import { describe, expect, it } from 'vitest';
import { occupiedCellIds } from '#shared/helpers/turn.js';
import { startAreaCellIds } from '#shared/helpers/placement.js';
import { runAction } from '#shared/publicApi.js';
import { createGame } from '../../../server/create.js';
import { load, view as partyView } from '../../../server/party.js';
import { handoverTarget, placementActor } from '../../../app/composables/game/useGameSession.js';
import { player } from '../../fixtures/state.js';

/**
 * Экран за одним столом ведёт тот, чьё решение сейчас. В ходу это действующий игрок (`actingPlayerId`),
 * а в расстановке хода ещё нет — очередь людей считает `placementActor`: первый по порядку мест человек,
 * который её не подтвердил. Передача включена **только в офлайн-игре, где человек ведёт несколько мест**
 * (одиночный режим и командная игра): в партии против компьютера человек один, и переключать его не на
 * кого — там экран остаётся у него.
 */
const human = (id, order, extra = {}) => ({
  id,
  control: 'human',
  order,
  placementReady: false,
  ...extra,
});
const ai = (id, order, extra = {}) => ({
  id,
  control: 'ai',
  order,
  placementReady: false,
  ...extra,
});

describe('placementActor', () => {
  it('очередь — первый по порядку мест человек, который расстановку не подтвердил', () => {
    const players = [human('p1', 1, { placementReady: true }), human('p2', 2), human('p3', 3)];

    // порядок мест важнее порядка в списке: очередь идёт по `order`
    expect(placementActor([...players].reverse())).toBe('p2');
  });

  it('подтвердившийся человек и слот компьютера из очереди выпадают', () => {
    const players = [
      human('p1', 1, { placementReady: true }),
      ai('bot', 2),
      human('p2', 3, { resigned: true }),
      human('p3', 4),
    ];

    expect(placementActor(players)).toBe('p3');
  });

  it('все подтвердили — расставлять больше некому', () => {
    expect(placementActor([human('p1', 1, { placementReady: true }), ai('bot', 2)])).toBeNull();
    expect(placementActor([])).toBeNull();
  });
});

describe('handoverTarget', () => {
  const table = [
    human('p1', 1, { placementReady: true }),
    ai('bot', 2, { placementReady: true }),
    human('p2', 3),
  ];

  it('расстановка: экран уходит следующему по порядку человеку, а не подтвердившему', () => {
    expect(
      handoverTarget({
        placement: true,
        seating: 'local',
        players: table,
        viewerId: 'p1',
      }),
    ).toBe('p2');
  });

  it('расстановка: ждут того, кто уже за этим экраном — передавать некому', () => {
    expect(
      handoverTarget({ placement: true, seating: 'local', players: table, viewerId: 'p2' }),
    ).toBeNull();
  });

  it('игра: экран следует за действующим игроком, слот компьютера его не забирает', () => {
    expect(
      handoverTarget({ seating: 'local', players: table, actingId: 'p2', viewerId: 'p1' }),
    ).toBe('p2');
    expect(
      handoverTarget({ seating: 'local', players: table, actingId: 'bot', viewerId: 'p1' }),
    ).toBeNull();
    expect(
      handoverTarget({ seating: 'local', players: table, actingId: 'p2', viewerId: 'p2' }),
    ).toBeNull();
  });

  it('человек за партией один (против компьютера) — экран не передаём', () => {
    const solo = [human('p1', 1), ai('bot', 2)];

    expect(
      handoverTarget({ placement: true, seating: 'local', players: solo, viewerId: 'bot' }),
    ).toBeNull();
    expect(
      handoverTarget({ seating: 'local', players: solo, actingId: 'p1', viewerId: 'bot' }),
    ).toBeNull();
  });

  it('не локальный стол (онлайн) экран не передаёт', () => {
    expect(
      handoverTarget({ placement: true, seating: 'online', players: table, viewerId: 'p1' }),
    ).toBeNull();
  });
});

/**
 * Сквозная проверка на настоящей партии: два человека за одним экраном (одиночный режим, 2 места).
 * Очередь расстановки и передача экрана считаются по **публичной проекции** (`party.js`), поэтому тест
 * проверяет и её: `control`, `order` и `placementReady` обязаны быть видны чужому смотрящему.
 */
const createTwoHumans = () => {
  createGame(
    {
      mapId: 'generated',
      mode: 'table',
      heroes: [
        { heroId: 'medusa', team: 'A', order: 1, control: 'human' },
        { heroId: 'anubis', team: 'B', order: 2, control: 'human' },
      ],
    },
    { testId: 'handover_table', testSeed: 5 },
  );
  return load('handover_table');
};

/** Расставить всех бойцов места теми же кликами по клеткам, что шлёт доска. */
const placeAll = (state, playerId) => {
  let run = state;
  for (const fighter of player(state, playerId).fighters) {
    if (fighter.currentPosition != null) continue;
    const busy = occupiedCellIds(run, fighter.id);
    const cell = startAreaCellIds(run, playerId).find(cellId => !busy.has(String(cellId)));
    if (cell == null) throw new Error(`для бойца ${fighter.id} не нашлось клетки в области`);
    run = runAction(run, {
      type: 'PICK',
      kind: 'cell',
      id: Number(cell),
      fighterId: fighter.id,
      playerId,
    });
  }
  return run;
};

describe('расстановка двух людей за одним экраном', () => {
  it('после «ОК» первого экран уходит второму, а его «ОК» закрывает расстановку', () => {
    let state = placeAll(createTwoHumans(), 'medusa');
    state = runAction(state, { type: 'UI_OK', playerId: 'medusa' });

    const waiting = partyView(state, 'medusa');
    expect(player(state, 'medusa').placementReady).toBe(true);
    expect(player(state, 'anubis').placementReady).toBe(false);
    expect(state.hook).toBe('gameStart');
    expect(
      handoverTarget({
        placement: true,
        seating: waiting.settings.seating,
        players: waiting.players,
        viewerId: waiting.you,
      }),
    ).toBe('anubis');

    state = placeAll(state, 'anubis');
    state = runAction(state, { type: 'UI_OK', playerId: 'anubis' });

    expect(state.hook).toBe('turn');
    expect(partyView(state, 'anubis').players.every(entry => entry.placementReady === true)).toBe(
      true,
    );

    // партия пошла: экран ведёт тот, чей ход (`adaptPartyView` на клиенте берёт его из `turn.playerId`)
    const started = partyView(state, 'anubis');
    const actor = String(started.turn.playerId);
    const other = actor === 'medusa' ? 'anubis' : 'medusa';
    expect(
      handoverTarget({
        seating: started.settings.seating,
        players: started.players,
        actingId: actor,
        viewerId: other,
      }),
    ).toBe(actor);
  });
});
