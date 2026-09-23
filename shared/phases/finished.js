import { findPlayer } from '#shared/helpers/base.js';
import { handCardIds } from '#shared/helpers/turn.js';

/** Имя победителя; null — если победитель почему-то не записан. */
const winnerName = partyState => {
  const winnerId = partyState.winner ?? null;
  if (winnerId == null) return null;
  return findPlayer(partyState, winnerId)?.name ?? String(winnerId);
};

const resultsOf = partyState => ({
  winner: partyState.winner ?? null,
  winnerName: winnerName(partyState),
  round: partyState.round ?? 1,
  turn: partyState.turn?.index ?? 0,
  players: (partyState.players ?? []).map(player => ({
    id: String(player.id),
    name: player.name ?? String(player.id),
    resigned: player.resigned === true,
    fighters: (player.fighters ?? []).map(fighter => ({
      id: String(fighter.id),
      name: fighter.name ?? String(fighter.id),
      type: fighter.type,
      hp: Number(fighter.currentHp) || 0,
      maxHp: Number.isFinite(Number(fighter.startHp))
        ? Number(fighter.startHp)
        : null,
    })),
  })),
});

export default {
  name: 'finished',

  hints: {
    finished: {
      active: () => true,
      text: partyState => {
        const name = winnerName(partyState);
        return name == null
          ? 'Партия завершена'
          : `Партия завершена: победа — ${name}`;
      },
    },
  },

  active: () => true,

  ui(partyState, playerId) {
    return {
      deck: { clickable: false },
      highlightedCellIds: [],
      highlightedFighterIds: [],
      framedFighterIds: [],
      playableCardIds: [],
      disabledCardIds: handCardIds(partyState, playerId),
      results: resultsOf(partyState),
      controls: {
        ok: { visible: false, enabled: false, label: null },
        back: { visible: false, enabled: false, label: null },
      },
    };
  },
};

/*
 Фаза finished: экран итогов партии.

 1. Активна для всех и всегда: ходов у неё нет, поэтому core отклонит любой клик (а в gameEnd
    действие отклоняет ещё и gameEngine — «партия завершена»).
 2. Подсказка сверху: «Партия завершена: победа — <имя>».
 3. ui.results отдаёт итоги для экрана: победитель, номер раунда и хода, а по каждому игроку —
    сдался ли он и что осталось от его бойцов (hp и максимум). Остальное клиент берёт из view.
 */
