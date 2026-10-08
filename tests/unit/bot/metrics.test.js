import { describe, expect, it } from 'vitest';
import {
  actionKindOf,
  createMetrics,
  noteAction,
  noteTransition,
  percent,
  snapshotHp,
  summarizeMetrics,
} from '../../../bot/play/metrics.js';
import {
  corridorMark,
  firstSeatWins,
  ladderAggregateLine,
  ladderLine,
  matrixTable,
  noiseMargin,
  turnsLine,
  winRateOf,
} from '../../../bot/tools/matchup.js';
import {
  cardTypeById,
  deckCardIds,
  deckSize,
  heroIds,
  matchups,
  referenceHeroIds,
} from '../../../bot/play/pool.js';

/**
 * Метрики бота — измерительный прибор для баланса героев, поэтому проверяем не «функция вызвалась»,
 * а числа: урон, покрытие, первое убийство. Снимок здоровья снимается до хода: инвариант самого
 * движка (ход не меняет входное состояние) сторожит `tests/unit/core/immutability.test.js`.
 */
const types = new Map([
  ['anubis_01', 'attack'],
  ['anubis_02', 'hybrid'],
  ['anubis_03', 'defense'],
  ['anubis_04', 'effect'],
]);

const state = (players, extra = {}) => ({ hook: 'turn', players, ...extra });
const player = (id, fighters) => ({ id, fighters });
const fighter = (id, currentHp, startHp = 10) => ({ id, currentHp, startHp });

const report = ({
  winner,
  steps = 100,
  damage = {},
  actions = {},
  played = {},
  firstBlood = null,
}) => ({
  status: 'finished',
  steps,
  state: { winner, players: [{ id: 'anubis' }, { id: 'dorothy' }] },
  metrics: {
    damage,
    actions,
    played: Object.fromEntries(
      Object.entries(played).map(([heroId, cards]) => [heroId, new Set(cards)]),
    ),
    firstBlood,
  },
});

describe('метрики: вид действия', () => {
  const turn = state([player('anubis', [])]);

  it('расстановка, карты, добор и завершение различаются', () => {
    expect(actionKindOf({ hook: 'gameStart' }, { kind: 'cell' }, types)).toBe('placement');
    expect(actionKindOf(turn, { kind: 'card', id: 'anubis_01_1' }, types)).toBe('attack');
    // гибрид считаем атакой: так же устроен подсчёт колод в deck-stats
    expect(actionKindOf(turn, { kind: 'card', id: 'anubis_02_1' }, types)).toBe('attack');
    expect(actionKindOf(turn, { kind: 'card', id: 'anubis_03_1' }, types)).toBe('defense');
    expect(actionKindOf(turn, { kind: 'card', id: 'anubis_04_3' }, types)).toBe('effect');
    expect(actionKindOf(turn, { kind: 'card', id: 'medusa_01_1' }, types)).toBe('unknown');
    expect(actionKindOf(turn, { kind: 'deck' }, types)).toBe('draw');
    expect(actionKindOf(turn, { kind: 'option', id: 'o1' }, types)).toBe('option');
    expect(actionKindOf(turn, { kind: 'fighter', id: 'amat' }, types)).toBe('target');
    expect(actionKindOf(turn, { type: 'UI_OK' }, types)).toBe('confirm');
  });

  it('клик по клетке — перемещение только в окне перемещения', () => {
    expect(actionKindOf(turn, { kind: 'cell', id: 5 }, types)).toBe('target');
    expect(
      actionKindOf(state([], { movement: { playerId: 'anubis' } }), { kind: 'cell', id: 5 }, types),
    ).toBe('move');
  });
});

describe('метрики: действия и покрытие', () => {
  it('действия копятся по героям, карты — без номера копии', () => {
    const metrics = createMetrics(types);
    const turn = state([player('anubis', []), player('dorothy', [])]);

    noteAction(metrics, turn, { kind: 'card', id: 'anubis_01_2', playerId: 'anubis' });
    noteAction(metrics, turn, { kind: 'card', id: 'anubis_01_3', playerId: 'anubis' });
    noteAction(metrics, turn, { kind: 'deck', playerId: 'dorothy' });

    expect(metrics.actions.anubis).toEqual({ attack: 2 });
    expect(metrics.actions.dorothy).toEqual({ draw: 1 });
    expect([...metrics.played.anubis]).toEqual(['anubis_01']);
  });
});

