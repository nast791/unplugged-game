import { describe, expect, it } from 'vitest';
import {
  ACTION_FEATURES,
  SUMMARY_FEATURES,
  actionFeatures,
} from '../../../bot/play/actionFeatures.js';
import {
  hasQValue,
  rankOptions,
  scoreAction,
  scoreOptions,
  valueOf,
} from '../../../bot/play/qvalue.js';
import { baseFeatureNames } from '../../../bot/play/value.js';
import { createState, player } from '../../fixtures/state.js';

/**
 * Рантайм артефакта тренера (`bot/play/qvalue.js`): оценка **пары** «состояние + действие». Проверяем
 * не «функция посчиталась», а свойства, на которых держится вся затея: скрещивание признаков позиции и
 * действия работает (без него оценка внутри точки решения вырождается), веса после ранжирования годятся
 * для выбора, а пустой артефакт ничего не ломает.
 */
const stateOf = () => {
  const state = createState({
    turn: { index: 1, playerId: '0', actedRound: ['0'], actionsLeft: 2 },
    _enteredHooks: { gameStart: true, turn: true },
  });
  player(state, '0').heroId = 'anubis';
  player(state, '0').fighters[0].id = 'anubis';
  return state;
};

/** Ручная таблица: одна ненулевая координата скрещивания и смещения — так видно вклад каждого члена. */
const summaryIndex = SUMMARY_FEATURES.map(name => baseFeatureNames.indexOf(name));
const table = {
  stateDim: baseFeatureNames.length,
  actionDim: ACTION_FEATURES,
  summaryFeatures: SUMMARY_FEATURES,
  summaryIndex,
  heroes: ['anubis'],
  cards: [],
  b: 1,
  wState: new Array(baseFeatureNames.length).fill(0),
  wAction: new Array(ACTION_FEATURES).fill(0),
  wCross: SUMMARY_FEATURES.map(() => new Array(ACTION_FEATURES).fill(0)),
  heroBias: [0.5],
  rivalBias: [0.25],
  cardBias: [0],
  bValue: 0,
  wValue: new Array(baseFeatureNames.length).fill(0),
};

