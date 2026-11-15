import { computed, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';

/**
 * Доска красит подсветку умения запасным тоном Анубиса, а не цветом фазы. Чтобы это решить, клиенту
 * нужен один признак: окно открыл сам герой (`source === player.skill.id`) или карта. Движок источник
 * уже отдаёт (`SET_TARGETING`/`SET_MOVEMENT` кладут `source`), поэтому признак считается здесь, а не в
 * `useBoardMap`. `useGameView` подменён: настоящий держит партию в `useState` Nuxt и ходит на сервер.
 */
vi.mock('~/composables/game/useGameView.js', async () => {
  const { computed: makeComputed, ref: makeRef } = await import('vue');

  const view = makeRef(null);
  const playerId = makeRef('ifrit');

  const api = {
    view: makeComputed(() => view.value),
    hostState: makeRef(null),
    gameId: makeRef('skill_window'),
    playerId,
    sendAction: vi.fn(async () => view.value),
    refresh: vi.fn(async () => view.value),
    steps: makeRef(0),
    selectedFighterId: makeRef(null),
    __seed: next => {
      view.value = next;
    },
  };

  return { useGameView: () => api };
});

vi.mock('~/composables/game/useGameHelpers.js', async () => {
  const { computed: makeComputed } = await import('vue');
  const { useGameView } = await import('~/composables/game/useGameView.js');
  return {
    useGameHelpers: () => {
      const { view, playerId } = useGameView();
      const players = makeComputed(() => view.value?.players ?? []);
      return {
        you: makeComputed(() => playerId.value),
        currentPlayerId: makeComputed(() => view.value?.currentPlayer ?? null),
        currentPlayer: makeComputed(
          () => players.value.find(entry => String(entry.id) === String(playerId.value)) ?? null,
        ),
        players,
        isMyTurn: makeComputed(() => String(view.value?.currentPlayer) === String(playerId.value)),
        turn: makeComputed(() => view.value?.turn ?? 0),
        phase: makeComputed(() => view.value?.phase ?? null),
        actionsLeft: makeComputed(() => view.value?.actionsLeft ?? 0),
        winner: makeComputed(() => view.value?.winner ?? null),
        isGameOver: makeComputed(() => view.value?.phase === 'gameEnd'),
        me: makeComputed(
          () => players.value.find(entry => String(entry.id) === String(playerId.value)) ?? null,
        ),
      };
    },
  };
});

vi.mock('~/composables/ui/useProfile.js', async () => {
  const { computed: makeComputed } = await import('vue');
  return { useProfile: () => ({ nick: makeComputed(() => 'Игрок') }) };
});

vi.mock('~/composables/ui/useToast.js', async () => {
  const { computed: makeComputed } = await import('vue');
  return {
    useToast: () => ({
      push: vi.fn(),
      message: makeComputed(() => ''),
      toast: makeComputed(() => null),
    }),
  };
});

globalThis.computed = computed;
globalThis.ref = ref;

const { useGameView } = await import('~/composables/game/useGameView.js');
const { useGameSession } = await import('~/composables/game/useGameSession.js');

const players = () => [
  {
    id: 'ifrit',
    name: 'Ифрит',
    color: '#EA580C',
    skill: { id: 'ifrit_skill', title: 'Пламя преисподней' },
    fighters: [],
    hand: { cards: [] },
    discard: { cards: [] },
    deck: { cards: [] },
    items: [],
    lost: [],
  },
  {
    id: 'tesla',
    name: 'Тесла',
    color: '#EF4444',
    skill: { id: 'tesla_skill', title: 'Мастерство катушек' },
    fighters: [],
    hand: { cards: [] },
    discard: { cards: [] },
    deck: { cards: [] },
    items: [],
    lost: [],
  },
];

const seed = extra => {
  useGameView().__seed({
    map: { id: 'test', nodes: [], settings: { nodeSize: 72 } },
    players: players(),
    currentPlayer: 'ifrit',
    phase: 'choose',
    turn: 1,
    ...extra,
  });
  return useGameSession();
};

describe('признак окна умения: источник окна сверяется со способностью героя', () => {
  it('окно способности Ифрита — это окно умения', () => {
    const session = seed({
      targeting: {
        playerId: 'ifrit',
        source: 'ifrit_skill',
        kind: 'fighters',
        required: false,
        count: 1,
        candidates: [],
        picked: null,
      },
    });

    expect(session.windowSource.value).toBe('ifrit_skill');
    expect(session.skillWindow.value).toBe(true);
  });

  it('окно от карты умением не считается: подсветка остаётся цветом фазы', () => {
    const session = seed({
      targeting: {
        playerId: 'ifrit',
        source: 'ifrit_14',
        kind: 'fighters',
        required: true,
        count: 1,
        candidates: [],
        picked: null,
      },
    });

    expect(session.windowSource.value).toBe('ifrit_14');
    expect(session.skillWindow.value).toBe(false);
  });

  it('черновик перемещения от умения Теслы — тоже окно умения', () => {
    const session = seed({
      movement: {
        playerId: 'ifrit',
        source: 'tesla_skill',
        origins: {},
        moves: [],
        fighters: [],
        damagedFighterIds: [],
      },
    });

    expect(session.skillWindow.value).toBe(true);
  });

  it('обычное перемещение без источника — не умение', () => {
    const session = seed({
      movement: { playerId: 'ifrit', source: null, origins: {}, moves: [], fighters: [] },
    });

    expect(session.windowSource.value).toBe(null);
    expect(session.skillWindow.value).toBe(false);
  });
});