describe('метрики: урон и первое убийство', () => {
  it('урон считается по снимку, снятому до изменения бойцов', () => {
    const metrics = createMetrics(types);
    const field = state([
      player('anubis', [fighter('anubis', 5), fighter('amat', 8)]),
      player('dorothy', [fighter('dorothy', 12)]),
    ]);
    const snapshot = snapshotHp(field);

    // исход боя: убитый боец уходит из массива (так делает SET_HEALTH на форке состояния)
    field.players[0].fighters = [fighter('amat', 8)];
    noteTransition(metrics, snapshot, field, 7);

    expect(metrics.damage.anubis.taken).toBe(5);
    expect(metrics.damage.dorothy.dealt).toBe(5);
    expect(metrics.firstBlood).toBe('dorothy');
    expect(metrics.firstBloodStep).toBe(7);
  });

  it('лечение уроном не считается, первое убийство фиксируется один раз', () => {
    const metrics = createMetrics(types);
    const field = state([
      player('anubis', [fighter('anubis', 5)]),
      player('dorothy', [fighter('dorothy', 12)]),
    ]);

    // лечение: 5 → 8, урона нет
    const healed = snapshotHp(field);
    field.players[0].fighters[0].currentHp = 8;
    noteTransition(metrics, healed, field, 1);
    expect(metrics.damage).toEqual({});

    // урон 8 → 3, смерть 3 → 0: первое убийство фиксируется на смерти
    const hurt = snapshotHp(field);
    field.players[0].fighters[0].currentHp = 3;
    noteTransition(metrics, hurt, field, 2);
    const deadly = snapshotHp(field);
    field.players[0].fighters[0].currentHp = 0;
    noteTransition(metrics, deadly, field, 3);
    // повторный учёт того же состояния ничего не добавляет
    noteTransition(metrics, snapshotHp(field), field, 4);

    expect(metrics.damage.anubis.taken).toBe(8);
    expect(metrics.damage.dorothy.dealt).toBe(8);
    expect(metrics.firstBlood).toBe('dorothy');
    expect(metrics.firstBloodStep).toBe(3);
  });
});

/**
 * Счёт действий в ходу: час движка — остаток действий (`turn.actionsLeft`). Ход с двумя действиями
 * считает метрика, по которой видно, играет ли бот связками (`--policy=chain`), а не отдельными ходами.
 */
describe('метрики: действия в ходу', () => {
  const turn = (playerId, actionsLeft, index) =>
    state([player(playerId, [])], { turn: { playerId, actionsLeft, index } });

  it('два действия в одном ходу считаются полным ходом', () => {
    const metrics = createMetrics(types);

    // первое действие: остаток 2 → 1, ход тот же
    noteTransition(metrics, snapshotHp(turn('anubis', 2, 1)), turn('anubis', 1, 1), 1);
    // второе: остаток 1 → 0, и этим действием ход закончился (активен соперник)
    noteTransition(metrics, snapshotHp(turn('anubis', 1, 1)), turn('dorothy', 2, 2), 2);
    // у соперника ход оборвался на одном действии: партия кончилась
    noteTransition(metrics, snapshotHp(turn('dorothy', 2, 2)), { hook: 'gameEnd' }, 3);

    expect([...metrics.turns.anubis.values()]).toEqual([2]);
    expect([...metrics.turns.dorothy.values()]).toEqual([1]);

    const reports = [
      {
        status: 'finished',
        steps: 3,
        state: { winner: 'anubis', players: [{ id: 'anubis' }, { id: 'dorothy' }] },
        metrics,
      },
    ];
    const { totals, heroes } = summarizeMetrics(reports);
    expect(totals).toMatchObject({ turns: 2, fullTurns: 1 });
    expect(heroes.anubis.fullTurns).toBe(1);
    expect(heroes.dorothy.fullTurns).toBe(0);
    expect(turnsLine(reports)).toContain('1 из 2 (50%)');
  });
});

