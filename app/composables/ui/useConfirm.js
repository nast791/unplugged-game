import { computed, ref } from 'vue';
import { closeModal, openModal, useIsModalOpen } from '~/composables/ui/useModal.js';

const NAME = 'confirm';

const request = ref(null);

export const askConfirm = options =>
  new Promise(resolve => {
    request.value = {
      title: '',
      text: '',
      confirmLabel: 'Подтвердить',
      cancelLabel: 'Отмена',
      ...options,
      resolve,
    };
    openModal(NAME);
  });

export const answerConfirm = value => {
  const current = request.value;
  request.value = null;
  closeModal(NAME);
  current?.resolve?.(value);
};

export const useConfirm = () => ({
  request: computed(() => request.value),
  isOpen: useIsModalOpen(NAME),
  answerConfirm,
});
