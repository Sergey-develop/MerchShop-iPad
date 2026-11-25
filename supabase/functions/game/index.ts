import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db = createClient(url, serviceKey, { auth: { persistSession: false } });
const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const uuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
async function admin(req: Request) {
 const token = req.headers.get('Authorization')?.replace(/^Bearer /i, '');
 if (!token || token === serviceKey) return false;
 const { data: user, error } = await db.auth.getUser(token);
 if (error || !user.user) return false;
 const { data } = await db.from('game_admins').select('user_id').eq('user_id', user.user.id).maybeSingle();
 return !!data;
}
async function enrich(draw: Record<string, unknown>) {
 const { data, error } = await db.from('prizes').select('id,name,description,image_url').eq('id', draw.prize_id).single();
 if (error) throw error;
 // Token combination is never returned to a public client.
 const { token_combination: _tokens, idempotency_key: _key, ...safeDraw } = draw;
 return { ...safeDraw, prize: data };
}
Deno.serve(async (req) => {
 if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
 if (req.method !== 'POST') return reply({ error: 'METHOD_NOT_ALLOWED' }, 405);
 try {
  const input = await req.json();
  if (!input || typeof input !== 'object') return reply({ error: 'INVALID_REQUEST' }, 400);
  const { action } = input;
  if (action === 'public_config') {
   const { data, error } = await db.from('app_settings').select('key,value').in('key', ['telegram_url','token_validation']);
   if (error) throw error;
   const values = Object.fromEntries((data || []).map((x) => [x.key, x.value]));
   return reply({ telegram_url: values.telegram_url, token_validation: values.token_validation });
  }
  if (action === 'draw') {
   if (!uuid(input.idempotencyKey) || !Array.isArray(input.tokens) || input.tokens.length !== 4 || input.tokens.some((x: unknown) => typeof x !== 'string' || x.length > 18)) return reply({ error: 'INVALID_REQUEST' }, 400);
   const { data, error } = await db.rpc('game_draw', { request_key: input.idempotencyKey, tokens: input.tokens });
   if (error) throw error;
   return reply({ draw: await enrich(data) });
  }
  if (action === 'recover') {
   if (!uuid(input.idempotencyKey)) return reply({ error: 'INVALID_REQUEST' }, 400);
   const { data, error } = await db.from('draws').select('*').eq('idempotency_key', input.idempotencyKey).maybeSingle();
   if (error) throw error;
   return data ? reply({ draw: await enrich(data) }) : reply({ error: 'NOT_FOUND' }, 404);
  }
  if (!await admin(req)) return reply({ error: 'UNAUTHORIZED' }, 401);
  if (action === 'admin_data') {
   const [prizes, days, inventory, draws, settings] = await Promise.all([
    db.from('prizes').select('*').order('name'), db.from('event_days').select('*').order('label'),
    db.from('prize_inventory').select('*'), db.from('draws').select('*').order('created_at', { ascending: false }).limit(500),
    db.from('app_settings').select('*'),
   ]);
   for (const result of [prizes, days, inventory, draws, settings]) if (result.error) throw result.error;
   return reply({ prizes: prizes.data, days: days.data, inventory: inventory.data, draws: draws.data, settings: settings.data });
  }
  if (action === 'issue' || action === 'cancel') {
   if (!uuid(input.drawId)) return reply({ error: 'INVALID_REQUEST' }, 400);
   const { data, error } = await db.rpc(action === 'issue' ? 'game_issue' : 'game_cancel', { draw_id: input.drawId });
   if (error) throw error;
   return reply({ draw: data });
  }
  if (action === 'set_inventory') {
   if (!uuid(input.inventoryId) || !Number.isInteger(input.total) || !Number.isInteger(input.weight)) return reply({ error: 'INVALID_REQUEST' }, 400);
   const { data, error } = await db.rpc('game_set_inventory', { inventory_id: input.inventoryId, new_total: input.total, new_weight: input.weight });
   if (error) throw error;
   return reply({ inventory: data });
  }
  if (action === 'set_active_day') {
   if (!uuid(input.dayId)) return reply({ error: 'INVALID_REQUEST' }, 400);
   const { error } = await db.rpc('game_set_active_day', { day_id: input.dayId });
   if (error) throw error;
   return reply({ ok: true });
  }
  if (action === 'update_day') {
   if (!uuid(input.dayId) || (input.date !== null && (typeof input.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)))) return reply({ error: 'INVALID_REQUEST' }, 400);
   const { data, error } = await db.from('event_days').update({ event_date: input.date }).eq('id',input.dayId).select().single();
   if (error) throw error;
   return reply({ day: data });
  }
  if (action === 'set_setting') {
   if (!['telegram_url','token_validation','cancellation_returns_stock'].includes(input.key)) return reply({ error: 'INVALID_REQUEST' }, 400);
   const value = input.value;
   if (input.key === 'telegram_url' && value !== null && (typeof value !== 'string' || !/^https:\/\/t\.me\/[A-Za-z0-9_]+\/?$/.test(value))) return reply({ error: 'INVALID_REQUEST' }, 400);
   if (input.key === 'cancellation_returns_stock' && typeof value !== 'boolean') return reply({ error: 'INVALID_REQUEST' }, 400);
   if (input.key === 'token_validation' && (!value || !['unconfigured','range_only_approved'].includes(value.mode) || !Number.isSafeInteger(value.min) || !Number.isSafeInteger(value.max) || value.min < 0 || value.max < value.min || !Number.isInteger(value.maxDigits) || value.maxDigits < 1 || value.maxDigits > 15)) return reply({ error: 'INVALID_REQUEST' }, 400);
   const { error } = await db.from('app_settings').update({ value }).eq('key',input.key);
   if (error) throw error;
   return reply({ ok: true });
  }
  if (action === 'update_prize') {
   if (!uuid(input.prizeId) || typeof input.name !== 'string' || input.name.length < 1 || input.name.length > 200 || typeof input.description !== 'string' || input.description.length > 1000 || typeof input.isActive !== 'boolean' || (input.imageUrl !== null && (typeof input.imageUrl !== 'string' || !/^https:\/\//i.test(input.imageUrl)))) return reply({ error: 'INVALID_REQUEST' }, 400);
   const { data, error } = await db.from('prizes').update({ name: input.name, description: input.description, image_url: input.imageUrl, is_active: input.isActive }).eq('id',input.prizeId).select().single();
   if (error) throw error;
   return reply({ prize: data });
  }
  return reply({ error: 'UNKNOWN_ACTION' }, 400);
 } catch (err) {
  const msg = (err as Error)?.message || '';
  const known = ['TOKEN_RULES_UNCONFIGURED','INVALID_TOKENS','NO_ACTIVE_DAY','NO_PRIZES','IDEMPOTENCY_CONFLICT','DRAW_NOT_FOUND','DRAW_ALREADY_PROCESSED','CANCELLATION_POLICY_UNCONFIGURED','INVALID_INVENTORY','INVENTORY_NOT_FOUND','DAY_NOT_FOUND'];
  const code = known.find((x) => msg.includes(x));
  if (code) return reply({ error: code }, code === 'TOKEN_RULES_UNCONFIGURED' || code === 'NO_ACTIVE_DAY' ? 503 : 409);
  console.error('game backend error', msg);
  return reply({ error: 'SERVER_ERROR' }, 500);
 }
});

