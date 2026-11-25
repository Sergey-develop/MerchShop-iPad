<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Prize } from '../types'
import { prizeArtwork, prizeLabel } from './prizeArtwork'

const props = defineProps<{ prizes: Prize[]; winnerId: string }>()
const emit = defineEmits<{ complete: [] }>()
const reel = ref<HTMLElement>()
const position = ref(0)
const centerSlot = computed(() => Math.round(position.value))
const landed = ref(false)

const prizes = props.prizes.filter(prize => prize.isActive || prize.id === props.winnerId)
const winner = prizes.findIndex(prize => prize.id === props.winnerId)
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const travel = prizes.length > 1 && !reducedMotion ? 36 + Math.floor(Math.random() * 9) : 0
const spinDuration = 8700 + Math.random() * 1400
const settleDuration = 770 + Math.random() * 330
// The pointer comes to rest between two cards, then settles into the winning slot.
const brakeStop = travel + (Math.random() < .5 ? -1 : 1) * (.54 + Math.random() * .12)

// The award is already reserved. Randomize only the surrounding cards.
function otherPrize(index: number) {
  const pick = Math.floor(Math.random() * (prizes.length - 1))
  return pick >= index ? pick + 1 : pick
}
function makeStrip() {
  if (winner < 0) return []
  const indices = [winner]
  if (prizes.length > 1) {
    let previous = winner
    for (let i = 0; i < travel + 1; i++) {
      previous = otherPrize(previous)
      indices.push(previous)
    }
    indices.reverse()
    const next = otherPrize(winner)
    indices.push(next, otherPrize(next))
  }
  return indices.map((index, i) => {
    const prize = prizes[index]!
    return { slot: prizes.length === 1 ? 0 : i - 1, prize, image: prizeArtwork(prize) }
  })
}
const cards = makeStrip()
const visibleCards = computed(() => cards.filter(card => Math.abs(card.slot - centerSlot.value) <= 3))

function pose(distance: number) {
  const side = Math.min(1, Math.abs(distance))
  const depth = (1 - Math.cos(Math.PI * side)) / 2
  return {
    transform: `translate3d(calc(var(--card-step) * ${distance}), calc(var(--card-drop) * ${depth}), 0) scale(${1 - .113 * depth})`,
    opacity: 1 - .5 * depth,
  }
}

// Start at full speed and brake uniformly until the final settling movement.
function spinPosition(t: number) {
  return brakeStop * t * (2 - t)
}

let frame = 0
let exit: Animation | undefined
function revealResult() {
  landed.value = true
  exit = reel.value!.animate([{ opacity: 1 }, { opacity: 0 }], {
    delay: 780, duration: reducedMotion ? 0 : 160, easing: 'ease-in', fill: 'forwards',
  })
  exit.onfinish = () => emit('complete')
}
onMounted(() => {
  if (!cards.length) { emit('complete'); return }
  if (!travel) { revealResult(); return }
  const start = performance.now()
  function spin(now: number) {
    const elapsed = now - start
    if (elapsed < spinDuration) {
      position.value = spinPosition(elapsed / spinDuration)
    } else {
      const t = Math.min(1, (elapsed - spinDuration) / settleDuration)
      position.value = brakeStop + (travel - brakeStop) * t * t * (3 - 2 * t)
      if (t === 1) { position.value = travel; revealResult(); return }
    }
    frame = requestAnimationFrame(spin)
  }
  frame = requestAnimationFrame(spin)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  if (exit) { exit.onfinish = null; exit.cancel() }
})
</script>

<template>
  <section ref="reel" class="prize-reel" :class="{ landed }" aria-label="Идёт розыгрыш мерча" aria-busy="true">
    <article v-for="card in visibleCards" :key="card.slot" class="rack-card" :data-slot="card.slot" :style="pose(card.slot - position)"
      :class="{ 'rack-previous': card.slot === centerSlot - 1, 'reel-card': card.slot === centerSlot, 'rack-next': card.slot === centerSlot + 1 }"
      :aria-hidden="card.slot !== centerSlot">
      <div class="rack-photo">
        <img v-if="card.image" :src="card.image" :alt="card.prize.name">
        <span v-else class="rack-empty">Изображение мерча<br>будет добавлено</span>
      </div>
      <div class="rack-caption">
        <span class="rack-label" :class="{ 'rack-label-long': prizeLabel(card.prize).length > 18 }">{{ prizeLabel(card.prize) || card.prize.name }}</span>
      </div>
    </article>
    <span :key="centerSlot" class="reel-pointer" aria-hidden="true"></span>
  </section>
