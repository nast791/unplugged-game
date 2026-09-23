import { describe, expect, it } from 'vitest';
import { rules } from '#shared/constants/rules.js';
import { resolvePhaseHint } from '#shared/helpers/base.js';
import turn from '#shared/lifecycle/turn.js';
import choose from '#shared/phases/choose.js';
import movement from '#shared/phases/movement.js';
import waiting from '#shared/phases/waiting.js';
import { ap, createState, deck, discard, hand, player } from '../../fixtures/state.js';

const lineMap = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2] },
    { id: 2, neighbors: [1, 3] },
    { id: 3, neighbors: [2, 4] },
    { id: 4, neighbors: [3, 5] },
    { id: 5, neighbors: [4] },
  ],
};

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(fighter => fighter.id === fighterId);

/** Ход игрока 0: alpha (move 2) на клетке 1, beta (игрок 1) на клетке 5, помощник вне поля. */
const turnState = () => {
  const state = createState({ map: lineMap });
  fighterOf(state, '0', 'alpha').currentPosition = 1;
  fighterOf(state, '0', 'pawn').currentPosition = null;
  player(state, '1').fighters[0].currentPosition = 5;
  return state;
};

const uiOf = (phase, state, playerId, clientContext = {}) =>
  phase.ui(state, playerId, clientContext, phase);

/** Как core выбирает фазу: первая активная в hook.phases. */
const activePhaseOf = (state, playerId) =>
  turn.phases.find(phase => phase.active?.(state, playerId)) ?? null;

describe('phase choose', () => {
  it('активна для активного игрока без моментов и в лимите руки', () => {
    const state = turnState();
    expect(choose.active(state, '0')).toBe(true);
    expect(choose.active(state, '1')).toBe(false);
  });

  it('не активна при открытом моменте или переполненной руке', () => {
    const withMoment = turnState();
    withMoment.movement = { playerId: '0', origins: {}, bonus: 0 };
    expect(choose.active(withMoment, '0')).toBe(false);

    const overLimit = turnState();
    player(overLimit, '0').hand.cards = Array.from(
      { length: rules.maxHandSize + 1 },
      (_, index) => ({ id: `x${index}`, instanceId: `x${index}_0` }),
    );
    expect(choose.active(overLimit, '0')).toBe(false);
  });

  it('клик по колоде: −1 действие, черновик перемещения, добор 1 карты', () => {
    const state = turnState();
    const before = hand(player(state, '0')).length;

    choose.moves.PICK(state, { kind: 'deck', playerId: '0' });

    expect(ap(state)).toBe(1);
    expect(state.movement).toEqual({
      playerId: '0',
      origins: {},
      bonus: 0,
      bonusUsed: false,
    });
    expect(hand(player(state, '0'))).toHaveLength(before + 1);
    expect(deck(player(state, '0'))).toHaveLength(1);
    expect(movement.active(state, '0')).toBe(true);
  });

  it('пустая колода: урон всем героям, помощнику — нет, перемещение доступно', () => {
    const state = turnState();
    player(state, '0').deck.cards = [];
    player(state, '0').discard.cards = [];
    player(state, '0').fighters.push({
      ...fighterOf(state, '0', 'alpha'),
      id: 'alpha2',
      name: 'Alpha2',
      currentPosition: null,
    });

    choose.moves.PICK(state, { kind: 'deck', playerId: '0' });

    expect(fighterOf(state, '0', 'alpha').currentHp).toBe(15 - rules.exhaustionDamage);
    expect(fighterOf(state, '0', 'alpha2').currentHp).toBe(15 - rules.exhaustionDamage);
    expect(fighterOf(state, '0', 'pawn').currentHp).toBe(4);
    expect(state.movement).not.toBeNull();
    expect(ap(state)).toBe(1);
  });

  it('отклоняет клик по полю в фазе объявления', () => {
    const state = turnState();
    expect(() =>
      choose.moves.PICK(state, { kind: 'cell', id: 2, playerId: '0' }),
    ).toThrow(/колода и карта атаки/);
  });

  it('ui: колода кликабельна, карты недоступны, кнопки нет; hint сверху', () => {
    const state = turnState();
    const ui = uiOf(choose, state, '0');

    expect(ui.deck.clickable).toBe(true);
    expect(ui.playableCardIds).toEqual([]);
    expect(ui.disabledCardIds).toHaveLength(3);
    expect(ui.controls.ok.visible).toBe(false);
    expect(resolvePhaseHint(choose.hints, state, '0')).toMatch(/возьмите карту/);
  });

  it('выбор цели: подсветка кандидатов, подсказка и клик по бойцу', () => {
    const state = turnState();
    state.targeting = {
      playerId: '0',
      source: 'skill',
      required: false,
      candidates: [{ fighterId: 'beta', playerId: '1', position: 5 }],
      picked: null,
    };

    const ui = uiOf(choose, state, '0');
    expect(ui.highlightedFighterIds).toEqual(['beta']);
    expect(resolvePhaseHint(choose.hints, state, '0')).toBe(
      'Выберите цель среди подсвеченных бойцов',
    );

    choose.moves.PICK(state, { kind: 'fighter', id: 'beta', playerId: '0' });
    expect(state.targeting.picked).toBe('beta');
  });

  it('выбор цели не мешает объявить действие, но держит ход открытым', () => {
    const state = turnState();
    state.targeting = {
      playerId: '0',
      source: 'skill',
      required: false,
      candidates: [{ fighterId: 'beta' }],
      picked: null,
    };

    expect(choose.active(state, '0')).toBe(true);
    expect(activePhaseOf(state, '0')?.name).toBe('choose');
    expect(
      turn.body({ ...state, turn: { ...state.turn, actionsLeft: 0 } }),
    ).toBe(false);

    expect(() =>
      choose.moves.PICK(state, { kind: 'fighter', id: 'beta', playerId: '1' }),
    ).toThrow(/некого/);
  });
});

