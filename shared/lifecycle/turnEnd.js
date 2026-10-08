import { runSkillMoment } from '#shared/skills/run.js';
import choose from '#shared/phases/choose.js';
import { hasMoment, isHandOverLimit } from '#shared/helpers/turn.js';

export default {
  name: 'turnEnd',
  // окно способности конца хода («Серебряные башмачки» Дороти): подсветка бойцов и клик по доске
  phases: [choose],
  /** Ход замыкается на turnStart: в lifecycle после turnEnd идёт gameEnd, но партию решает turnStart. */
  next: 'turnStart',

  enter: partyState => {
    if (partyState._enteredHooks?.turnEnd) return partyState;

    const state = {
      ...partyState,
      movement: null,
      combat: null,
      targeting: null,
      _enteredHooks: { ...(partyState._enteredHooks ?? {}), turnEnd: true },
    };

    // «заморожен» живёт до конца хода, в котором его поставили (карта «Оцепенение»)
    for (const player of state.players ?? []) {
      for (const fighter of player.fighters ?? []) {
        if (fighter.frozen === true) delete fighter.frozen;
      }
    }

    // эффекты «в конце хода»: правила способности игрока, чей ход заканчивается (заряд катушек и т.п.)
    return runSkillMoment(state, state.turn?.playerId, 'turnEnd');
  },

  body: partyState =>
    !hasMoment(partyState) && !isHandOverLimit(partyState, partyState.turn?.playerId),

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
 Хук 4: конец хода (turnEnd). Пока пропускной — лимит руки и передача хода, плюс способности конца хода.

 1. Вход — из хука turn, когда действий не осталось и все моменты (перемещение, бой, выбор цели) закрыты.
 2. enter снимает моменты (страховка) и помечает вход, чтобы повторный прогон внутри turnEnd ничего
    не сбрасывал; затем идут правила способности игрока, чей ход заканчивается (момент turnEnd).
 3. Фаза одна — choose: способность конца хода показывает себя через окно выбора цели (подсветка бойцов,
    подсказка сверху). Клик по подсвеченному бойцу идёт в движок, отказ — общей кнопкой «Завершить умение»;
    списка вариантов и автоматики у такого окна нет.
 4. body: ход завершён, когда моментов в работе нет и рука влезает в rules.maxHandSize. Переполненную руку
    ловит фаза handLimit ещё в хуке turn, здесь это страховка от перехода с плохим состоянием.
 5. exit снимает активные фазы игроков; дальше хук отдаёт ход в turnStart (next: 'turnStart' — в lifecycle
    после turnEnd стоит gameEnd, но игру завершает turnStart, когда живых сторон осталось не больше одной).
 6. lastCombat и lastBonus здесь НЕ снимаются: это итог последнего действия хода, он нужен UI и логу;
    их снимает enter следующего хода.
 7. TODO: логгер хода, сдача партии (RESIGN).
*/
