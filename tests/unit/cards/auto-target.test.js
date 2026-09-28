import { describe, expect, it } from 'vitest';
import { runAction } from '#shared/gameEngine.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

/**
 * Окно, открытое с `auto: true`, движок закрывает сам, если кандидат в нём один:
 * свойство карты «выберите вражеского бойца» не спрашивает клик, когда враг один.
 * Карта здесь синтетическая: проверяется механизм движка, а не конкретный контент.
 */
const autoCard = {
  id: 'test_auto',
  instanceId: 'test_auto_1',
  title: 'Авто-цель',
  type: 'effect',
  text: 'ЭФФЕКТ: Нанесите 1 урон вражескому бойцу.',
  rules: [
    {
      moment: 'effect',
      when: [
        {
          fact: 'FIGHTERS',
          params: { side: 'opponent' },
          min: 1,
          var: 'targets',
        },
      ],
      then: [
        {
          action: 'SET_TARGETING',
          op: 'open',
          candidates: '$targets',
          count: 1,
          auto: true,
        },
      ],
    },
    {
      moment: 'picked',
      when: [{ fact: 'PICKED', var: 'picked' }],
      then: [{ action: 'SET_HEALTH', fighterIds: '$picked', delta: -1 }],
    },
  ],
};

const map = {
  id: 'line',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'arcane' },
    { id: 2, neighbors: [1, 3], terrain: 'arcane' },
    { id: 3, neighbors: [2], terrain: 'arcane' },
  ],
};

const unit = (id, cell, hp) =>
  fighter({
    id,
    name: id,
    type: 'hero',
    currentPosition: cell,
    currentHp: hp,
    move: 2,
    attackRange: 1,
  });

const slot = (id, name, order, fighters, hand = []) => ({
  id,
  name,
  order,
  placementReady: true,
  deck: { visibility: [], cards: [] },
  hand: { visibility: [], cards: hand },
  discard: { visibility: [], cards: [] },
  fighters,
});

/** Врагов `count` штук: у одного кандидата выбора нет, у двух — есть. */
const state = (count = 1) => {
  const enemies = [unit('beta', 2, 10), unit('gamma', 3, 10)].slice(0, count);
  return createState({
    phase: PHASES.turn,
    map,
    players: [
      slot('0', 'Тесла', 1, [unit('tesla', 1, 14)], [{ ...autoCard }]),
      slot('1', 'Враги', 2, enemies),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });
};

const play = start =>
  runAction(start, {
    type: 'PICK',
    kind: 'card',
    id: 'test_auto_1',
    playerId: '0',
  });

const hp = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId).currentHp;

describe('окно с одним кандидатом закрывается само (auto: true)', () => {
  it('кандидат один: урон нанесён, окна игрок не видит', () => {
    const played = play(state(1));

    expect(played.targeting ?? null).toBeNull();
    expect(played.effect ?? null).toBeNull();
    expect(hp(played, '1', 'beta')).toBe(9);
    expect(player(played, '0').discard.cards.map(card => card.id)).toEqual(['test_auto']);
  });

  it('кандидатов два: окно открыто и ждёт клика игрока', () => {
    const played = play(state(2));

    expect(played.targeting.kind).toBe('fighters');
    expect(played.targeting.auto).toBe(true);
    expect(played.targeting.candidates.map(entry => entry.fighterId)).toEqual(['beta', 'gamma']);
    expect(hp(played, '1', 'beta')).toBe(10);

    const picked = runAction(played, {
      type: 'PICK',
      kind: 'fighter',
      id: 'gamma',
      playerId: '0',
    });

    expect(picked.targeting ?? null).toBeNull();
    expect(hp(picked, '1', 'beta')).toBe(10);
    expect(hp(picked, '1', 'gamma')).toBe(9);
  });
});
