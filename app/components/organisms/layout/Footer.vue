<template>
  <section
    class="text-14 text-dim relative z-10 flex flex-wrap items-center justify-between gap-12 px-24 pb-20"
  >
    <span>{{ RIGHTS }}</span>
    <span class="flex items-center gap-12 tracking-[0.08em] uppercase">
      <ATooltip :text="TOOLTIPS.footer.age()">
        <span class="border-line/70 border-2 px-8 py-2"> 16+ </span>
      </ATooltip>
      <span>сборка {{ appVersion }}</span>
    </span>
  </section>
</template>

<script setup>
import ATooltip from '~/components/atoms/ATooltip.vue';
import { TOOLTIPS } from '~/constants/tooltips.js';

const { appVersion } = useRuntimeConfig().public;

const RIGHTS = '© 2026 <правообладатель>. Все права защищены.';
</script>
