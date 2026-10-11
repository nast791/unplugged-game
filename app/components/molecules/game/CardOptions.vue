<template>
  <ul class="flex flex-col gap-2">
    <li v-for="option in list" :key="option.id">
      <button
        v-if="interactive"
        type="button"
        class="flex w-full items-start gap-6 text-left disabled:cursor-not-allowed"
        :class="
          option.disabled
            ? 'text-dim'
            : 'text-ink hover:text-accent cursor-pointer transition-colors'
        "
        :disabled="option.disabled"
        @click="emit('select', option.id)"
      >
        <Icon
          :name="markIcon(option)"
          class="size-16 shrink-0"
          :class="pickedSet.has(String(option.id)) && 'text-success'"
          aria-hidden="true"
        />

        <span class="text-13 leading-1.1">{{ option.text }}</span>
      </button>

      <span
        v-else
        class="text-13 leading-1.1 flex gap-4"
        :class="tone === 'card' ? 'text-white/75' : 'text-dim'"
      >
        <span aria-hidden="true">•</span>
        <span>{{ option.text }}</span>
      </span>
    </li>
  </ul>
</template>

<script setup>
const props = defineProps({
  options: { type: Array, default: () => [] },
  interactive: { type: Boolean, default: false },
  single: { type: Boolean, default: true },
  picked: { type: Array, default: () => [] },
  tone: { type: String, default: 'card' },
});

const emit = defineEmits(['select']);

const list = computed(() => props.options ?? []);
const pickedSet = computed(() => new Set((props.picked ?? []).map(String)));

const markIcon = option => {
  if (pickedSet.value.has(String(option.id))) return 'lucide:check';
  return props.single ? 'lucide:circle' : 'lucide:square';
};
</script>
