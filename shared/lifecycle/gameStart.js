import pickNumHero from '../phases/pickNumHero.js';
import place from '../phases/place.js';
import { allPlayersPlacementReady } from '#shared/helpers/placement.js';
import { runPhase } from '#shared/core.js';

export default {
  name: 'gameStart',
  phases: [pickNumHero, place],

  enter: partyState => {
    if (partyState._enteredHooks?.gameStart) return partyState;
    let state = {
      ...partyState,
      _enteredHooks: { ...(partyState._enteredHooks ?? {}), gameStart: true },
    };
    for (const player of state.players ?? []) {
      state = runPhase(state, player.id);
    }
    return state;
  },

  body: partyState => allPlayersPlacementReady(partyState),

  exit: partyState => {
    let state = partyState;
    for (const player of state.players ?? []) {
      if (player._activePhase) player._activePhase = null;
      player.numberedHeroCommitted = false;
    }
    return state;
  },
};

/* Хук 1: начало игры

 1. Автоматический старт хука после создания игры на сервере.
 2. Если у игрока несколько героев, то переходим в фазу pickNumHero, оттуда в фазу place.
 3. Если у игрока один герой, то переходим в фазу place.
 4. Подтверждение расстановки всех игроков - переход в хук начала хода.
 5. После своего UI_OK — hint «Ожидание…», фаза активна, пока не готовы все.
 6. TODO: Если какой-то игрок сдался/вышел из игры в хуке начала игры, то его расстановку не ждем (для него расстановка автоматически завершается?).
 */