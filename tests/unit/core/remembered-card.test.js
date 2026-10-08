import { describe, expect, it } from 'vitest';
import { SET_CARDS } from '#shared/actions/cards.js';
import { stateFields } from '#shared/constants/state.js';
import { runRules } from '#shared/rules/run.js';
import { view } from '../../../server/party.js';
import { createState, discard, hand, player } from '../../fixtures/state.js';

/**
 * «Запомненная карта»: сброс чужой карты кладёт её в служебный транзиент `state._remember`,
 * а правило тут же берёт её `bonus` подстановкой `$remembered.<ключ>.<поле>` и прибавляет
 * к своему числу боя (`SET_COMBAT { op: 'value', delta }`).
 */

const enemyCard = (id, bonus) => ({
  id,
  instanceId: `${id}_1`,
  title: id,
  type: 'effect',
  value: 0,
  bonus,
  fighter: 'beta',
});

const dropParams = {
  action: 'SET_CARDS',
  op: 'discard',
  of: '$enemy',
  from: 'hand',
  random: true,
  count: 1,
  remember: 'stuzha',
};

const bonusParams = {
  action: 'SET_COMBAT',
  op: 'value',
  side: 'self',
  delta: '$remembered.stuzha.bonus',
};

/** Сброс одной случайной карты оппонента и усиление своей карты боя на её `bonus`. */
const rememberRule = {
  moment: 'duringCombat',
  when: [{ fact: 'COMBAT', params: { player: 'opponent' }, var: 'enemy' }],
  then: [dropParams, bonusParams],
};

/** Бой вскрыт: игрок 0 атакует, игрок 1 защищается — правило `duringCombat` работает. */
const battleState = ({ enemyHand = [], seed = 5 } = {}) => {
  const state = createState({ settings: { seed } });
  player(state, '1').hand = { visibility: [], cards: enemyHand.map(card => ({ ...card })) };
  state.combat = {
    stage: 'reveal',
    attackerPlayerId: '0',
    defenderPlayerId: '1',
    attackerFighterId: 'alpha',
    targetFighterId: 'beta',
    attackCard: { id: 'atk', instanceId: 'atk_0', bonus: 1 },
    defenseCard: { id: 'bdef', instanceId: 'bdef_0', bonus: 1 },
    attackValue: 4,
    defenseValue: 2,
  };
  return state;
};

const runBattle = state =>
  runRules(state, [rememberRule], 'duringCombat', { playerId: '0', source: 'stuzha_card' });

const enemyDiscard = state => discard(player(state, '1'));

