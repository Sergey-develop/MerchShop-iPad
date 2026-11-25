<script setup lang="ts">
import { nextTick, ref } from 'vue'

const props = withDefaults(defineProps<{
  as?: 'button' | 'summary'
  framed?: boolean
  settle?: boolean
}>(), { as: 'button' })

const emit = defineEmits<{ click: [event: MouseEvent] }>()
const surface = ref<HTMLElement>()
const pressed = ref(false)
const heldPointer = ref<number | null>(null)
let pulse = 0
let waiting = false

function hold(event: PointerEvent) {
  if (event.pointerType !== 'mouse' && event.button === 0) heldPointer.value = event.pointerId
}

function release(event: PointerEvent) {
  if (heldPointer.value === event.pointerId) heldPointer.value = null
}

async function showPress(control: HTMLElement) {
  const current = ++pulse
  pressed.value = true
  await nextTick()
  const transitions = (surface.value ?? control).getAnimations().filter(animation =>
    'transitionProperty' in animation && ['transform', 'box-shadow'].includes(String(animation.transitionProperty))
  )
  await Promise.allSettled(transitions.map(animation => animation.finished))
  if (current === pulse) pressed.value = false
}

async function activate(event: MouseEvent) {
  const control = event.currentTarget as HTMLElement
  if (waiting) {
    event.preventDefault()
    return
  }
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    emit('click', event)
    return
  }

  const feedback = showPress(control)
  if (!props.settle || !event.detail) {
    // Typing, timed answers and actions requiring a user gesture run on this click.
    emit('click', event)
    return
  }

  waiting = true
  const submitter = control instanceof HTMLButtonElement && control.type === 'submit' ? control : null
  if (submitter?.form) event.preventDefault()
  await feedback
  waiting = false
  if (!control.isConnected || control.matches(':disabled') || control.closest('[inert]')) return
  emit('click', event)
  if (submitter) submitter.form?.requestSubmit(submitter)
}
</script>

<template>
  <component :is="as" class="press-control" :class="{ 'press-frame': framed, 'is-pressed': pressed || heldPointer !== null }"
    @pointerdown="hold" @pointerup="release" @pointercancel="release" @pointerleave="release" @click="activate">
    <span v-if="framed" ref="surface" class="press-face"><slot /></span>
    <slot v-else />
  </component>
</template>

<style scoped>
.press-control {
  --button-state-motion: 200ms ease-out;
}
.press-control:not(.press-frame) {
  box-shadow: 0 2px 4px rgb(0 0 0 / 45%), inset 0 1px 1px rgb(255 255 255 / 12%);
}
.press-frame {
  background: transparent;
  color: white;
}
.press-frame:disabled { color: #f6877f; }
.press-face {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: inherit;
  border-radius: inherit;
  background: var(--face-fill, #ed0f00);
  box-shadow: 3px 7px 9px rgb(40 0 0 / 48%), inset 2px 2px 5px 1px #ffffff54, inset -1px -1px 2px #ffffff24;
  pointer-events: none;
  user-select: none;
}
@media (hover: hover) and (pointer: fine) {
  .press-frame:enabled:hover .press-face { background: var(--face-hover, var(--face-fill, #ed0f00)); }
}
.press-frame:enabled:is(:active, .is-pressed) { background: #a10a00; }
.press-frame:enabled:is(:active, .is-pressed) .press-face {
  background: #cf0d00;
  box-shadow: 1px 2px 4px rgb(40 0 0 / 42%), inset 0 3px 7px 1px #68150c55, inset 0 -1px 2px #ffffff1f;
}
.press-control:not(.press-frame, :disabled):is(:active, .is-pressed) {
  box-shadow: 0 1px 2px rgb(0 0 0 / 40%), inset 0 3px 7px 1px rgb(0 0 0 / 28%), inset 0 -1px 2px rgb(255 255 255 / 12%);
}
@media (prefers-reduced-motion: no-preference) {
  .press-frame { transition: color var(--button-state-motion); }
  .press-face, .press-control:not(.press-frame) {
    transition: transform 140ms cubic-bezier(.23, 1, .32, 1), box-shadow 140ms ease-out;
  }
  .press-frame:enabled:is(:active, .is-pressed) .press-face,
  .press-control:not(.press-frame, :disabled):is(:active, .is-pressed) {
    transform: translateY(2px) scale(.985);
    transition-duration: 110ms;
  }
}
</style>
