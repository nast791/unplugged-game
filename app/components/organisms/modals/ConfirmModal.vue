<template>
  <AModal name="confirm" :title="request?.title ?? ''" :ui="{ modal_content: 'w-420' }">
    <p class="text-16">{{ request?.text }}</p>

    <template #footer>
      <AButton variant="secondary" @click="cancel">{{ request?.cancelLabel ?? 'Отмена' }}</AButton>

      <AButton variant="primary" @click="confirm">
        {{ request?.confirmLabel ?? 'Подтвердить' }}
      </AButton>
    </template>
  </AModal>
</template>

<script setup>
import AButton from '~/components/atoms/AButton.vue';
import AModal from '~/components/atoms/AModal.vue';
import { useConfirm } from '~/composables/ui/useConfirm.js';

const { request, isOpen, answerConfirm } = useConfirm();

/** Закрытие окна без кнопки (Esc, крестик, клик по подложке) — тот же отказ, иначе промис вызывающего повиснет. */
watch(isOpen, open => {
  if (!open) answerConfirm(false);
});

const confirm = () => answerConfirm(true);

const cancel = () => answerConfirm(false);
</script>
