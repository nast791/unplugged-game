import { describe, expect, it } from 'vitest';
import { SET_HEALTH } from '#shared/actions/health.js';
import { SET_MOVEMENT } from '#shared/actions/movement.js';
import { runRules } from '#shared/rules/run.js';
import snowQueenCards from '../../../server/content/heroes/snow-queen/cards.js';
import { ap, card, createState, discard, fighter, hand, player } from '../../fixtures/state.js';

/**
 * Карты пака на движке (`passport.md` §7): «Клёв в темноте» (выбор карты из чужой руки на победе),
 * «Стужа в сердце» (усиление сброшенной карты), «Сосулька» (лёд и порог осколков), «Снежная тропа»
 * (добор и лечение на победе), «Жертва» (смерть от этой карты), «Ледяное зеркало» (чужая рука в окне
 * выбора), «Трещина» (отмена свойств с трёх осколков), «Метель из осколков» (проход с уроном) и
 * «Вечность» (возврат вороны). Механику проверяют свои тесты движка (`tests/unit/core/`), здесь — что
 * карты пака подключены именно к ней.
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

describe('03 «Клёв в темноте»: выбитую карту выбирает королева, а не противник', () => {
  /** Бой вскрыт и уже посчитан: ворона 0 победила, у защитника 1 — своя рука. */
  const winBattle = handCards => {
    const state = crowBattle({ hp: 2 });
    player(state, '1').hand = { visibility: [], cards: handCards.map(entry => ({ ...entry })) };
    state.combat = {
      stage: 'close',
      attackerPlayerId: '0',
      defenderPlayerId: '1',
      attackerFighterId: 'crow_1',
      targetFighterId: 'beta',
      attackCard: { id: 'snow-queen_03', instanceId: 'sq03_0', bonus: 2, rules: [] },
      defenseCard: { id: 'bdef', instanceId: 'bdef_0', bonus: 1, rules: [] },
      attackValue: 5,
      defenseValue: 4,
    };
    return state;
  };

  it('окно открывается на картах чужой руки, с названиями и ключами', () => {
    const state = winBattle([
      card({ id: 'foe_a', title: 'Ледяной панцирь', bonus: 1 }),
      card({ id: 'foe_b', title: 'Укус', bonus: 2 }),
    ]);

    const next = run(state, '03', 'afterCombat', '0');

    expect(next.targeting.kind).toBe('options');
    expect(next.targeting.playerId).toBe('0');
    expect(next.targeting.required).toBe(true);
    expect(next.targeting.candidates.map(entry => entry.title)).toEqual([
      'Ледяной панцирь',
      'Укус',
    ]);
  });

  it('выбранная карта уходит в сброс противника, остальные остаются в его руке', () => {
    const state = winBattle([
      card({ id: 'foe_a', title: 'Ледяной панцирь', bonus: 1 }),
      card({ id: 'foe_b', title: 'Укус', bonus: 2 }),
    ]);

    const opened = run(state, '03', 'afterCombat', '0');
    const chosen = opened.targeting.candidates.find(entry => entry.title === 'Укус');
    opened.targeting.picked = [chosen.optionId];

    const next = run(opened, '03', 'picked', '0');

    expect(discard(player(next, '1')).map(entry => entry.id)).toEqual(['foe_b']);
    expect(hand(player(next, '1')).map(entry => entry.id)).toEqual(['foe_a']);
    expect(hand(player(next, '0'))).toHaveLength(3);
  });

  it('пустая рука противника: выбирать нечего, окно не открывается', () => {
    const state = winBattle([]);

    expect(() => run(state, '03', 'afterCombat', '0')).not.toThrow();

    expect(state.targeting ?? null).toBeNull();
  });
});

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

describe('06 «Сосулька»: тройка на старте, пятёрка на льду, семёрка на пороге', () => {
  /** Линия 8—9—10: под героем 0 — лёд, под героем 1 — лес. */
  const iceMap = {
    id: 'ice',
    nodes: [
      { id: 8, neighbors: [9], terrain: 'ice' },
      { id: 9, neighbors: [8, 10], terrain: 'forest' },
      { id: 10, neighbors: [9], terrain: 'forest' },
    ],
  };

  const shard = partial => card({ type: 'hybrid', bonus: 2, tags: ['shard'], ...partial });

  const iceBattle = ({ shards = 0 } = {}) => {
    const state = battle();
    state.map = structuredClone(iceMap);
    player(state, '0').discard = {
      visibility: [],
      cards: Array.from({ length: shards }, (_, index) => shard({ id: `shard_${index}` })),
    };
    return state;
  };

  it('на любой клетке карта остаётся тройкой, пока осколков мало', () => {
    const next = run(battle(), '06', 'duringCombat', '0');

    expect(next.combat.attackValue).toBe(4);
  });

  it('боец на льду — значение становится 5', () => {
    const next = run(iceBattle(), '06', 'duringCombat', '0');

    expect(next.combat.attackValue).toBe(5);
  });

  it('шесть осколков — значение 7 на любой клетке, и это сильнее льда', () => {
    expect(run(iceBattle({ shards: 5 }), '06', 'duringCombat', '0').combat.attackValue).toBe(5);

    const next = run(iceBattle({ shards: 6 }), '06', 'duringCombat', '0');

    expect(next.combat.attackValue).toBe(7);
  });
});