describe('запомненная карта: SET_CARDS { remember } и $remembered', () => {
  it('сброс запоминается: в транзиенте та же карта, что ушла в сброс', () => {
    const state = battleState({ enemyHand: [enemyCard('a', 1), enemyCard('b', 3)] });
    const before = hand(player(state, '1')).length;

    SET_CARDS(state, {
      op: 'discard',
      of: '1',
      from: 'hand',
      random: true,
      count: 1,
      remember: 'stuzha',
    });

    const dropped = enemyDiscard(state);
    expect(dropped).toHaveLength(1);
    expect(hand(player(state, '1'))).toHaveLength(before - 1);
    expect(state._remember.stuzha).toBe(dropped[0]);
    expect(state._remember.stuzha.bonus).toBe(dropped[0].bonus);
  });

  it('без remember поведение прежнее: карта сброшена, транзиента нет', () => {
    const state = battleState({ enemyHand: [enemyCard('a', 2)] });

    SET_CARDS(state, { op: 'discard', of: '1', from: 'hand', random: true, count: 1 });

    expect(enemyDiscard(state)).toHaveLength(1);
    expect(state._remember).toBeUndefined();
  });

  it('число боя растёт ровно на bonus сброшенной карты', () => {
    const state = battleState({ enemyHand: [enemyCard('a', 3)] });

    const next = runBattle(state);

    expect(enemyDiscard(next)).toHaveLength(1);
    expect(enemyDiscard(next)[0].bonus).toBe(3);
    expect(next.combat.attackValue).toBe(4 + 3);
    expect(next.combat.defenseValue).toBe(2);
  });

  it('какую бы карту ни выбрал сид, прибавляется именно её bonus', () => {
    const picks = [];

    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const state = battleState({
        enemyHand: [enemyCard('a', 1), enemyCard('b', 2), enemyCard('c', 4)],
        seed,
      });

      const next = runBattle(state);
      const dropped = enemyDiscard(next);

      expect(dropped).toHaveLength(1);
      expect(next.combat.attackValue).toBe(4 + dropped[0].bonus);
      picks.push(dropped[0].id);
    }

    // сид действительно решает, какую карту сбрасывать (иначе проверка выше ничего не стоит)
    expect(new Set(picks).size).toBeGreaterThan(1);
  });

  it('транзиент живёт до конца прогона: его видят все шаги цепочки then', () => {
    const state = battleState({ enemyHand: [enemyCard('a', 2)] });
    const doubleRule = {
      ...rememberRule,
      then: [dropParams, bonusParams, bonusParams],
    };

    const next = runRules(state, [doubleRule], 'duringCombat', {
      playerId: '0',
      source: 'stuzha_card',
    });

    // оба шага взяли `bonus` сброшенной карты: транзиент не снимается после первого действия
    expect(next.combat.attackValue).toBe(4 + 2 + 2);
  });

  it('отдельный прогон правил транзиента не видит — и не падает', () => {
    const state = battleState({ enemyHand: [enemyCard('a', 2)] });
    const dropRule = {
      moment: 'duringCombat',
      when: [{ fact: 'COMBAT', params: { player: 'opponent' }, var: 'enemy' }],
      then: [dropParams],
    };
    const bonusRule = { moment: 'duringCombat', then: [bonusParams] };

    // так правила карты зовёт очередь боя (`shared/cards/run.js`): по правилу за вызов,
    // поэтому `remember` и чтение транзиента обязаны быть шагами одного `then`
    const dropped = runRules(state, [dropRule], 'duringCombat', {
      playerId: '0',
      source: 'stuzha_card',
    });
    const after = runRules(dropped, [bonusRule], 'duringCombat', {
      playerId: '0',
      source: 'stuzha_card',
    });

    expect(enemyDiscard(after)).toHaveLength(1);
    expect(after.combat.attackValue).toBe(4);
  });

  it('пустая рука: правило не падает, усиления нет, остальные шаги цепочки работают', () => {
    const state = battleState({ enemyHand: [] });
    const rule = {
      ...rememberRule,
      then: [...rememberRule.then, { action: 'SET_HEALTH', fighterIds: ['beta'], delta: -1 }],
    };
    const betaHp = () =>
      player(state, '1').fighters.find(fighter => fighter.id === 'beta').currentHp;
    const before = betaHp();

    expect(() =>
      runRules(state, [rule], 'duringCombat', { playerId: '0', source: 'stuzha_card' }),
    ).not.toThrow();

    expect(enemyDiscard(state)).toHaveLength(0);
    expect(state.combat.attackValue).toBe(4);
    // пропущен ровно шаг с несуществующей переменной, а не вся цепочка правила
    expect(betaHp()).toBe(before - 1);
    expect(state._remember).toBeUndefined();
  });

  it('транзиент не уходит в проекцию партии', () => {
    const state = createState();
    state._remember = { stuzha: { id: 'a', bonus: 3 } };

    expect(state._remember.stuzha.bonus).toBe(3);
    expect('_remember' in view(state, '0')).toBe(false);
    expect(view(state, '0')._remember).toBeUndefined();
  });

  it('после прогона правил момента транзиента в состоянии нет', () => {
    const state = battleState({ enemyHand: [enemyCard('a', 3)] });

    const next = runBattle(state);

    expect(next._remember).toBeUndefined();
    expect('_remember' in next).toBe(false);
    expect(stateFields).not.toHaveProperty('_remember');
  });

  it('детерминизм по сиду: тот же сид — та же карта, то же число и тот же курсор', () => {
    const run = seed => {
      const state = battleState({
        enemyHand: [enemyCard('a', 1), enemyCard('b', 2), enemyCard('c', 4)],
        seed,
      });
      const next = runBattle(state);

      return {
        card: enemyDiscard(next)[0].id,
        value: next.combat.attackValue,
        rng: next.rng,
      };
    };

    expect(run(11)).toEqual(run(11));
    expect(run(12)).toEqual(run(12));
    expect(run(11).rng).toBeGreaterThan(0);
  });
});
