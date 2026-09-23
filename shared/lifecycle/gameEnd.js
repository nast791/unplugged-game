import finished from '#shared/phases/finished.js';

export default {
  name: 'gameEnd',
  phases: [finished],

  enter: partyState => {
    if (partyState._enteredHooks?.gameEnd) return partyState;

    const state = {
      ...partyState,
      movement: null,
      combat: null,
      targeting: null,
      turn: { ...partyState.turn, actionsLeft: 0 },
      _enteredHooks: { ...(partyState._enteredHooks ?? {}), gameEnd: true },
    };
    for (const player of state.players ?? []) {
      if (player._activePhase) player._activePhase = null;
    }
    return state;
  },

  body: () => true,

  exit: partyState => ({
    ...partyState,
    _enteredHooks: { ...(partyState._enteredHooks ?? {}), gameEnd: false },
  }),
};

/*
 Хук 5: конец партии (gameEnd). Терминальный — после него lifecycle заканчивается.

 1. Вход — из turnStart (некому ходить или живых сторон не больше одной), из боя после смертельного
    урона, из RESIGN, а также из старого api движка карт.
 2. enter нормализует финальное состояние: снимает моменты (перемещение, бой, выбор цели),
    обнуляет действия и активные фазы игроков. winner уже проставлен тем, кто завершил партию.
 3. body всегда true: вошли и остались. exit снимает флаг входа.
 4. Смысл хука — подведение итогов: фаза finished отдаёт подсказку и ui.results (победитель, раунд,
    ход, состояние бойцов), а сама партия после сохранения удаляется из памяти (server/party.js).
 5. lastCombat НЕ снимается: результат последнего боя входит в итоги.
 6. TODO: логгер итогов, статистика (урон, доборы), эффекты и способности «в конце партии»,
    реванш/рестарт из этого же экрана.
*/
