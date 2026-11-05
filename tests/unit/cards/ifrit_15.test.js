import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction } from '#shared/publicApi.js';
import ifritCards from '../../../server/content/heroes/ifrit/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const card = ifritCards.find(entry => entry.id === 'ifrit_15');

/** Линия 1—2—3: Бета бьёт Ифрита с 3, Ифрит стоит на 2 (стихию задаёт тест). */
const lineMap = terrain => ({
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'ice' },
    { id: 2, neighbors: [1, 3], terrain },
    { id: 3, neighbors: [2], terrain: 'ice' },
  ],
});

const zone = cards => ({ visibility: [], cards });

const unit = (id, cell, hp, extra = {}) => ({
  ...fighter({
    id,
    name: id,
    type: 'hero',
    currentPosition: cell,
    currentHp: hp,
    move: 2,
    attackRange: 1,
  }),
  startHp: hp,
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

const attackCard = (value = 4) => ({
  id: 'beta_atk',
  instanceId: 'beta_atk_1',
  type: 'attack',
  value,
  bonus: 1,
  fighter: 'beta',
});

/** Ход Беты: она бьёт Ифрита картой `value`, Ифрит отвечает «Искрами». */
const buildState = ({ terrain = 'lava', betaRange = 1, attackValue = 4 } = {}) =>
  createState({
    phase: PHASES.turn,
    map: lineMap(terrain),
    players: [
      slot(
        '0',
        'Ифрит',
        1,
        [unit('ifrit', 2, 14, { attackRange: 3 })],
        [{ ...card, instanceId: 'ifrit_15_1' }],
      ),
      slot('1', 'Бета', 2, [unit('beta', 3, 14, { attackRange: betaRange })], [
        attackCard(attackValue),
      ]),
    ],
    turn: { index: 1, playerId: '1', actedRound: ['1'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

const openBattle = state =>
  runAction(state, { type: 'PICK', kind: 'card', id: 'beta_atk_1', playerId: '1' });

const defend = (state, cardId = 'ifrit_15_1') =>
  runAction(state, { type: 'PICK', kind: 'card', id: cardId, playerId: '0' });

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId);

describe('карта ifrit_15 «Искры»', () => {
  it('описана правилами, моменты — из списка', () => {
    expect(card.rules.map(rule => rule.moment)).toEqual(['duringCombat', 'afterCombat']);
    for (const rule of card.rules) expect(isMoment(rule.moment)).toBe(true);
    expect(card.hook).toBeUndefined();
    expect(card).toMatchObject({
      type: 'hybrid',
      value: 2,
      bonus: 2,
      quantity: 2,
      fighter: 'ifrit',
    });
    // сила искр зависит от стихии под Ифритом, а не от дальности атаки
    expect(card.rules[0].when[0]).toMatchObject({
      fact: 'FIGHTERS',
      params: { fighterIds: ['ifrit'], terrain: 'lava' },
    });
    expect(card.rules[0].then[0]).toMatchObject({
      action: 'SET_COMBAT',
      op: 'value',
      side: 'self',
      to: 4,
    });
    expect(card.rules[1].when[0]).toMatchObject({
      fact: 'COMBAT',
      params: { role: 'defender' },
    });
    expect(card.rules[1].then[0]).toMatchObject({
      action: 'SET_HEALTH',
      fighterIds: '$foe',
      delta: -1,
    });
  });

  it('на лаве значение становится 4: атака гасится, атакующий получает 1 урон', () => {
    const after = defend(openBattle(buildState({ terrain: 'lava' })));

    expect(after.lastCombat.attackValue).toBe(4);
    expect(after.lastCombat.defenseValue).toBe(4);
    expect(after.lastCombat.winner).toBe('defender');
    // защита победила — урона боем нет, но искры всё равно жалят атакующего
    expect(fighterOf(after, '0', 'ifrit').currentHp).toBe(14);
    expect(fighterOf(after, '1', 'beta').currentHp).toBe(13);
  });

  it('вне лавы остаётся 2: Ифрит получает разницу, атакующий — 1 урон', () => {
    const after = defend(openBattle(buildState({ terrain: 'ice' })));

    expect(after.lastCombat.defenseValue).toBe(2);
    expect(after.lastCombat.winner).toBe('attacker');
    expect(fighterOf(after, '0', 'ifrit').currentHp).toBe(12);
    expect(fighterOf(after, '1', 'beta').currentHp).toBe(13);
  });

  it('при дальней атаке сила та же: дальность больше не условие', () => {
    const after = defend(openBattle(buildState({ terrain: 'lava', betaRange: 3 })));

    expect(after.lastCombat.defenseValue).toBe(4);
    expect(after.lastCombat.winner).toBe('defender');
    expect(fighterOf(after, '1', 'beta').currentHp).toBe(13);
  });

  it('ответный урон приходит и при проигранной битве', () => {
    const after = defend(openBattle(buildState({ terrain: 'lava', attackValue: 8 })));

    expect(after.lastCombat.defenseValue).toBe(4);
    expect(after.lastCombat.winner).toBe('attacker');
    // Ифрит потерял 4 здоровья, но Бета всё равно получила 1 от «Искр»
    expect(fighterOf(after, '0', 'ifrit').currentHp).toBe(10);
    expect(fighterOf(after, '1', 'beta').currentHp).toBe(13);
  });
});
