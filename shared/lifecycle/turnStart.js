import { rules } from '#shared/constants/rules.js';
import {
  finishedSides,
  nextAlivePlayerId,
  queryPlayers,
} from '#shared/facts-new/players.js';

export default {
  name: 'turnStart',
  phases: [],

  enter: partyState => {
    let state = {
      ...partyState,
      _enteredHooks: { ...(partyState._enteredHooks ?? {}), turn: false },
    };

    const nextPlayerId = nextAlivePlayerId(state);
    if (nextPlayerId == null) {
      return { ...state, hook: 'gameEnd', winner: state.winner ?? null };
    }

    const playerId = String(nextPlayerId);
    state.turn = { ...state.turn, playerId };

    const alivePlayers = queryPlayers(state, { alive: true }, {});
    const { finished, winner } = finishedSides(state);
    if (finished) {
      return { ...state, hook: 'gameEnd', winner };
    }

    const aliveIds = new Set(
      alivePlayers.map(entry => String(entry.playerId)),
    );
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

    if (actedRound.length >= alivePlayers.length) {
      state.round = (state.round ?? 1) + 1;
      state.turn.actedRound = [playerId];
    }

    return state;
  },

  body: () => true,

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