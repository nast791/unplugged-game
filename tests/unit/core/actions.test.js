import { describe, expect, it } from 'vitest';
import { SET_CARDS } from '#shared/actions/cards.js';
import { SET_COMBAT } from '#shared/actions/combat.js';
import { SET_FIGHTER_CELL } from '#shared/actions/fighter.js';
import { SET_HEALTH } from '#shared/actions/health.js';
import { SET_MOVEMENT } from '#shared/actions/movement.js';
import { SET_REVEAL } from '#shared/actions/reveal.js';
import { SET_TARGETING } from '#shared/actions/targeting.js';
import { SET_ACTIONS } from '#shared/actions/base.js';
import { ap, createState, deck, discard, fighter, hand, player } from '../../fixtures/state.js';

describe('SET_ACTIONS', () => {
  it('списывает и добавляет действия', () => {
    const spent = createState({ actionsLeft: 2 });
    expect(ap(SET_ACTIONS(spent, { playerId: '0', delta: -1 }))).toBe(1);

    const gained = createState({ actionsLeft: 2 });
    expect(ap(SET_ACTIONS(gained, { playerId: '0', delta: 1 }))).toBe(3);
  });

  it('объявление действия снимает итоги прошлого боя, добавление действия — нет', () => {
    const spent = createState({ actionsLeft: 2 });
    spent.lastCombat = { combatDamage: 2 };
    spent.lastBonus = { amount: 1 };
    SET_ACTIONS(spent, { playerId: '0', delta: -1 });
    expect(spent.lastCombat).toBeNull();
    expect(spent.lastBonus).toBeNull();

    const gained = createState({ actionsLeft: 2 });
    gained.lastCombat = { combatDamage: 2 };
    SET_ACTIONS(gained, { playerId: '0', delta: 1 });
    expect(gained.lastCombat).toEqual({ combatDamage: 2 });
  });

  it('не даёт уйти в минус', () => {
    const state = createState({ actionsLeft: 0 });
    expect(() => SET_ACTIONS(state, { playerId: '0', delta: -1 })).toThrow(/нет действий/);
  });

  it('отклоняет неизвестного игрока и нулевой delta', () => {
    const state = createState();
    expect(() => SET_ACTIONS(state, { playerId: 'missing', delta: -1 })).toThrow(/не найден/);
    expect(() => SET_ACTIONS(state, { playerId: '0', delta: 0 })).toThrow(/delta/);
  });
});

describe('SET_CARDS', () => {
  it('draw забирает верх колоды в руку', () => {
    const state = createState();
    SET_CARDS(state, { playerId: '0', op: 'draw', count: 1 });
    expect(deck(player(state, '0'))).toHaveLength(1);
    expect(hand(player(state, '0'))).toHaveLength(4);
  });

  it('draw не перетасовывает сброс: пустая колода бьёт героя истощением', () => {
    const state = createState();
    SET_CARDS(state, { playerId: '0', op: 'draw', count: 5 });
    expect(deck(player(state, '0'))).toHaveLength(0);
    expect(hand(player(state, '0'))).toHaveLength(5);

    // колода была из 2 карт: 5 − 2 = 3 недостающие карты, по 2 урона за каждую — главному герою
    const before = player(state, '0').fighters.find(f => f.id === 'alpha').currentHp;
    SET_CARDS(state, { playerId: '0', op: 'draw', count: 3 });
    expect(player(state, '0').fighters.find(f => f.id === 'alpha').currentHp).toBe(before - 6);
    // помощник истощение не получает
    expect(player(state, '0').fighters.find(f => f.id === 'pawn').currentHp).toBe(4);
    expect(hand(player(state, '0'))).toHaveLength(5);
  });

  it('discard по cardIds и по количеству', () => {
    const state = createState();
    SET_CARDS(state, { playerId: '0', op: 'discard', cardIds: ['atk_0'] });
    expect(hand(player(state, '0')).map(card => card.instanceId)).toEqual(['def_0', 'fx_0']);
    expect(discard(player(state, '0'))).toHaveLength(1);

    SET_CARDS(state, { playerId: '0', op: 'discard', from: 'deck', count: 2 });
    expect(deck(player(state, '0'))).toHaveLength(0);
    expect(discard(player(state, '0'))).toHaveLength(3);
  });

  it('move переносит карты между зонами', () => {
    const state = createState();
    SET_CARDS(state, {
      playerId: '0',
      op: 'move',
      cardIds: ['fx_0'],
      from: 'hand',
      to: 'discard',
    });
    expect(discard(player(state, '0')).map(card => card.instanceId)).toEqual(['fx_0']);
  });

  it('cardIds принимает объекты факта (CARDS, HAND) наравне с ключами', () => {
    const state = createState();
    SET_CARDS(state, {
      playerId: '0',
      op: 'move',
      from: 'hand',
      to: 'discard',
      cardIds: [{ cardId: 'fx_0', bonus: 2 }, 'def_0'],
    });

    expect(discard(player(state, '0')).map(card => card.instanceId)).toEqual(['fx_0', 'def_0']);
  });

  it('отклоняет неверный op, зону и отсутствующую карту', () => {
    const state = createState();
    expect(() => SET_CARDS(state, { playerId: '0', op: 'burn' })).toThrow(/op/);
    expect(() => SET_CARDS(state, { playerId: '0', op: 'discard', from: 'sleeve' })).toThrow(
      /зона/,
    );
    expect(() => SET_CARDS(state, { playerId: '0', op: 'discard', cardId: 'nope_0' })).toThrow(
      /нет в зоне/,
    );
    expect(() => SET_CARDS(state, { playerId: 'missing', op: 'draw' })).toThrow(/не найден/);
  });
});

