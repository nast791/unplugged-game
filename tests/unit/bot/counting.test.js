import { describe, expect, it } from 'vitest';
import { runUi } from '#shared/publicApi.js';
import {
  cancelRiskOf,
  expectedAttack,
  expectedBonus,
  expectedRuleShare,
  remainingCount,
  remainingOf,
} from '../../../bot/play/counting.js';
import { actionsFor, playDuel } from '../../../bot/play/duel.js';
import { cancelCardIds } from '../../../bot/play/pool.js';
import { heroes } from '../../../server/content/index.js';
import { card as fixtureCard, createState, player } from '../../fixtures/state.js';

/**
 * Подсчёт карт и честность защиты — по настоящим партиям: остаток колоды соперника должен сходиться
 * с его зонами на любом шаге, а решение защитника не должно зависеть от скрытого числа атаки
 * (проекция отдаёт его только владельцу карты, значит и бот его читать не вправе).
 */
const PAIRS = [
  { heroA: 'tesla', heroB: 'anubis' },
  { heroA: 'snow-queen', heroB: 'medusa' },
  { heroA: 'ifrit', heroB: 'dorothy' },
];

const SEEDS = [1, 2, 3, 4];

const sweep = visit => {
  for (const seed of SEEDS) {
    for (const pair of PAIRS) {
      playDuel({
        seed,
        ...pair,
        policy: 'greedy',
        onStep: ({ state, playerId, step }) => visit({ state, playerId, step, seed, pair }),
      });
    }
  }
};

/** Копии карты в колоде героя с учётом `quantity`. */
const copiesInDeck = (heroId, cardId) =>
  (heroes[heroId]?.cards ?? [])
    .filter(card => card.id === cardId)
    .reduce((sum, card) => sum + (Number(card.quantity) || 1), 0);

