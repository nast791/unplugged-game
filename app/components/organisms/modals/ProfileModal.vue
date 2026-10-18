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
      <span class="text-18">Аватар</span>
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
import AButton from '~/components/atoms/AButton.vue';
import AInput from '~/components/atoms/AInput.vue';
import AModal from '~/components/atoms/AModal.vue';
import { DEFAULT_NICK, useProfile } from '~/composables/ui/useProfile';
import { closeModal, useIsModalOpen } from '~/composables/ui/useModal';
import { notify } from '~/composables/ui/useToast';

const AVATAR_ICONS = [
  'lucide:user-round',
  'lucide:cat',
  'lucide:ghost',
  'lucide:flame',
  'lucide:snowflake',
  'lucide:bird',
];

const { profile, avatar, setNick, setAvatar } = useProfile();

const draftNick = ref(profile.value?.nick ?? '');
const draftAvatar = ref(avatar.value || AVATAR_ICONS[0]);
const nickInput = ref(null);

const isOpen = useIsModalOpen('profile');

watch(isOpen, open => {
  if (!open) return;
  draftNick.value = profile.value?.nick ?? '';
  draftAvatar.value = avatar.value || AVATAR_ICONS[0];
  nextTick(() => nickInput.value?.focus());
});

const save = () => {
  setNick(draftNick.value);
  setAvatar(draftAvatar.value);
  notify('Профиль сохранён');
  closeModal('profile');
};
</script>
