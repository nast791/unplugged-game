<template>
  <section class="relative flex items-center gap-16">
    <span class="text-ink flex items-center gap-6" :title="`Игровая валюта: ${currencyLabel}`">
      <Icon name="lucide:coins" class="text-gold size-24!" aria-hidden="true" />
      <span class="text-16 lining-nums">{{ currencyLabel }}</span>
    </span>

    <AButton
      variant="ghost"
      icon
      class="rounded-full p-0"
      :aria-label="`Профиль игрока ${nick}`"
      @click="openProfile"
    >
      <span class="from-info via-violet to-pink inline-flex rounded-full bg-gradient-to-br p-1">
        <AAvatar
          :icon="avatar || DEFAULT_AVATAR"
          :alt="nick"
          class="bg-surface-2 size-44 border-0"
        />
      </span>
    </AButton>
  </section>
</template>

<script setup>
import AAvatar from '~/components/atoms/AAvatar.vue';
import AButton from '~/components/atoms/AButton.vue';
import { useProfile } from '~/composables/useProfile';
import { openModal } from '~/composables/ui/useModal';

const { nick, avatar, currency } = useProfile();

const DEFAULT_AVATAR = 'lucide:user-round';

const currencyLabel = computed(() =>
  String(Math.max(0, Math.trunc(currency.value))).replace(/\B(?=(\d{3})+(?!\d))/g, ' '),
);

const openProfile = () => openModal('profile');
</script>