describe('SET_HEALTH', () => {
  it('наносит урон и лечит в пределах startHp', () => {
    const state = createState();
    player(state, '0').fighters[0].startHp = 15;

    SET_HEALTH(state, { fighterId: 'alpha', delta: -5 });
    expect(player(state, '0').fighters[0].currentHp).toBe(10);

    SET_HEALTH(state, { fighterId: 'alpha', delta: 10 });
    expect(player(state, '0').fighters[0].currentHp).toBe(15);
  });

  it('убирает бойца с 0 HP', () => {
    const state = createState();
    SET_HEALTH(state, { fighterId: 'pawn', delta: -4 });
    expect(player(state, '0').fighters.map(f => f.id)).toEqual(['alpha']);
  });

  it('бьёт список целей', () => {
    const state = createState();
    SET_HEALTH(state, { fighterIds: ['alpha', 'pawn'], delta: -2 });
    expect(player(state, '0').fighters.map(f => f.currentHp)).toEqual([13, 2]);
  });

  it('ушедшего с поля бойца пропускает без ошибки', () => {
    const state = createState();
    expect(() => SET_HEALTH(state, { fighterId: 'nope', delta: -1 })).not.toThrow();
    expect(player(state, '0').fighters.map(f => f.id)).toEqual(['alpha', 'pawn']);
  });

  it('отклоняет нулевой delta и пустой список целей', () => {
    const state = createState();
    expect(() => SET_HEALTH(state, { fighterId: 'alpha', delta: 0 })).toThrow(/delta/);
    expect(() => SET_HEALTH(state, { delta: -1 })).toThrow(/fighterId/);
  });
});

describe('SET_FIGHTER_CELL', () => {
  it('переносит бойца, start пишет startPosition', () => {
    const state = createState();
    SET_FIGHTER_CELL(state, { fighterId: 'alpha', cellId: 9 });
    expect(player(state, '0').fighters[0].currentPosition).toBe(9);
    expect(player(state, '0').fighters[0].startPosition).toBeUndefined();

    SET_FIGHTER_CELL(state, { fighterId: 'alpha', cellId: 10, start: true });
    expect(player(state, '0').fighters[0].startPosition).toBe(10);
  });

  it('cellId null снимает бойца с поля', () => {
    const state = createState();
    SET_FIGHTER_CELL(state, { fighterId: 'alpha', cellId: null, start: true });
    expect(player(state, '0').fighters[0].currentPosition).toBeNull();
    expect(player(state, '0').fighters[0].startPosition).toBeNull();
  });

  it('отклоняет неизвестного бойца и клетку', () => {
    const state = createState();
    expect(() => SET_FIGHTER_CELL(state, { fighterId: 'nope', cellId: 8 })).toThrow(/не найден/);
    expect(() => SET_FIGHTER_CELL(state, { fighterId: 'alpha', cellId: 777 })).toThrow(/клетка/);
    expect(() => SET_FIGHTER_CELL(state, { cellId: 8 })).toThrow(/fighterId/);
  });
});