describe('метрики: свод по серии', () => {
  it('винрейт, длина, урон и покрытие считаются по дошедшим до конца', () => {
    const reports = [
      report({
        winner: 'anubis',
        steps: 100,
        damage: { anubis: { dealt: 12, taken: 4 }, dorothy: { dealt: 4, taken: 12 } },
        actions: { anubis: { attack: 3, move: 1 } },
        played: { anubis: deckCardIds('anubis').slice(0, 2) },
        firstBlood: 'anubis',
      }),
      report({ winner: 'dorothy', steps: 200, firstBlood: 'anubis' }),
      { status: 'crash', steps: 0, state: { winner: null }, metrics: null },
    ];

    const { totals, heroes } = summarizeMetrics(reports);

    expect(totals).toEqual({
      games: 2,
      steps: 300,
      deaths: 2,
      decidedByFirstBlood: 1,
      turns: 0,
      fullTurns: 0,
    });
    expect(heroes.anubis.games).toBe(2);
    expect(heroes.anubis.wins).toBe(1);
    expect(heroes.anubis.steps).toBe(300);
    expect(heroes.anubis.dealt).toBe(12);
    expect(heroes.anubis.played.size).toBe(2);
    expect(heroes.anubis.deck).toEqual(deckCardIds('anubis'));
    expect(heroes.dorothy.wins).toBe(1);
    expect(percent(heroes.anubis.wins, heroes.anubis.games)).toBe(50);
  });
});

describe('пул героев', () => {
  it('у каждого героя есть колода, и тип каждой карты известен', () => {
    expect(heroIds.length).toBeGreaterThanOrEqual(4);
    const types = cardTypeById();
    for (const heroId of heroIds) {
      expect(deckSize(heroId)).toBeGreaterThan(0);
      for (const cardId of deckCardIds(heroId)) {
        expect(types.get(cardId)).toBeTruthy();
      }
    }
  });

  it('эталон оригинала — часть пула, пары упорядоченные и без зеркал', () => {
    for (const heroId of referenceHeroIds) expect(heroIds).toContain(heroId);

    const pairs = matchups(['anubis', 'dorothy', 'ifrit']);
    expect(pairs).toHaveLength(6);
    expect(pairs).toContainEqual({ heroA: 'anubis', heroB: 'dorothy' });
    expect(pairs).toContainEqual({ heroA: 'dorothy', heroB: 'anubis' });
    expect(pairs.filter(pair => pair.heroA === pair.heroB)).toEqual([]);
  });
});

describe('матрица матчапов', () => {
  it('винрейт считается только по дошедшим до конца партиям', () => {
    const reports = [
      { status: 'finished', state: { winner: 'anubis' } },
      { status: 'finished', state: { winner: 'dorothy' } },
      { status: 'crash', state: { winner: null } },
    ];

    expect(winRateOf(reports, 'anubis')).toEqual({ games: 2, wins: 1, rate: 50 });
  });

  it('клетка таблицы — винрейт строки, выход за коридор помечен', () => {
    const pairResults = [
      {
        heroA: 'anubis',
        heroB: 'dorothy',
        reports: [{ status: 'finished', state: { winner: 'anubis' } }],
      },
    ];
    const markdown = matrixTable(pairResults, ['anubis', 'dorothy']);

    expect(markdown).toContain('Анубис');
    expect(markdown).toContain('100% !');
    expect(markdown).toContain('| — |');
    expect(corridorMark(50, 30, 70)).toBe('');
    expect(corridorMark(29, 30, 70)).toBe(' !');
    expect(noiseMargin(200)).toBeLessThan(noiseMargin(50));
  });

  it('лестница считает победы политики первого игрока, а не героя строки', () => {
    // чётный сид — первым ходит heroB (политика строки), нечётный — heroA; победитель всюду heroB
    const reports = [
      { status: 'finished', seed: 2, state: { winner: 'dorothy' } },
      { status: 'finished', seed: 3, state: { winner: 'dorothy' } },
    ];
    const pairResults = [{ heroA: 'anubis', heroB: 'dorothy', reports }];

    // политика строки победила один раз из двух: в первой партии она играла за dorothy
    expect(ladderLine(pairResults, 'greedy', 'random')).toContain('50% побед на 2 партиях');
  });

  it('лестница в обе стороны складывает победные партии политики из двух замеров', () => {
    const pairResults = [
      {
        heroA: 'anubis',
        heroB: 'dorothy',
        reports: [
          { status: 'finished', seed: 2, state: { winner: 'dorothy' } },
          { status: 'finished', seed: 3, state: { winner: 'dorothy' } },
        ],
      },
    ];

    // первым ходит heroB на чётных сидах и heroA на нечётных: победы первого места — 1 из 2 партий
    expect(firstSeatWins(pairResults)).toEqual({ wins: 1, games: 2 });

    // встречный замер: политика ходила второй и взяла 7 из 10 — вместе 6 + 7 из 20
    const line = ladderAggregateLine(
      { wins: 6, games: 10 },
      { wins: 3, games: 10 },
      'greedy',
      'random',
    );
    expect(line).toContain('65% против 35%');
    expect(line).toContain('13 против 7 на 20 партиях');
  });
});
