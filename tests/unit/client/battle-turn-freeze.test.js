import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

/**
 * Пока окно битвы не закрыто, ход не передан: гексы героев стоят на месте, а счётчик действий держит
 * значение из битвы (правило владельца, m01938). Движок к этому моменту уже списал действие и передал
 * ход, поэтому клиент запоминает ход на время битвы и отдаёт его, пока на экране итог.
 */
vi.mock('~/composables/game/useGameView.js', async () => {
  const { computed: makeComputed, ref: makeRef } = await import('vue');

  const view = makeRef(null);
  const playerId = makeRef('anubis');

  return {
    useGameView: () => ({
      view: makeComputed(() => view.value),
      hostState: makeRef(null),
      gameId: makeRef('battle_turn'),
      playerId,
      sendAction: vi.fn(async () => view.value),
      refresh: vi.fn(async () => view.value),
      steps: makeRef(0),
      selectedFighterId: makeRef(null),
      __seed: next => {
        view.value = next;
      },
    }),
  };
});

const { useGameView } = await import('~/composables/game/useGameView.js');
const { useGameHelpers } = await import('~/composables/game/useGameHelpers.js');
const { setBattleResultShown } = await import('~/composables/game/useBattleGate.js');

const players = () => [
  { id: 'anubis', name: 'Анубис', color: '#EDC9AF', fighters: [], items: [], lost: [] },
  { id: 'medusa', name: 'Медуза', color: '#059669', fighters: [], items: [], lost: [] },
];

const viewOf = extra => ({
  map: { id: 'test', nodes: [], settings: { nodeSize: 72 } },
  players: players(),
  currentPlayer: 'anubis',
  actionsLeft: 2,
  actionsTotal: 2,
  phase: 'choose',
  turn: 1,
  ...extra,
});

const seed = async extra => {
  useGameView().__seed(viewOf(extra));
  await nextTick();
};

const helpers = () => {
  const game = useGameHelpers();
  return game;
};

describe('итог битвы на экране: ход и действия держатся прежними', () => {
  it('после битвы гексы не переезжают, пока окно итога не закрыто', async () => {
    setBattleResultShown(false);
    useGameView().__seed(viewOf({}));
    await nextTick();
    const game = helpers();

    // битва идёт: движок уже списал действие, ход всё ещё Анубиса
    await seed({
      combat: { stage: 'defense', attackerPlayerId: 'anubis', defenderPlayerId: 'medusa' },
      currentPlayer: 'anubis',
      actionsLeft: 1,
    });
    expect(game.currentPlayerId.value).toBe('anubis');
    expect(game.actionsLeft.value).toBe(1);

    // бой закрыт и ход передан Медузе, но игрок ещё читает итог
    setBattleResultShown(true);
    await seed({ currentPlayer: 'medusa', actionsLeft: 2, phase: 'choose' });

    expect(game.currentPlayerId.value).toBe('anubis');
    expect(game.actionsLeft.value).toBe(1);
    expect(game.isMyTurn.value).toBe(true);

    // «Закрыть» — и только теперь всё меняется
    setBattleResultShown(false);
    await nextTick();

    expect(game.currentPlayerId.value).toBe('medusa');
    expect(game.actionsLeft.value).toBe(2);
    expect(game.isMyTurn.value).toBe(false);
  });

  it('без итога на экране ход отдаётся сразу: заморозка не залипает', async () => {
    setBattleResultShown(false);
    useGameView().__seed(viewOf({}));
    await nextTick();
    const game = helpers();

    await seed({ currentPlayer: 'medusa', actionsLeft: 1 });

    expect(game.currentPlayerId.value).toBe('medusa');
    expect(game.actionsLeft.value).toBe(1);
  });

  it('прибавка действия видна сразу, пока ход не перешёл другому', async () => {
    setBattleResultShown(false);
    useGameView().__seed(viewOf({}));
    await nextTick();
    const game = helpers();

    await seed({
      combat: { stage: 'defense', attackerPlayerId: 'anubis', defenderPlayerId: 'medusa' },
      currentPlayer: 'anubis',
      actionsLeft: 1,
    });

    // «ПОСЛЕ БИТВЫ: получите 1 действие» сработало, итог ещё на экране, ход всё ещё свой
    setBattleResultShown(true);
    await seed({ currentPlayer: 'anubis', actionsLeft: 2 });

    expect(game.actionsLeft.value).toBe(2);
    expect(game.actionsTotal.value).toBe(2);

    setBattleResultShown(false);
    await nextTick();
  });
});
