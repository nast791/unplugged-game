import { describe, expect, it } from 'vitest';
import { SET_COMBAT } from '#shared/actions/combat.js';
import { advanceCombat } from '#shared/cards/run.js';
import { isMoment } from '#shared/constants/moments.js';
import { runAction } from '#shared/gameEngine.js';
import medusaCards from '../../../server/content/heroes/medusa/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const card = medusaCards.find(entry => entry.id === 'medusa_08');

const lineMap = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'arcane' },
    { id: 2, neighbors: [1, 3], terrain: 'arcane' },
    { id: 3, neighbors: [2], terrain: 'arcane' },
  ],
};

const zone = cards => ({ visibility: [], cards });

const unit = (id, cell, hp, extra = {}) => ({
  ...fighter({
    id,
    name: id,
    type: 'hero',
    currentPosition: cell,
    currentHp: hp,
    move: 3,
    attackRange: 1,
  }),
  ...extra,
});

const slot = (id, name, order, fighters, hand = []) => ({
  id,
  name,
  order,
  placementReady: true,
  deck: zone([]),
  hand: zone(hand),
  discard: zone([]),
  fighters,
});

/** Карта противника с эффектами во всех трёх окнах боя. */
const enemyCard = (id, type, value, targetFighterId) => ({
  id,
  instanceId: `${id}_1`,
  title: id,
  type,
  value,
  bonus: 1,
  fighter: 'beta',
  rules: [
    {
      moment: 'duringCombat',
      then: [{ action: 'SET_COMBAT', op: 'value', side: 'defense', delta: 5 }],
    },
    {
      moment: 'afterCombat',
      then: [{ action: 'SET_HEALTH', fighterIds: [targetFighterId], delta: -5 }],
    },
  ],
});

