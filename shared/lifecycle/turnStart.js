import { aliveSideCount } from '#shared/facts-new/players.js';
import { rules } from '#shared/constants/rules.js';
import { runFact } from '#shared/core.js';

export default {
  name: 'turnStart',
  phases: [],

  enter: partyState => {
    let state = partyState;

    const next = runFact(state, 'NEXT_PLAYER', {});
    if (!next.ok || next.value == null) {
      return { ...state, hook: 'gameEnd', winner: state.winner ?? null };
    }

    const playerId = String(next.value);
    state.turn = { ...state.turn, playerId };

    const alivePlayers = runFact(state, 'PLAYERS', { alive: true });
    if (aliveSideCount(state) <= 1) {
      return {
        ...state,
        hook: 'gameEnd',
        winner: alivePlayers.value[0]?.playerId ?? null,
        turn: { ...state.turn, actionsLeft: 0 },
      };
    }

    const aliveIds = new Set(alivePlayers.value.map(entry => String(entry.playerId)));
    const actedRound = [
      ...new Set([
        ...(state.turn?.actedRound ?? []).filter(id => aliveIds.has(String(id))),
        playerId,
      ]),
    ];

    state.turn = {
      ...state.turn,
      index: (state.turn?.index ?? 0) + 1,
      actionsTotal: rules.actionsPerTurn,
      actionsLeft: rules.actionsPerTurn,
      bonus: { movement: 0, attack: 0, defense: 0, actions: 0 },
      actedRound,
    };

    if (actedRound.length >= alivePlayers.value.length) {
      state.round = (state.round ?? 1) + 1;
      state.turn.actedRound = [playerId];
    }

    return state;
  },

  body: partyState => partyState.hook !== 'gameEnd',

  exit: partyState => partyState,
};

/*
 Хук 2: начало хода игрока. Автоматически после gameStart и после каждого turnEnd.

 Живой игрок: FFA — жив герой; команда — в team нужен живой герой; свой герой или (мёртвый герой + свои помощники при живом герое союзника); без героя и помощников — выбыл.

 1. Находим следующего живого игрока по order (при playerId null — первый по order; мёртвых пропускаем).
 2. Если нет живых игроков, то gameEnd.
 3. turn.playerId — текущий активный игрок, который начинает ход.
 4. Если осталась одна сторона (FFA: один игрок; команда: одна team), то gameEnd, winner — первый живой по order, actionsLeft = 0.
 5. Прибавляем к счетчику ходов 1 (turn.index += 1).
 6. Общее количество действий и оставшееся количество действий в ходе сбрасываем на rules.actionsPerTurn.
 7. Обнуляем все временные бонусы (movement, attack, defense, actions).
 8. В turn.actedRound добавляем текущего игрока (убираем id мёртвых, без дублей); если все живые уже ходили в этом раунде — round += 1, actedRound = [текущий игрок].
 9. TODO: проверяем скилл героя активного игрока - срабатывает ли он в этом хуке.
 10. После body core переводит hook в turn.
 */