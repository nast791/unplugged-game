import { describe, expect, it } from 'vitest';
import { SET_HEALTH } from '#shared/actions/health.js';
import { SET_MOVEMENT } from '#shared/actions/movement.js';
import { runRules } from '#shared/rules/run.js';
import snowQueenCards from '../../../server/content/heroes/snow-queen/cards.js';
import { ap, card, createState, discard, fighter, hand, player } from '../../fixtures/state.js';

/**
 * Четыре карты пака, которые появились только после правок движка (`passport.md` §7):
 * «Стужа в сердце» (усиление сброшенной карты), «Жертва» (смерть от этой карты), «Ледяное зеркало»
 * (чужая рука в окне выбора) и «Метель из осколков» (проход с уроном). Механику проверяют свои
 * тесты движка (`tests/unit/core/`), здесь — что карты пака подключены именно к ней.
 */
const cards = Object.fromEntries(snowQueenCards.map(entry => [entry.id, entry]));
const cardOf = id => cards[`snow-queen_${id}`];
const run = (state, id, moment, playerId) =>
  runRules(state, cardOf(id).rules, moment, {
    playerId,
    source: cardOf(id).id,
    card: cardOf(id),
  });

/** Бой вскрыт: игрок 0 атакует, игрок 1 защищается. */
const battle = ({ enemyHand = [], seed = 4 } = {}) => {
  const state = createState({ settings: { seed } });
  player(state, '0').hand = { visibility: [], cards: enemyHand.map(entry => ({ ...entry })) };
  state.combat = {
    stage: 'reveal',
    attackerPlayerId: '0',
    defenderPlayerId: '1',
    attackerFighterId: 'alpha',
    targetFighterId: 'beta',
    attackCard: { id: 'atk', instanceId: 'atk_0', bonus: 1 },
    defenseCard: { id: 'sq05', instanceId: 'sq05_0', bonus: 1 },
    attackValue: 4,
    defenseValue: 3,
  };
  return state;
};

/** Ворона в бою: она атаковала, бой уже закрыт (момент `afterCombat` читает `lastCombat`). */
const crowBattle = ({ hp = 1, actionsLeft = 0 } = {}) => {
  const state = createState({ actionsLeft });
  const me = player(state, '0');
  me.fighters = [
    ...me.fighters,
    fighter({
      id: 'crow_1',
      name: 'Crow',
      type: 'assistant',
      group: 'crow',
      currentPosition: 9,
      currentHp: hp,
      startHp: hp,
      move: 3,
    }),
  ];
  state.lastCombat = {
    winner: 'attacker',
    winnerPlayerId: '0',
    attackerPlayerId: '0',
    defenderPlayerId: '1',
    attackerFighterId: 'crow_1',
    targetFighterId: 'beta',
  };
  return state;
};

const crowState = state => player(state, '0').fighters.find(entry => entry.id === 'crow_1');

describe('05 «Стужа в сердце»: сброс чужой карты усиливает защиту', () => {
  it('значение растёт ровно на усиление сброшенной карты', () => {
    const state = battle({ enemyHand: [card({ id: 'foe_card', title: 'Foe', bonus: 3 })] });

    const next = run(state, '05', 'duringCombat', '1');

    expect(hand(player(next, '0'))).toHaveLength(0);
    expect(discard(player(next, '0'))).toHaveLength(1);
    expect(next.combat.defenseValue).toBe(3 + discard(player(next, '0'))[0].bonus);
    expect(next._remember).toBeUndefined();
  });

  it('какую бы карту ни выбрал сид, прибавляется её усиление', () => {
    const bonuses = [];

    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const state = battle({
        enemyHand: [
          card({ id: 'foe_a', bonus: 1 }),
          card({ id: 'foe_b', bonus: 2 }),
          card({ id: 'foe_c', bonus: 4 }),
        ],
        seed,
      });

      const next = run(state, '05', 'duringCombat', '1');
      const dropped = discard(player(next, '0'))[0];

      expect(next.combat.defenseValue).toBe(3 + dropped.bonus);
      bonuses.push(dropped.id);
    }

    expect(new Set(bonuses).size).toBeGreaterThan(1);
  });

  it('пустая рука оппонента: правило не падает и ничего не прибавляет', () => {
    const state = battle({ enemyHand: [] });

    expect(() => run(state, '05', 'duringCombat', '1')).not.toThrow();

    expect(state.combat.defenseValue).toBe(3);
    expect(discard(player(state, '0'))).toHaveLength(0);
  });
});

