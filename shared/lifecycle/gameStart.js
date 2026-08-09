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
