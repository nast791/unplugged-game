<template>
  <div
    v-if="open"
    class="bg-app/94 backdrop-blur-8 fixed inset-0 z-50 flex items-center justify-center p-24"
    @click.self="closeGameMenu()"
    @contextmenu.prevent
  >
    <section
      class="border-line bg-surface rounded-8 flex w-420 max-w-full flex-col gap-8 border-2 p-16 shadow-2xl"
      aria-label="Меню партии"
    >
      <div class="flex items-center justify-between gap-12 pb-4">
        <span class="text-15 text-dim tracking-[0.1em] uppercase">Меню партии</span>

        <AButton variant="ghost" icon aria-label="Вернуться в партию" @click="closeGameMenu()">
          <Icon name="lucide:x" class="size-24" aria-hidden="true" />
        </AButton>
      </div>

      <AButton variant="menu" @click="openProfile">Профиль</AButton>

      <AButton variant="menu" @click="openSettings">Настройки</AButton>

      <AButton variant="menu" @click="workInProgress('Справка')">Справка</AButton>

      <AButton variant="menu" :disabled="isGameOver" @click="resign">Сдаться</AButton>

      <AButton variant="menu" @click="leaveToLobby">Выйти в лобби</AButton>
    </section>
  </div>
</template>

<script setup>
import AButton from '~/components/atoms/AButton.vue';
import { useGameSession } from '~/composables/game/useGameSession.js';
import { askConfirm } from '~/composables/ui/useConfirm.js';
import { closeGameMenu, openGameMenu, useGameMenu } from '~/composables/ui/useGameMenu.js';
import { getActiveModals, openModal } from '~/composables/ui/useModal.js';
import { notify } from '~/composables/ui/useToast';

const { open } = useGameMenu();
const { isGameOver, onResign } = useGameSession();

const escapeTaken = () =>
  getActiveModals().value.length > 0 || Boolean(document.querySelector('[data-esc-layer]'));

const onKeydown = event => {
  if (event.key !== 'Escape') return;
  if (open.value) {
    closeGameMenu();
    return;
  }
  if (escapeTaken()) return;
  openGameMenu();
};

onMounted(() => document.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));

const resign = async () => {
  closeGameMenu();
  const confirmed = await askConfirm({
    title: 'Сдаться?',
    text: 'Партия для вас завершится.',
    confirmLabel: 'Сдаться',
  });
  if (!confirmed) return;
  await onResign();
};

const leaveToLobby = async () => {
  closeGameMenu();
  const confirmed = await askConfirm({
    title: 'Выйти в лобби?',
    text: 'Партия останется только по своему адресу в этой вкладке.',
    confirmLabel: 'Выйти',
  });
  if (!confirmed) return;
  await navigateTo('/');
};

const workInProgress = title => {
  closeGameMenu();
  notify(`«${title}» — экран в разработке`);
};

const openProfile = () => {
  closeGameMenu();
  openModal('profile');
};

const openSettings = () => {
  closeGameMenu();
  openModal('settings');
};
</script>
