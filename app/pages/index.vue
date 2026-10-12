<template>
  <div class="lobby-root bg-app text-ink relative flex h-full w-full flex-col overflow-hidden">
    <div class="lobby-backdrop pointer-events-none absolute inset-0" aria-hidden="true" />

    <ALoader v-if="!ready" class="absolute inset-0 z-30" />

    <template v-else>
      <Header />

      <main class="relative z-10 flex flex-1 items-center justify-center p-24">
        <Menu :season="SEASON" @select="onSelect" />
      </main>

      <Footer />
    </template>

    <ProfileModal />
    <TableSetupModal :content="content" />

    <ExitScreen />

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
import ALoader from '~/components/atoms/ALoader.vue';
import ExitScreen from '~/components/organisms/lobby/ExitScreen.vue';
import Footer from '~/components/organisms/layout/Footer.vue';
import Header from '~/components/organisms/layout/Header.vue';
import Menu from '~/components/organisms/lobby/Menu.vue';
import ProfileModal from '~/components/organisms/modals/ProfileModal.vue';
import TableSetupModal from '~/components/organisms/modals/TableSetupModal.vue';
import { useLobbyBoot } from '~/composables/useLobbyBoot';
import { useSeoTitle } from '~/composables/useSeoTitle';
import { exitGame } from '~/composables/ui/useExitScreen';
import { openModal } from '~/composables/ui/useModal';
import { clearToast, notify, useToast } from '~/composables/ui/useToast';

useSeoTitle('Лобби');

const { ready, content, boot } = useLobbyBoot();
const { toast } = useToast();

onMounted(boot);

onBeforeUnmount(clearToast);

const SEASON = 'Сезон 1 · Остановившаяся зима';

const onSelect = item => {
  if (item.id === 'table') {
    openModal('table');
    return;
  }
  if (item.id === 'exit') {
    exitGame();
    return;
  }
  notify(`«${item.title}» — экран в разработке`);
};
</script>
