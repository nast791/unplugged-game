<template>
  <DialogRoot :open="open" :modal="props.modal" @update:open="onOpenChange">
    <DialogPortal>
      <DialogOverlay :class="styles.modal_overlay" />

      <DialogContent
        :class="styles.modal_content"
        @pointer-down-outside="onPointerDownOutside"
        @interact-outside="onInteractOutside"
        @escape-key-down="onEscapeKeyDown"
      >
        <VisuallyHidden>
          <DialogTitle>{{ props.title || 'Окно' }}</DialogTitle>
          <DialogDescription>{{ props.description || props.title || 'Окно' }}</DialogDescription>
        </VisuallyHidden>

        <header v-if="hasHeader" :class="styles.modal_header">
          <slot name="header">
            <h2 :class="styles.modal_title">{{ props.title }}</h2>
          </slot>

          <DialogClose v-if="props.closeBtn" :class="styles.modal_close" aria-label="Закрыть">
            <slot name="close">
              <Icon name="lucide:x" class="size-20" aria-hidden="true" />
            </slot>
          </DialogClose>
        </header>

        <AScroll v-if="$slots.default" :ui="styles">
          <div :class="styles.modal_body">
            <slot />
          </div>
        </AScroll>

        <footer v-if="$slots.footer || props.error" :class="styles.modal_footer">
          <p v-if="props.error" :class="styles.modal_error" role="alert">{{ props.error }}</p>

          <slot name="footer" />
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<script setup>
/**
 * Тело всегда через общий скролл: длинные формы и списки не растягивают окно.
 */
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  VisuallyHidden,
} from 'reka-ui';
import { useUI } from '~/composables/ui/useUI';
import {
  addActiveModal,
  getActiveModals,
  removeActiveModal,
  useModalPayload,
} from '~/composables/ui/useModal';

/**
 * Модалка по имени: `name` регистрирует её в реестре, поэтому `openModal('table', payload)` открывает её
 * снаружи, `closeAllModals()` закрывает все, а пейлоад доступен как `payload` (или `useModalPayload`).
 * Без `name` работает обычное `v-model:open`.
 *
 * `error` — сообщение о том, почему главная кнопка не работает: рисуется в футере **слева** от кнопок.
 * В теле окна сообщение не годится: при появлении скролла его сдвигает вверх и не видно.
 */
const props = defineProps({
  name: { type: String, default: '' },
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  error: { type: String, default: '' },
  modal: { type: Boolean, default: true },
  closeBtn: { type: Boolean, default: true },
  closeOnOverlay: { type: Boolean, default: true },
  closeOnEscape: { type: Boolean, default: true },
  preset: { type: String, default: 'modal' },
  ui: { type: Object, default: () => ({}) },
});

const open = defineModel({ type: Boolean, default: false });
const emit = defineEmits(['openChange']);

const slots = useSlots();
const hasHeader = computed(() => Boolean(slots.header || props.title || props.closeBtn));

const { styles } = useUI(
  () => props.preset,
  () => props.ui,
);

/** Ключ реестра: имя (если задано) или собственный id экземпляра. */
const instanceId = useId();
const registryKey = computed(() => props.name || instanceId);
const payload = useModalPayload(() => registryKey.value);

const active = getActiveModals();
const syncing = ref(false);

if (active.value.includes(registryKey.value)) open.value = true;

watch(
  () => active.value.includes(registryKey.value),
  shouldOpen => {
    if (syncing.value || open.value === shouldOpen) return;
    syncing.value = true;
    open.value = shouldOpen;
    syncing.value = false;
    emit('openChange', shouldOpen);
  },
);

const onOpenChange = value => {
  if (syncing.value || open.value === value) return;
  open.value = value;
  emit('openChange', value);
};

if (import.meta.client) {
  watch(
    open,
    value => {
      if (syncing.value) return;
      if (value) addActiveModal(registryKey.value);
      else removeActiveModal(registryKey.value);
    },
    { immediate: true },
  );

  onBeforeUnmount(() => removeActiveModal(registryKey.value));
}

/** Клик по оверлею и Esc закрывают окно, если это разрешено пропами. */
const onPointerDownOutside = event => {
  if (!props.closeOnOverlay) event.preventDefault();
};

const onInteractOutside = event => {
  if (!props.closeOnOverlay) event.preventDefault();
};

const onEscapeKeyDown = event => {
  if (!props.closeOnEscape) event.preventDefault();
};

defineExpose({ payload });
</script>
