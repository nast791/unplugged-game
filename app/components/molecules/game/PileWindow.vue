<template>
  <AModal :name="props.name" :title="props.title" :close-btn="false" :ui="ui">
    <template #header>
      <span
        class="text-17 font-semibold tracking-[0.02em] uppercase"
        :style="{ color: HERO_INFO_TONE }"
      >
        {{ props.title }}
      </span>

      <AButton variant="ghost" icon :aria-label="props.closeLabel" @click="closeModal(props.name)">
        <Icon name="lucide:x" class="size-24" aria-hidden="true" />
      </AButton>
    </template>

    <slot />
  </AModal>
</template>

<script setup>
import AButton from '~/components/atoms/AButton.vue';
import AModal from '~/components/atoms/AModal.vue';
import { HERO_INFO_TONE } from '~/constants/colors.js';
import { closeModal } from '~/composables/ui/useModal.js';

const props = defineProps({
  name: { type: String, required: true },
  title: { type: String, default: '' },
  closeLabel: { type: String, default: 'Закрыть' },
});

const ui = {
  modal_content: 'w-92dvw max-w-1120 rounded-8',
  modal_header:
    'flex items-center justify-between gap-12 border-b-2 border-line/70 py-10 pr-6 pl-16',
  modal_body: 'flex flex-col gap-12 p-16',
};
</script>
