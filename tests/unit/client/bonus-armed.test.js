import { computed, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';

/**
 * Подъём карты усиления хранится **на уровне модуля**, а не внутри `useGameSession`: поднимает карту
 * панель руки, а скидывает её сброс — разные молекулы. Пока ref создавался в самом композабле, у каждой
 * молекулы была своя копия: рука показывала карту поднятой, а сброс её не видел и на клик открывал окно
 * сброса вместо сброса карты (живой баг).
 *
 * Здесь два вызова композабла — это две молекулы: подъём через первый обязан быть виден второму.
 * `useGameView` подменён: настоящий держит партию в `useState` Nuxt и ходит на сервер.
 */
vi.mock('~/composables/game/useGameView.js', async () => {
  const { computed: makeComputed, ref: makeRef } = await import('vue');
  const { runUi } = await import('#shared/publicApi.js');
  const { adaptPartyView } = await import('~/composables/game/useGameView.js');

  const view = makeRef(null);
  const hostState = makeRef(null);
  const gameId = makeRef('bonus_shared');
  const playerId = makeRef('medusa');
  const steps = makeRef(0);
  const selectedFighterId = makeRef(null);
  const sendAction = vi.fn(async () => view.value);
  const refresh = vi.fn(async () => view.value);

  /** Один и тот же объект на все вызовы — как настоящий `useGameView` с состоянием Nuxt. */
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

/**
 * Профиль игрока: `useGameSession` берёт оттуда имя места для подписи владельца карты. Настоящий
 * `useProfile` держит значение в `useState` Nuxt, а его в этом тесте нет.
 */
vi.mock('~/composables/ui/useProfile.js', async () => {
  const { computed: makeComputed } = await import('vue');
  return { useProfile: () => ({ nick: makeComputed(() => 'Игрок') }) };
});

const { createGameResponse } = await import('../../../server/create.js');
const { runAction } = await import('../../../shared/publicApi.js');
const { useGameView } = await import('~/composables/game/useGameView.js');
const { useGameSession } = await import('~/composables/game/useGameSession.js');

/** Партия, остановленная в фазе перемещения: карты с усилением в руке играются. */
const movementParty = () => {
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
  host.movement = {
    playerId: 'medusa',
    origins: {},
    bonus: 0,
    bonusUsed: false,
    budget: null,
    fighters: [],
    optional: false,
    throughEnemies: false,
    damagedFighterIds: [],
    moves: [],
    source: null,
    playedCard: null,
  };

  return host;
};

const bonusCardOf = state =>
  state.players
    .find(player => player.id === 'medusa')
    .hand.cards.find(card => (Number(card.bonus) || 0) > 0);

describe('сброс усиления: подъём карты виден всем молекулам', () => {
  /** Подъём живёт в модуле, поэтому состояние партии и подъём сбрасываются перед каждым тестом. */
  const seed = () => {
    useGameView().__seed(movementParty(), 'medusa');
    useGameSession().disarmBonusCard();
  };

  it('карта, поднятая в одной молекуле, поднята и в другой', () => {
    seed();
    const hand = useGameSession();
    const discard = useGameSession();
    const card = bonusCardOf(useGameView().hostState.value);

    expect(hand.canDiscardBonus.value).toBe(true);
    expect(discard.armedBonusCard.value).toBe(null);

    hand.armBonusCard(card);

    // главное: вторая молекула видит тот же подъём — иначе сброс открывает окно вместо сброса карты
    expect(discard.armedBonusCard.value?.instanceId).toBe(card.instanceId);
    expect(hand.armedBonusCard.value?.instanceId).toBe(card.instanceId);
  });

  it('сброс поднятой карты уходит в движок и снимает подъём у всех', async () => {
    seed();
    const session = useGameSession();
    const card = bonusCardOf(useGameView().hostState.value);

    expect(session.armBonusCard(card)).toBe(true);
    await session.onBonusDiscard();

    expect(useGameView().sendAction).toHaveBeenCalledWith({
      type: 'PICK',
      kind: 'card',
      id: String(card.instanceId),
    });
    expect(useGameSession().armedBonusCard.value).toBe(null);
  });
});
