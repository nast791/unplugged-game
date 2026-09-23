import { describe, expect, it } from 'vitest';
import { runUi } from '#shared/core.js';
import { runAction } from '#shared/gameEngine.js';
import { ap, createState, hand, player, PHASES } from '../fixtures/state.js';

const lineMap = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2] },
    { id: 2, neighbors: [1, 3] },
    { id: 3, neighbors: [2] },
  ],
};

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(fighter => fighter.id === fighterId);

/** Ход игрока 0: alpha (attackRange 2) на 1, beta на 3, карта atk привязана к alpha. */
const turnState = () => {
  const state = createState({
    phase: PHASES.turn,
    map: lineMap,
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });
  fighterOf(state, '0', 'alpha').currentPosition = 1;
  fighterOf(state, '0', 'alpha').attackRange = 2;
  fighterOf(state, '0', 'pawn').currentPosition = null;
  fighterOf(state, '1', 'beta').currentPosition = 3;
  return state;
};

describe('scenario: ход через gameEngine.runAction', () => {
  it('перемещение → атака → защита → передача хода', () => {
    let state = turnState();

    // 1. Клик по колоде: объявлено перемещение, −1 действие, добор 1.
    state = runAction(state, { type: 'PICK', kind: 'deck', playerId: '0' });
    expect(state.hook).toBe(PHASES.turn);
    expect(ap(state)).toBe(1);
    expect(state.movement).toEqual({
      playerId: '0',
      origins: {},
      bonus: 0,
      bonusUsed: false,
    });
    expect(hand(player(state, '0'))).toHaveLength(4);
    expect(runUi(state, '0').phase).toBe('movement');
    expect(runUi(state, '0').controls.ok.label).toBe('Закончить действие');

    // 2. Шаг бойца по подсвеченной клетке.
    expect(runUi(state, '0', { selectedFighterId: 'alpha' }).highlightedCellIds).toEqual([
      '2',
    ]);
    state = runAction(state, {
      type: 'PICK',
      kind: 'cell',
      id: 2,
      fighterId: 'alpha',
      playerId: '0',
    });
    expect(fighterOf(state, '0', 'alpha').currentPosition).toBe(2);
    expect(state.movement.origins).toEqual({ alpha: 1 });

    // 3. Кнопка «Закончить действие» закрывает перемещение.
    state = runAction(state, { type: 'UI_OK', playerId: '0' });
    expect(state.movement).toBeNull();
    expect(runUi(state, '0').phase).toBe('choose');

    // 4. Карта атаки: объявлен бой, −1 действие, ход держится моментом.
    state = runAction(state, {
      type: 'PICK',
      kind: 'card',
      id: 'atk_0',
      playerId: '0',
    });
    expect(ap(state)).toBe(0);
    expect(state.hook).toBe(PHASES.turn);
    expect(state.combat.stage).toBe('target');
    expect(state.combat.attackerFighterId).toBe('alpha');
    expect(runUi(state, '0', {}).highlightedFighterIds).toEqual(['beta']);

    // 5. Выбор цели: дальше отвечает защитник, у него своя фаза.
    state = runAction(state, {
      type: 'PICK',
      kind: 'fighter',
      id: 'beta',
      playerId: '0',
    });
    expect(state.combat.stage).toBe('defense');
    expect(state.combat.defenderPlayerId).toBe('1');
    expect(runUi(state, '0').phase).toBe('attack');
    expect(runUi(state, '1').phase).toBe('defense');

    // 6. Защита картой: числа, урон, закрытие боя и передача хода.
    state = runAction(state, {
      type: 'PICK',
      kind: 'card',
      id: 'bdef_0',
      playerId: '1',
    });

    expect(state.combat).toBeNull();
    expect(state.lastCombat.combatDamage).toBe(1);
    expect(state.lastCombat.defenderPlayerId).toBe('1');
    expect(fighterOf(state, '1', 'beta').currentHp).toBe(12);

    expect(state.hook).toBe(PHASES.turn);
    expect(state.turn.playerId).toBe('1');
    expect(state.turn.index).toBe(2);
    expect(state.round).toBe(2);
    expect(ap(state)).toBe(2);
    expect(runUi(state, '1').phase).toBe('choose');
    expect(runUi(state, '1').deck.clickable).toBe(true);
  });

  it('пас защитника отдаёт весь урон и не тратит его действия', () => {
    let state = turnState();
    state = runAction(state, { type: 'PICK', kind: 'deck', playerId: '0' });
    state = runAction(state, { type: 'UI_OK', playerId: '0' });
    state = runAction(state, {
      type: 'PICK',
      kind: 'card',
      id: 'atk_0',
      playerId: '0',
    });
    state = runAction(state, {
      type: 'PICK',
      kind: 'fighter',
      id: 'beta',
      playerId: '0',
    });

    state = runAction(state, { type: 'UI_OK', playerId: '1' });

    expect(state.lastCombat.combatDamage).toBe(4);
    expect(state.lastCombat.defendedWithCard).toBe(false);
    expect(fighterOf(state, '1', 'beta').currentHp).toBe(9);
    expect(ap(state)).toBe(2);
  });

  it('чужой клик отклоняется: у ожидающего нет ходов', () => {
    let state = turnState();
    expect(() =>
      runAction(state, { type: 'PICK', kind: 'deck', playerId: '1' }),
    ).toThrow(/недоступен/);
  });
});
