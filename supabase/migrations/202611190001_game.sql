-- Production schema. Apply on a Supabase PostgreSQL database with pgcrypto installed.
create extension if not exists pgcrypto with schema extensions;
create table public.prizes (
 id uuid primary key default gen_random_uuid(), name text not null, description text not null default '',
 image_url text, is_active boolean not null default true
);
create table public.event_days (
 id uuid primary key default gen_random_uuid(), label text not null unique, event_date date, is_active boolean not null default false
);
create unique index event_days_one_active on public.event_days ((is_active)) where is_active;
create table public.prize_inventory (
 id uuid primary key default gen_random_uuid(), prize_id uuid not null references public.prizes(id),
 event_day_id uuid not null references public.event_days(id), total_quantity integer not null default 0 check(total_quantity >= 0),
 available_quantity integer not null default 0 check(available_quantity >= 0),
 reserved_quantity integer not null default 0 check(reserved_quantity >= 0), issued_quantity integer not null default 0 check(issued_quantity >= 0),
 drop_weight integer not null default 0 check(drop_weight between 0 and 1000000),
 unique(prize_id,event_day_id), check(total_quantity = available_quantity + reserved_quantity + issued_quantity)
);
create table public.draws (
 id uuid primary key default gen_random_uuid(), event_day_id uuid not null references public.event_days(id),
 token_combination jsonb not null, prize_id uuid not null references public.prizes(id),
 status text not null default 'reserved' check(status in ('reserved','issued','cancelled')),
 created_at timestamptz not null default now(), issued_at timestamptz, idempotency_key uuid not null unique,
 check(jsonb_typeof(token_combination) = 'array' and jsonb_array_length(token_combination)=4)
);
create index draws_created_idx on public.draws(created_at desc);
create table public.app_settings (key text primary key, value jsonb not null);
-- This table is populated manually by a trusted operator with Supabase Auth user IDs.
create table public.game_admins (user_id uuid primary key references auth.users(id));
insert into public.app_settings values
 ('telegram_url', 'null'::jsonb),
 ('token_validation', '{"mode":"unconfigured","min":0,"max":999999,"maxDigits":6}'::jsonb),
 ('cancellation_returns_stock', 'false'::jsonb);
insert into public.event_days(label) values ('День 1'),('День 2');
insert into public.prizes(name) values
 ('Носки MAGNIT TECH'),('Мультитул'),('Карабин'),('Бутылка для воды'),('Коврик для мыши'),
 ('Футболка MAGNIT TECH'),('Шарф'),('Худи'),('Рюкзак'),('Пижама'),
 ('Новая серая футболка MAGNIT TECH'),('Новый белый лонгслив MAGNIT TECH');
insert into public.prize_inventory(prize_id,event_day_id) select p.id,d.id from public.prizes p cross join public.event_days d;

-- Reject-by-default hook: range_only_approved is explicitly an operator-approved format check,
-- NOT proof of token authenticity. Replace this function with the approved server-side rules.
create function public.validate_game_tokens(tokens jsonb) returns boolean language plpgsql stable set search_path = '' as $$
declare cfg jsonb; t jsonb; s text; n numeric;
begin
 select value into cfg from public.app_settings where key='token_validation';
 if cfg->>'mode' <> 'range_only_approved' then raise exception 'TOKEN_RULES_UNCONFIGURED'; end if;
 if jsonb_typeof(tokens) <> 'array' or jsonb_array_length(tokens) <> 4 then return false; end if;
 for t in select value from jsonb_array_elements(tokens) loop
  if jsonb_typeof(t) <> 'string' then return false; end if;
  s := t #>> '{}';
  if s !~ '^[0-9]+$' or length(s) > least(coalesce((cfg->>'maxDigits')::int,6), 18) then return false; end if;
  n := s::numeric;
  if n < (cfg->>'min')::numeric or n > (cfg->>'max')::numeric then return false; end if;
 end loop;
 return true;
end $$;

-- Uniform integer in [0, upper_bound). Rejection sampling avoids modulo bias.
create function public.secure_below(upper_bound bigint) returns bigint language plpgsql volatile set search_path = '' as $$
declare b bytea; x bigint; ceiling bigint; extension_schema text;
begin
 if upper_bound <= 0 or upper_bound > 4294967296 then raise exception 'INVALID_WEIGHT_SUM'; end if;
 select n.nspname into extension_schema from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto';
 if extension_schema is null then raise exception 'PGCRYPTO_UNAVAILABLE'; end if;
 ceiling := (4294967296 / upper_bound) * upper_bound;
 loop
  execute pg_catalog.format('select %I.gen_random_bytes(4)', extension_schema) into b;
  x := (get_byte(b,0)::bigint << 24) + (get_byte(b,1)::bigint << 16) + (get_byte(b,2)::bigint << 8) + get_byte(b,3)::bigint;
  exit when x < ceiling;
 end loop;
 return x % upper_bound;
end $$;

