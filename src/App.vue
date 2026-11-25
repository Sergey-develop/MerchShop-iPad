<script setup lang="ts">
import PressButton from './components/PressButton.vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import QRCode from 'qrcode';
import careerQr from './assets/merch/telegram-career.png';
import { getState, draw, getDraw, issue, updateState, validateTokens, available, STORAGE_KEY, newDrawId } from './services/demo';
import type { DemoState, Draw } from './types';

import MerchReel from './components/MerchReel.vue';
import MerchResult from './components/MerchResult.vue';
import TokenPanel from './components/TokenPanel.vue';
import brandLogo from './assets/merch/brand.webp';
import welcomeVideo from '../Мерчшоп_видео.mp4?url';
import subscribePhoto from './assets/merch/subscribe.webp';
import instructionsPhoto from './assets/merch/instructions.webp';

type Screen = 'welcome' | 'telegram' | 'instructions' | 'tokenInput' | 'animation' | 'result' | 'admin';
const state = ref<DemoState>(getState());
const screen = ref<Screen>('welcome');
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const reducedMotion = ref(motionPreference.matches);
function syncMotionPreference() { reducedMotion.value = motionPreference.matches; }
onMounted(() => motionPreference.addEventListener('change', syncMotionPreference));
onBeforeUnmount(() => motionPreference.removeEventListener('change', syncMotionPreference));
const tokens = ref(['', '', '', '']);
const result = ref<Draw>();
const error = ref('');
const qr = ref('');
const busy = ref(false);
const adminTab = ref<'prizes'|'draws'|'settings'>('prizes');
const defaultChannel = 'https://t.me/magnittech';
const channelUrl = computed(() => state.value.settings.telegramUrl.trim() || defaultChannel);
const officialChannel = computed(() => channelUrl.value === defaultChannel);
const prize = computed(() => state.value.prizes.find(p => p.id === result.value?.prizeId));
const valid = computed(() => !validateTokens(tokens.value, state.value.settings.tokenRules));
const day = computed(() => state.value.days.find(d => d.id === state.value.settings.activeDayId));
const inventory = (id: string) => state.value.inventory.find(row => row.prizeId === id);
const reelPrizes = computed(() => state.value.prizes.filter(p => {
  const row = inventory(p.id);
  return p.id === result.value?.prizeId || (p.isActive && row && row.weight > 0 && available(row) > 0);
}));
function syncStock(event: StorageEvent) {
  if (event.key !== STORAGE_KEY) return;
  const latest = getState();
  if (screen.value !== 'admin') { state.value = latest; return; }
  // Preserve the edits on screen while reflecting reservations and issues from other tabs.
  state.value.draws = latest.draws;
  for (const current of latest.inventory) {
    const row = inventory(current.prizeId);
    if (row) { row.reserved = current.reserved; row.issued = current.issued; }
  }
}
onMounted(() => window.addEventListener('storage', syncStock));
onBeforeUnmount(() => window.removeEventListener('storage', syncStock));
const errorMessage = (e: unknown) => e instanceof Error ? e.message : 'Не удалось выполнить операцию. Попробуйте ещё раз.';
function refresh() { state.value = getState(); }
watch(channelUrl, async (url, _, onCleanup) => {
  if (officialChannel.value) { qr.value = careerQr; return; }
  let current = true;
  onCleanup(() => { current = false; });
  qr.value = '';
  try {
    if (new URL(url).protocol !== 'https:') return;
    const image = await QRCode.toDataURL(url, { scale: 16, margin: 4, errorCorrectionLevel: 'M' });
    if (current) qr.value = image;
  } catch {
    // Invalid or oversized links leave the settings hint visible.
  }
}, { immediate: true });
watch(screen, () => window.scrollTo(0, 0), { flush: 'post' });
onMounted(() => { const key = sessionStorage.getItem('merch-draw-key'); if (key) { const saved = getDraw(key); if (saved) { result.value = saved; screen.value = 'result'; } else { screen.value = 'tokenInput'; error.value = 'Предыдущий запрос не найден. Повторите запуск с тем же идентификатором.'; } } });
async function startDraw() {
  if (busy.value || !valid.value) return;
  busy.value = true;
  error.value = '';
  const key = sessionStorage.getItem('merch-draw-key') || newDrawId();
  sessionStorage.setItem('merch-draw-key', key);
  try {
    result.value = await draw([...tokens.value], key);
    refresh();
    screen.value = 'animation';
  } catch (e) {
    error.value = errorMessage(e);
    busy.value = false;
  }
}
function showResult() {
  screen.value = 'result';
  busy.value = false;
}
function finish() { sessionStorage.removeItem('merch-draw-key'); result.value = undefined; tokens.value = ['', '', '', '']; error.value = ''; screen.value = 'welcome'; }
let previousScreen: Screen = 'welcome';
let taps = 0;
let resetTimer: ReturnType<typeof setTimeout> | undefined;
function resetTaps() {
  clearTimeout(resetTimer);
  taps = 0;
}
function toggleAdmin() {
  resetTaps();
  error.value = '';
  refresh();
  if (screen.value === 'admin') {
    screen.value = previousScreen;
  } else {
    previousScreen = screen.value;
    screen.value = 'admin';
  }
}
function tapCorner() {
  clearTimeout(resetTimer);
  if (++taps === 5) toggleAdmin();
  else resetTimer = setTimeout(resetTaps, 2500);
}
onBeforeUnmount(resetTaps);
async function saveAdmin() { try { await updateState(JSON.parse(JSON.stringify(state.value)) as DemoState); refresh(); error.value = 'Настройки демонстрации сохранены.'; } catch(e) { error.value = errorMessage(e); } }
async function markIssued(id: string) { try { await issue(id); refresh(); error.value = 'Выдача подтверждена.'; } catch(e) { error.value = errorMessage(e); } }
function setImage(p: {imageUrl: string}, ev: Event) { const file = (ev.target as HTMLInputElement).files?.[0]; if (!file) return; if (file.size > 600_000) { error.value = 'Изображение должно быть меньше 600 КБ для локального хранения.'; return; } const reader = new FileReader(); reader.onload = () => { p.imageUrl = String(reader.result); }; reader.readAsDataURL(file); }
</script>
<template>
  <div @click.capture="resetTaps" class="app-shell" :class="[`screen-${screen}`, { 'is-admin': screen === 'admin' }]">
    <div class="design-stage">
      <video v-if="screen === 'welcome' && !reducedMotion" class="welcome-video" :src="welcomeVideo"
        autoplay muted loop playsinline aria-hidden="true" tabindex="-1"></video>
      <header class="topbar">
        <div class="brand"><img :src="brandLogo" alt="MAGNIT TECH" width="294" height="101"></div>
        <PressButton v-if="screen === 'admin'" type="button" class="admin-link" @click="toggleAdmin">В игру</PressButton>
      </header>
      <main class="stage">
        <section v-if="screen === 'welcome'" class="welcome-panel" aria-labelledby="welcome-title">
          <h1 id="welcome-title">ЗАБРАТЬ<br>МЕРЧ</h1>
          <PressButton framed settle type="button" class="primary action-button" @click="screen = 'telegram'">ВОЙТИ В MERCH SHOP</PressButton>
        </section>

        <section v-else-if="screen === 'telegram'" class="split-layout" aria-labelledby="telegram-title">
          <img class="left-panel editorial-photo subscribe-photo" :src="subscribePhoto" alt="Белый лонгслив MAGNIT TECH TEAM">
          <div class="copy-panel">
            <h2 id="telegram-title" class="panel-title">Подпишись<br>на телеграм канал</h2>
            <div class="panel-body telegram-body">
              <div v-if="qr" class="channel-code" :class="{ 'is-official': officialChannel }">
                <img :src="qr" alt="QR-код Telegram-канала" :class="{ 'standard-qr': !officialChannel }">
                <span v-if="!officialChannel">{{ channelUrl }}</span>
              </div>
              <div v-else class="channel-empty">
                <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
                  <path d="M20 5H12a7 7 0 0 0-7 7v8m39-15h8a7 7 0 0 1 7 7v8M5 44v8a7 7 0 0 0 7 7h8m24 0h8a7 7 0 0 0 7-7v-8" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
                  <path d="m17 30 29-11-6 27-10-8-5 5v-9l14-10-16 8z" fill="currentColor"/>
                </svg>
                <strong>Не удалось сформировать QR-код</strong>
                <p>Организатор может добавить её в настройках.</p>
              </div>
            </div>
            <PressButton framed settle type="button" class="primary action-button" @click="screen = 'instructions'">Я ПОДПИСАЛСЯ</PressButton>
            <p class="sr-only">Подписка подтверждается нажатием кнопки.</p>
          </div>
        </section>

        <section v-else-if="screen === 'instructions'" class="split-layout" aria-labelledby="instructions-title">
          <img class="left-panel editorial-photo instructions-photo" :src="instructionsPhoto" alt="Футболка, шопер и аксессуары MAGNIT TECH">
          <div class="copy-panel">
            <h2 id="instructions-title" class="panel-title">Время забрать свой мерч</h2>
            <div class="panel-body rules-body">
              <p class="description">Собери свою комбинацию из четырёх токенов, введи числа<br>в ячейки и забирай свой мерч от MAGNIT TECH.</p>
            </div>
            <PressButton framed settle type="button" class="primary action-button" @click="screen = 'tokenInput'">ЗАБРАТЬ МЕРЧ</PressButton>
          </div>
        </section>

        <TokenPanel v-else-if="screen === 'tokenInput'" v-model="tokens"
          :rules="state.settings.tokenRules" :valid="valid" :busy="busy" :error="error" @launch="startDraw" />
        <MerchReel v-else-if="screen === 'animation' && result" :prizes="reelPrizes" :winner-id="result.prizeId" @complete="showResult"/>
        <MerchResult v-else-if="screen === 'result'" :prize="prize" @finish="finish"/>
        <section v-else class="admin" aria-labelledby="admin-title">
          <h1 id="admin-title">Настройки демо</h1>
          <p class="admin-intro">Данные хранятся в этом браузере. Доступ к настройкам открыт. Для реальной выдачи требуется серверная авторизация.</p>
          <nav class="tabs" aria-label="Разделы настроек">
            <PressButton v-for="tab in (['prizes','draws','settings'] as const)" :key="tab" type="button"
              :class="{ active: adminTab === tab }" :aria-pressed="adminTab === tab" @click="adminTab = tab; error = ''">
              {{ { prizes: 'Призы и остатки', draws: 'Выигрыши', settings: 'Настройки' }[tab] }}
            </PressButton>
          </nav>
          <p v-if="error" class="admin-status" role="status">{{ error }}</p>
          <div v-if="adminTab === 'prizes'" class="admin-list">
            <article v-for="p in state.prizes" :key="p.id" class="admin-prize">
              <div class="admin-prize-main">
                <input v-model="p.name" :aria-label="`Название ${p.name}`">
                <label class="checkbox-label"><input v-model="p.isActive" type="checkbox"> Активен</label>
                <label class="upload">Изображение<input type="file" accept="image/*" @change="setImage(p, $event)"></label>
              </div>
              <div class="admin-days">
                <div class="day-edit">
                  <b>Общий запас</b>
                  <template v-if="inventory(p.id)">
                    <label>Количество<input v-model.number="inventory(p.id)!.total" type="number" min="0"></label>
                    <label>Вес<input v-model.number="inventory(p.id)!.weight" type="number" min="0" step="any"></label>
                    <span>Резерв: {{ inventory(p.id)!.reserved }} · Выдано: {{ inventory(p.id)!.issued }} · Осталось: {{ available(inventory(p.id)!) }}</span>
                  </template>
                </div>
              </div>
            </article>
          </div>
          <div v-else-if="adminTab === 'draws'" class="draw-list">
            <p v-if="!state.draws.length">Выигрышей пока нет.</p>
            <article v-for="d in [...state.draws].reverse()" :key="d.id" class="draw-item">
              <div>
                <b>{{ state.prizes.find(p => p.id === d.prizeId)?.name }}</b>
                <p>{{ new Date(d.createdAt).toLocaleString('ru-RU') }} · {{ d.tokens.join(' / ') }} · {{ d.id.slice(0, 8).toUpperCase() }}</p>
                <span>{{ d.status }}</span>
              </div>
              <PressButton v-if="d.status === 'reserved'" type="button" class="secondary" @click="markIssued(d.id)">Подтвердить выдачу</PressButton>
            </article>
          </div>
          <div v-else class="settings-grid">
            <label>Ссылка Telegram<input v-model="state.settings.telegramUrl" placeholder="https://..."></label>
            <label>Активный день<select v-model="state.settings.activeDayId"><option v-for="d in state.days" :key="d.id" :value="d.id">{{ d.label }}</option></select></label>
            <label v-for="d in state.days" :key="d.id">Дата: {{ d.label }}<input v-model="d.date" type="date"></label>
            <label>Минимум токена<input v-model.number="state.settings.tokenRules.min" type="number" min="0"></label>
            <label>Максимум токена<input v-model.number="state.settings.tokenRules.max" type="number" min="0"></label>
            <label>Максимум цифр<input v-model.number="state.settings.tokenRules.maxLength" type="number" min="1" max="12"></label>
            <p>Активный день: {{ day?.label }}. Запас общий для всех дней.</p>
          </div>
          <PressButton v-if="adminTab !== 'draws'" type="button" class="save" @click="saveAdmin">Сохранить изменения</PressButton>
        </section>
      </main>
    </div>
  </div>
  <button v-if="!busy" class="corner-switch" type="button" @click="tapCorner"
    :aria-label="(screen === 'admin' ? 'В игру' : 'Админка') + '. Нажмите 5 раз.'"></button>
</template>
