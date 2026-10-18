import { describe, expect, it } from 'vitest';
import { runRules } from '#shared/rules/run.js';
import snowQueenCards from '../../../server/content/heroes/snow-queen/cards.js';
import { ap, createState, deck, discard, fighter, player } from '../../fixtures/state.js';

const card = snowQueenCards.find(entry => entry.id === 'snow-queen_01');

/** Три клетки льда подряд: телепорт врага всегда найдёт свободную. */
const iceMap = {
  id: 'ice',
  nodes: [
    { id: 1, neighbors: [2], terrain: 'ice' },
    { id: 2, neighbors: [1, 3], terrain: 'ice' },
    { id: 3, neighbors: [2], terrain: 'ice' },
  ],
};

/**
 * Бой закрыт: королева (игрок 0) выиграла его «Зеркальным сколом», у неё осталась колода,
 * боец противника жив и стоит на льду. Регрессия: замороженному телепорт закрыт движком,
 * поэтому окно не должно открываться вовсе (иначе клик падал бы с «боец … заморожен»).
 */
const closedBattle = ({ frozen = false, map = iceMap } = {}) => {
  const state = createState({ map });
  player(state, '0').fighters = [
    fighter({
      id: 'snow-queen',
      name: 'Снежная королева',
      type: 'hero',
      currentPosition: 2,
      currentHp: 16,
      startHp: 16,
      move: 2,
      attackRange: 3,
    }),
  ];
  player(state, '1').fighters = [
    fighter({ id: 'beta', name: 'Beta', type: 'hero', currentPosition: 1, currentHp: 13, frozen }),
  ];
  state.lastCombat = {
    winner: 'attacker',
    winnerPlayerId: '0',
    attackerPlayerId: '0',
    defenderPlayerId: '1',
    attackerFighterId: 'snow-queen',
    targetFighterId: 'beta',
  };
  return state;
};

const run = (state, moment) =>
  runRules(state, card.rules, moment, { playerId: '0', source: card.id, card });

const fighterOf = (state, id) =>
  player(state, '1').fighters.find(entry => entry.id === id) ??
  player(state, '0').fighters.find(entry => entry.id === id);

describe('карта snow-queen_01 «Зеркальный скол»', () => {
  it('выигранная битва: карта уходит в сброс, окно открывается на свободном льду', () => {
    const state = closedBattle();
    // верх колоды — последний элемент списка: карты тянутся с конца
    const top = deck(player(state, '0')).at(-1);

    const next = run(state, 'afterCombat');

    expect(discard(player(next, '0')).map(entry => entry.id)).toEqual([top.id]);
    expect(deck(player(next, '0')).map(entry => entry.id)).not.toContain(top.id);
    expect(next.targeting?.kind).toBe('cells');
    expect(next.targeting?.playerId).toBe('0');
    // свободен только третий лёд: клетки 1 и 2 заняты участниками боя
    expect(next.targeting?.candidates.map(entry => String(entry.cellId))).toEqual(['3']);
    // окно необязательное: отказаться от переноса можно общей кнопкой
    expect(next.targeting?.required).toBe(false);
  });

  it('отмеченный лёд переносит врага, но не считается шагом', () => {
    const opened = run(closedBattle(), 'afterCombat');
    opened.targeting.picked = ['3'];

    const next = run(opened, 'picked');

    expect(Number(fighterOf(next, 'beta').currentPosition)).toBe(3);
    expect(fighterOf(next, 'beta').movedThisTurn).not.toBe(true);
    expect(next.movement ?? null).toBeNull();
    expect(ap(next)).toBe(2);
  });

  it('боец противника заморожен — окна нет, краха нет, карта не сбрасывается', () => {
    const state = closedBattle({ frozen: true });
    const before = deck(player(state, '0')).length;

    expect(() => run(state, 'afterCombat')).not.toThrow();

    const next = run(state, 'afterCombat');
    expect(next.targeting ?? null).toBeNull();
    expect(deck(player(next, '0'))).toHaveLength(before);
  });

  it('льда на карте нет — окно не открывается и колода цела', () => {
    const desertMap = {
      id: 'sand',
      nodes: [
        { id: 1, neighbors: [2], terrain: 'desert' },
        { id: 2, neighbors: [1, 3], terrain: 'desert' },
        { id: 3, neighbors: [2], terrain: 'desert' },
      ],
    };
    const state = closedBattle({ map: desertMap });
    const before = deck(player(state, '0')).length;

    const next = run(state, 'afterCombat');

    expect(next.targeting ?? null).toBeNull();
    expect(deck(player(next, '0'))).toHaveLength(before);
  });
});