describe('08 «Жертва»: ворона гибнет от этой карты и приносит действие', () => {
  it('после боя ворона получает 1 урон и погибает, действие возвращается', () => {
    const state = crowBattle({ hp: 1, actionsLeft: 0 });

    const next = run(state, '08', 'afterCombat', '0');

    expect(crowState(next)).toBeUndefined();
    expect(player(next, '0').lost.map(entry => entry.id)).toContain('crow_1');
    expect(ap(next)).toBe(1);
  });

  it('урон не смертелен — ворона жива, действия не будет', () => {
    const state = crowBattle({ hp: 2, actionsLeft: 0 });

    const next = run(state, '08', 'afterCombat', '0');

    expect(crowState(next).currentHp).toBe(1);
    expect(player(next, '0').lost ?? []).toHaveLength(0);
    expect(ap(next)).toBe(0);
  });

  it('смерть от чужой карты действие не приносит: правило смотрит на источник', () => {
    const state = crowBattle({ hp: 1, actionsLeft: 0 });
    const other = cardOf('03');

    SET_HEALTH(state, {
      fighterIds: ['crow_1'],
      delta: -1,
      playerId: '0',
      source: other.id,
      playedCard: other,
    });

    expect(player(state, '0').lost.map(entry => entry.id)).toContain('crow_1');
    expect(ap(state)).toBe(0);
  });
});

describe('09 «Ледяное зеркало»: чужая рука в окне выбора', () => {
  const mirrorBattle = handCards =>
    battle({
      enemyHand: handCards,
    });

  it('окно открывается на картах чужой руки, с названиями и ключами', () => {
    const state = mirrorBattle([
      card({ id: 'foe_a', title: 'Ледяной панцирь', bonus: 1 }),
      card({ id: 'foe_b', title: 'Укус', bonus: 2 }),
    ]);

    const next = run(state, '09', 'duringCombat', '1');

    expect(next.targeting.kind).toBe('options');
    expect(next.targeting.playerId).toBe('1');
    expect(next.targeting.candidates.map(entry => entry.title)).toEqual([
      'Ледяной панцирь',
      'Укус',
    ]);
    expect(next.targeting.candidates.every(entry => entry.optionId)).toBe(true);
  });

  it('выбранная карта уходит в сброс, остальные остаются в руке', () => {
    const state = mirrorBattle([
      card({ id: 'foe_a', title: 'Ледяной панцирь', bonus: 1 }),
      card({ id: 'foe_b', title: 'Укус', bonus: 2 }),
    ]);

    const opened = run(state, '09', 'duringCombat', '1');
    const chosen = opened.targeting.candidates.find(entry => entry.title === 'Укус');
    opened.targeting.picked = [chosen.optionId];

    const next = run(opened, '09', 'picked', '1');

    expect(discard(player(next, '0')).map(entry => entry.id)).toEqual(['foe_b']);
    expect(hand(player(next, '0')).map(entry => entry.id)).toEqual(['foe_a']);
    expect(next.targeting).not.toBeNull();
  });

  it('пустая рука оппонента: выбирать нечего, окно не открывается', () => {
    const state = mirrorBattle([]);

    expect(() => run(state, '09', 'duringCombat', '1')).not.toThrow();

    expect(state.targeting ?? null).toBeNull();
  });
});

describe('11 «Метель из осколков»: проход сквозь врагов с уроном', () => {
  const blizzardState = ({ frozen = false } = {}) => {
    const state = createState();
    player(state, '0').fighters = [
      fighter({
        id: 'snow-queen',
        name: 'Снежная королева',
        type: 'hero',
        currentPosition: 8,
        currentHp: 16,
        startHp: 16,
        move: 2,
        attackRange: 3,
        frozen,
      }),
    ];
    player(state, '1').fighters = [
      fighter({
        id: 'foe',
        name: 'Враг',
        type: 'hero',
        currentPosition: 9,
        currentHp: 5,
        startHp: 5,
      }),
    ];
    return state;
  };

  it('открывает перемещение на 4 клетки сквозь врагов с уроном 2', () => {
    const state = blizzardState();

    const next = run(state, '11', 'effect', '0');

    expect(next.movement).toMatchObject({
      playerId: '0',
      budget: 4,
      throughEnemies: true,
      damageOnPass: 2,
      fighters: ['snow-queen'],
    });
  });

  it('враг на маршруте получает 2 урона', () => {
    const state = blizzardState();
    run(state, '11', 'effect', '0');

    SET_MOVEMENT(state, { op: 'step', playerId: '0', fighterId: 'snow-queen', cellId: 10 });

    expect(player(state, '1').fighters[0].currentHp).toBe(3);
    expect(player(state, '0').fighters[0].currentPosition).toBe(10);
  });

  it('замороженная королева карту не разыгрывает', () => {
    const state = blizzardState({ frozen: true });

    run(state, '11', 'effect', '0');

    expect(state.movement).toBeNull();
  });
});
