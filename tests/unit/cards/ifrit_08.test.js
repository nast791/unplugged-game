import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction, runUi } from '#shared/publicApi.js';
import ifritCards from '../../../server/content/heroes/ifrit/cards.js';
import { createState, discard, fighter, PHASES, player } from '../../fixtures/state.js';

const card = ifritCards.find(entry => entry.id === 'ifrit_08');

/** Линия 1—2—3—4: Ифрит на 2, Бета на 3, есть куда отодвинуть. */
const lineMap = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'ice' },
    { id: 2, neighbors: [1, 3], terrain: 'ice' },
    { id: 3, neighbors: [2, 4], terrain: 'ice' },
    { id: 4, neighbors: [3], terrain: 'ice' },
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

const betaAttack = {
  id: 'beta_atk',
  instanceId: 'beta_atk_1',
  type: 'attack',
  value: 6,
  bonus: 1,
  fighter: 'beta',
};

const betaDefense = {
  id: 'beta_def',
  instanceId: 'beta_def_1',
  type: 'hybrid',
  value: 2,
  bonus: 1,
  fighter: 'beta',
};

/** Ифрит на 2 держит «Стену огня», Бета на 3 с `betaHp` здоровья. */
const buildState = ({ betaHp = 14 } = {}) =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot(
        '0',
        'Ифрит',
        1,
        [unit('ifrit', 2, 14, { attackRange: 3 })],
        [{ ...card, instanceId: 'ifrit_08_1' }],
      ),
      slot('1', 'Бета', 2, [unit('beta', 3, betaHp)]),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

/** Ифрит бьёт Стеной огня (4), Бета пасует. */
const openBattle = state => {
  const opened = runAction(state, {
    type: 'PICK',
    kind: 'card',
    id: 'ifrit_08_1',
    playerId: '0',
  });
  return runAction(opened, { type: 'UI_OK', playerId: '1' });
};

/** Окно перемещения закрывает сам атакующий общей кнопкой. */
const finish = state => runAction(state, { type: 'UI_OK', playerId: '0' });

const step = (state, fighterId, cellId) =>
  runAction(state, { type: 'PICK', kind: 'cell', id: cellId, fighterId, playerId: '0' });

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId);

describe('карта ifrit_08 «Стена огня»', () => {
  it('описана правилами, момент — из списка', () => {
    expect(card.rules).toHaveLength(1);
    expect(card.rules[0].moment).toBe('afterCombat');
    expect(isMoment(card.rules[0].moment)).toBe(true);
    expect(card.hook).toBeUndefined();
    expect(card).toMatchObject({
      type: 'hybrid',
      value: 4,
      bonus: 2,
      quantity: 2,
      fighter: 'any',
    });
    expect(card.rules[0].when[0]).toMatchObject({ fact: 'COMBAT', params: { winner: 'self' } });
    expect(card.rules[0].then[0]).toMatchObject({
      action: 'SET_MOVEMENT',
      op: 'open',
      fighters: '$alive',
      budget: 1,
      optional: true,
    });
  });

  it('после победы открывается окно перемещения атакующего с бюджетом 1', () => {
    const after = openBattle(buildState());

    expect(after.lastCombat.winner).toBe('attacker');
    expect(after.movement).toMatchObject({
      playerId: '0',
      budget: 1,
      optional: true,
      fighters: ['beta'],
    });
    expect(runUi(after, '0').controls.ok).toMatchObject({
      visible: true,
      label: 'Закончить эффект',
    });
    // бой ждёт решения игрока, шаг очереди — в ожидании
    expect(after.combat.effects.map(entry => entry.status)).toEqual(['waiting']);
  });

  it('атакующего можно сдвинуть на соседнюю клетку, и бой после этого закрывается', () => {
    const moved = step(openBattle(buildState()), 'beta', '4');

    expect(fighterOf(moved, '1', 'beta').currentPosition).toBe('4');
    expect(fighterOf(moved, '1', 'beta').currentHp).toBe(10); // 4 урона пришло до сдвига

    const closed = finish(moved);

    expect(closed.movement ?? null).toBeNull();
    expect(closed.combat ?? null).toBeNull();
    expect(closed.combat ?? null).toBeNull();
    // карта ушла в сброс, а сдвиг сохранён
    expect(discard(player(closed, '0')).map(entry => entry.id)).toEqual(['ifrit_08']);
    expect(fighterOf(closed, '1', 'beta').currentPosition).toBe('4');
  });

  it('от окна можно отказаться: боец остаётся на месте', () => {
    const after = finish(openBattle(buildState()));

    expect(after.movement ?? null).toBeNull();
    expect(String(fighterOf(after, '1', 'beta').currentPosition)).toBe('3');
    // отказ виден в отчёте боя: очередь свойств остаётся в `lastCombat`
    expect(after.lastCombat.effects.map(entry => entry.status)).toEqual(['declined']);
  });

  it('при поражении окна нет: сдвигать некого', () => {
    // Бета бьёт Ифрита на 6, Ифрит пасует — побеждает защитник, свойство не срабатывает
    const state = buildState();
    player(state, '1').hand = zone([betaAttack]);
    state.turn = { ...state.turn, playerId: '1', actedRound: ['1'] };

    const opened = runAction(state, {
      type: 'PICK',
      kind: 'card',
      id: 'beta_atk_1',
      playerId: '1',
    });
    const after = runAction(opened, { type: 'UI_OK', playerId: '0' });

    expect(after.lastCombat.winner).toBe('attacker');
    expect(after.lastCombat.winnerPlayerId).toBe('1');
    expect(after.movement ?? null).toBeNull();
    expect(String(fighterOf(after, '0', 'ifrit').currentPosition)).toBe('2');
    expect(String(fighterOf(after, '1', 'beta').currentPosition)).toBe('3');
  });

  it('атакующий погиб в бою — окно не открывается', () => {
    // Бета на 4 hp получает 4 урона и уходит в `lost`: двигать в бою некого
    const after = openBattle(buildState({ betaHp: 4 }));

    expect(player(after, '1').fighters).toEqual([]);
    expect(player(after, '1').lost.map(entry => entry.id)).toEqual(['beta']);
    expect(after.movement ?? null).toBeNull();
    expect(after.lastCombat.combatDamage).toBe(4);
  });

  it('играется и в защиту: победа защитника тоже открывает окно по атакующему', () => {
    // Ифрит защищается «Стеной огня» (4) против атаки 3: побеждает защитник,
    // и правило двигает бойца противника — того, кто атаковал
    const state = buildState();
    state.turn = { ...state.turn, playerId: '1', actedRound: ['1'] };
    player(state, '1').hand = zone([
      { ...betaAttack, id: 'beta_atk_low', instanceId: 'beta_atk_low_1', value: 3 },
    ]);

    const opened = runAction(state, {
      type: 'PICK',
      kind: 'card',
      id: 'beta_atk_low_1',
      playerId: '1',
    });
    const after = runAction(opened, {
      type: 'PICK',
      kind: 'card',
      id: 'ifrit_08_1',
      playerId: '0',
    });

    expect(after.lastCombat.winner).toBe('defender');
    expect(after.movement).toMatchObject({ playerId: '0', budget: 1, fighters: ['beta'] });
  });
});
