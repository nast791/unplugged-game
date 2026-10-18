<template>
  <header
    class="relative z-10 flex items-center justify-between gap-24 py-12"
    :class="props.compact ? 'pr-12 pl-24' : 'px-24'"
  >
    <div class="flex items-center gap-64">
      <NuxtLink to="/" class="inline-flex" aria-label="UnPlugged — на главную">
        <BrandLogo class="h-32 w-auto" />
      </NuxtLink>

      <div v-if="hasPartyInfo" class="flex flex-wrap items-center gap-16">
        <span v-if="props.mode" class="text-24 font-semibold tracking-[0.02em] uppercase">{{
          props.mode
        }}</span>
        <span
          v-if="props.mode && (props.stage || props.elapsed)"
          class="bg-line h-24 w-1"
          aria-hidden="true"
        />
        <span v-if="props.stage" class="text-16 text-dim lining-nums">{{ props.stage }}</span>
        <ATooltip v-if="props.elapsed" :text="TOOLTIPS.header.elapsed()">
          <span class="text-16 text-dim lining-nums">{{ props.elapsed }}</span>
        </ATooltip>
      </div>
    </div>

    <div class="flex items-center gap-16">
      <AButton
        v-if="props.menu"
        variant="ghost"
        icon
        aria-label="Меню партии"
        @click="openGameMenu()"
      >
        <Icon name="lucide:settings" class="size-24!" aria-hidden="true" />
      </AButton>

      <ProfileBar />
    </div>
  </header>
</template>

<script setup>
import AButton from '~/components/atoms/AButton.vue';
import ATooltip from '~/components/atoms/ATooltip.vue';
import ProfileBar from '~/components/organisms/layout/ProfileBar.vue';
import { TOOLTIPS } from '~/constants/tooltips.js';
import { openGameMenu } from '~/composables/ui/useGameMenu.js';
import BrandLogo from '~/svg/brand/logo.svg';

const props = defineProps({
  mode: { type: String, default: '' },
  stage: { type: String, default: '' },
  elapsed: { type: String, default: '' },
  menu: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
});

const hasPartyInfo = computed(() => Boolean(props.mode || props.stage || props.elapsed));
</script>
