import { computed, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { startAreaCellIds } from '#shared/helpers/placement.js';

/**
 * Активный боец — это выбор игрока, а не подсказка клиента: по умолчанию не подсвечен никто,
 * активным боец становится кликом и только там, где клик что-то решает (перемещение), а клик мимо
 * клетки активность снимает. `useGameView` подменён: настоящий держит партию в `useState` Nuxt.
 */
vi.mock('~/composables/game/useGameView.js', async () => {
  const { computed: makeComputed, ref: makeRef } = await import('vue');
  const { runUi } = await import('#shared/publicApi.js');
  const { adaptPartyView } = await import('~/composables/game/useGameView.js');

  const view = makeRef(null);
  const hostState = makeRef(null);
  const gameId = makeRef('fighter_selection');
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
      // новая партия — пустой выбор: иначе прошлый клик переезжает в следующий тест через общий ref
      selectedFighterId.value = null;
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

/** Профиль игрока: `useGameSession` берёт оттуда имя места для подписи владельца карты. */
vi.mock('~/composables/ui/useProfile.js', async () => {
  const { computed: makeComputed } = await import('vue');
  return { useProfile: () => ({ nick: makeComputed(() => 'Игрок') }) };
});

const { createGameResponse } = await import('../../../server/create.js');
const { useGameView } = await import('~/composables/game/useGameView.js');
const { useGameSession } = await import('~/composables/game/useGameSession.js');

/** Партия, остановленная на своём ходу: `phase` — фаза, которую игрок видит как окно. */
const myTurnParty = phase => {
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
    player._activePhase = player.id === 'medusa' ? phase : 'waiting';
    for (const fighter of player.fighters ?? []) {
      if (fighter.currentPosition == null) fighter.currentPosition = fighter.startPosition ?? 1;
    }
  }

  const mine = host.players.find(player => player.id === 'medusa');
  host.movement =
    phase === 'movement'
      ? {
          playerId: 'medusa',
          // список movable: без него движок не отдаёт окно перемещения и клеток не появляется
          fighters: mine.fighters.map(fighter => String(fighter.id)),
          origins: Object.fromEntries(
            mine.fighters.map(fighter => [fighter.id, fighter.currentPosition]),
          ),
          bonus: 0,
          bonusUsed: false,
          budget: null,
          optional: false,
          throughEnemies: false,
          damagedFighterIds: [],
          moves: [],
          source: null,
          playedCard: null,
        }
      : null;

  return host;
};

const seed = phase => {
  useGameView().__seed(myTurnParty(phase), 'medusa');
  return useGameSession();
};

describe('активный боец: выбор ставит клик, а не клиент', () => {
  it('по умолчанию никто не подсвечен', () => {
    const session = seed('movement');

    expect(session.selectedFighterId.value).toBe(null);
    expect(session.highlightedCellIds.value).toEqual([]);
  });

  it('клик по своему бойцу в перемещении делает его активным и показывает клетки', () => {
    const session = seed('movement');
    const fighter = session.myFighters.value.find(entry => entry.currentPosition != null);

    session.onFighterClick({ fighterId: fighter.id });

    expect(session.selectedFighterId.value).toBe(String(fighter.id));
    expect(session.highlightedCellIds.value.length).toBeGreaterThan(0);
  });

  it('клик мимо клетки снимает активность', () => {
    const session = seed('movement');
    const fighter = session.myFighters.value.find(entry => entry.currentPosition != null);
    session.onFighterClick({ fighterId: fighter.id });

    session.onCellClick(null);

    expect(session.selectedFighterId.value).toBe(null);
    expect(session.highlightedCellIds.value).toEqual([]);
  });

  it('окно эффекта со своим бойцом принимает клик, хотя движок своих рамкой не метит', () => {
    const host = myTurnParty('movement');
    // окно эффекта: своих бойцов движок не подсвечивает — выбирает их клик
    host.movement.source = 'card';
    host.movement.playedCard = 'card-1';
    useGameView().__seed(host, 'medusa');
    const session = useGameSession();

    expect(session.highlightedFighterIds.value).toEqual([]);
    expect(session.highlightedCellIds.value).toEqual([]);
    expect(session.boardInteractive.value).toBe(true);

    const fighter = session.myFighters.value.find(entry => entry.currentPosition != null);
    session.onFighterClick({ fighterId: fighter.id });

    expect(session.selectedFighterId.value).toBe(String(fighter.id));
  });

  it('без перемещения клик по бойцу активным его не делает', () => {
    const session = seed('attack');
    const fighter = session.myFighters.value.find(entry => entry.currentPosition != null);

    session.onFighterClick({ fighterId: fighter.id });

    expect(session.selectedFighterId.value).toBe(null);
  });
});

/**
 * Расстановка: пока «ОК» не нажата, выставленного бойца можно поднять кликом по фишке и переставить.
 * Раньше выбор работал только в перемещении (`ui.phase === 'movement'`), поэтому в расстановке клик по
 * своей фишке лишь писал «этого бойца сейчас выбрать нельзя», а боец оставался там, куда его поставили.
 */
describe('расстановка: выставленного бойца можно переставить до «ОК»', () => {
  /** Партия в расстановке: герой на номерной клетке, один помощник уже выставлен в область героя. */
  const placeParty = () => {
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

    const mine = host.players.find(player => player.id === 'medusa');
    const pawn = mine.fighters.find(
      fighter => fighter.type !== 'hero' && fighter.currentPosition == null,
    );
    const busy = new Set(
      host.players.flatMap(player =>
        (player.fighters ?? [])
          .filter(fighter => fighter.currentPosition != null)
          .map(fighter => String(fighter.currentPosition)),
      ),
    );
    const cellId = startAreaCellIds(host, 'medusa').find(id => !busy.has(String(id)));
    pawn.currentPosition = cellId;
    pawn.startPosition = cellId;

    return { host, pawnId: String(pawn.id) };
  };

  it('клик по выставленному бойцу делает его активным и зажигает свободные клетки области', () => {
    const { host, pawnId } = placeParty();
    useGameView().__seed(host, 'medusa');
    const session = useGameSession();

    expect(session.isPlacement.value).toBe(true);
    session.onFighterClick({ fighterId: pawnId });

    expect(session.selectedFighterId.value).toBe(pawnId);
    expect(session.highlightedCellIds.value.length).toBeGreaterThan(0);
    expect(session.highlightedCellIds.value).not.toContain(
      String(
        session.myFighters.value.find(fighter => String(fighter.id) === pawnId).currentPosition,
      ),
    );
  });

  it('клик по подсвеченной клетке уходит движку тем же PICK с выбранным бойцом', () => {
    const { host, pawnId } = placeParty();
    useGameView().__seed(host, 'medusa');
    const session = useGameSession();
    useGameView().sendAction.mockClear();

    session.onFighterClick({ fighterId: pawnId });
    const target = session.highlightedCellIds.value[0];
    session.onCellClick(target);

    expect(useGameView().sendAction).toHaveBeenCalledTimes(1);
    expect(useGameView().sendAction.mock.calls[0][0]).toMatchObject({
      type: 'PICK',
      kind: 'cell',
      fighterId: pawnId,
    });
    expect(String(useGameView().sendAction.mock.calls[0][0].id)).toBe(String(target));
  });
});

/**
 * Окно клеток, открытое картой («Врата» Анубиса: «можете поместить бойца оппонента на свободную клетку
 * пустыни»), бойца не ждёт: кого переносить, решает само правило. Раньше клик по подсвеченной клетке
 * падал в ветку «Сначала выберите бойца», и свойство карты сыграть было нельзя — партия вставала.
 */
describe('окно клеток от карты: клик по подсвеченной клетке — это весь выбор', () => {
  /** Партия в окне клеток: кандидаты объявлены картой, свой боец не выбран. */
  const cardWindow = () => {
    const host = myTurnParty('choose');
    host.turn.playerId = 'medusa';
    const cell = host.map.nodes.find(node => node.heroStart !== true);
    host.targeting = {
      kind: 'cells',
      playerId: 'medusa',
      source: 'anubis_08',
      candidates: [{ cellId: String(cell.id) }],
      count: 1,
      required: false,
      picked: [],
      complete: false,
    };
    return { host, cellId: String(cell.id) };
  };

  it('клик по подсвеченной клетке уходит без выбранного бойца', () => {
    const { host, cellId } = cardWindow();
    useGameView().__seed(host, 'medusa');
    const session = useGameSession();
    useGameView().sendAction.mockClear();

    expect(session.selectedFighterId.value).toBe(null);
    expect(session.highlightedCellIds.value).toContain(cellId);

    session.onCellClick(cellId);

    expect(useGameView().sendAction).toHaveBeenCalledTimes(1);
    expect(useGameView().sendAction.mock.calls[0][0]).toMatchObject({ type: 'PICK', kind: 'cell' });
    expect(String(useGameView().sendAction.mock.calls[0][0].id)).toBe(cellId);
  });

  it('клетка вне окна по-прежнему просит выбрать бойца', () => {
    const { host } = cardWindow();
    useGameView().__seed(host, 'medusa');
    const session = useGameSession();
    useGameView().sendAction.mockClear();

    session.onCellClick('999');

    expect(useGameView().sendAction).not.toHaveBeenCalled();
    expect(session.selectedFighterId.value).toBe(null);
  });
});
