import { describe, expect, it } from 'vitest';
import { SET_HEALTH } from '#shared/actions/health.js';
import { isMoment } from '#shared/constants/moments.js';
import { runAction } from '#shared/publicApi.js';
import dorothyCards from '../../../server/content/heroes/dorothy/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const card = dorothyCards.find(entry => entry.id === 'dorothy_01');

/**
 * Линия 1—2—3—4—5: Дороти на 2, Бета на 3 (соседняя), Тото — на 1 или на 5.
 * После боя Тото и Бета меняются местами, где бы собака ни стояла.
 */
const lineMap = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'ice' },
    { id: 2, neighbors: [1, 3], terrain: 'ice' },
    { id: 3, neighbors: [2, 4], terrain: 'ice' },
    { id: 4, neighbors: [3, 5], terrain: 'lava' },
    { id: 5, neighbors: [4], terrain: 'lava' },
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

const slot = (id, name, order, fighters, hand = [], lost = []) => ({
  id,
  name,
  order,
  placementReady: true,
  deck: zone([]),
  hand: zone(hand),
  discard: zone([]),
  fighters,
  lost,
});

/** Дороти и Тото игрока 0 против Беты игрока 1; `totoCell` — где стоит собака.
 *  `assistantHp` — вместо героя-Беты на соседней клетке стоит помощник с таким здоровьем. */
const buildState = ({ totoCell = 1, assistantHp = null } = {}) =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot(
        '0',
        'Дороти',
        1,
        [unit('dorothy', 2, 12), unit('toto', totoCell, 6, { type: 'assistant', group: 'toto' })],
        [{ ...card, instanceId: 'dorothy_01_1' }],
      ),
      slot(
        '1',
        'Бета',
        2,
        assistantHp == null
          ? [unit('beta', 3, 13)]
          : [
              unit('harpies_1', 3, assistantHp, { type: 'assistant', group: 'harpies' }),
              unit('beta', 4, 13),
            ],
      ),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

/** Тото убит: боец уходит с поля в `lost` игрока. */
const killToto = state => {
  SET_HEALTH(state, { fighterId: 'toto', delta: -6 });
  return state;
};

/** Дороти бьёт Бету «Тото отвлекает»: карта привязана к ней, защитник пасует. */
const battle = state => {
  const opened = runAction(state, {
    type: 'PICK',
    kind: 'card',
    id: 'dorothy_01_1',
    playerId: '0',
  });
  return runAction(opened, { type: 'UI_OK', playerId: '1' });
};

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId);

describe('карта dorothy_01 «Тото отвлекает»', () => {
  it('описана правилами, момент — из списка', () => {
    expect(card.rules).toHaveLength(3);
    for (const rule of card.rules) {
      expect(rule.moment).toBe('afterCombat');
      expect(isMoment(rule.moment)).toBe(true);
    }
    expect(card.hook).toBeUndefined();
    expect(card).toMatchObject({ type: 'attack', value: 4, bonus: 4, fighter: 'dorothy' });
    expect(card.rules[0].then.map(step => step.action)).toEqual(['SWAP_FIGHTERS']);
    // обмен сложился — одно действие; обмен не сложился (нет Тото или бойца противника) — два
    expect(card.rules[1].then).toEqual([{ action: 'SET_ACTIONS', delta: 1 }]);
    expect(card.rules[2].then).toEqual([{ action: 'SET_ACTIONS', delta: 2 }]);
    expect(card.rules[2].any).toHaveLength(2);
    // «Тото или боец противника уже не на поле» — `max` пишется на самом факте
    expect(card.rules[2].any[0][0]).toMatchObject({
      fact: 'FIGHTERS',
      params: { group: 'toto' },
      max: 0,
    });
  });

  it('после боя меняет Бету и Тото местами и даёт дополнительное действие', () => {
    const after = battle(buildState({ totoCell: 1 }));

    // бой: 13 − 4, Бета жива и меняется клеткой с собакой
    expect(after.lastCombat.combatDamage).toBe(4);
    expect(fighterOf(after, '1', 'beta').currentHp).toBe(9);
    // обмен не приводит клетки к строке: бойцы меняются теми значениями, что стоят в состоянии
    expect(Number(fighterOf(after, '1', 'beta').currentPosition)).toBe(1);
    expect(Number(fighterOf(after, '0', 'toto').currentPosition)).toBe(3);
    // карта стоила действие и вернула его
    expect(after.turn.actionsLeft).toBe(2);
  });

  it('собака стоит далеко — обмен всё равно работает', () => {
    const after = battle(buildState({ totoCell: 5 }));

    expect(Number(fighterOf(after, '1', 'beta').currentPosition)).toBe(5);
    expect(Number(fighterOf(after, '0', 'toto').currentPosition)).toBe(3);
    expect(after.turn.actionsLeft).toBe(2);
  });

  it('Тото убит — обмена нет, но карта даёт 2 действия вместо 1', () => {
    const state = killToto(buildState({ totoCell: 1 }));
    expect(fighterOf(state, '0', 'toto')).toBeUndefined();
    expect(player(state, '0').lost.map(entry => entry.id)).toEqual(['toto']);

    const after = battle(state);

    expect(Number(fighterOf(after, '1', 'beta').currentPosition)).toBe(3);
    // карта стоила действие и вернула два: 2 − 1 + 2
    expect(after.turn.actionsLeft).toBe(3);
  });

  it('боец противника погиб в бою — обмена нет, тоже 2 действия', () => {
    const after = battle(buildState({ assistantHp: 1 }));

    // помощник в 1 hp не пережил бой (атака 4), меняться не с кем
    expect(fighterOf(after, '1', 'harpies_1')).toBeUndefined();
    expect(Number(fighterOf(after, '0', 'toto').currentPosition)).toBe(1);
    expect(after.turn.actionsLeft).toBe(3);
  });
});