describe('07 «Снежная тропа»: на победе добор и лечение своего бойца', () => {
  const trailBattle = ({ win = true, hp = 12, startHp = 15 } = {}) => {
    const state = battle();
    player(state, '0').fighters[0] = {
      ...player(state, '0').fighters[0],
      currentHp: hp,
      startHp,
    };
    state.combat.stage = 'close';
    state.lastCombat = {
      winner: win ? 'attacker' : 'defender',
      winnerPlayerId: win ? '0' : '1',
      attackerPlayerId: '0',
      defenderPlayerId: '1',
      attackerFighterId: 'alpha',
      targetFighterId: 'beta',
    };
    return state;
  };

  const heroOf = state => player(state, '0').fighters.find(entry => entry.id === 'alpha');

  it('победа: карта в руке и +1 здоровье своему бойцу', () => {
    const state = trailBattle({ hp: 12 });
    const handBefore = hand(player(state, '0')).length;

    const next = run(state, '07', 'afterCombat', '0');

    expect(hand(player(next, '0'))).toHaveLength(handBefore + 1);
    expect(heroOf(next).currentHp).toBe(13);
  });

  it('выше начального здоровье не поднимается', () => {
    const next = run(trailBattle({ hp: 15, startHp: 15 }), '07', 'afterCombat', '0');

    expect(heroOf(next).currentHp).toBe(15);
  });

  it('поражение: ни карты, ни лечения', () => {
    const state = trailBattle({ win: false, hp: 12 });
    const handBefore = hand(player(state, '0')).length;

    const next = run(state, '07', 'afterCombat', '0');

    expect(hand(player(next, '0'))).toHaveLength(handBefore);
    expect(heroOf(next).currentHp).toBe(12);
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

describe('10 «Трещина»: отмена свойств с трёх осколков', () => {
  const crackBattle = shards => {
    const state = battle();
    // у карты противника есть свойства — иначе отменять нечего
    state.combat.attackCard.rules = [{ moment: 'duringCombat', when: [], then: [] }];
    player(state, '1').discard = {
      visibility: [],
      cards: Array.from({ length: shards }, (_, index) =>
        card({ id: `shard_${index}`, type: 'hybrid', bonus: 2, tags: ['shard'] }),
      ),
    };
    return state;
  };

  it('три осколка — свойства карты оппонента отменены', () => {
    const next = run(crackBattle(3), '10', 'duringCombat', '1');

    expect(next.combat.cancelled).toEqual({ attacker: true });
  });

  it('два осколка — старая ступень уже не хватает', () => {
    const next = run(crackBattle(2), '10', 'duringCombat', '1');

    expect(next.combat.cancelled).toBeUndefined();
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

describe('13 «Вечность»: ворона возвращается на любую свободную клетку с 1 hp', () => {
  /** Линия 8—9—10—11: лёд только под бойцами, свободные клетки — лес: лёд для карты не нужен. */
  const eternityMap = {
    id: 'eternity',
    nodes: [
      { id: 8, neighbors: [9], terrain: 'ice' },
      { id: 9, neighbors: [8, 10], terrain: 'forest' },
      { id: 10, neighbors: [9, 11], terrain: 'ice' },
      { id: 11, neighbors: [10], terrain: 'forest' },
    ],
  };

  const eternity = () => {
    const state = createState({ map: eternityMap });
    player(state, '0').fighters = [
      fighter({
        id: 'snow-queen',
        name: 'Снежная королева',
        type: 'hero',
        currentPosition: 8,
        currentHp: 16,
        startHp: 16,
        attackRange: 3,
      }),
    ];
    player(state, '0').lost = [
      fighter({
        id: 'crow_1',
        name: 'Crow',
        type: 'assistant',
        group: 'crow',
        currentPosition: null,
        currentHp: 0,
        startHp: 2,
        move: 3,
        attackRange: 1,
      }),
    ];
    player(state, '1').fighters = [
      fighter({
        id: 'foe',
        name: 'Foe',
        type: 'hero',
        currentPosition: 10,
        currentHp: 5,
        startHp: 5,
      }),
    ];
    return state;
  };

  it('окно открывается на свободных клетках, а не только на льду', () => {
    const opened = run(eternity(), '13', 'effect', '0');

    expect(opened.targeting.kind).toBe('cells');
    expect(opened.targeting.required).toBe(true);
    expect(opened.targeting.candidates.map(entry => entry.cellId)).toEqual(['9', '11']);
  });

  it('выбранная клетка поднимает ворону с 1 здоровьем и приносит карту', () => {
    const opened = run(eternity(), '13', 'effect', '0');
    const handBefore = hand(player(opened, '0')).length;
    opened.targeting.picked = ['11'];

    const next = run(opened, '13', 'picked', '0');
    const crow = player(next, '0').fighters.find(entry => entry.id === 'crow_1');

    expect(crow.currentPosition).toBe('11');
    expect(crow.currentHp).toBe(1);
    expect(player(next, '0').lost).toEqual([]);
    expect(hand(player(next, '0'))).toHaveLength(handBefore + 1);
  });

  it('свободных клеток нет — окна нет, ворона остаётся убитой', () => {
    const state = eternity();
    // занимаем обе свободные клетки: поднимать ворону некуда
    player(state, '1').fighters.push(
      fighter({
        id: 'foe_2',
        name: 'Foe 2',
        type: 'hero',
        currentPosition: 9,
        currentHp: 5,
        startHp: 5,
      }),
      fighter({
        id: 'foe_3',
        name: 'Foe 3',
        type: 'hero',
        currentPosition: 11,
        currentHp: 5,
        startHp: 5,
      }),
    );

    const after = run(state, '13', 'effect', '0');

    expect(after.targeting ?? null).toBeNull();
    expect(player(after, '0').lost).toHaveLength(1);
  });
});
