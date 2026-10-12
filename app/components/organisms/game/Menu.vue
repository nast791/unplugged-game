<template>
  <div
    v-if="open"
    class="fixed inset-0 z-40 flex items-center justify-center p-24"
    @click.self="closeGameMenu()"
    @contextmenu.prevent
  >
    <section
      class="border-line bg-surface rounded-8 flex w-380 flex-col gap-8 border-2 p-12 shadow-2xl"
      aria-label="Меню партии"
    >
      <div class="flex flex-col gap-4">
        <AButton variant="menu" :disabled="isGameOver" @click="resign">Сдаться</AButton>

        <AButton variant="menu" @click="workInProgress('Настройки')">Настройки</AButton>

        <AButton variant="menu" @click="workInProgress('Справка')">Справка</AButton>

        <AButton variant="menu" @click="leaveToLobby">Выйти в лобби</AButton>
      </div>
    </section>
  </div>
</template>

<script setup>
import AButton from '~/components/atoms/AButton.vue';
import { useGameSession } from '~/composables/useGameSession.js';
import { askConfirm } from '~/composables/ui/useConfirm.js';
import { closeGameMenu, openGameMenu, useGameMenu } from '~/composables/ui/useGameMenu.js';
import { getActiveModals } from '~/composables/ui/useModal.js';
import { notify } from '~/composables/ui/useToast';

const { open } = useGameMenu();
const { isGameOver, onResign } = useGameSession();

/** Верхний слой забирает Esc себе: модалка из реестра или слой, который сам закрывается по Esc. */
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
</script>
