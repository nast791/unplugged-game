<template>
  <section class="relative">
    <div
      class="from-info/25 via-violet/20 to-pink/25 blur-80 pointer-events-none absolute -inset-60 rounded-full bg-gradient-to-br"
      aria-hidden="true"
    />

    <div
      class="rounded-6 from-info/25 to-pink/25 relative bg-gradient-to-br via-white/10 p-[2px] shadow-2xl"
    >
      <div class="bg-app/55 rounded-5 backdrop-blur-16 flex w-380 flex-col gap-6 p-6">
        <nav
          ref="menuRef"
          class="flex flex-col gap-4"
          aria-label="Главное меню"
          @keydown.down.prevent="move(1)"
          @keydown.up.prevent="move(-1)"
        >
          <AButton
            v-for="item in MENU_ITEMS"
            :key="item.id"
            variant="menu"
            data-menu-item
            @click="emit('select', item)"
          >
            <span class="text-20 tracking-[0.12em] uppercase">{{ item.title }}</span>
          </AButton>
        </nav>

        <div class="flex flex-col items-center gap-6 pt-6">
          <div
            class="via-line h-1 w-full bg-gradient-to-r from-transparent to-transparent"
            aria-hidden="true"
          />
          <p v-if="props.season" class="text-accent/90 text-14 tracking-[0.08em] uppercase">
            {{ props.season }}
          </p>
          <p class="text-dim/70 text-14 tracking-[0.1em] uppercase" aria-live="polite">{{ tip }}</p>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { MENU_ITEMS, TIPS } from '#shared/constants/ui.js';
import AButton from '~/components/atoms/AButton.vue';

const props = defineProps({
  season: { type: String, default: '' },
});

const emit = defineEmits(['select']);

const TIP_INTERVAL_MS = 7000;

const menuRef = ref(null);
const tipIndex = ref(0);
const tip = computed(() => TIPS[tipIndex.value % TIPS.length]);

let tipTimer = null;

onMounted(() => {
  tipTimer = setInterval(() => {
    tipIndex.value = (tipIndex.value + 1) % TIPS.length;
  }, TIP_INTERVAL_MS);
});

onBeforeUnmount(() => clearInterval(tipTimer));

const move = step => {
  const buttons = [...(menuRef.value?.querySelectorAll('button[data-menu-item]') ?? [])];
  if (!buttons.length) return;
  const current = buttons.indexOf(document.activeElement);
  const next = current < 0 ? 0 : (current + step + buttons.length) % buttons.length;
  buttons[next]?.focus();
};
</script>
