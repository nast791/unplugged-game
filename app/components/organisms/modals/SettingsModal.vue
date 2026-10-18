<template>
  <AModal name="settings" title="Настройки">
    <div class="flex flex-col gap-16">
      <ARadioGroup
        v-model="draft"
        :label="SETTINGS_GROUP_TITLE"
        :options="ANIMATION_SPEED_OPTIONS"
        data-animation-speed
      />

      <p class="text-14 text-dim leading-1.2">{{ hint }}</p>
    </div>

    <template #footer>
      <AButton @click="close">Готово</AButton>
    </template>
  </AModal>
</template>

<script setup>
import AButton from '~/components/atoms/AButton.vue';
import AModal from '~/components/atoms/AModal.vue';
import ARadioGroup from '~/components/atoms/ARadioGroup.vue';
import { ANIMATION_SPEED_OPTIONS } from '~/constants/animation.js';
import { closeModal } from '~/composables/ui/useModal.js';
import { useSettings } from '~/composables/ui/useSettings.js';

const SETTINGS_GROUP_TITLE = 'Скорость анимации';

const { animation, setAnimation } = useSettings();

const draft = ref(animation.value);
const hint = computed(() => {
  const label =
    ANIMATION_SPEED_OPTIONS.find(option => option.value === draft.value)?.label ?? 'Средне';
  return `Сейчас: ${label}. Скорость задаёт паузы в окне битвы, перелёт карт и показ урона: быстрее — короче, медленнее — есть время прочитать. Совсем без пауз процесс не читается, поэтому нижняя граница — «быстро».`;
});

watch(draft, value => setAnimation(value));

const close = () => closeModal('settings');
</script>