describe('SET_MOVEMENT', () => {
  const opened = () => SET_MOVEMENT(createState(), { op: 'open', playerId: '0' });

  it('open открывает черновик, повторный open — ошибка', () => {
    const state = opened();
    expect(state.movement).toEqual({
      playerId: '0',
      origins: {},
      bonus: 0,
      bonusUsed: false,
      budget: null,
      fighters: null,
      optional: false,
      throughEnemies: false,
      damageOnPass: null,
      damagedFighterIds: [],
      moves: [],
      source: null,
      playedCard: null,
    });
    expect(() => SET_MOVEMENT(state, { op: 'open', playerId: '0' })).toThrow(/уже открыто/);
  });

  it('step пишет origin при первом шаге и не перезаписывает его', () => {
    const state = opened();
    SET_MOVEMENT(state, {
      op: 'step',
      playerId: '0',
      fighterId: 'alpha',
      cellId: 9,
    });
    expect(state.movement.origins).toEqual({ alpha: 8 });
    expect(player(state, '0').fighters[0].currentPosition).toBe(9);

    SET_MOVEMENT(state, {
      op: 'step',
      playerId: '0',
      fighterId: 'alpha',
      cellId: 8,
    });
    expect(state.movement.origins).toEqual({ alpha: 8 });
    expect(player(state, '0').fighters[0].currentPosition).toBe(8);
  });

  it('step отклоняет чужого бойца, чужое перемещение и отсутствие черновика', () => {
    const state = opened();
    expect(() =>
      SET_MOVEMENT(state, {
        op: 'step',
        playerId: '0',
        fighterId: 'beta',
        cellId: 8,
      }),
    ).toThrow(/не ваш/);
    expect(() =>
      SET_MOVEMENT(state, {
        op: 'step',
        playerId: '1',
        fighterId: 'beta',
        cellId: 9,
      }),
    ).toThrow(/чужое перемещение/);

    expect(() =>
      SET_MOVEMENT(createState(), {
        op: 'step',
        playerId: '0',
        fighterId: 'alpha',
        cellId: 9,
      }),
    ).toThrow(/не открыто/);
  });

  it('bonus: карта в сброс, усиление всему действию, один раз', () => {
    const state = opened();
    SET_MOVEMENT(state, { op: 'bonus', playerId: '0', cardId: 'fx_0' });

    expect(state.movement.bonus).toBe(2);
    expect(state.movement.bonusUsed).toBe(true);
    expect(hand(player(state, '0')).map(card => card.instanceId)).toEqual(['atk_0', 'def_0']);
    expect(discard(player(state, '0')).map(card => card.instanceId)).toEqual(['fx_0']);

    expect(() => SET_MOVEMENT(state, { op: 'bonus', playerId: '0', cardId: 'atk_0' })).toThrow(
      /уже использовано/,
    );
  });

  it('bonus отклоняет карту без усиления и отсутствующую карту', () => {
    const state = opened();
    player(state, '0').hand.cards.push({
      id: 'ice',
      instanceId: 'plain_0',
      type: 'effect',
      value: 0,
      bonus: 0,
    });

    expect(() => SET_MOVEMENT(state, { op: 'bonus', playerId: '0', cardId: 'plain_0' })).toThrow(
      /нет усиления/,
    );
    expect(() => SET_MOVEMENT(state, { op: 'bonus', playerId: '0', cardId: 'nope_0' })).toThrow(
      /нет в руке/,
    );
    expect(() => SET_MOVEMENT(state, { op: 'bonus', playerId: '0' })).toThrow(/cardId/);
  });

  it('close закрывает перемещение, чужой игрок — нет', () => {
    const state = opened();
    expect(() => SET_MOVEMENT(state, { op: 'close', playerId: '1' })).toThrow(/чужое перемещение/);
    SET_MOVEMENT(state, { op: 'close', playerId: '0' });
    expect(state.movement).toBeNull();
  });

  it('отклоняет неизвестный op', () => {
    expect(() => SET_MOVEMENT(createState(), { op: 'fly', playerId: '0' })).toThrow(/op/);
  });
});