/** Бета (игрок 1) атакует Медузу (игрок 0); её карта «Обманный маневр» в руке. */
const defenseState = () =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot(
        '0',
        'Медуза',
        1,
        [unit('medusa', 1, 16, { attackType: 'ranged' })],
        [{ ...card, instanceId: 'medusa_08_1' }],
      ),
      slot(
        '1',
        'Бета',
        2,
        [unit('beta', 3, 13, { attackType: 'ranged' })],
        [enemyCard('beta_atk', 'attack', 3, 'medusa')],
      ),
    ],
    turn: { index: 1, playerId: '1', actedRound: ['1'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

/** Медуза объявляет бой «Обманным маневром»; Бета защищается своей картой. */
const attackState = () =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot(
        '0',
        'Медуза',
        1,
        [unit('medusa', 1, 16, { attackType: 'ranged' })],
        [{ ...card, instanceId: 'medusa_08_1' }],
      ),
      slot(
        '1',
        'Бета',
        2,
        [unit('beta', 3, 13, { attackType: 'ranged' })],
        [enemyCard('beta_def', 'defense', 3, 'medusa')],
      ),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId);

describe('карта medusa_08 «Обманный маневр»', () => {
  it('описана правилами, момент — из списка', () => {
    expect(card.rules).toHaveLength(1);
    expect(card.rules[0].moment).toBe('immediately');
    expect(isMoment(card.rules[0].moment)).toBe(true);
    expect(card.hook).toBeUndefined();
  });

  it('защитник отменяет все эффекты карты атакующего', () => {
    let battle = runAction(defenseState(), {
      type: 'PICK',
      kind: 'card',
      id: 'beta_atk_1',
      playerId: '1',
    });
    battle = runAction(battle, {
      type: 'PICK',
      kind: 'fighter',
      id: 'medusa',
      playerId: '1',
    });

    const after = runAction(battle, {
      type: 'PICK',
      kind: 'card',
      id: 'medusa_08_1',
      playerId: '0',
    });

    // числа карт не отменяются: атака 3 против защиты 2 — Медуза получает 1 урон
    expect(after.lastCombat.attackValue).toBe(3);
    expect(after.lastCombat.defenseValue).toBe(2);
    expect(after.lastCombat.combatDamage).toBe(1);
    expect(fighterOf(after, '0', 'medusa').currentHp).toBe(15);
    // а эффекты карты атакующего сгорели: ни +5 к числу, ни 5 урона после боя
    expect(after.lastCombat.winner).toBe('attacker');
    expect(after.combat).toBeNull();
  });

  it('в очереди боя шаги атакующего помечены cancelled', () => {
    let battle = runAction(defenseState(), {
      type: 'PICK',
      kind: 'card',
      id: 'beta_atk_1',
      playerId: '1',
    });
    battle = runAction(battle, {
      type: 'PICK',
      kind: 'fighter',
      id: 'medusa',
      playerId: '1',
    });

    // доигрываем бой вручную, чтобы увидеть очередь: движок мутирует состояние на месте
    const revealed = SET_COMBAT(battle, {
      op: 'defense',
      playerId: '0',
      cardId: 'medusa_08_1',
    });
    const combat = revealed.combat;
    const queue = combat.effects;

    advanceCombat(revealed);

    expect(combat.cancelled).toEqual({ attacker: true });
    expect(queue.map(entry => [entry.side, entry.moment, entry.status])).toEqual([
      ['defender', 'immediately', 'applied'],
      ['attacker', 'duringCombat', 'cancelled'],
      ['attacker', 'afterCombat', 'cancelled'],
    ]);
  });

  it('карта противника без эффектов: отменять нечего, эффект не разыгрывается', () => {
    // у карты атакующего нет ни одного правила — «Обманному манёвру» нечего отменять
    const clean = enemyCard('beta_atk', 'attack', 3, 'medusa');
    clean.rules = [];

    const start = defenseState();
    player(start, '1').hand.cards = [clean];

    let battle = runAction(start, {
      type: 'PICK',
      kind: 'card',
      id: 'beta_atk_1',
      playerId: '1',
    });
    battle = runAction(battle, {
      type: 'PICK',
      kind: 'fighter',
      id: 'medusa',
      playerId: '1',
    });

    const revealed = SET_COMBAT(battle, {
      op: 'defense',
      playerId: '0',
      cardId: 'medusa_08_1',
    });
    const combat = revealed.combat;
    const queue = combat.effects;

    advanceCombat(revealed);

    expect(queue.map(entry => [entry.side, entry.moment, entry.status])).toEqual([
      ['defender', 'immediately', 'skipped'],
    ]);
    expect(combat.cancelled).toBeUndefined();
    // отменять было нечего, но бой посчитан как обычно: атака 3 против защиты 2
    expect(revealed.lastCombat.attackValue).toBe(3);
    expect(revealed.lastCombat.combatDamage).toBe(1);
    expect(fighterOf(revealed, '0', 'medusa').currentHp).toBe(15);
  });

  it('атакующий отменяет эффекты карты защитника', () => {
    let battle = runAction(attackState(), {
      type: 'PICK',
      kind: 'card',
      id: 'medusa_08_1',
      playerId: '0',
    });
    battle = runAction(battle, {
      type: 'PICK',
      kind: 'fighter',
      id: 'beta',
      playerId: '0',
    });

    const revealed = runAction(battle, {
      type: 'PICK',
      kind: 'card',
      id: 'beta_def_1',
      playerId: '1',
    });

    // защита 3 без отменённой прибавки +5; атакующий проиграл, урона нет
    expect(revealed.lastCombat.defenseValue).toBe(3);
    expect(revealed.lastCombat.attackValue).toBe(2);
    expect(revealed.lastCombat.combatDamage).toBe(0);
    expect(revealed.lastCombat.winner).toBe('defender');
    // «после боя» защитника тоже отменено: Медуза не теряет 5 HP
    expect(fighterOf(revealed, '0', 'medusa').currentHp).toBe(16);
  });
});
