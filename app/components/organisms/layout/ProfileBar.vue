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
          :aria-label="`Профиль игрока ${nick}`"
        >
          <span
            class="from-info via-violet to-pink inline-flex rounded-full bg-gradient-to-br p-1"
          >
            <AAvatar
              :icon="avatar || DEFAULT_AVATAR"
              :alt="nick"
              class="bg-surface-2 size-44 border-0"
            />
          </span>
        </AButton>
      </template>
    </ADropdown>
  </section>
</template>

<script setup>
import AAvatar from '~/components/atoms/AAvatar.vue';
import AButton from '~/components/atoms/AButton.vue';
import ADropdown from '~/components/atoms/ADropdown.vue';
import { useProfile } from '~/composables/useProfile';
import { exitGame } from '~/composables/ui/useExitScreen';
import { openModal } from '~/composables/ui/useModal';
import { notify } from '~/composables/ui/useToast';

const { nick, avatar, currency } = useProfile();

const DEFAULT_AVATAR = 'lucide:user-round';

const currencyLabel = computed(() =>
  String(Math.max(0, Math.trunc(currency.value))).replace(/\B(?=(\d{3})+(?!\d))/g, ' '),
);

const menuItems = computed(() => [
  { heading: nick.value },
  { separator: true },
  { id: 'profile', label: 'Профиль', icon: 'lucide:user-round' },
  { id: 'settings', label: 'Настройки', icon: 'lucide:settings' },
  { separator: true },
  { id: 'exit', label: 'Выход', icon: 'lucide:log-out' },
]);

const onSelect = item => {
  if (item.id === 'profile') {
    openModal('profile');
    return;
  }
  if (item.id === 'exit') {
    exitGame();
    return;
  }
  notify('«Настройки» — экран в разработке');
};
</script>
