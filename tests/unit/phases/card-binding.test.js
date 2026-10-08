import { describe, expect, it } from 'vitest';
import { SET_CARDS } from '#shared/actions/cards.js';
import { SET_MOVEMENT } from '#shared/actions/movement.js';
import { runAction, runUi } from '#shared/publicApi.js';
import { attackCandidates, attackRejection } from '#shared/helpers/combat.js';
import { cardFighterId, fighterMatchesCard, hasFighterForCard } from '#shared/helpers/cards.js';
import { bonusCardIds } from '#shared/helpers/turn.js';
import dorothyCards from '../../../server/content/heroes/dorothy/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const lineMap = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'ice' },
    { id: 2, neighbors: [1, 3], terrain: 'ice' },
    { id: 3, neighbors: [2], terrain: 'ice' },
  ],
};

const zone = cards => ({ visibility: [], cards });

const unit = (id, cell, hp, { type = 'hero', group = null, ...extra } = {}) => ({
  ...fighter({
    id,
    name: id,
    type,
    currentPosition: cell,
    currentHp: hp,
    move: 3,
    attackRange: 1,
  }),
  group,
  ...extra,
});

const card = (id, type, value, binding) => ({
  id,
  instanceId: `${id}_1`,
  title: id,
  type,
  value,
  bonus: 1,
  fighter: binding,
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

const handCardOf = (state, id) => handCards(state).find(entry => entry.id === id);

const handCards = state => player(state, '0').hand.cards;

/**
 * Медуза (игрок 0) — дальний боец, рядом Гарпия (помощник с группой 'harpies').
 * В руке: атака Гарпий, атака «любым бойцом», защита Гарпий. У Беты — своя атака.
 * `harpiesAlive: false` — Гарпия снята с поля (нет живых Гарпий).
 */
const state = (harpiesAlive = true, turnPlayerId = '0') =>
  createState({
    phase: PHASES.turn,
    map: lineMap,
    players: [
      slot(
        '0',
        'Медуза',
        1,
        [
          unit('medusa', 1, 16, { attackRange: 3 }),
          unit('harpies_1', 2, harpiesAlive ? 4 : 0, {
            type: 'assistant',
            group: 'harpies',
          }),
        ],
        [
          card('harpy_atk', 'attack', 3, 'harpies'),
          card('any_atk', 'attack', 4, 'any'),
          card('harpy_def', 'defense', 2, 'harpies'),
        ],
      ),
      slot(
        '1',
        'Бета',
        2,
        [unit('beta', 3, 13, { attackRange: 3 })],
        [card('beta_atk', 'attack', 3, 'beta')],
      ),
    ],
    turn: { index: 1, playerId: turnPlayerId, actedRound: [turnPlayerId] },
    _enteredHooks: { gameStart: true, turn: true },
  });

describe('привязка карты к бойцу', () => {
  it('«any» и пустое значение — без привязки, иначе id бойца или группы', () => {
    const harpy = unit('harpies_1', 2, 4, { type: 'assistant', group: 'harpies' });

    expect(cardFighterId({ fighter: 'any' })).toBeNull();
    expect(cardFighterId({ fighter: 'harpies' })).toBe('harpies');
    expect(cardFighterId({})).toBeNull();
    // помощники одного вида: id `harpies_1`, группа `harpies` — карта подходит обоим
    expect(fighterMatchesCard(harpy, { fighter: 'harpies' })).toBe(true);
    expect(fighterMatchesCard(harpy, { fighter: 'harpies_2' })).toBe(false);
    expect(fighterMatchesCard(harpy, { fighter: 'any' })).toBe(true);
  });

  it('карту Гарпий можно играть, пока Гарпия на поле', () => {
    const alive = state();
    expect(hasFighterForCard(alive, '0', handCardOf(alive, 'harpy_atk'))).toBe(true);
    expect(
      attackCandidates(alive, '0', handCardOf(alive, 'harpy_atk')).map(entry => entry.fighterId),
    ).toEqual(['harpies_1']);
    expect(attackRejection(alive, '0', 'harpy_atk_1')).toBeNull();
  });

  it('карта Гарпий: атакующего движок берёт сам, и это реальный боец, а не группа', () => {
    const battle = runAction(state(), {
      type: 'PICK',
      kind: 'card',
      id: 'harpy_atk_1',
      playerId: '0',
    });

    // привязка 'harpies' — группа: в атакующего должен попасть harpies_1, иначе целей не найдётся
    expect(battle.combat.attackerFighterId).toBe('harpies_1');
    // враг один — цель тоже выбирается сама
    expect(battle.combat.stage).toBe('defense');
    expect(battle.combat.targetFighterId).toBe('beta');
  });

  it('несколько Гарпий достают врага: атакующего выбирает игрок', () => {
    const two = state();
    two.map.nodes.push({ id: 4, neighbors: [3], terrain: 'ice' });
    two.map.nodes.find(node => node.id === 3).neighbors.push(4);
    player(two, '0').fighters.push(
      unit('harpies_2', 4, 4, { type: 'assistant', group: 'harpies' }),
    );

    const opened = runAction(two, {
      type: 'PICK',
      kind: 'card',
      id: 'harpy_atk_1',
      playerId: '0',
    });
    expect(opened.combat.stage).toBe('attacker');
    expect(opened.combat.attackerFighterId).toBeNull();

    const chosen = runAction(opened, {
      type: 'PICK',
      kind: 'fighter',
      id: 'harpies_2',
      playerId: '0',
    });
    expect(chosen.combat.attackerFighterId).toBe('harpies_2');
    expect(chosen.combat.stage).toBe('defense');
    expect(chosen.combat.targetFighterId).toBe('beta');
  });

  it('без живых Гарпий их карты в атаку не идут', () => {
    const dead = state(false);
    expect(hasFighterForCard(dead, '0', handCardOf(dead, 'harpy_atk'))).toBe(false);
    expect(attackCandidates(dead, '0', handCardOf(dead, 'harpy_atk'))).toEqual([]);
    expect(attackRejection(dead, '0', 'harpy_atk_1')).toMatch(/нет на поле/);

    const ui = runUi(dead, '0');
    expect(ui.playableCardIds).toEqual(['any_atk_1']);
    expect(ui.disabledCardIds).toEqual(['harpy_atk_1', 'harpy_def_1']);

    expect(() =>
      runAction(dead, {
        type: 'PICK',
        kind: 'card',
        id: 'harpy_atk_1',
        playerId: '0',
      }),
    ).toThrow(/нет на поле/);
  });

  it('карта «любым бойцом» играется, даже если Гарпий нет', () => {
    const dead = state(false);
    expect(
      attackCandidates(dead, '0', handCardOf(dead, 'any_atk')).map(entry => entry.fighterId),
    ).toEqual(['medusa']);
    expect(attackRejection(dead, '0', 'any_atk_1')).toBeNull();
  });

  it('в защиту карту Гарпий без живой Гарпии не сыграть', () => {
    const dead = state(false, '1');
    let battle = runAction(dead, {
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
    expect(battle.combat.stage).toBe('defense');
    expect(battle.combat.defenderPlayerId).toBe('0');

    // единственная карта защиты Медузы привязана к Гарпиям, которых нет
    expect(runUi(battle, '0').playableCardIds).toEqual([]);
    expect(() =>
      runAction(battle, {
        type: 'PICK',
        kind: 'card',
        id: 'harpy_def_1',
        playerId: '0',
      }),
    ).toThrow(/не для бойца, которого атакуют/);
  });
});

/**
 * Карта убитого помощника остаётся в колоде топливом: объявить её нельзя (атака, эффект, защита),
 * а сбросить и усилить (`bonus`) — можно. Дороти (игрок 0) без Тото, он лежит в `lost`.
 */
describe('карта убитого помощника: объявить нельзя, топливом — можно', () => {
  const dorothyCard = id => dorothyCards.find(entry => entry.id === id);

  /** Дороти на 1, Тото убит в `lost`, Бета на 3; в руке — две карты Тото и карта без привязки. */
  const deadTotoState = () => {
    const state = createState({
      phase: PHASES.turn,
      map: lineMap,
      players: [
        slot(
          '0',
          'Дороти',
          1,
          [unit('dorothy', 1, 12)],
          [
            { ...dorothyCard('dorothy_06'), instanceId: 'dorothy_06_1' },
            { ...dorothyCard('dorothy_07'), instanceId: 'dorothy_07_1' },
            { ...dorothyCard('dorothy_09'), instanceId: 'dorothy_09_1' },
            // эффект, привязанный к Тото: проверяем гейт объявления, а не розыгрыш
            card('toto_fx', 'effect', null, 'toto'),
          ],
        ),
        slot('1', 'Бета', 2, [unit('beta', 3, 13, { attackRange: 3 })]),
      ],
      turn: { index: 1, playerId: '0', actedRound: ['0'] },
      _enteredHooks: { gameStart: true, turn: true },
    });
    state.players[0].lost = [unit('toto', null, 0, { type: 'assistant', group: 'toto' })];
    return state;
  };

  it('привязка мертва, а карта без привязки играется как обычно', () => {
    const state = deadTotoState();

    expect(hasFighterForCard(state, '0', handCardOf(state, 'dorothy_06'))).toBe(false);
    expect(hasFighterForCard(state, '0', handCardOf(state, 'dorothy_07'))).toBe(false);
    expect(hasFighterForCard(state, '0', handCardOf(state, 'toto_fx'))).toBe(false);
    // «любой боец» привязки не имеет: Дороти на поле — карта играется
    expect(hasFighterForCard(state, '0', handCardOf(state, 'dorothy_09'))).toBe(true);

    const ui = runUi(state, '0');
    expect(ui.playableCardIds).toEqual(['dorothy_09_1']);
    expect(ui.disabledCardIds).toEqual(['dorothy_06_1', 'dorothy_07_1', 'toto_fx_1']);
  });

  it('атаку картой Тото объявить нельзя', () => {
    const state = deadTotoState();

    expect(attackCandidates(state, '0', handCardOf(state, 'dorothy_06'))).toEqual([]);
    expect(attackRejection(state, '0', 'dorothy_06_1')).toMatch(/нет на поле/);
    expect(() =>
      runAction(state, { type: 'PICK', kind: 'card', id: 'dorothy_06_1', playerId: '0' }),
    ).toThrow(/нет на поле/);
  });

  it('эффект картой Тото объявить нельзя', () => {
    const state = deadTotoState();

    expect(() =>
      runAction(state, { type: 'PICK', kind: 'card', id: 'toto_fx_1', playerId: '0' }),
    ).toThrow(/привязана к бойцу/);
  });

  it('в усиление перемещения карта Тото годится: уходит в сброс и даёт свой bonus', () => {
    const state = deadTotoState();
    expect(bonusCardIds(state, '0')).toEqual([
      'dorothy_06_1',
      'dorothy_07_1',
      'dorothy_09_1',
      'toto_fx_1',
    ]);

    SET_MOVEMENT(state, { op: 'open', playerId: '0' });
    SET_MOVEMENT(state, { op: 'bonus', playerId: '0', cardId: 'dorothy_06_1' });

    expect(state.movement.bonus).toBe(1);
    expect(state.movement.bonusUsed).toBe(true);
    expect(player(state, '0').discard.cards.map(entry => entry.id)).toEqual(['dorothy_06']);
    expect(player(state, '0').hand.cards.map(entry => entry.id)).toEqual([
      'dorothy_07',
      'dorothy_09',
      'toto_fx',
    ]);
  });

  it('сброс по эффекту карту Тото не блокирует', () => {
    const state = deadTotoState();

    SET_CARDS(state, { playerId: '0', op: 'discard', cardIds: ['dorothy_07_1'] });

    expect(player(state, '0').discard.cards.map(entry => entry.id)).toEqual(['dorothy_07']);
    expect(player(state, '0').hand.cards.map(entry => entry.id)).toEqual([
      'dorothy_06',
      'dorothy_09',
      'toto_fx',
    ]);
  });
});