</template>

<style scoped>
.prize-reel {
  --card-u: var(--u);
  --card-step: calc(570.5 * var(--card-u));
  --card-drop: calc(186 * var(--card-u));
  position: absolute;
  inset: 0;
  overflow: hidden;
}
.rack-card {
  position: absolute;
  top: calc(170 * var(--u));
  left: calc(50% - 254 * var(--card-u));
  width: calc(509 * var(--card-u));
  height: calc(570 * var(--card-u));
  border-radius: calc(67 * var(--card-u));
  background: url('../assets/merch/reel-card.webp') center / 100% 100% no-repeat;
  overflow: hidden;
  transform-origin: center;
}
.rack-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(transparent 60%, rgb(0 0 0 / 60%));
  pointer-events: none;
  transition: opacity 180ms ease-out;
}
.reel-card::before { opacity: 0; }
.rack-photo {
  position: absolute;
  inset: calc(20 * var(--card-u)) calc(20 * var(--card-u)) auto;
  height: calc(343 * var(--card-u));
  display: grid;
  place-items: center;
  border-radius: calc(48 * var(--card-u));
  overflow: hidden;
  background: #150a0b;
}
.rack-photo img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  transition: opacity 180ms ease-out;
}
.rack-previous .rack-photo img { opacity: .95; }
.rack-empty {
  text-align: center;
  font-size: calc(28 * var(--card-u));
  line-height: 1.2;
  color: #c8bdbd;
}
.rack-caption {
  position: absolute;
  top: calc(359 * var(--card-u));
  bottom: 0;
  left: calc(16 * var(--card-u));
  right: calc(21 * var(--card-u));
  display: grid;
  place-items: center;
  text-align: center;
}
.rack-label {
  min-height: calc(76 * var(--card-u));
  max-height: 94%;
  max-width: 100%;
  align-content: center;
  overflow: auto;
  overflow-wrap: anywhere;
  padding: calc(8 * var(--card-u)) calc(41 * var(--card-u)) calc(6 * var(--card-u));
  color: white;
  border: max(1px, calc(1 * var(--card-u))) solid #fb3b22;
  border-radius: calc(52 * var(--card-u));
  font-size: calc(45 * var(--card-u));
  font-family: 'Merch Prize', 'Segoe UI', Arial, sans-serif;
  line-height: 1;
  font-weight: 400;
  transition: color 180ms ease-out;
}
.rack-next .rack-label { color: rgb(255 255 255 / 81%); }
.rack-label-long {
  font-size: calc(33 * var(--card-u));
  padding-inline: calc(24 * var(--card-u));
}
.reel-pointer {
  position: absolute;
  top: calc(843 * var(--u));
  left: calc(659 * var(--u));
  width: calc(49 * var(--u));
  height: calc(42 * var(--u));
  background: #fff;
  clip-path: polygon(50% 0, 100% 100%, 0 100%);
}
@media (max-width: 700px) and (orientation: portrait) {
  .prize-reel {
    --card-u: min(.14vw, .106svh);
    --card-step: calc(511.5 * var(--card-u));
    --card-drop: calc(98 * var(--card-u));
    position: relative;
    inset: auto;
    width: 100%;
    height: max(66svh, calc(760 * var(--card-u)));
    margin-block: auto;
  }
  .rack-card {
    top: 5%;
    left: calc(50% - 254.5 * var(--card-u));
  }
  .reel-pointer {
    top: calc(5% + 650 * var(--card-u));
    left: calc(50% - 24.5 * var(--card-u));
    width: calc(49 * var(--card-u));
    height: calc(42 * var(--card-u));
  }
}
@media (prefers-reduced-motion: no-preference) {
  .reel-pointer { animation: tick 150ms ease-out; transform-origin: center bottom; }
  @keyframes tick { 35% { transform: rotate(-12deg); } }
  .landed .reel-card { box-shadow: 0 0 calc(52 * var(--card-u)) #ff341753; }
  .landed .reel-card .rack-label { background: #83160c; }
}
</style>
