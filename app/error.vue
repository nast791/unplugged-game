<template>
  <section
    class="bg-app text-ink flex h-dvh flex-col items-center justify-center gap-16 px-24 text-center"
  >
    <Icon :name="icon" class="text-dim size-64" aria-hidden="true" />

    <p class="text-dim text-16 font-medium tracking-[0.08em] uppercase">{{ code }}</p>

    <h1 class="text-32 font-semibold">{{ title }}</h1>

    <p class="text-dim text-16 max-w-560">{{ text }}</p>

    <button
      type="button"
      class="rounded-4 bg-accent text-18 text-app hover:bg-accent-hover mt-8 px-32 py-12 font-medium transition-colors"
      @click="toLobby()"
    >
      В лобби
    </button>
  </section>
</template>

<script setup>
const props = defineProps({
  error: { type: Object, default: null },
});

const route = useRoute();

const code = computed(() => Number(props.error?.statusCode) || 500);
const missing = computed(() => code.value === 404);
const inParty = computed(() => String(route.path ?? '').startsWith('/game'));

const icon = computed(() => (missing.value ? 'lucide:compass-off' : 'lucide:triangle-alert'));

const title = computed(() => {
  if (!missing.value) return 'Страница не открылась';
  return inParty.value ? 'Партия не найдена' : 'Страница не найдена';
});

const text = computed(() => {
  const own = typeof props.error?.message === 'string' ? props.error.message.trim() : '';
  if (own && !own.startsWith('[GET]') && !own.startsWith('[POST]')) return own;
  if (!missing.value) return 'Попробуйте ещё раз — если повторяется, начните новую партию.';
  return inParty.value ? 'Такой партии у сервера нет.' : 'Такого адреса в игре нет.';
});

const toLobby = () => clearError({ redirect: '/' });
</script>
