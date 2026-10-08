import { describe, expect, it } from 'vitest';
import { isMoment } from '#shared/constants/moments.js';
import { runAction, runUi } from '#shared/publicApi.js';
import { view } from '../../../server/party.js';
import medusaCards from '../../../server/content/heroes/medusa/cards.js';
import { createState, fighter, PHASES, player } from '../../fixtures/state.js';

const card = medusaCards.find(entry => entry.id === 'medusa_10');

/** Линия 1—2—3 в одной зоне, клетка 4 — другая зона. */
const zoneMap = {
  id: 'zones',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'ice' },
    { id: 2, neighbors: [1, 3], terrain: 'ice' },
    { id: 3, neighbors: [2, 4], terrain: 'ice' },
    { id: 4, neighbors: [3], terrain: 'lava' },
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

/** Медуза (игрок 0) держит «Роковую встречу»; Бета стоит в её зоне, помощник — в другой. */
const state = ({ medusaAlive = true } = {}) =>
  createState({
    phase: PHASES.turn,
    map: zoneMap,
    players: [
      slot(
        '0',
        'Медуза',
        1,
        [
          unit('medusa', 1, medusaAlive ? 16 : 0, { attackRange: 3 }),
          unit('harpies_1', 2, 1, { type: 'assistant', group: 'harpies' }),
        ],
        [{ ...card, instanceId: 'medusa_10_1' }],
      ),
      slot('1', 'Бета', 2, [
        unit('beta', 3, 13, { attackRange: 3 }),
        unit('beta_pet', 4, 7, { type: 'assistant' }),
      ]),
    ],
    turn: { index: 1, playerId: '0', actedRound: ['0'] },
    _enteredHooks: { gameStart: true, turn: true },
  });

const playCard = (start = state()) =>
  runAction(start, { type: 'PICK', kind: 'card', id: 'medusa_10_1', playerId: '0' });

const pickTarget = (start, fighterId) =>
  runAction(start, { type: 'PICK', kind: 'fighter', id: fighterId, playerId: '0' });

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(entry => entry.id === fighterId);

describe('карта medusa_10 «Роковая встреча»', () => {
  it('описана правилами, моменты — из списка', () => {
    expect(card.rules).toHaveLength(2);
    for (const rule of card.rules) expect(isMoment(rule.moment)).toBe(true);
    expect(card.rules.map(rule => rule.moment)).toEqual(['effect', 'picked']);
    expect(card.hook).toBeUndefined();
  });

  it('разыгрывается как действие: −1 действие, карта в сброс, окно выбора цели', () => {
    const start = state();
    expect(player(start, '0').turn?.actionsLeft ?? start.turn.actionsLeft).toBe(2);

    const played = playCard(start);

    expect(played.turn.actionsLeft).toBe(1);
    expect(player(played, '0').hand.cards).toHaveLength(0);
    expect(player(played, '0').discard.cards.map(entry => entry.id)).toEqual(['medusa_10']);
    // окно обязательное: объявить другое действие нельзя
    expect(played.targeting.required).toBe(true);
    expect(played.targeting.source).toBe('medusa_10_1');
    expect(runUi(played, '0').highlightedFighterIds.sort()).toEqual([
      'beta',
      'harpies_1',
      'medusa',
    ]);
    expect(() => runAction(played, { type: 'PICK', kind: 'deck', playerId: '0' })).toThrow(
      /сначала выберите цель/,
    );
  });

  it('карта открыта всем, а её эффекты идут очередью шагов со статусами', () => {
    const played = playCard();

    expect(played.effect.playerId).toBe('0');
    expect(played.effect.source).toBe('medusa_10_1');
    expect(played.effect.card.id).toBe('medusa_10');
    // очередь как у эффектов боя: первый шаг ждёт решения, второй ещё не разыгран
    expect(played.effect.steps.map(step => [step.order, step.moment, step.status])).toEqual([
      [1, 'effect', 'waiting'],
      [2, 'picked', 'pending'],
    ]);

    // карту видят все: сыгранная карта открыта
    const enemyView = view(played, '1');
    expect(enemyView.effect.card.id).toBe('medusa_10');
    expect(enemyView.effect.steps.map(step => step.status)).toEqual(['waiting', 'pending']);

    const after = pickTarget(played, 'beta');

    expect(after.effect).toBeNull();
  });

  it('выбранный боец получает 2 урона, способность Медузы тут не срабатывает', () => {
    const played = playCard();
    // у Медузы есть способность начала хода с уроном 1: она не должна сработать на этом выборе
    const after = pickTarget(played, 'beta');

    expect(fighterOf(after, '1', 'beta').currentHp).toBe(11);
    expect(after.targeting).toBeNull();
    expect(after.effect).toBeNull();
    expect(after.turn.actionsLeft).toBe(1);
  });

  it('бойца вне зоны Медузы выбрать нельзя', () => {
    const played = playCard();

    expect(() => pickTarget(played, 'beta_pet')).toThrow(/не среди кандидатов/);
    expect(fighterOf(played, '1', 'beta_pet').currentHp).toBe(7);
  });

  it('карта привязана к Медузе: без неё на поле она недоступна', () => {
    const dead = state({ medusaAlive: false });
    player(dead, '0').fighters = player(dead, '0').fighters.filter(entry => entry.id !== 'medusa');

    const ui = runUi(dead, '0');
    expect(ui.playableCardIds).toEqual([]);
    expect(ui.disabledCardIds).toEqual(['medusa_10_1']);
    expect(() => playCard(dead)).toThrow(/нет на поле/);
  });
});
