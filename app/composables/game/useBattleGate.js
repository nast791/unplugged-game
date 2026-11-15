import { ref } from 'vue';

// Пока итог битвы на экране, партия ждёт игрока: окно закрывает он сам, а не таймер.
const battleResult = ref(false);

// Итог для ленты подсказок: кто сколько получил, пока окно не закрыто.
const battleSummary = ref('');

let dismissHandler = null;

export const battleResultShown = () => battleResult;

export const battleResultSummary = () => battleSummary;

export const setBattleResultShown = open => {
  battleResult.value = open === true;
};

export const setBattleResultSummary = text => {
  battleSummary.value = String(text ?? '');
};

/** Закрыть окно итога битвы у того, кто его показывает: кнопка «Закрыть» живёт и на верхней панели. */
export const dismissBattleResult = () => dismissHandler?.();

export const registerBattleDismiss = handler => {
  dismissHandler = typeof handler === 'function' ? handler : null;
};

export default battleResultShown;
