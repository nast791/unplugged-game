import { computed, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';

/**
 * Подпись владельца карты в углу — имя бойца по-русски, как на картах в руке. В окне битвы карта
 * чаще всего **чужая**, а поиск шёл только по своим бойцам: привязка не находилась, и в углу оставался
 * английский id (`anubis`). Здесь карта бьётся по всей партии, включая павших.
 */
vi.mock('~/composables/game/useGameView.js', async () => {
  const { computed: makeComputed, ref: makeRef } = await import('vue');
  const { runUi } = await import('#shared/publicApi.js');
  const { adaptPartyView } = await import('~/composables/game/useGameView.js');

  const view = makeRef(null);
  const hostState = makeRef(null);
  const gameId = makeRef('owner_label');
  const playerId = makeRef('medusa');
  const steps = makeRef(0);
  const selectedFighterId = makeRef(null);
  const sendAction = vi.fn(async () => view.value);
  const refresh = vi.fn(async () => view.value);

  const api = {
    view: makeComputed(() => view.value),
    hostState,
    gameId,
    playerId,
    sendAction,
    refresh,
    steps,
    selectedFighterId,
    __seed: (host, asPlayerId) => {
      hostState.value = host;
      playerId.value = asPlayerId;
      view.value = adaptPartyView({ ...host, ui: runUi(host, asPlayerId) });
    },
  };

  return { useGameView: () => api };
});

vi.mock('~/composables/game/useGameHelpers.js', async () => {
  const { computed: makeComputed } = await import('vue');
  const { useGameView } = await import('~/composables/game/useGameView.js');
  return {
    playerLabel: () => 'Игрок',
    useGameHelpers: () => {
      const { view, playerId } = useGameView();
      return {
        you: makeComputed(() => playerId.value),
        currentPlayerId: makeComputed(() => view.value?.currentPlayer ?? null),
        currentPlayer: makeComputed(
          () =>
            (view.value?.players ?? []).find(
              entry => String(entry.id) === String(view.value?.currentPlayer),
            ) ?? null,
        ),
        players: makeComputed(() => view.value?.players ?? []),
        isMyTurn: makeComputed(() => String(view.value?.currentPlayer) === String(playerId.value)),
        turn: makeComputed(() => view.value?.turn ?? 0),
        phase: makeComputed(() => view.value?.phase ?? null),
        actionsLeft: makeComputed(() => view.value?.actionsLeft ?? 0),
        winner: makeComputed(() => view.value?.winner ?? null),
        isGameOver: makeComputed(() => view.value?.phase === 'gameEnd'),
        me: makeComputed(
          () =>
            (view.value?.players ?? []).find(
              entry => String(entry.id) === String(playerId.value),
            ) ?? null,
        ),
      };
    },
  };
});

globalThis.computed = computed;
globalThis.ref = ref;

vi.mock('~/composables/ui/useProfile.js', async () => {
  const { computed: makeComputed } = await import('vue');
  return { useProfile: () => ({ nick: makeComputed(() => 'Игрок') }) };
});

const { createGameResponse } = await import('../../../server/create.js');
const { useGameView } = await import('~/composables/game/useGameView.js');
const { useGameSession } = await import('~/composables/game/useGameSession.js');

/** Партия двоих: Медуза (смотрящий) против Анубиса, оба уже расставлены. */
const party = () => {
  const { host } = createGameResponse({
    mapId: 'generated',
    mode: 'hotseat',
    seed: 11,
    heroes: [
      { heroId: 'medusa', team: 'A', order: 1, control: 'human' },
      { heroId: 'anubis', team: 'B', order: 2, control: 'human' },
    ],
    playerId: 'medusa',
  });

  host.hook = 'turn';
  host._enteredHooks = { ...(host._enteredHooks ?? {}), gameStart: true, turn: true };
  for (const player of host.players ?? []) {
    player.placementReady = true;
    player._activePhase = player.id === 'medusa' ? 'movement' : 'waiting';
    for (const fighter of player.fighters ?? []) {
      if (fighter.currentPosition == null) fighter.currentPosition = fighter.startPosition ?? 1;
    }
  }

  return host;
};

const seed = (host = party()) => {
  useGameView().__seed(host, 'medusa');
  return useGameSession();
};

describe('подпись владельца карты: имя бойца, а не привязка', () => {
  it('своя карта называет своего бойца по-русски', () => {
    expect(seed().cardFighterLabel({ fighter: 'medusa' })).toBe('Медуза');
  });

  it('чужая карта тоже называет бойца — по-русски, а не английским id', () => {
    expect(seed().cardFighterLabel({ fighter: 'anubis' })).toBe('Анубис');
  });

  it('карта павшего бойца остаётся подписанной', () => {
    const host = party();
    const anubis = host.players.find(player => player.id === 'anubis');
    const index = anubis.fighters.findIndex(fighter => String(fighter.id) === 'amat');
    const [amat] = anubis.fighters.splice(index, 1);
    anubis.lost = [{ ...amat, currentHp: 0 }];

    expect(seed(host).cardFighterLabel({ fighter: 'amat' })).toBe('Амат');
  });

  it('карта без привязки и карта «любой» подписаны «любой»', () => {
    const session = seed();

    expect(session.cardFighterLabel({})).toBe('любой');
    expect(session.cardFighterLabel({ fighter: 'any' })).toBe('любой');
  });

  it('неизвестная привязка остаётся как есть, а не пустой строкой', () => {
    expect(seed().cardFighterLabel({ fighter: 'unknown-fighter' })).toBe('unknown-fighter');
  });
});