describe('phase movement', () => {
  const openMovement = () => {
    const state = turnState();
    choose.moves.PICK(state, { kind: 'deck', playerId: '0' });
    return state;
  };

  it('активна только у владельца открытого перемещения', () => {
    const state = turnState();
    expect(movement.active(state, '0')).toBe(false);

    const opened = openMovement();
    expect(movement.active(opened, '0')).toBe(true);
    expect(movement.active(opened, '1')).toBe(false);
  });

  it('ui: подсветка клеток выбранного бойца в радиусе от старта', () => {
    const state = openMovement();
    expect(uiOf(movement, state, '0').highlightedCellIds).toEqual([]);

    const ui = uiOf(movement, state, '0', { selectedFighterId: 'alpha' });
    expect(ui.highlightedCellIds).toEqual(['2', '3']);
    expect(ui.deck.clickable).toBe(false);
    expect(ui.controls.ok).toEqual({
      visible: true,
      enabled: true,
      label: 'Закончить действие',
    });
  });

  it('шаг запоминает origin и не даёт уйти дальше радиуса', () => {
    const state = openMovement();
    movement.moves.PICK(state, {
      kind: 'cell',
      id: 3,
      fighterId: 'alpha',
      playerId: '0',
    });

    expect(fighterOf(state, '0', 'alpha').currentPosition).toBe(3);
    expect(state.movement.origins).toEqual({ alpha: 1 });
    expect(uiOf(movement, state, '0', { selectedFighterId: 'alpha' }).highlightedCellIds).toEqual([
      '1',
      '2',
    ]);

    expect(() =>
      movement.moves.PICK(state, {
        kind: 'cell',
        id: 4,
        fighterId: 'alpha',
        playerId: '0',
      }),
    ).toThrow(/вне радиуса/);
  });

  it('отклоняет чужих бойцов, занятые клетки и клик не по клетке', () => {
    const state = openMovement();
    expect(() =>
      movement.moves.PICK(state, {
        kind: 'cell',
        id: 4,
        fighterId: 'beta',
        playerId: '0',
      }),
    ).toThrow(/не ваш/);

    expect(() =>
      movement.moves.PICK(state, {
        kind: 'cell',
        id: 1,
        fighterId: 'alpha',
        playerId: '0',
      }),
    ).toThrow(/уже на этой клетке/);

    expect(() => movement.moves.PICK(state, { kind: 'deck', playerId: '0' })).toThrow(
      /доступны клетка и карта усиления/,
    );

    expect(() => movement.moves.PICK(state, { kind: 'cell', id: 99, fighterId: 'alpha', playerId: '0' })).toThrow(
      /не найдена на карте/,
    );
  });

  it('усиление: одна карта за действие, bonus всему перемещению', () => {
    const state = openMovement();
    movement.moves.PICK(state, {
      kind: 'cell',
      id: 3,
      fighterId: 'alpha',
      playerId: '0',
    });

    movement.moves.PICK(state, { kind: 'card', id: 'fx_0', playerId: '0' });
    expect(state.movement.bonus).toBe(2);
    expect(state.movement.bonusUsed).toBe(true);
    expect(discard(player(state, '0')).map(card => card.instanceId)).toEqual(['fx_0']);
    expect(uiOf(movement, state, '0').playableCardIds).toEqual([]);
    expect(uiOf(movement, state, '0').disabledCardIds).toEqual(
      hand(player(state, '0')).map(card => card.instanceId),
    );

    expect(uiOf(movement, state, '0', { selectedFighterId: 'alpha' }).highlightedCellIds).toEqual([
      '1',
      '2',
      '4',
    ]);

    expect(() =>
      movement.moves.PICK(state, { kind: 'card', id: 'atk_0', playerId: '0' }),
    ).toThrow(/усиление уже использовано/);
  });

  it('усилить можно только карту с bonus', () => {
    const state = openMovement();
    player(state, '0').hand.cards.push({
      id: 'plain',
      instanceId: 'plain_0',
      type: 'effect',
      value: 0,
      bonus: 0,
    });
    const ui = uiOf(movement, state, '0');
    expect(ui.playableCardIds).not.toContain('plain_0');
    expect(ui.disabledCardIds).toContain('plain_0');

    expect(() =>
      movement.moves.PICK(state, { kind: 'card', id: 'plain_0', playerId: '0' }),
    ).toThrow(/нет усиления/);
  });

  it('кнопка закрывает перемещение, дальше снова choose', () => {
    const state = openMovement();
    expect(movement.ok.enabled(state, '0')).toBe(true);

    movement.ok.onPress(state, { playerId: '0' });

    expect(state.movement).toBeNull();
    expect(ap(state)).toBe(1);
    expect(movement.active(state, '0')).toBe(false);
    expect(choose.active(state, '0')).toBe(true);
  });
});

describe('phase waiting', () => {
  it('активна для всех, кроме активного игрока', () => {
    const state = turnState();
    expect(waiting.active(state, '1')).toBe(true);
    expect(waiting.active(state, '0')).toBe(false);
  });

  it('подсказки: ждём перемещения и ход игрока', () => {
    const state = turnState();
    expect(resolvePhaseHint(waiting.hints, state, '1')).toBe('Ход игрока Alpha');

    state.movement = { playerId: '0', origins: {}, bonus: 0 };
    expect(resolvePhaseHint(waiting.hints, state, '1')).toBe(
      'Ждём перемещения бойцов: Alpha',
    );
  });

  it('ui: без подсветки и без кнопок, ходов нет', () => {
    const state = turnState();
    const ui = uiOf(waiting, state, '1', { selectedFighterId: 'beta' });
    expect(ui.highlightedCellIds).toEqual([]);
    expect(ui.controls.ok.visible).toBe(false);
    expect(waiting.moves).toBeUndefined();
  });
});
