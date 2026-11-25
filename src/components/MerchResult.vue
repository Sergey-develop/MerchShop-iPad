<script setup lang="ts">
import PressButton from './PressButton.vue'
import { computed, ref } from 'vue'
import type { Prize } from '../types'
import { prizeArtwork, prizeLabel } from './prizeArtwork'

const props = defineProps<{ prize?: Prize }>()
defineEmits<{ finish: [] }>()
const label = computed(() => prizeLabel(props.prize))
const image = computed(() => prizeArtwork(props.prize, true))
const photoReady = ref(false)
const foil = ['#ff493b', '#edac52', '#ffd99c', '#da4245', '#e8dfe2']
function between(min: number, max: number) {
  return min + Math.random() * (max - min)
}
const confetti = Array.from({ length: 44 }, (_, i) => {
  const side = i % 2 === 0 ? 1 : -1
  const late = i >= 32
  const edge = between(0, 8)
  return {
    left: (side === 1 ? edge : 100 - edge) + '%',
    top: between(62, 83) + '%',
    '--reach': side * between(12, 58) + 'cqw',
    '--peak': -between(30, 71) + 'cqh',
    '--fall': between(20, 48) + 'cqh',
    '--turn': side * between(130, 360) + 'deg',
    '--size': between(.9, 1.8) + 'cqw',
    '--delay': (late ? between(510, 810) : between(170, 360)) + 'ms',
    '--flight': between(1600, 2380) + 'ms',
    color: foil[i % foil.length],
  }
})
const glints = [[15, 33], [79, 42], [27, 64], [66, 25], [88, 68], [19, 45], [71, 61]]
</script>

<template>
  <section class="split-layout result-layout" aria-label="Результат розыгрыша">
    <div class="left-panel result-prize" :class="{ revealed: photoReady || !image }">
      <img v-if="image" class="result-photo" :class="{ 'catalogue-portrait': !prize?.imageUrl }" :src="image" :alt="prize?.name"
        @load="photoReady = true" @error="photoReady = true">
      <p v-else class="result-no-photo">Изображение мерча<br>будет добавлено</p>
      <div class="prize-confetti" aria-hidden="true">
        <div class="prize-light"></div>
        <i v-for="(piece, i) in confetti" :key="i" :style="piece"><b></b></i>
        <span v-for="([x, y], i) in glints" :key="'glint-' + i" class="glint"
          :style="{ left: x + '%', top: y + '%', animationDelay: (400 + i * 205) + 'ms' }"></span>
      </div>
      <h2 class="result-heading">ТЫ ВЫИГРАЛ:</h2>
      <p class="result-name" :class="{ 'result-name-long': label.length > 18 }">{{ label }}</p>
    </div>
    <div class="copy-panel result-copy">
      <h2 class="panel-title">Поздравляем!</h2>
      <div class="panel-body result-detail">
        <p class="description">Твой мерч ждёт тебя <strong>на стенде MAGNIT TECH</strong>. Покажи результат организатору и передай четыре использованных токена, чтобы забрать свой приз.</p>
      </div>
      <PressButton framed settle type="button" class="primary action-button" @click="$emit('finish')">ОТЛИЧНО!</PressButton>
    </div>
  </section>
</template>

