<template>
  <section
    class="bg-app/95 backdrop-blur-8 absolute inset-0 z-40 flex flex-col items-center justify-center gap-20"
  >
    <Icon name="lucide:door-open" class="text-dim size-64" aria-hidden="true" />
    <h2 class="text-32 font-semibold">Вы вышли из игры</h2>
    <p class="text-16 text-dim max-w-520 text-center">
      Вкладку можно закрыть. Профиль и настройки сохранены в этом браузере.
    </p>
    <button
      type="button"
      class="rounded-4 bg-accent text-18 text-app hover:bg-accent-hover mt-8 px-32 py-12 font-medium transition-colors"
      @click="emit('back')"
    >
      Вернуться
    </button>
  </section>
</template>

<script setup>
/**
 * Организм — всегда секция (конвенция владельца). Вкладку скриптом не закрыть (`window.close`
 * только для окон, открытых скриптом), поэтому «Выход» — экран прощания с кнопкой возврата;
 * с авторизацией он же станет выходом из аккаунта (§2.1).
 */
const emit = defineEmits(['back']);
</script>
