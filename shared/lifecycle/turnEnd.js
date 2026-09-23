import { isHandOverLimit } from '#shared/helpers/turn.js';

export default {
  name: 'turnEnd',
  phases: [],
  /** Ход замыкается на turnStart: в lifecycle после turnEnd идёт gameEnd, но партию решает turnStart. */
  next: 'turnStart',

  enter: partyState => {
    if (partyState._enteredHooks?.turnEnd) return partyState;
    return {
      ...partyState,
      movement: null,
      combat: null,
      targeting: null,
      _enteredHooks: { ...(partyState._enteredHooks ?? {}), turnEnd: true },
    };
  },

  body: partyState =>
    !isHandOverLimit(partyState, partyState.turn?.playerId),

  exit: partyState => {
    const state = {
      ...partyState,
      _enteredHooks: { ...(partyState._enteredHooks ?? {}), turnEnd: false },
    };
    for (const player of state.players ?? []) {
      if (player._activePhase) player._activePhase = null;
    }
    return state;
  },
};

/*
 Хук 4: конец хода (turnEnd). Пока пропускной — лимит руки и передача хода, без эффектов и логгера.

 1. Вход — из хука turn, когда действий не осталось и все моменты (перемещение, бой, выбор цели) закрыты.
 2. enter снимает моменты (страховка) и помечает вход, чтобы повторный прогон внутри turnEnd ничего
    не сбрасывал.
 3. body: ход завершён, когда рука влезает в rules.maxHandSize. Переполненную руку ловит фаза handLimit
    ещё в хуке turn, здесь это страховка от перехода с плохим состоянием.
 4. exit снимает активные фазы игроков; дальше хук отдаёт ход в turnStart (next: 'turnStart' — в lifecycle
    после turnEnd стоит gameEnd, но игру завершает turnStart, когда живых сторон осталось не больше одной).
 5. lastCombat и lastBonus здесь НЕ снимаются: это итог последнего действия хода, он нужен UI и логу;
    их снимает enter следующего хода.
 6. TODO: эффекты конца хода, логгер хода, сдача партии (RESIGN).
*/
