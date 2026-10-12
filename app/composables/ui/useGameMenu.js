import { computed, ref } from 'vue';

const open = ref(false);

export const openGameMenu = () => {
  open.value = true;
};

export const closeGameMenu = () => {
  open.value = false;
};

export const useGameMenu = () => ({
  open: computed(() => open.value),
  openGameMenu,
  closeGameMenu,
});

export default useGameMenu;
