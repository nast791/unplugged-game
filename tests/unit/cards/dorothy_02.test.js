import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runFact } from '#shared/facts/run.js';
import { runAction } from '#shared/publicApi.js';
import dorothyCards from '../../../server/content/heroes/dorothy/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const card = dorothyCards.find(entry => entry.id === 'dorothy_02');

/** Линия 1—2—3—4—5: обычный лёд, лава и пустыня в середине. */
const lineMap = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'ice' },
    { id: 2, neighbors: [1, 3], terrain: 'ice' },
    { id: 3, neighbors: [2, 4], terrain: 'lava' },
    { id: 4, neighbors: [3, 5], terrain: 'desert' },
    { id: 5, neighbors: [4], terrain: 'ice' },
  ],
};

/** Клетка 3 сразу в двух стихиях: +1 должно прийти один раз, а не дважды. */
const dualMap = {
  id: 'dual',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'ice' },
    { id: 2, neighbors: [1, 3], terrain: 'ice' },
    { id: 3, neighbors: [2], terrain: ['lava', 'desert'] },
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

/** Дороти на `heroCell` против Беты на `foeCell`. Карта без привязки: на поле один боец — она его и берёт. */
const buildState = ({ heroCell = 1, foeCell = 2, map = lineMap } = {}) =>
  createState({
    phase: PHASES.turn,
    map,
    players: [
      slot(
        '0',
        'Дороти',
        1,
        [unit('dorothy', heroCell, 12)],
        [{ ...card, instanceId: 'dorothy_02_1' }],
      ),
      slot('1', 'Бета', 2, [unit('beta', foeCell, 13)]),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

/** Дороти бьёт Бету «Ведром воды»; защитник пасует. */
const battle = state => {
  const opened = runAction(state, {
    type: 'PICK',
    kind: 'card',
    id: 'dorothy_02_1',
    playerId: '0',
  });
  return runAction(opened, { type: 'UI_OK', playerId: '1' });
};

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId);

describe('карта dorothy_02 «Ведро воды»', () => {
  it('описана правилами, момент — из списка', () => {
    expect(card.rules).toHaveLength(1);
    expect(card.rules[0].moment).toBe('duringCombat');
    expect(isMoment(card.rules[0].moment)).toBe(true);
    expect(card.hook).toBeUndefined();
    expect(card).toMatchObject({ type: 'attack', value: 4, bonus: 1, fighter: 'any' });
    // две стихии описаны ветками «или», а не двумя правилами
    expect(card.rules[0].any).toHaveLength(2);
  });

  it('цель на обычной стихии — бонуса нет, атака 4', () => {
    const after = battle(buildState({ heroCell: 1, foeCell: 2 }));

    expect(after.lastCombat.attackValue).toBe(4);
    expect(after.lastCombat.combatDamage).toBe(4);
    expect(fighterOf(after, '1', 'beta').currentHp).toBe(9);
  });

  it('во время боя факт COMBAT { select } видит бойцов открытого боя', () => {
    const opened = runAction(buildState({ heroCell: 2, foeCell: 3 }), {
      type: 'PICK',
      kind: 'card',
      id: 'dorothy_02_1',
      playerId: '0',
    });

    // объявление действия сбросило итог прошлого боя, а итог текущего ещё не посчитан:
    // карта опирается на открытый бой, а не на lastCombat
    expect(opened.combat.stage).toBe('defense');
    expect(opened.lastCombat).toBeNull();
    expect(runFact(opened, 'COMBAT', { select: 'opponent' }, { playerId: '0' })).toEqual({
      ok: true,
      value: ['beta'],
    });
    expect(runFact(opened, 'COMBAT', { player: 'opponent' }, { playerId: '0' })).toEqual({
      ok: true,
      value: '1',
    });
    // по этой цели стихия клетки уже читается: $foe для условия карты есть
    expect(
      runFact(opened, 'FIGHTERS', { fighterIds: ['beta'], terrain: 'lava' }, { playerId: '0' }).ok,
    ).toBe(true);
  });

  it('цель на лаве — +1, атака 5', () => {
    const after = battle(buildState({ heroCell: 2, foeCell: 3 }));

    expect(after.lastCombat.attackValue).toBe(5);
    expect(after.lastCombat.combatDamage).toBe(5);
    expect(fighterOf(after, '1', 'beta').currentHp).toBe(8);
  });

  it('цель на песке — +1, атака 5', () => {
    const after = battle(buildState({ heroCell: 5, foeCell: 4 }));

    expect(after.lastCombat.attackValue).toBe(5);
    expect(after.lastCombat.combatDamage).toBe(5);
    expect(fighterOf(after, '1', 'beta').currentHp).toBe(8);
  });

  it('цель на двухцветной клетке лава+песок — +1 приходит один раз', () => {
    const after = battle(buildState({ map: dualMap, heroCell: 2, foeCell: 3 }));

    expect(after.lastCombat.attackValue).toBe(5);
    expect(after.lastCombat.combatDamage).toBe(5);
  });
});