describe('SET_COMBAT', () => {
  /** alpha (attackRange 2) достаёт beta через помощника на 9. */
  const attackState = () => {
    const state = createState();
    player(state, '0').fighters[0].attackRange = 2;
    return state;
  };

  const addSwing = state => {
    player(state, '0').hand.cards.push({
      id: 'swing',
      instanceId: 'swing_0',
      type: 'attack',
      value: 3,
      bonus: 0,
    });
    return state;
  };

  /** Второй враг в радиусе: карта 11 рядом с 10, alpha с attackRange 3 достаёт обоих. */
  const addSecondTarget = state => {
    state.map.nodes.push({ id: 11, neighbors: [10], x: 3, y: 0 });
    state.map.nodes.find(node => node.id === 10).neighbors.push(11);
    player(state, '0').fighters[0].attackRange = 3;
    player(state, '1').fighters.push(fighter({ id: 'gamma', currentPosition: 11 }));
    return state;
  };

  it('open с привязанной картой сам выбирает атакующего и единственную цель', () => {
    const state = SET_COMBAT(attackState(), {
      op: 'open',
      playerId: '0',
      cardId: 'atk_0',
    });

    // цель одна — выбора нет, бой сразу ждёт защиту
    expect(state.combat.stage).toBe('defense');
    expect(state.combat.targetFighterId).toBe('beta');
    expect(state.combat.defenderPlayerId).toBe('1');
    expect(state.combat.attackerPlayerId).toBe('0');
    expect(state.combat.attackerFighterId).toBe('alpha');
    expect(state.combat.attackValue).toBe(4);
    expect(hand(player(state, '0')).map(card => card.instanceId)).toEqual(['def_0', 'fx_0']);
    expect(discard(player(state, '0'))).toHaveLength(0);
  });

  it('open при нескольких кандидатах ждёт выбора атакующего', () => {
    const state = SET_COMBAT(addSwing(attackState()), {
      op: 'open',
      playerId: '0',
      cardId: 'swing_0',
    });
    expect(state.combat.stage).toBe('attacker');
    expect(state.combat.attackerFighterId).toBeNull();

    SET_COMBAT(state, { op: 'attacker', fighterId: 'pawn' });
    expect(state.combat.attackerFighterId).toBe('pawn');
    // враг один: цель выбирается автоматически, выбора нет
    expect(state.combat.stage).toBe('defense');
    expect(state.combat.targetFighterId).toBe('beta');
  });

  it('attacker отклоняет бойца, который не может атаковать этой картой', () => {
    const state = SET_COMBAT(addSwing(attackState()), {
      op: 'open',
      playerId: '0',
      cardId: 'swing_0',
    });

    expect(() => SET_COMBAT(state, { op: 'attacker', fighterId: 'beta' })).toThrow(
      /не может атаковать/,
    );

    SET_COMBAT(state, { op: 'attacker', fighterId: 'alpha' });
    expect(() => SET_COMBAT(state, { op: 'attacker', fighterId: 'pawn' })).toThrow(/уже определён/);
  });

  it('несколько целей: выбор кликом, своего бойца взять нельзя', () => {
    const state = addSecondTarget(addSwing(attackState()));
    SET_COMBAT(state, { op: 'open', playerId: '0', cardId: 'swing_0' });
    SET_COMBAT(state, { op: 'attacker', fighterId: 'alpha' });

    expect(state.combat.stage).toBe('target');
    expect(state.combat.targetFighterId).toBeNull();
    expect(() => SET_COMBAT(state, { op: 'target', fighterId: 'pawn' })).toThrow(/недоступна/);

    SET_COMBAT(state, { op: 'target', fighterId: 'gamma' });

    expect(state.combat.targetFighterId).toBe('gamma');
    expect(state.combat.defenderPlayerId).toBe('1');
    expect(state.combat.stage).toBe('defense');
  });

  it('open отклоняет не-атакующую карту, отсутствие кандидатов и повторный бой', () => {
    const state = attackState();
    expect(() => SET_COMBAT(state, { op: 'open', playerId: '0', cardId: 'fx_0' })).toThrow(
      /не атакует/,
    );
    expect(() => SET_COMBAT(state, { op: 'open', playerId: '0', cardId: 'nope_0' })).toThrow(
      /нет в руке/,
    );

    expect(() => SET_COMBAT(createState(), { op: 'open', playerId: '0', cardId: 'atk_0' })).toThrow(
      /не достаёт/,
    );

    const started = SET_COMBAT(state, {
      op: 'open',
      playerId: '0',
      cardId: 'atk_0',
    });
    expect(() => SET_COMBAT(started, { op: 'open', playerId: '0', cardId: 'def_0' })).toThrow(
      /уже идёт/,
    );
  });

  it('отклоняет выборы без боя и неизвестный op', () => {
    const state = createState();
    expect(() => SET_COMBAT(state, { op: 'attacker', fighterId: 'alpha' })).toThrow(/бой не идёт/);
    expect(() => SET_COMBAT(state, { op: 'target', fighterId: 'beta' })).toThrow(/бой не идёт/);
    expect(() => SET_COMBAT(state, { op: 'fly' })).toThrow(/op/);
  });

  it('замена защиты снимает снимок вскрытия, открытый заменённой картой', () => {
    const state = createState();
    player(state, '0').fighters[0].attackRange = 2;
    SET_COMBAT(state, { op: 'open', playerId: '0', cardId: 'atk_0' });
    SET_COMBAT(state, { op: 'defense', playerId: '1', cardId: 'bdef_0' });

    // карта защиты раскрыла колоду противника — снимок принадлежит именно ей
    SET_REVEAL(state, { op: 'open', of: '0', source: 'bdef_0' });
    expect(state.reveal).toHaveLength(1);

    SET_COMBAT(state, { op: 'replaceDefense', playerId: '0' });

    // заменённая карта ушла в сброс — её снимок уходит вместе с ней
    expect(state.reveal).toBeNull();
    // и карта с тем же свойством может раскрыть колоду заново (иначе «колода уже раскрыта»)
    expect(() => SET_REVEAL(state, { op: 'open', of: '0', source: 'bdef2_0' })).not.toThrow();
  });
});