/** Среднее число атаки колоды героя: с ним должно совпасть ожидание на старте партии. */
const deckAttackMean = heroId => {
  const values = (heroes[heroId]?.cards ?? [])
    .filter(card => card.type === 'attack' || card.type === 'hybrid')
    .flatMap(card =>
      Array.from({ length: Number(card.quantity) || 1 }, () => Number(card.value) || 0),
    );
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const lineOf = options =>
  options
    .map(
      entry =>
        `${entry.action.kind ?? entry.action.type}:${entry.action.id ?? '—'}=${entry.weight}`,
    )
    .join(' ');

describe('подсчёт карт', () => {
  it('остаток соперника сходится с его зонами на каждом шаге партии', () => {
    let steps = 0;
    const broken = [];

    sweep(({ state, playerId, step, seed }) => {
      steps += 1;
      for (const { unseen } of remainingOf(state, playerId).opponents) {
        // остаток — это ровно чужая рука, нераскрытая колода и закрытые карты боя
        const identity = unseen.handSize + unseen.deckSize + unseen.hiddenInPlay;
        if (unseen.cards !== identity) broken.push({ seed, step, hero: unseen.heroId, ...unseen });
      }
    });

    expect(steps).toBeGreaterThan(1000);
    expect(broken).toEqual([]);
  }, 30000);

  it('в остатке нет фантомных копий: сброс и открытые карты боя из него вычтены', () => {
    const extra = [];

    sweep(({ state, playerId, step, seed }) => {
      for (const { player, unseen } of remainingOf(state, playerId).opponents) {
        const discarded = new Map();
        for (const card of player.discard?.cards ?? []) {
          discarded.set(card.id, (discarded.get(card.id) ?? 0) + 1);
        }
        for (const [cardId, count] of unseen.pooled) {
          const possible = copiesInDeck(player.heroId, cardId) - (discarded.get(cardId) ?? 0);
          if (count > possible)
            extra.push({ seed, step, hero: player.heroId, cardId, count, possible });
        }
      }
    });

    expect(extra).toEqual([]);
  }, 30000);

  it('на старте ожидание атаки равно средней атаке колоды соперника', () => {
    const seen = [];

    sweep(({ state, playerId, step }) => {
      if (step !== 0) return;
      const opponent = (state.players ?? []).find(player => String(player.id) !== String(playerId));
      seen.push({
        expected: expectedAttack(state, playerId),
        mean: deckAttackMean(opponent.heroId),
      });
    });

    expect(seen.length).toBeGreaterThan(0);
    for (const { expected, mean } of seen) expect(expected).toBeCloseTo(mean, 6);
  }, 30000);

  it('остаток уменьшается, когда карта уходит в открытый сброс', () => {
    const observed = [];

    sweep(({ state, playerId }) => {
      for (const { player, unseen } of remainingOf(state, playerId).opponents) {
        const discarded = (player.discard?.cards ?? []).map(card => card.id);
        if (discarded.length === 0) continue;
        const cardId = discarded[0];
        observed.push({
          heroId: player.heroId,
          cardId,
          left: remainingCount(state, playerId, cardId),
          inDeck: copiesInDeck(player.heroId, cardId),
        });
      }
    });

    expect(observed.length).toBeGreaterThan(0);
    // из колоды ушло хотя бы по одной копии: остаток строго меньше полной колоды
    for (const entry of observed) expect(entry.left).toBeLessThan(entry.inDeck);
  }, 30000);
});

describe('честность защиты', () => {
  it('подмена скрытого числа атаки не меняет выбор защитника', () => {

    const windows = [];

    sweep(({ state, playerId }) => {
      const ui = runUi(state, playerId);
      if (state.combat?.stage !== 'defense' || (ui.playableCardIds ?? []).length < 2) return;

      const weights = lineOf(actionsFor(state, playerId, { policy: 'greedy' }));
      // скрытое поле: живой защитник его не видит, значит бот не должен на него реагировать
      const tampered = structuredClone(state);
      tampered.combat.attackValue = 77;
      if (tampered.combat.attackCard) {
        tampered.combat.attackCard = { ...tampered.combat.attackCard, value: 77 };
      }
      const after = lineOf(actionsFor(tampered, playerId, { policy: 'greedy' }));

      windows.push({ weights, after, expected: expectedAttack(state, playerId) });
    });

    expect(windows.length).toBeGreaterThan(0);
    for (const window of windows) {
      expect(window.after).toBe(window.weights);
      // и ожидание берётся из подсчёта, а не из скрытого поля
      expect(window.expected).toBeGreaterThan(0);
    }
  }, 30000);
});

/**
 * Отмены по остатку колоды (`.docs/bot-strategies.md` п. 5) и ожидание скрытых чисел боя: бот не видит
 * чужую руку, но видит её размер и точный остаток колоды — этого хватает, чтобы оценить вероятность
 * «у него есть отмена» и среднее усиление его карты.
 */
describe('отмены и скрытые числа по остатку колоды', () => {
  /** Соперник-Анубис: карты-отмены у него — «Врата» (две копии). */
  const stateOf = ({ hand = 4, discarded = [], heroId = 'anubis' } = {}) => {
    const state = createState({ turn: { index: 1, playerId: '0', actionsLeft: 2 } });
    const rival = player(state, '1');
    rival.heroId = heroId;
    rival.hand.cards = Array.from({ length: hand }, (_, index) =>
      fixtureCard({ id: `rival_${index}` }),
    );
    rival.discard.cards = discarded.map((id, index) =>
      fixtureCard({ id, instanceId: `${id}_${index}` }),
    );
    return state;
  };

  it('карты-отмены берутся из контента: у каждого героя свой список', () => {
    // «Врата» Анубиса, «Ловкость рук» Дороти (бывший общий «Обманный маневр»), «Трещина» Снежной
    expect([...cancelCardIds('anubis')]).toEqual(['anubis_05']);
    expect([...cancelCardIds('dorothy')]).toEqual(['dorothy_14']);
    expect([...cancelCardIds('snow-queen')]).toEqual(['snow-queen_10']);
  });

  it('вероятность отмены растёт с рукой и падает, когда копии вышли', () => {
    const small = cancelRiskOf(stateOf({ hand: 3 }), '0');
    const big = cancelRiskOf(stateOf({ hand: 6 }), '0');

    expect(small).toBeGreaterThan(0);
    expect(big).toBeGreaterThan(small);
    expect(big).toBeLessThan(1);
    // обе копии в сбросе — отмен у него не осталось
    expect(cancelRiskOf(stateOf({ discarded: ['anubis_05', 'anubis_05'] }), '0')).toBe(0);
  });

  it('рука из одной-двух карт не считается: ответа там может не быть по определению', () => {
    expect(cancelRiskOf(stateOf({ hand: 2 }), '0')).toBe(0);
    expect(cancelRiskOf(stateOf({ hand: 3 }), '0')).toBeGreaterThan(0);
  });

  it('ожидаемое усиление — среднее по невышедшим картам боя, а не догадка', () => {
    const state = stateOf({ heroId: 'anubis' });
    const deck = (heroes.anubis?.cards ?? [])
      .filter(card => ['attack', 'defense', 'hybrid'].includes(card.type))
      .flatMap(card =>
        Array.from({ length: Number(card.quantity) || 1 }, () => Number(card.bonus) || 0),
      );
    const mean = deck.reduce((sum, value) => sum + value, 0) / deck.length;

    expect(expectedBonus(state, '0')).toBeCloseTo(mean, 6);
    // «есть ли у его карты свойства» — доля карт с правилами, а не факт
    expect(expectedRuleShare(state, '0', { min: 1 })).toBeGreaterThan(0.9);
    expect(expectedRuleShare(state, '0', { min: 3 })).toBeLessThan(1);
  });
});
