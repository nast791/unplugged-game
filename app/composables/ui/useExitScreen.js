import { computed, ref } from 'vue';

const exited = ref(false);

export const exitGame = () => {
  exited.value = true;
};

export const returnToLobby = () => {
  exited.value = false;
};

export const useExitScreen = () => ({
  exited: computed(() => exited.value),
  exitGame,
  returnToLobby,
});
