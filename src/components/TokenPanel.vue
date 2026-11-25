<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import type { TokenRules } from '../types';
import PressButton from './PressButton.vue';
import crown from '../assets/merch/token-crown.webp';
import arrow from '../assets/merch/token-arrow.webp';
import coin from '../assets/merch/token-coin.webp';
import heart from '../assets/merch/token-heart.webp';

const tokens = defineModel<string[]>({ required: true });
const props = defineProps<{ rules: TokenRules; valid: boolean; busy: boolean; error: string }>();
const emit = defineEmits<{ launch: [] }>();

// Keep the physical symbols' indices in the saved combination, independently of their visual order.
const slots = [
  { index: 1, name: 'Корона', icon: crown },
  { index: 3, name: 'Стрелка', icon: arrow },
  { index: 0, name: 'Монета', icon: coin },
  { index: 2, name: 'Сердце', icon: heart },
];
const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'backspace'];
const activeIndex = ref<number | null>(null);
const fieldFor = (index: number) => document.querySelector<HTMLInputElement>(`#token-${index}`);

function isEditingTarget(target: EventTarget | null) {
  return target instanceof Element && !!target.closest('.token-slot, .token-keypad');
}

function hideKeypad() {
  activeIndex.value = null;
  const focused = document.activeElement;
  if (focused instanceof HTMLElement && isEditingTarget(focused)) focused.blur();
}

function dismissOutside(event: Event) {
  if (activeIndex.value === null || isEditingTarget(event.target)) return;
  // Closing on pointerdown would move the launch button before the tap finishes on a phone.
  if (event.target instanceof Element && event.target.closest('.launch:enabled')) return;
  hideKeypad();
}

onMounted(() => {
  document.addEventListener('pointerdown', dismissOutside);
  document.addEventListener('focusin', dismissOutside);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', dismissOutside);
  document.removeEventListener('focusin', dismissOutside);
});

function inputToken(index: number, event: Event) {
  const field = event.target as HTMLInputElement;
  const edit = event as InputEvent;
  const { min, max, maxLength } = props.rules;
  const value = field.value.replace(/\D/g, '').slice(0, maxLength);
  const enteredDigit = edit.data == null ? value !== tokens.value[index] : /\d/.test(edit.data);
  if (field.value !== value) field.value = value;
  const updated = [...tokens.value];
  updated[index] = value;
  tokens.value = updated;

  if (!enteredDigit || edit.isComposing || edit.inputType?.startsWith('delete')) return;
  const validSingleDigit = value.length === 1 && Number(value) >= min && Number(value) <= max;
  if (!validSingleDigit && value.length !== maxLength) return;
  const next = slots[slots.findIndex(slot => slot.index === index) + 1];
  if (next) {
    const nextField = fieldFor(next.index);
    nextField?.focus();
    nextField?.select();
  }
}

function pressKey(key: string) {
  if (activeIndex.value === null || props.busy) return;
  const field = fieldFor(activeIndex.value);
  if (!field) return;
  let start = field.selectionStart ?? field.value.length;
  let end = field.selectionEnd ?? start;
  const digit = key !== 'C' && key !== 'backspace';
  if (key === 'C') {
    start = 0;
    end = field.value.length;
  } else if (key === 'backspace' && start === end) {
    start = Math.max(0, start - 1);
  }
  if (digit && field.value.length - (end - start) >= props.rules.maxLength) return;
  field.focus();
  field.setRangeText(digit ? key : '', start, end, 'end');
  // Native and on-screen entry must apply identical token rules and focus advancement.
  field.dispatchEvent(new InputEvent('input', {
    bubbles: true, data: digit ? key : null, inputType: digit ? 'insertText' : 'deleteContentBackward',
  }));
}
</script>

<template>
  <section class="token-panel" :class="{ 'keypad-open': activeIndex !== null }" aria-labelledby="token-title"
    :aria-busy="busy" @keydown.esc.prevent="hideKeypad">
    <h2 id="token-title" class="sr-only">Введи числа с токенов</h2>
    <div class="token-grid">
      <label v-for="token in slots" :key="token.index" class="token-slot" :title="token.name">
        <span class="token-tile"><img :src="token.icon" alt=""><span class="sr-only">{{ token.name }}</span></span>
        <span class="token-field" :class="{ filled: tokens[token.index] }">
          <input :id="`token-${token.index}`" :value="tokens[token.index]" :disabled="busy"
            inputmode="none" pattern="[0-9]*" autocomplete="off" aria-controls="token-keypad" :aria-label="`Число: ${token.name}`"
            :style="{ '--digits': Math.max(3, tokens[token.index]?.length ?? 0) }"
            @focus="activeIndex = token.index" @click="activeIndex = token.index" @input="inputToken(token.index, $event)">
        </span>
      </label>
    </div>
    <div id="token-keypad" class="token-keypad" role="group" aria-label="Цифровая клавиатура"
      :inert="activeIndex === null || busy" @pointerdown.prevent>
      <PressButton v-for="key in keys" :key="key" type="button" class="token-key"
        :aria-label="key === 'C' ? 'Очистить поле' : key === 'backspace' ? 'Стереть цифру' : key" @click="pressKey(key)">
        <svg v-if="key === 'backspace'" viewBox="0 0 44 32" fill="none" stroke="currentColor" stroke-width="2.5"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M15 2h25a2 2 0 0 1 2 2v24a2 2 0 0 1-2 2H15L2 16Z"/>
          <path d="m21 11 10 10m0-10L21 21"/>
        </svg>
        <template v-else>{{ key }}</template>
      </PressButton>
    </div>
    <p v-if="error" class="token-message error" role="alert">{{ error }}</p>
    <PressButton framed settle type="button" class="primary action-button launch" :disabled="!valid || busy" @click="emit('launch')">
      {{ busy ? 'ОБРАБОТКА...' : 'ЗАПУСТИТЬ' }}
    </PressButton>
    <p class="sr-only">Демо: любые корректные числа. Подлинность физических токенов не проверяется.</p>
  </section>
</template>