describe('SET_COMBAT: защита и расчёт', () => {
  const battle = (patch = {}) => {
    const state = createState();
    player(state, '0').fighters[0].attackRange = 2;
    if (patch.defenderHp != null) {
      player(state, '1').fighters[0].currentHp = patch.defenderHp;
    }
    if (patch.defenderCard) {
      player(state, '1').hand.cards.push(patch.defenderCard);
    }

    SET_COMBAT(state, { op: 'open', playerId: '0', cardId: 'atk_0' });
    return state;
  };

  const finish = state => {
    SET_COMBAT(state, { op: 'reveal' });
    SET_COMBAT(state, { op: 'resolve' });
    return SET_COMBAT(state, { op: 'close' });
  };

  it('карта защиты уменьшает урон, lastCombat заполнен, карты уходят в сброс', () => {
    const state = battle();
    SET_COMBAT(state, { op: 'defense', playerId: '1', cardId: 'bdef_0' });

    expect(state.combat.defenseValue).toBe(3);
    expect(state.combat.defendedWithCard).toBe(true);
    expect(state.combat.stage).toBe('reveal');
    expect(hand(player(state, '1'))).toHaveLength(0);

    finish(state);

    expect(state.lastCombat).toEqual({
      attackerPlayerId: '0',
      defenderPlayerId: '1',
      attackerFighterId: 'alpha',
      targetFighterId: 'beta',
      attackValue: 4,
      defenseValue: 3,
      combatDamage: 1,
      winner: 'attacker',
      winnerPlayerId: '0',
      defendedWithCard: true,
      attackCardId: 'atk_0',
      defenseCardId: 'bdef_0',
      // отчёт боя хранит разрешённую очередь свойств (у этих карт её нет)
      effects: [],
    });
    expect(player(state, '1').fighters[0].currentHp).toBe(12);
    expect(discard(player(state, '0')).map(card => card.instanceId)).toEqual(['atk_0']);
    expect(discard(player(state, '1')).map(card => card.instanceId)).toEqual(['bdef_0']);
    expect(state.combat).toBeNull();
  });

  it('пас: защита 0 и весь урон по цели', () => {
    const state = battle();
    SET_COMBAT(state, { op: 'defense', playerId: '1' });

    expect(state.combat.defenseValue).toBe(0);
    expect(state.combat.defendedWithCard).toBe(false);

    finish(state);

    expect(state.lastCombat.combatDamage).toBe(4);
    expect(state.lastCombat.winner).toBe('attacker');
    expect(state.lastCombat.defendedWithCard).toBe(false);
    expect(player(state, '1').fighters[0].currentHp).toBe(9);
    expect(discard(player(state, '1'))).toHaveLength(0);
  });

  it('защита не своей роли, чужой картой и не тем типом — ошибка', () => {
    const state = battle();
    expect(() => SET_COMBAT(state, { op: 'defense', playerId: '0' })).toThrow(/защищается игрок/);
    expect(() => SET_COMBAT(state, { op: 'defense', playerId: '1', cardId: 'nope_0' })).toThrow(
      /нет в руке защитника/,
    );

    const withAttackCard = battle({
      defenderCard: {
        id: 'bswing',
        instanceId: 'bswing_0',
        type: 'attack',
        value: 2,
      },
    });
    expect(() =>
      SET_COMBAT(withAttackCard, {
        op: 'defense',
        playerId: '1',
        cardId: 'bswing_0',
      }),
    ).toThrow(/не защищает/);
  });

  it('шаги боя идут строго по порядку', () => {
    const state = battle();
    expect(() => SET_COMBAT(state, { op: 'reveal' })).toThrow(/недоступен/);
    expect(() => SET_COMBAT(state, { op: 'resolve' })).toThrow(/недоступен/);
    expect(() => SET_COMBAT(state, { op: 'close' })).toThrow(/недоступен/);

    SET_COMBAT(state, { op: 'defense', playerId: '1' });
    expect(() => SET_COMBAT(state, { op: 'defense', playerId: '1' })).toThrow(/недоступен/);

    SET_COMBAT(state, { op: 'reveal' });
    expect(() => SET_COMBAT(state, { op: 'reveal' })).toThrow(/недоступен/);

    SET_COMBAT(state, { op: 'resolve' });
    expect(() => SET_COMBAT(state, { op: 'resolve' })).toThrow(/недоступен/);

    SET_COMBAT(state, { op: 'close' });
    expect(state.combat).toBeNull();
  });

  it('смертельный урон убирает бойца с поля', () => {
    const state = battle({ defenderHp: 1 });
    SET_COMBAT(state, { op: 'defense', playerId: '1' });
    finish(state);

    expect(player(state, '1').fighters).toHaveLength(0);
    expect(state.lastCombat.combatDamage).toBe(4);
    expect(discard(player(state, '0')).map(card => card.instanceId)).toEqual(['atk_0']);
  });

  it('cancel снимает бой на любой стадии, карты — в сброс, урона нет', () => {
    const state = battle();
    SET_COMBAT(state, { op: 'cancel', playerId: '0' });

    expect(state.combat).toBeNull();
    expect(state.lastCombat).toBeNull();
    expect(player(state, '1').fighters[0].currentHp).toBe(13);
    expect(discard(player(state, '0')).map(card => card.instanceId)).toEqual(['atk_0']);

    const withDefense = battle();
    SET_COMBAT(withDefense, {
      op: 'defense',
      playerId: '1',
      cardId: 'bdef_0',
    });
    SET_COMBAT(withDefense, { op: 'cancel', playerId: '1' });

    expect(withDefense.combat).toBeNull();
    expect(discard(player(withDefense, '1')).map(card => card.instanceId)).toEqual(['bdef_0']);
    expect(player(withDefense, '1').fighters[0].currentHp).toBe(13);
  });

  it('cancel без боя ничего не делает, чужому игроку отказывает', () => {
    const empty = createState();
    expect(SET_COMBAT(empty, { op: 'cancel', playerId: '0' }).combat).toBeNull();

    const state = battle();
    expect(() => SET_COMBAT(state, { op: 'cancel', playerId: 'nope' })).toThrow(
      /только его участник/,
    );
  });
});