describe('оценка пары «состояние + действие»', () => {
  it('скрещивание признаков позиции и действия меняет оценку', () => {
    const state = stateOf();
    const stateFeatures = new Array(baseFeatureNames.length).fill(0);
    const fighters = summaryIndex[SUMMARY_FEATURES.indexOf('fighters')];
    stateFeatures[fighters] = 1; // «у меня на одного бойца больше»
    const action = new Array(ACTION_FEATURES).fill(0);
    action[0] = 1; // «играю карту»

    const plain = structuredClone(table);
    const before = scoreAction(plain, {
      stateFeatures,
      action,
      hero: 'anubis',
      rival: 'tesla',
      card: null,
    });

    const crossed = structuredClone(table);
    crossed.wCross[SUMMARY_FEATURES.indexOf('fighters')][0] = 2;
    const after = scoreAction(crossed, {
      stateFeatures,
      action,
      hero: 'anubis',
      rival: 'tesla',
      card: null,
    });
    expect(after - before).toBeCloseTo(2, 6);

    // без бойцов (сводка нулевая) скрещивание молчит
    const quiet = scoreAction(crossed, {
      stateFeatures: new Array(baseFeatureNames.length).fill(0),
      action,
      hero: 'anubis',
      rival: 'tesla',
      card: null,
    });
    expect(quiet).toBeCloseTo(before, 6);
  });

  it('смещения героя, соперника и карты входят в оценку', () => {
    const state = stateOf();
    const stateFeatures = new Array(baseFeatureNames.length).fill(0);
    const action = new Array(ACTION_FEATURES).fill(0);

    const value = scoreAction(table, {
      stateFeatures,
      action,
      hero: 'anubis',
      rival: 'tesla',
      card: null,
    });
    expect(value).toBeCloseTo(1 + 0.5 + 0.25, 6); // b + герой + соперник; чужой герой — нулевое смещение
  });

  it('ранжирование переставляет веса, но запрещённые варианты не возвращает', () => {
    const state = stateOf();
    const options = [
      { weight: 10, action: { type: 'PICK', kind: 'card', id: 'atk_0' } },
      { weight: 1, action: { type: 'PICK', kind: 'deck' } },
      { weight: 0, action: { type: 'PICK', kind: 'cell', id: 11 } }, // политика запретила этот шаг
    ];
    const ranked = rankOptions(state, '0', options, { table });

    expect(ranked).toHaveLength(3);
    for (const entry of ranked.filter(entry => Number(entry.weight) > 0)) {
      expect(Number.isFinite(entry.qvalue)).toBe(true);
    }
    // «шаг в никуда» остаётся запрещённым: вес 0 — это вето политики, а не «мало»
    const vetoed = ranked.find(entry => entry.action.id === 11);
    expect(vetoed.weight).toBe(0);
    // лучший по модели вариант весит больше остальных разрешённых
    const allowed = ranked.filter(entry => entry.weight > 0);
    const best = allowed.reduce((leader, entry) => (entry.qvalue > leader.qvalue ? entry : leader));
    expect(best.weight).toBe(Math.max(...allowed.map(entry => entry.weight)));
  });

  it('пустой артефакт ничего не меняет: политика играет как раньше', () => {
    const empty = { v: 1, kind: 'linear-q', stateDim: 0 };
    expect(hasQValue(empty)).toBe(false);

    const options = [{ weight: 3, action: { type: 'UI_OK' } }];
    expect(rankOptions(stateOf(), '0', options, { table: empty })).toBe(options);
    expect(scoreOptions(stateOf(), '0', options, { table: empty })).toBe(null);
  });

  it('оценки вариантов отдаются словарём — из них же собирается приор поиска', () => {
    const state = stateOf();
    const options = [
      { weight: 10, action: { type: 'PICK', kind: 'card', id: 'atk_0' } },
      { weight: 0, action: { type: 'PICK', kind: 'cell', id: 11 } }, // политика запретила шаг
      { weight: 4, action: { type: 'PICK', kind: 'deck' } },
    ];
    const scores = scoreOptions(state, '0', options, { table });

    // вариант с весом 0 политика не предлагает — модель его не оценивает и вернуть не может
    expect(scores.size).toBe(2);
    expect(scores.has(JSON.stringify(options[1].action))).toBe(false);
    for (const value of scores.values()) expect(Number.isFinite(value)).toBe(true);

    // ранжирование берёт **те же** числа: выбор ученика и приор поиска разойтись не могут
    for (const entry of rankOptions(state, '0', options, { table })) {
      if (entry.weight > 0) expect(entry.qvalue).toBe(scores.get(JSON.stringify(entry.action)));
    }
  });
});

/**
 * Нелинейный артефакт (`mlp-q`, §28): игра читает обученную сеть тем же `scoreAction`. Формула обязана
 * совпадать с `trainer/model.py` — `[состояние ⊕ действие ⊕ герой ⊕ соперник ⊕ карта]`, два слоя с
 * `relu`, голова `score`; матрицы лежат по строкам. Числа здесь посчитаны вручную, чтобы тест ловил
 * именно формулы, а не «функция вернула число».
 */
const mlpTable = {
  v: 1,
  kind: 'mlp-q',
  stateDim: 2,
  actionDim: 1,
  hidden: 2,
  embed: 1,
  heroes: ['alpha', 'beta'],
  cards: ['card_a'],
  heroEmbed: [[0.5], [-0.25]],
  cardEmbed: [[0.1], [0.2]],
  // вход: [state0, state1, action0, hero, rival, card]
  W1: [
    0.1,
    0.2,
    -0.3,
    0.4,
    0.5,
    -0.6, // строка 0
    0.5,
    -0.4,
    0.3,
    -0.2,
    0.1,
    0.2, // строка 1
  ],
  b1: [0.05, -0.1],
  W2: [1.0, -2.0, 0.5, 0.5],
  b2: [0, 0],
  Wscore: [3.0, -1.0],
  bscore: [0.25],
  Wvalue: [0.5, -0.5],
  bvalue: [0.1],
};

