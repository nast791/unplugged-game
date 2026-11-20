import { describe, expect, it } from 'vitest';
import {
  createMetrics,
  noteAction,
  noteTransition,
  snapshotHp,
  summarizeMetrics,
} from '../../../bot/play/metrics.js';
import { deckProfile, heroProfiles, profileLines, seriesLines } from '../../../bot/play/profile.js';
import { deckSize } from '../../../bot/play/pool.js';

/**
 * Новые счётчики метрик: карты и их свойства, окно умения, отметка срабатывания, предметы.
 * Состояния синтетические — настоящая партия тут не нужна, проверяются сами числа счётчиков.
 */
const types = new Map([
  ['anubis_01', 'attack'],
  ['anubis_04', 'effect'],
  ['anubis_05', 'defense'],
]);

const state = (players, extra = {}) => ({ hook: 'turn', players, ...extra });
const player = (id, extra = {}) => ({ id, fighters: [], ...extra });
const report = metrics => ({
  status: 'finished',
  seed: 1,
  steps: 200,
  state: { winner: 'anubis', players: [{ id: 'anubis' }, { id: 'dorothy' }] },
  metrics,
});

describe('метрики: карты и свойства', () => {
  it('розыгрыши копятся по id без номера копии, тип — из контента', () => {
    const metrics = createMetrics(types);
    const turn = state([player('anubis')]);

    noteAction(metrics, turn, { kind: 'card', id: 'anubis_01_2', playerId: 'anubis' });
    noteAction(metrics, turn, { kind: 'card', id: 'anubis_01_3', playerId: 'anubis' });
    noteAction(metrics, turn, { kind: 'card', id: 'anubis_05_1', playerId: 'anubis' });

    expect(metrics.cards.anubis.anubis_01).toMatchObject({ type: 'attack', plays: 2 });
    expect(metrics.cards.anubis.anubis_05).toMatchObject({ type: 'defense', plays: 1 });
  });

  it('выбранное свойство считается у окна карты, а не у окна умения', () => {
    const metrics = createMetrics(types);
    const cardWindow = state([player('anubis')], {
      targeting: { playerId: 'anubis', source: 'anubis_01_1', picked: null },
    });
    noteAction(metrics, cardWindow, { kind: 'option', id: 'o1', playerId: 'anubis' });
    expect(metrics.cards.anubis.anubis_01.options).toBe(1);

    const skillWindow = state([player('anubis')], {
      targeting: { playerId: 'anubis', source: 'anubis_skill', picked: null },
    });
    noteAction(metrics, skillWindow, { kind: 'option', id: 'o2', playerId: 'anubis' });
    expect(metrics.cards.anubis.anubis_01.options).toBe(1);
  });
});

describe('метрики: эффект без срабатывания', () => {
  const effect = rules => ({ id: 'anubis_04', instanceId: 'anubis_04_1', type: 'effect', rules });

  it('невыполненное условие — розыгрыш впустую', () => {
    const metrics = createMetrics(types);
    const hand = { cards: [effect([{ when: [{ fact: 'HAND', params: { min: 2 } }] }])] };
    const turn = state([player('anubis', { hand })]);

    noteAction(metrics, turn, { kind: 'card', id: 'anubis_04_1', playerId: 'anubis' });

    expect(metrics.cards.anubis.anubis_04).toMatchObject({ plays: 1, empty: 1, fires: 0 });
  });

  it('выполненное условие срабатывает и впустую не считается', () => {
    const metrics = createMetrics(types);
    const rule = [{ when: [{ fact: 'HAND', params: { min: 2 } }] }];
    const hand = { cards: [effect(rule), { id: 'anubis_01', instanceId: 'anubis_01_1' }] };
    const turn = state([player('anubis', { hand })]);

    noteAction(metrics, turn, { kind: 'card', id: 'anubis_04_1', playerId: 'anubis' });

    expect(metrics.cards.anubis.anubis_04).toMatchObject({ plays: 1, empty: 0, fires: 1 });
  });
});

