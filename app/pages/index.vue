<template>
  <div class="lobby-root bg-app text-ink relative flex h-dvh w-full flex-col overflow-hidden">
    <div class="lobby-backdrop pointer-events-none absolute inset-0" aria-hidden="true" />

    <ALoader v-if="!ready" class="absolute inset-0 z-30" />

    <template v-else>
      <header class="relative z-10 flex items-start justify-between gap-24 p-24">
        <NuxtLink to="/" class="inline-flex" aria-label="UnPlugged — на главную">
          <BrandLogo class="h-32 w-auto" />
        </NuxtLink>
        <ProfileBar
          :nick="nick"
          :avatar="avatar"
          :currency="currency"
          @profile="onProfileAction('profile')"
          @settings="onProfileAction('settings')"
          @exit="onProfileAction('exit')"
        />
      </header>

      <main class="relative z-10 flex flex-1 items-center justify-center p-24">
        <Menu :season="SEASON" @select="onSelect" />
      </main>

      <Footer />
    </template>

    <ProfileModal :nick="profile?.nick ?? ''" :avatar="avatar" @save="saveProfile" />
    <TableSetupModal :content="content" />

    <ExitScreen v-if="exited" @back="exited = false" />

    <p
      v-if="toast"
      class="rounded-4 border-line bg-surface text-16 pointer-events-none absolute bottom-96 left-1/2 z-50 -translate-x-1/2 border-2 px-20 py-10"
      role="status"
      aria-live="polite"
    >
      {{ toast }}
    </p>
  </div>
</template>

<script setup>
import BrandLogo from '~/svg/brand/logo.svg';
import { useLobbyBoot } from '~/composables/useLobbyBoot';
import { useProfile } from '~/composables/useProfile';
import { useSeoTitle } from '~/composables/useSeoTitle';
import { openModal } from '~/composables/ui/useModal';

/** Лобби (`docs/ui-plan.md` §2). Композаблы импортированы явно — см. `AGENTS.md` §12. */
useSeoTitle('Лобби');

const { ready, content, boot } = useLobbyBoot();
const { profile, nick, currency, avatar, setNick, setAvatar } = useProfile();

onMounted(boot);

/** Сезон — динамика, поэтому пропом; пока его не отдаёт контент, подпись стоит здесь. */
const SEASON = 'Сезон 1 · Остановившаяся зима';

const exited = ref(false);
const toast = ref('');
let toastTimer = null;

const notify = message => {
  toast.value = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value = '';
  }, 2400);
};

onBeforeUnmount(() => clearTimeout(toastTimer));

/** Пункт меню = режим или раздел: экранов пока нет, поэтому честный тост вместо пустой ссылки. */
const onSelect = item => {
  if (item.id === 'table') {
    openModal('table');
    return;
  }
  if (item.id === 'exit') {
    exited.value = true;
    return;
  }
  notify(`«${item.title}» — экран в разработке`);
};

/** Меню профиля: профиль и выход работают, настройки появятся вместе с экраном настроек (§6). */
const onProfileAction = action => {
  if (action === 'profile') {
    openModal('profile');
    return;
  }
  if (action === 'exit') {
    exited.value = true;
    return;
  }
  notify('«Настройки» — экран в разработке');
};

const saveProfile = values => {
  setNick(values.nick);
  setAvatar(values.avatar);
  notify('Профиль сохранён');
};
</script>