describe('нелинейный артефакт (mlp-q)', () => {
  it('forward-pass считает ту же формулу, что тренер', () => {
    // разбор вручную: скрытый слой 1 → relu(−0.335) = 0 и relu(0.395) = 0.395;
    // слой 2 → relu(−0.79) = 0 и relu(0.1975) = 0.1975; голова → 0.25 + 3·0 − 1·0.1975
    const score = scoreAction(mlpTable, {
      stateFeatures: [1, 2],
      action: [3],
      hero: 'alpha',
      rival: 'beta',
      card: null,
    });
    expect(score).toBeCloseTo(0.0525, 6);

    // голова ценности — линейная по состоянию: 0.1 + 0.5·1 − 0.5·2
    expect(valueOf(mlpTable, [1, 2])).toBeCloseTo(-0.4, 6);
  });

  it('герой и карта берутся из словарей артефакта, неизвестные — нулевая строка', () => {
    const base = { stateFeatures: [1, 2], action: [3], rival: 'beta', card: null };
    const alpha = scoreAction(mlpTable, { ...base, hero: 'alpha' });
    const beta = scoreAction(mlpTable, { ...base, hero: 'beta' });
    const unknown = scoreAction(mlpTable, { ...base, hero: 'nobody' });

    expect(alpha).not.toBe(beta);
    // неизвестный герой получает нулевую строку словаря — здесь она же строка «alpha»
    // (так же считает тренер: `model.py: _hero` ищет имя, а не найдя, берёт нулевой индекс)
    expect(unknown).toBe(alpha);
    // карта меняет эмбеддинг: `card_a` — строка 1 словаря (0 — «не карта»)
    const withCard = scoreAction(mlpTable, { ...base, hero: 'alpha', card: 'card_a' });
    expect(withCard).not.toBe(alpha);
  });

  it('рантайм играет нелинейным артефактом так же, как линейным', () => {
    const state = stateOf();
    const options = [
      { weight: 10, action: { type: 'PICK', kind: 'card', id: 'atk_0' } },
      { weight: 1, action: { type: 'PICK', kind: 'deck' } },
      { weight: 0, action: { type: 'PICK', kind: 'cell', id: 11 } }, // вето политики
    ];

    expect(hasQValue(mlpTable)).toBe(true);
    const ranked = rankOptions(state, '0', options, { table: mlpTable });
    for (const entry of ranked.filter(entry => entry.weight > 0)) {
      expect(Number.isFinite(entry.qvalue)).toBe(true);
    }
    expect(ranked.find(entry => entry.action.id === 11).weight).toBe(0);
    // артефакт без весов не считается загруженным
    expect(hasQValue({ kind: 'mlp-q', stateDim: 2, actionDim: 1 })).toBe(false);
  });
});

describe('примесь мнения политики (§29)', () => {
  const withMix = (value, run) => {
    const before = process.env.QVALUE_PRIOR_MIX;
    process.env.QVALUE_PRIOR_MIX = String(value);
    try {
      return run();
    } finally {
      if (before == null) delete process.env.QVALUE_PRIOR_MIX;
      else process.env.QVALUE_PRIOR_MIX = before;
    }
  };
  const options = () => [
    { weight: 4, action: { type: 'PICK', kind: 'cell', id: 8 } },
    { weight: 1, action: { type: 'PICK', kind: 'cell', id: 9 } },
  ];

  /**
   * Клетки — тот случай, ради которого примесь появилась: оценки модели у них различаются на сотые, то
   * есть порядок задаёт шум (§29, замер оракула). Тогда вес политики должен решать исход спора.
   */
  it('при равных оценках модели выигрывает вариант, важный политике', () => {
    const state = stateOf();
    const ranked = withMix(0.3, () =>
      rankOptions(state, '0', options(), { table, temperature: 0 }),
    );

    expect(ranked.find(entry => entry.action.id === 8).weight).toBeGreaterThan(0);
    expect(ranked.find(entry => entry.action.id === 9).weight).toBe(0);
  });

  it('примесь 0 — чистая модель: равные оценки остаются равными', () => {
    const state = stateOf();
    const ranked = withMix(0, () => rankOptions(state, '0', options(), { table, temperature: 0 }));

    for (const entry of ranked) expect(entry.weight).toBeGreaterThan(0);
  });
});

describe('оценка пары «состояние + действие» (продолжение)', () => {
  it('признаки действия: карта отличается от колоды и от клетки', () => {
    const state = stateOf();
    const card = actionFeatures(state, '0', {
      action: { type: 'PICK', kind: 'card', id: 'atk_0' },
    });
    const deck = actionFeatures(state, '0', { action: { type: 'PICK', kind: 'deck' } });

    expect(card).toHaveLength(ACTION_FEATURES);
    expect(card[0]).toBe(1); // карта
    expect(deck[0]).toBe(0);
    expect(deck[1]).toBe(1); // колода
    expect(card[5]).toBeGreaterThan(0); // сила карты
    expect(valueOf(table, new Array(15).fill(0))).toBe(0);
  });
});