describe('метрики: умение героя', () => {
  const skill = { id: 'anubis_skill', text: 'текст' };
  const turn = state([player('anubis', { skill }), player('dorothy')]);

  it('окно умения: открытие, выбор и срабатывание без двойного счёта', () => {
    const metrics = createMetrics(types);

    const open = { ...turn, targeting: { playerId: 'anubis', source: 'anubis_skill' } };
    noteTransition(metrics, snapshotHp(turn), open, 1);
    expect(metrics.skills.anubis).toMatchObject({ opens: 1, picks: 0, fires: 0 });

    // окно одной цели закрывается тем же кликом: выбор виден по действию
    noteAction(metrics, open, { kind: 'cell', id: 7, playerId: 'anubis' });
    const picked = {
      ...turn,
      lastSkill: { playerId: 'anubis', skillId: 'anubis_skill', moment: 'picked' },
    };
    noteTransition(metrics, snapshotHp(open), picked, 2);
    expect(metrics.skills.anubis).toMatchObject({ opens: 1, picks: 1, fires: 0 });

    const fired = {
      ...turn,
      lastSkill: { playerId: 'anubis', skillId: 'anubis_skill', moment: 'turnStart' },
    };
    noteTransition(metrics, snapshotHp(turn), fired, 3);
    noteTransition(metrics, snapshotHp(fired), fired, 4);
    expect(metrics.skills.anubis.fires).toBe(1);
  });

  it('включение флага постоянного умения — тоже срабатывание', () => {
    const metrics = createMetrics(types);
    const active = {
      ...turn,
      players: [player('anubis', { skill, skillActive: true }), player('dorothy')],
    };
    noteTransition(metrics, snapshotHp(turn), active, 1);
    expect(metrics.skills.anubis.fires).toBe(1);
  });
});

describe('метрики: предметы', () => {
  it('смена состояния и включение видны по группе предмета', () => {
    const metrics = createMetrics(types);
    const off = state([
      player('anubis', { items: [{ id: 'coil_1', group: 'coil', state: 'inactive' }] }),
    ]);
    const on = state([
      player('anubis', { items: [{ id: 'coil_1', group: 'coil', state: 'active' }] }),
    ]);

    noteTransition(metrics, snapshotHp(off), on, 1);
    noteTransition(metrics, snapshotHp(on), off, 2);

    expect(metrics.items.anubis.coil).toMatchObject({ active: true, changes: 2 });
    expect([...metrics.items.anubis.coil.states].sort()).toEqual(['active', 'inactive']);
  });
});

describe('метрики: сводка и профиль', () => {
  const metrics = {
    damage: { anubis: { dealt: 10, taken: 4 }, dorothy: { dealt: 4, taken: 10 } },
    actions: { anubis: { attack: 3 }, dorothy: { draw: 2 } },
    played: { anubis: new Set(['anubis_01']), dorothy: new Set() },
    turns: {},
    firstBlood: 'anubis',
    cards: {
      anubis: {
        anubis_04: { type: 'effect', plays: 3, empty: 3, options: 0, fires: 0, value: 0 },
        anubis_01: { type: 'attack', plays: 2, empty: 0, options: 1, fires: 0, value: 0 },
      },
      dorothy: {},
    },
    skills: {
      anubis: { opens: 2, picks: 1, fires: 1 },
      dorothy: { opens: 0, picks: 0, fires: 0 },
    },
    items: {
      anubis: { shroud: { active: true, changes: 1, states: new Set(['active', 'inactive']) } },
      dorothy: {},
    },
  };

  it('покарточные числа и «ни разу не сработало» сворачиваются по серии', () => {
    const summary = summarizeMetrics([report(metrics)]);

    expect(summary.heroes.anubis.cards.anubis_04).toMatchObject({ plays: 3, empty: 3 });
    expect(summary.cards.anubis_04).toMatchObject({ plays: 3, empty: 3 });
    expect(summary.heroes.anubis.skills).toMatchObject({ opens: 2, picks: 1, applied: 1 });
    expect(summary.skills).toEqual({ opens: 2, picks: 1, fires: 1, applied: 1 });
    expect(summary.heroes.anubis.items.shroud.activeGames).toBe(1);
    expect(summary.items.activeGames).toBe(1);
    expect(summary.silentCards).toEqual(['anubis_04']);
    expect(summary.silentSkills).toEqual(['dorothy']);
    expect(summary.silentItems).toEqual([]);
  });

  it('профиль на пустой серии строится и печатается', () => {
    const profiles = heroProfiles([], ['anubis']);
    const lines = profileLines(profiles);

    expect(profiles[0]).toMatchObject({ heroId: 'anubis', games: 0, winrate: 0, avgSteps: 0 });
    expect(profiles[0].deck.cards).toBe(deckSize('anubis'));
    expect(profiles[0].items.length).toBeGreaterThan(0);
    expect(lines[0]).toBe('\n### Профиль героев');
    expect(lines.length).toBeGreaterThan(1);
    expect(seriesLines(summarizeMetrics([]))).toHaveLength(1);
  });

  it('профиль по серии: бесполезные свойства, числа умения, матчапы', () => {
    const profiles = heroProfiles([report(metrics)], ['anubis']);

    expect(profiles[0].games).toBe(1);
    expect(profiles[0].cards.silent).toEqual([{ id: 'anubis_04', plays: 3, empty: 3 }]);
    expect(profiles[0].skill).toMatchObject({ opens: 2, picks: 1, fires: 1, applied: 1 });
    expect(profiles[0].matchups.best[0]).toMatchObject({ heroId: 'dorothy', games: 1 });
    expect(profileLines(profiles).join('\n')).toContain('свойство ни разу не сработало');
  });

  it('состав колоды берётся из пака', () => {
    const deck = deckProfile('tesla');

    expect(deck.cards).toBe(deckSize('tesla'));
    expect(deck.types.attack).toBeGreaterThan(0);
    expect(deck.assistants.hp).toBeGreaterThanOrEqual(0);
  });
});

