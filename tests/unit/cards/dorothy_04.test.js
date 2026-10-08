import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction, runUi } from '#shared/publicApi.js';
import { movementDestinations } from '#shared/helpers/turn.js';
import dorothyCards from '../../../server/content/heroes/dorothy/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const card = dorothyCards.find(entry => entry.id === 'dorothy_04');

/** Линия 1—2—3—4: Тото на 1, Дороти на 2, Бета на 3, свободная клетка 4. */
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

const slot = (id, name, order, fighters, hand = [], deck = []) => ({
  id,
  name,
  order,
  placementReady: true,
  deck: zone(deck),
  hand: zone(hand),
  discard: zone([]),
  fighters,
});

const deckCard = index => ({
  id: `deck_${index}`,
  instanceId: `deck_${index}`,
  type: 'effect',
  value: 0,
  bonus: 1,
});

/** Бета бьёт Дороти, Дороти защищается «Сменой караула»; здоровье героини просело до 6. */
const buildState = () =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot(
        '0',
        'Дороти',
        1,
        [
          unit('dorothy', 2, 6, { startHp: 12 }),
          unit('toto', 1, 6, { type: 'assistant', group: 'toto' }),
        ],
        [
          { ...card, instanceId: 'dorothy_04_1' },
          { id: 'hand_1', instanceId: 'hand_1', type: 'effect', value: 0, bonus: 1 },
        ],
        [deckCard(0), deckCard(1)],
      ),
      slot(
        '1',
        'Бета',
        2,
        [unit('beta', 3, 13)],
        [
          {
            id: 'beta_atk',
            instanceId: 'beta_atk_1',
            type: 'attack',
            value: 2,
            bonus: 1,
            fighter: 'beta',
          },
        ],
      ),
    ],
    turn: { index: 1, playerId: '1', actedRound: ['1'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

/** Бой доигран до окна вариантов: защитник (Дороти) выбрал карту, числа посчитаны. */
const optionWindow = () => {
  const opened = runAction(buildState(), {
    type: 'PICK',
    kind: 'card',
    id: 'beta_atk_1',
    playerId: '1',
  });
  return runAction(opened, {
    type: 'PICK',
    kind: 'card',
    id: 'dorothy_04_1',
    playerId: '0',
  });
};

const choose = (state, optionId) =>
  runAction(state, { type: 'PICK', kind: 'option', id: optionId, playerId: '0' });

const step = (state, fighterId, cellId) =>
  runAction(state, {
    type: 'PICK',
    kind: 'cell',
    id: cellId,
    fighterId,
    playerId: '0',
  });

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId);

describe('карта dorothy_04 «Смена караула»', () => {
  it('описана правилами, моменты — из списка', () => {
    expect(card.rules.map(rule => rule.moment)).toEqual([
      'afterCombat',
      'picked',
      'picked',
      'picked',
    ]);
    for (const rule of card.rules) expect(isMoment(rule.moment)).toBe(true);
    expect(card.hook).toBeUndefined();
    expect(card).toMatchObject({ type: 'defense', value: 4, bonus: 1, fighter: 'dorothy' });
    expect(card.options.map(option => option.id)).toEqual(['heal', 'draw', 'push']);
  });

  it('после боя открывает необязательное окно вариантов', () => {
    const paused = optionWindow();

    expect(paused.targeting).toMatchObject({
      playerId: '0',
      source: 'dorothy_04_1',
      kind: 'options',
      count: 1,
      required: false,
      picked: null,
    });
    // кандидаты несут только id и доступность: подписи вариант берёт из `card.options` в ui.choices
    expect(paused.targeting.candidates).toEqual([
      { optionId: 'heal', title: null, disabled: false },
      { optionId: 'draw', title: null, disabled: false },
      { optionId: 'push', title: null, disabled: false },
    ]);
    // шаг очереди ждёт решения игрока, бой ещё не закрыт
    expect(paused.combat.stage).toBe('close');
    expect(paused.combat.effects.find(entry => entry.moment === 'afterCombat').status).toBe(
      'waiting',
    );

    const ui = runUi(paused, '0');
    // тексты вариантов берутся с самой карты
    expect(ui.choices).toEqual([
      { optionId: 'heal', title: 'Восстановите Дороти 2 здоровья.', disabled: false },
      { optionId: 'draw', title: 'Возьмите 1 карту.', disabled: false },
      { optionId: 'push', title: 'Сдвиньте атакующего бойца на 1 клетку.', disabled: false },
    ]);
    // отказ от свойства разрешён общей кнопкой завершения — без вопросов «выбрать или нет»
    expect(ui.controls.ok).toEqual({
      visible: true,
      enabled: true,
      label: 'Закончить эффект',
    });
  });

  it('от варианта можно отказаться: шаг помечается declined, бой закрывается', () => {
    const paused = optionWindow();

    const refused = runAction(paused, { type: 'UI_OK', playerId: '0' });

    expect(refused.targeting).toBeNull();
    expect(refused.combat).toBeNull();
    expect(refused.lastCombat.effects[0].status).toBe('declined');
    expect(fighterOf(refused, '0', 'dorothy').currentHp).toBe(6);
    expect(player(refused, '0').hand.cards.map(entry => entry.id)).toEqual(['hand_1']);
  });

  it('вариант «heal» лечит Дороти на 2', () => {
    const healed = choose(optionWindow(), 'heal');

    expect(fighterOf(healed, '0', 'dorothy').currentHp).toBe(8);
    expect(healed.targeting).toBeNull();
    expect(healed.combat).toBeNull();
  });

  it('вариант «draw» берёт карту из колоды', () => {
    const paused = optionWindow();
    expect(player(paused, '0').deck.cards).toHaveLength(2);

    const drawn = choose(paused, 'draw');

    expect(player(drawn, '0').deck.cards.map(entry => entry.id)).toEqual(['deck_0']);
    expect(player(drawn, '0').hand.cards.map(entry => entry.id)).toEqual(['hand_1', 'deck_1']);
    expect(drawn.combat).toBeNull();
  });

  it('вариант «push» открывает перемещение атакующего на 1 клетку', () => {
    const pushed = choose(optionWindow(), 'push');

    expect(pushed.targeting).toBeNull();
    expect(pushed.movement).toMatchObject({
      playerId: '0',
      budget: 1,
      optional: true,
      fighters: ['beta'],
    });
    // Дороти стоит на 2, значит Бету можно сдвинуть только на 4
    expect(movementDestinations(pushed, '0', 'beta')).toEqual(['4']);

    const moved = step(pushed, 'beta', '4');
    expect(fighterOf(moved, '1', 'beta').currentPosition).toBe('4');
    expect(moved.movement.moves).toEqual([{ fighterId: 'beta', from: 3, to: '4' }]);

    const finished = runAction(moved, { type: 'UI_OK', playerId: '0' });
    expect(finished.movement).toBeNull();
    expect(finished.combat).toBeNull();
    expect(finished.lastCombat.effects[0].status).toBe('applied');
  });

  it('перемещение атакующего необязательно: можно сразу закончить эффект', () => {
    const paused = choose(optionWindow(), 'push');

    const finished = runAction(paused, { type: 'UI_OK', playerId: '0' });

    expect(finished.movement).toBeNull();
    expect(finished.combat).toBeNull();
    expect(fighterOf(finished, '1', 'beta').currentPosition).toBe(3);
    expect(finished.lastCombat.effects[0].status).toBe('declined');
  });
});
