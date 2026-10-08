<template>
  <section class="relative flex items-center gap-16">
    <span class="text-ink flex items-center gap-6" :title="`Игровая валюта: ${currencyLabel}`">
      <Icon name="lucide:coins" class="text-gold size-20" aria-hidden="true" />
      <span class="text-16 lining-nums">{{ currencyLabel }}</span>
    </span>

    <ADropdown :items="menuItems" @select="onSelect">
      <template #trigger>
        <AButton
          variant="ghost"
          icon
          class="rounded-full p-0"
          :aria-label="`Профиль игрока ${props.nick}`"
        >
          <span
            class="from-info via-violet to-pink inline-flex rounded-full bg-gradient-to-br p-[1px]"
          >
            <AAvatar
              :icon="props.avatar || DEFAULT_AVATAR"
              :alt="props.nick"
              class="bg-surface-2 size-44 border-0"
            />
          </span>
        </AButton>
      </template>
    </ADropdown>
  </section>
</template>

<script setup>
/** Аватар — голая иконка в градиентном кольце, монеты без рамки (решение владельца). */
const props = defineProps({
  nick: { type: String, default: '' },
  avatar: { type: String, default: '' },
  currency: { type: Number, default: 0 },
});

const DEFAULT_AVATAR = 'lucide:user-round';

const emit = defineEmits(['profile', 'settings', 'exit']);

/** «1 240» считаем руками: Intl на сервере и в браузере ставит разные пробелы — это гидратация. */
const currencyLabel = computed(() =>
  String(Math.max(0, Math.trunc(props.currency))).replace(/\B(?=(\d{3})+(?!\d))/g, ' '),
);

/** `computed`: имя меняется после сохранения в модалке, константа держала бы старое. */
const menuItems = computed(() => [
  { heading: props.nick },
  { separator: true },
  { id: 'profile', label: 'Профиль', icon: 'lucide:user-round' },
  { id: 'settings', label: 'Настройки', icon: 'lucide:settings' },
  { separator: true },
  { id: 'exit', label: 'Выход', icon: 'lucide:log-out' },
]);

const onSelect = item => emit(item.id);
</script>
