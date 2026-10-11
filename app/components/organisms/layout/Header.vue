<template>
  <section class="relative z-10 flex items-start justify-between gap-24 p-24">
    <div class="flex items-center gap-64">
      <NuxtLink to="/" class="inline-flex" aria-label="UnPlugged — на главную">
        <BrandLogo class="h-32 w-auto" />
      </NuxtLink>

      <div v-if="hasPartyInfo" class="flex flex-wrap items-center gap-16">
        <span v-if="props.mode" class="text-24 font-semibold tracking-[0.08em] uppercase">{{
          props.mode
        }}</span>
        <span
          v-if="props.mode && (props.stage || props.elapsed)"
          class="bg-line h-24 w-1"
          aria-hidden="true"
        />
        <span v-if="props.stage" class="text-16 text-dim lining-nums">{{ props.stage }}</span>
        <span
          v-if="props.elapsed"
          class="text-16 text-dim lining-nums"
          title="Время с начала партии"
        >
          {{ props.elapsed }}
        </span>
      </div>
    </div>

    <ProfileBar />
  </section>
</template>

<script setup>
import ProfileBar from '~/components/organisms/layout/ProfileBar.vue';
import BrandLogo from '~/svg/brand/logo.svg';

const props = defineProps({
  mode: { type: String, default: '' },
  stage: { type: String, default: '' },
  elapsed: { type: String, default: '' },
});

const hasPartyInfo = computed(() => Boolean(props.mode || props.stage || props.elapsed));
</script>