<style scoped>
.result-prize {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  background: linear-gradient(166deg, #0a0404 0%, #110203 53%, #450306 75%, #d4080a 100%);
}
.result-photo,
.result-no-photo {
  position: absolute;
  inset: 22% 5.6% 18%;
  width: 88.8%;
  height: 60%;
  margin: 0;
}
.result-photo {
  object-fit: contain;
  border-radius: calc(38 * var(--u));
}
.result-no-photo {
  display: grid;
  align-content: center;
  text-align: center;
  font-size: calc(32 * var(--u));
  line-height: 1.2;
  color: #e0d0d1;
}
.prize-confetti { display: none; }
@media (prefers-reduced-motion: no-preference) {
  .result-prize:not(.revealed) :is(.result-photo, .result-name) { opacity: 0; }
  .revealed .result-photo { animation: prize-arrival 920ms 65ms cubic-bezier(.19,.78,.22,1) backwards; }
  .revealed .result-name { animation: prize-caption 580ms 270ms cubic-bezier(.19,.9,.27,1) backwards; }
  .revealed .prize-confetti {
    display: block;
    position: absolute;
    inset: 0;
    container-type: size;
    pointer-events: none;
    overflow: hidden;
  }
  .prize-light {
    position: absolute;
    inset: -10%;
    background: radial-gradient(ellipse at 50% 58%, #fff0c04a, #ff9d4830 27%, transparent 60%),
                radial-gradient(ellipse at 0% 80%, #ff783c70, transparent 44%),
                radial-gradient(ellipse at 100% 75%, #ffad5c66, transparent 40%);
    opacity: 0;
    animation: warm-light 1450ms cubic-bezier(.25,.58,.3,1);
  }
  .prize-confetti i {
    position: absolute;
    animation: foil-drift var(--flight) var(--delay) cubic-bezier(.12,.64,.34,1) backwards;
  }
  .prize-confetti b {
    display: block;
    width: var(--size);
    height: calc(var(--size) * 2.1);
    border-radius: 24%;
    background: linear-gradient(135deg, #fffa, transparent 50%, #34000b44), currentColor;
    opacity: 0;
    animation: foil-flight var(--flight) var(--delay) backwards;
  }
  .prize-confetti i:nth-of-type(3n) b { height: var(--size); border-radius: 50%; }
  .glint {
    position: absolute;
    width: clamp(10px, 3.2cqw, 24px);
    aspect-ratio: 1;
    background: #fff0c7;
    clip-path: polygon(50% 0, 59% 39%, 100% 50%, 59% 59%, 50% 100%, 41% 59%, 0 50%, 41% 39%);
    opacity: 0;
    animation: glint 780ms ease-in-out backwards;
  }
  @keyframes warm-light {
    0% { opacity: 0; transform: scale(.86); }
    27% { opacity: 1; }
    100% { opacity: 0; transform: scale(1.12); }
  }
  @keyframes glint {
    0%, 100% { opacity: 0; transform: scale(.3); }
    44% { opacity: .94; transform: scale(1); }
  }
  @keyframes prize-arrival {
    from { opacity: 0; transform: translateY(2.4%) scale(1.095); }
    to { opacity: 1; transform: none; }
  }
  @keyframes prize-caption {
    from { opacity: 0; transform: translateY(8px); }
  }
  @keyframes foil-drift {
    from { transform: translateX(0); }
    to { transform: translateX(var(--reach)); }
  }
  @keyframes foil-flight {
    0% { opacity: 0; transform: translateY(0) rotate(0deg) rotateY(65deg); animation-timing-function: cubic-bezier(.18,.65,.42,1); }
    7% { opacity: 1; }
    36% { transform: translateY(var(--peak)) rotate(var(--turn)) rotateY(190deg); animation-timing-function: cubic-bezier(.48,0,.7,.62); }
    74% { opacity: .92; }
    100% { opacity: 0; transform: translateY(var(--fall)) rotate(calc(var(--turn) * 2.1)) rotateY(480deg); }
  }
}
.result-heading {
  position: absolute;
  inset: 3.82% 4.89% auto;
  height: 15.93%;
  margin: 0;
  display: block;
  align-content: center;
  text-align: center;
  border: 1px solid #ffffff14;
  border-radius: calc(30 * var(--u));
  backdrop-filter: blur(calc(13 * var(--u)));
  background: #10070873;
  color: #fff;
  font-size: calc(40 * var(--u));
  line-height: .9;
  font-weight: 400;
}
.result-photo.catalogue-portrait {
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 0;
}
.result-name {
  position: absolute;
  bottom: 4.33%;
  left: 5.55%;
  min-height: calc(76 * var(--u));
  max-height: 32%;
  max-width: 88.9%;
  overflow: auto;
  overflow-wrap: anywhere;
  align-content: center;
  padding: calc(7 * var(--u)) calc(42 * var(--u));
  border: max(1px, calc(1 * var(--u))) solid #f83e22;
  border-radius: calc(52 * var(--u));
  background: #000;
  margin: 0;
  color: #fff;
  font-size: calc(45 * var(--u));
  font-family: 'Nunito Sans', 'Segoe UI', Arial, sans-serif;
  line-height: 1;
  font-weight: 400;
}
.result-name-long {
  font-size: calc(35 * var(--u));
}
.result-detail {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: calc(20 * var(--u));
  overflow: auto;
  background: #140305 url('../assets/merch/result-detail.webp') center / 100% 100% no-repeat;
}
.result-detail strong { font-weight: 600; }
.description strong { color: #da3221; }
@media (orientation: landscape) and (max-height: 600px) {
  .result-heading { font-size: max(18px, calc(40 * var(--u))); }
  .result-no-photo { font-size: max(14px, calc(32 * var(--u))); }
  .result-name { font-size: max(16px, calc(35 * var(--u))); }
  .result-detail > * { flex: 0 0 auto; }
}
@media (max-width: 700px) and (orientation: portrait) {
  .result-prize {
    width: 100%;
    aspect-ratio: 613 / 785;
  }
  .result-heading {
    height: 19%;
    border-radius: 14px;
    font-size: clamp(20px, 5.5vw, 30px);
  }
  .result-name {
    min-height: 36px;
    padding: 5px 17px;
    border-radius: 24px;
    font-size: clamp(19px, 5vw, 28px);
  }
  .result-name-long, .result-no-photo { font-size: 19px; }
  .result-photo { border-radius: 16px; }
  .result-detail { gap: 18px; }
}
</style>
