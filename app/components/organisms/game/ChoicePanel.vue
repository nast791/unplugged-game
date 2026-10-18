<template>
  <section
    v-if="options.length"
    class="rounded-6 border-accent/60 bg-surface/95 backdrop-blur-16 w-full max-w-720 border-2 px-20 py-14 shadow-2xl"
  >
    <div class="flex items-start gap-14">
      <Icon name="lucide:list-checks" class="text-accent size-22 shrink-0" aria-hidden="true" />

      <div class="flex min-w-0 flex-1 flex-col gap-10">
        <CardOptions
          interactive
          :single="choiceCount <= 1"
          :options="options"
          :picked="picked"
          @select="onChoiceClick"
        />

        <span class="text-16 text-dim">
          {{ status }}
        </span>
      </div>
    </div>
  </section>
</template>

<script setup>
import CardOptions from '~/components/molecules/game/CardOptions.vue';
import { useGameSession } from '~/composables/game/useGameSession.js';

const { choices, targetingChoices, choiceCount, choicePicked, onChoiceClick } = useGameSession();

const options = computed(() =>
  [...choices.value, ...targetingChoices.value].map(entry => ({
    id: entry.optionId,
    text: entry.title,
    disabled: entry.disabled,
  })),
);
const picked = choicePicked;
const status = computed(() => {
  const count = choiceCount.value;
  const marked = picked.value.length;
  if (count > 1) {
    if (marked >= count) return 'Нажмите «Подтвердить»';
    return marked > 0 ? `Выбрано ${marked} из ${count}` : `Выберите варианты (нужно ${count})`;
  }
  return marked ? 'Нажмите «Подтвердить»' : 'Выберите вариант';
});
</script>
