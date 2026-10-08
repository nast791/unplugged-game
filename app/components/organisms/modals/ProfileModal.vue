<template>
  <AModal name="profile" title="Профиль">
    <AInput
      ref="nickInput"
      v-model="draftNick"
      label="Имя"
      :placeholder="DEFAULT_NICK"
      :maxlength="24"
      @keydown.enter.prevent="save"
    />

    <div class="flex flex-col gap-8">
      <span class="text-14 text-dim">Аватар</span>
      <div class="flex flex-wrap gap-8">
        <AButton
          v-for="icon in AVATAR_ICONS"
          :key="icon"
          icon
          variant="ghost"
          class="rounded-4 flex size-48 items-center justify-center border-2"
          :class="
            draftAvatar === icon
              ? 'border-accent bg-surface-2 text-accent'
              : 'border-line text-dim hover:text-ink'
          "
          :aria-pressed="draftAvatar === icon"
          :aria-label="`Аватар ${icon}`"
          @click="draftAvatar = icon"
        >
          <Icon :name="icon" class="size-24" aria-hidden="true" />
        </AButton>
      </div>
    </div>

    <template #footer>
      <AButton variant="secondary" @click="closeModal('profile')">Отмена</AButton>
      <AButton @click="save">Сохранить</AButton>
    </template>
  </AModal>
</template>

<script setup>
/**
 * Модалка по имени: открывается `openModal('profile')`, закрывается `closeModal('profile')`
 * или кнопкой в шапке (её рисует AModal).
 */
import { DEFAULT_NICK } from '~/composables/useProfile';
import { closeModal, useIsModalOpen } from '~/composables/ui/useModal';

/** Доступные аватары — выбор интерфейса, поэтому список живёт здесь, а не в профиле. */
const AVATAR_ICONS = [
  'lucide:user-round',
  'lucide:cat',
  'lucide:ghost',
  'lucide:flame',
  'lucide:snowflake',
  'lucide:bird',
];

const props = defineProps({
  nick: { type: String, default: '' },
  avatar: { type: String, default: '' },
});

const emit = defineEmits(['save']);

const draftNick = ref(props.nick);
const draftAvatar = ref(props.avatar || AVATAR_ICONS[0]);
const nickInput = ref(null);

const isOpen = useIsModalOpen('profile');

/** Пока окно закрыто, содержимое не отрисовано: фокус и черновики обновляем на открытии. */
watch(isOpen, open => {
  if (!open) return;
  draftNick.value = props.nick;
  draftAvatar.value = props.avatar || AVATAR_ICONS[0];
  nextTick(() => nickInput.value?.focus());
});

const save = () => {
  emit('save', { nick: draftNick.value, avatar: draftAvatar.value });
  closeModal('profile');
};
</script>
