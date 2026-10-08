<template>
  <section
    class="text-12 text-dim relative z-10 flex flex-wrap items-center justify-between gap-12 px-24 pb-20"
  >
    <span>{{ RIGHTS }}</span>
    <span class="flex items-center gap-12 tracking-[0.16em] uppercase">
      <span class="rounded-0 border-line/70 border-2 px-8 py-2" title="Возрастной рейтинг">
        16+
      </span>
      <span>сборка {{ appVersion }}</span>
    </span>
  </section>
</template>

<script setup>
const { appVersion } = useRuntimeConfig().public;

/** Правообладателя владелец даёт перед публикацией: пока плейсхолдер (`docs/ui-plan.md` §2.4). */
const RIGHTS = '© 2026 <правообладатель>. Все права защищены.';
</script>
