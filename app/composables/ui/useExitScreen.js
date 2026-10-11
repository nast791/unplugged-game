import { computed, ref } from 'vue';

/**
 * Экран выхода: вкладку скриптом не закрыть (`window.close` работает только для окон, открытых скриптом),
 * поэтому «Выход» — экран прощания с кнопкой возврата (`organisms/lobby/ExitScreen.vue`).
 *
 * «Выход» стоит в двух местах — в меню профиля справа сверху и в центральном меню лобби, — поэтому
 * видимость экрана общая, а не пропс страницы: показать её может любой из них. Состояние модульное, как
 * у модалок и тоста (`ui/`): выходит игрок кликом, в SSR-рендере выхода нет.
 */
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