describe('метрики: карты — добор, сброс и правила', () => {
  const handOf = cards => ({ cards });
  // в настоящей руке `id` карты — это id копии (`anubis_05_1`), а не id контента
  const card = (cardId, instanceId, extra = {}) => ({
    id: instanceId,
    instanceId,
    cardId,
    type: 'effect',
    ...extra,
  });

  it('добор виден по появлению копии в руке', () => {
    const metrics = createMetrics(types);
    const first = card('anubis_01', 'anubis_01_1', { type: 'attack' });
    const second = card('anubis_05', 'anubis_05_1', { type: 'defense' });
    const before = snapshotHp(state([player('anubis', { hand: handOf([first]) })]));

    noteTransition(
      metrics,
      before,
      state([player('anubis', { hand: handOf([first, second]) })]),
      1,
    );

    expect(metrics.cards.anubis.anubis_05.drawn).toBe(1);
  });

  it('сыгранная карта сбросом не считается, а ушедшая из руки без розыгрыша — считается', () => {
    const metrics = createMetrics(types);
    const played = card('anubis_01', 'anubis_01_1', { type: 'attack' });
    const dropped = card('anubis_05', 'anubis_05_1', { type: 'defense' });
    const turn = state([player('anubis', { hand: handOf([played, dropped]) })]);

    noteAction(metrics, turn, { kind: 'card', id: 'anubis_01_1', playerId: 'anubis' });
    noteTransition(metrics, snapshotHp(turn), state([player('anubis')]), 1);

    expect(metrics.cards.anubis.anubis_01.discarded).toBe(0);
    expect(metrics.cards.anubis.anubis_05.discarded).toBe(1);
  });

  it('правила карты считают, сколько раз условие выполнилось', () => {
    const metrics = createMetrics(types);
    const rules = [
      { moment: 'effect', when: [], then: [] },
      { moment: 'effect', when: [{ fact: 'HAND', params: { min: 9 } }], then: [] },
    ];
    const effect = card('anubis_04', 'anubis_04_1', { rules });
    const turn = state([player('anubis', { hand: handOf([effect]) })]);

    noteAction(metrics, turn, { kind: 'card', id: 'anubis_04_1', playerId: 'anubis' });

    expect(metrics.cards.anubis.anubis_04.rules[0]).toEqual({ plays: 1, fires: 1 });
    expect(metrics.cards.anubis.anubis_04.rules[1]).toEqual({ plays: 1, fires: 0 });
  });

  it('в серии видны ни разу не сыгранные, сбрасываемые карты и молчащие механики', () => {
    const metrics = createMetrics(types);
    const quiet = card('anubis_04', 'anubis_04_1', {
      rules: [{ moment: 'effect', when: [{ fact: 'HAND', params: { min: 9 } }], then: [] }],
    });
    const turn = state([player('anubis', { hand: handOf([quiet]) })]);
    for (let index = 0; index < 5; index += 1) {
      noteAction(metrics, turn, { kind: 'card', id: 'anubis_04_1', playerId: 'anubis' });
    }
    metrics.cards.anubis.anubis_05 = {
      type: 'defense',
      plays: 0,
      drawn: 3,
      discarded: 0,
      empty: 0,
      options: 0,
      fires: 0,
      value: 0,
      rules: [],
    };
    metrics.cards.anubis.anubis_01 = {
      type: 'attack',
      plays: 1,
      drawn: 6,
      discarded: 5,
      empty: 0,
      options: 0,
      fires: 0,
      value: 0,
      rules: [],
    };

    const summary = summarizeMetrics([report(metrics)]);

    expect(summary.neverPlayed.map(entry => entry.cardId)).toContain('anubis_05');
    expect(summary.discardHeavy.map(entry => entry.cardId)).toContain('anubis_01');
    expect(summary.silentRules.map(entry => `${entry.cardId}#${entry.index}`)).toContain(
      'anubis_04#0',
    );
  });
});