-- All eligible inventory rows are locked in deterministic order in the same transaction.
-- Idempotency lock serializes retries, including simultaneous retries with the same key.
create function public.game_draw(request_key uuid, tokens jsonb) returns public.draws
language plpgsql security definer set search_path = '' as $$
declare existing public.draws; day_id uuid; candidate record; weight_sum bigint; ticket bigint; chosen uuid;
begin
 if request_key is null then raise exception 'INVALID_REQUEST'; end if;
 perform pg_advisory_xact_lock(hashtextextended(request_key::text, 0));
 select * into existing from public.draws where idempotency_key=request_key;
 if found then
  if existing.token_combination <> tokens then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return existing;
 end if;
 if not public.validate_game_tokens(tokens) then raise exception 'INVALID_TOKENS'; end if;
 select id into day_id from public.event_days where is_active for update;
 if day_id is null then raise exception 'NO_ACTIVE_DAY'; end if;
 perform i.id from public.prize_inventory i where i.event_day_id=day_id order by i.id for update;
 select coalesce(sum(i.drop_weight),0) into weight_sum from public.prize_inventory i
 join public.prizes p on p.id=i.prize_id where i.event_day_id=day_id and i.available_quantity>0 and i.drop_weight>0 and p.is_active;
 if weight_sum=0 then raise exception 'NO_PRIZES'; end if;
 ticket := public.secure_below(weight_sum);
 for candidate in select i.prize_id,i.drop_weight from public.prize_inventory i join public.prizes p on p.id=i.prize_id
  where i.event_day_id=day_id and i.available_quantity>0 and i.drop_weight>0 and p.is_active order by i.id loop
  if ticket < candidate.drop_weight then chosen := candidate.prize_id; exit; end if;
  ticket := ticket-candidate.drop_weight;
 end loop;
 update public.prize_inventory set available_quantity=available_quantity-1,reserved_quantity=reserved_quantity+1
 where event_day_id=day_id and prize_id=chosen and available_quantity>0;
 if not found then raise exception 'INVENTORY_CONFLICT'; end if;
 insert into public.draws(event_day_id,token_combination,prize_id,idempotency_key) values(day_id,tokens,chosen,request_key) returning * into existing;
 return existing;
end $$;

create function public.game_issue(draw_id uuid) returns public.draws language plpgsql security definer set search_path = '' as $$
declare d public.draws;
begin
 select * into d from public.draws where id=draw_id for update;
 if not found then raise exception 'DRAW_NOT_FOUND'; end if;
 if d.status <> 'reserved' then raise exception 'DRAW_ALREADY_PROCESSED'; end if;
 update public.prize_inventory set reserved_quantity=reserved_quantity-1,issued_quantity=issued_quantity+1
 where event_day_id=d.event_day_id and prize_id=d.prize_id and reserved_quantity>0;
 if not found then raise exception 'INVENTORY_CONFLICT'; end if;
 update public.draws set status='issued',issued_at=now() where id=draw_id returning * into d;
 return d;
end $$;

create function public.game_cancel(draw_id uuid) returns public.draws language plpgsql security definer set search_path = '' as $$
declare d public.draws; returns_stock boolean;
begin
 select * into d from public.draws where id=draw_id for update;
 if not found then raise exception 'DRAW_NOT_FOUND'; end if;
 if d.status <> 'reserved' then raise exception 'DRAW_ALREADY_PROCESSED'; end if;
 select value::text::boolean into returns_stock from public.app_settings where key='cancellation_returns_stock';
 -- Refuse cancellation until the return policy is explicitly enabled. Never silently lose stock.
 if not coalesce(returns_stock,false) then raise exception 'CANCELLATION_POLICY_UNCONFIGURED'; end if;
 update public.prize_inventory set reserved_quantity=reserved_quantity-1,available_quantity=available_quantity+1
 where event_day_id=d.event_day_id and prize_id=d.prize_id and reserved_quantity>0;
 if not found then raise exception 'INVENTORY_CONFLICT'; end if;
 update public.draws set status='cancelled' where id=draw_id returning * into d;
 return d;
end $$;

create function public.game_set_inventory(inventory_id uuid, new_total integer, new_weight integer) returns public.prize_inventory
language plpgsql security definer set search_path='' as $$
declare i public.prize_inventory;
begin
 select * into i from public.prize_inventory where id=inventory_id for update;
 if not found then raise exception 'INVENTORY_NOT_FOUND'; end if;
 if new_total < i.reserved_quantity+i.issued_quantity or new_weight < 0 or new_weight > 1000000 then raise exception 'INVALID_INVENTORY'; end if;
 update public.prize_inventory set total_quantity=new_total,available_quantity=new_total-reserved_quantity-issued_quantity,drop_weight=new_weight where id=inventory_id returning * into i;
 return i;
end $$;
create function public.game_set_active_day(day_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(1983234567);
 if not exists(select 1 from public.event_days where id=day_id) then raise exception 'DAY_NOT_FOUND'; end if;
 update public.event_days set is_active=false where is_active;
 update public.event_days set is_active=true where id=day_id;
end $$;

alter table public.prizes enable row level security;
alter table public.event_days enable row level security;
alter table public.prize_inventory enable row level security;
alter table public.draws enable row level security;
alter table public.app_settings enable row level security;
alter table public.game_admins enable row level security;
-- No public table access. The Edge Function owns authorization and uses the service role.
revoke all on public.prizes,public.event_days,public.prize_inventory,public.draws,public.app_settings,public.game_admins from anon,authenticated;
revoke execute on function public.validate_game_tokens(jsonb),public.secure_below(bigint),public.game_draw(uuid,jsonb),public.game_issue(uuid),public.game_cancel(uuid),public.game_set_inventory(uuid,integer,integer),public.game_set_active_day(uuid) from public,anon,authenticated;
grant execute on function public.game_draw(uuid,jsonb),public.game_issue(uuid),public.game_cancel(uuid),public.game_set_inventory(uuid,integer,integer),public.game_set_active_day(uuid) to service_role;

