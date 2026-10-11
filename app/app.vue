<template>
  <div>
    <Html lang="ru" class="h-dvh overflow-hidden scroll-smooth" />
    <Body
      class="font-display text-18 text-primary w-min-content h-dvh overflow-hidden scroll-smooth bg-white leading-[1.2] font-normal -tracking-[0.01em] lining-nums outline-none"
    />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>

<script setup>
/** Заголовок по умолчанию: страницы перекрывают его своим `useSeoTitle`. */
useHead({ title: 'Настольная игра' });
</script>