describe('SET_TARGETING', () => {
  const opened = () =>
    SET_TARGETING(createState(), {
      op: 'open',
      playerId: '0',
      source: 'skill',
      candidates: [{ fighterId: 'beta', playerId: '1', name: 'Beta', position: 10 }],
    });

  it('open нормализует кандидатов и пишет источник', () => {
    const state = opened();
    expect(state.targeting).toEqual({
      playerId: '0',
      source: 'skill',
      required: false,
      auto: false,
      kind: 'fighters',
      count: 1,
      candidates: [{ fighterId: 'beta', playerId: '1', name: 'Beta', position: 10 }],
      picked: null,
    });
  });

  it('open с auto: true помечает окно «без выбора» (движок отметит единственного кандидата)', () => {
    const state = SET_TARGETING(createState(), {
      op: 'open',
      playerId: '0',
      source: 'skill',
      candidates: [{ fighterId: 'beta', playerId: '1' }],
      auto: true,
    });

    expect(state.targeting.auto).toBe(true);
    expect(state.targeting.required).toBe(false);
  });

  it('open с kind cells: кандидаты — клетки, выбор по клетке', () => {
    const state = SET_TARGETING(createState(), {
      op: 'open',
      playerId: '0',
      kind: 'cells',
      candidates: ['9', { cellId: 10 }],
      count: 1,
    });

    expect(state.targeting.kind).toBe('cells');
    expect(state.targeting.candidates).toEqual([{ cellId: '9' }, { cellId: '10' }]);

    const picked = SET_TARGETING(state, {
      op: 'pick',
      playerId: '0',
      cellId: '10',
    });
    expect(picked.targeting.picked).toBe('10');

    expect(() => SET_TARGETING(state, { op: 'pick', playerId: '0', cellId: '1' })).toThrow(
      /не среди кандидатов/,
    );
  });

  it('выбор всегда про одну цель: count по умолчанию 1, другое значение отклоняется', () => {
    const one = SET_TARGETING(createState(), {
      op: 'open',
      playerId: '0',
      candidates: ['beta'],
      count: 1,
    });
    expect(one.targeting.count).toBe(1);

    expect(() =>
      SET_TARGETING(createState(), {
        op: 'open',
        playerId: '0',
        candidates: ['beta'],
        count: 2,
      }),
    ).toThrow(/ровно одна цель/);
  });

  it('open принимает и просто id бойцов', () => {
    const state = SET_TARGETING(createState(), {
      op: 'open',
      playerId: '0',
      candidates: ['beta'],
    });
    expect(state.targeting.candidates).toEqual([
      { fighterId: 'beta', playerId: null, name: null, position: null },
    ]);
    expect(state.targeting.required).toBe(false);
  });

  it('pick отмечает выбранного кандидата', () => {
    const state = opened();
    SET_TARGETING(state, { op: 'pick', playerId: '0', fighterId: 'beta' });
    expect(state.targeting.picked).toBe('beta');
  });

  it('pick отклоняет чужой выбор, не-кандидата и отсутствие выбора', () => {
    const state = opened();
    expect(() => SET_TARGETING(state, { op: 'pick', playerId: '1', fighterId: 'beta' })).toThrow(
      /чужой выбор/,
    );
    expect(() => SET_TARGETING(state, { op: 'pick', playerId: '0', fighterId: 'alpha' })).toThrow(
      /не среди кандидатов/,
    );
    expect(() =>
      SET_TARGETING(createState(), {
        op: 'pick',
        playerId: '0',
        fighterId: 'beta',
      }),
    ).toThrow(/не открыт/);
  });

  it('close снимает выбор, чужой игрок — нет', () => {
    const state = opened();
    expect(() => SET_TARGETING(state, { op: 'close', playerId: '1' })).toThrow(/чужой выбор/);
    SET_TARGETING(state, { op: 'close', playerId: '0' });
    expect(state.targeting).toBeNull();
  });

  it('open отклоняет повтор, пустых кандидатов и неизвестный op', () => {
    const state = opened();
    expect(() => SET_TARGETING(state, { op: 'open', playerId: '0', candidates: ['beta'] })).toThrow(
      /уже открыт/,
    );
    expect(() =>
      SET_TARGETING(createState(), {
        op: 'open',
        playerId: '0',
        candidates: [],
      }),
    ).toThrow(/candidates/);
    expect(() =>
      SET_TARGETING(createState(), {
        op: 'open',
        playerId: 'nope',
        candidates: ['beta'],
      }),
    ).toThrow(/не найден/);
    expect(() => SET_TARGETING(createState(), { op: 'fly' })).toThrow(/op/);
  });
});
