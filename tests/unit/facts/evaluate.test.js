import { describe, expect, it } from 'vitest';
import { createCardEngine } from '@nast791/cards/core';
import { PHASE } from '#shared/facts/moment.js';
import { FIGHTERS, queryFighters } from '#shared/facts/fighters.js';
import { ANSWER } from '#shared/facts/answer.js';
import { COMBAT } from '#shared/facts/combat.js';
import { resolveVar } from '#shared/facts/vars.js';
import { createState, fighter, player } from '../../fixtures/state.js';

const facts = { PHASE, FIGHTERS, ANSWER, COMBAT };

const areaMap = {
  id: 'areas',
  nodes: [
    { id: 1, neighbors: [2], areas: ['#blue'] },
    { id: 2, neighbors: [1], areas: ['#blue'] },
  ],
};

/** Атакующий 0 победил; защитник beta. */
const lastCombat = {
  attackerPlayerId: '0',
  defenderPlayerId: '1',
  attackerFighterId: 'medusa',
  targetFighterId: 'beta',
  winner: 'attacker',
  winnerPlayerId: '0',
  combatDamage: 2,
};

const board = (patch = {}) => {
  const state = createState({
    map: structuredClone(areaMap),
    lastCombat: structuredClone(lastCombat),
    ...patch,
  });
  player(state, '0').fighters = [
    fighter({ id: 'medusa', currentPosition: 1, currentHp: 16 }),
  ];
  player(state, '1').fighters = [
    fighter({ id: 'beta', currentPosition: 2, currentHp: 13 }),
  ];
  return state;
};

describe('fact PHASE', () => {
  it('сверяет state.phase / ctx.phase', () => {
    expect(PHASE({ phase: 'turnStart' }, { id: 'turnStart' }).ok).toBe(true);
    expect(PHASE({ state: { phase: 'turn' } }, { id: 'turnStart' }).ok).toBe(
      false,
    );
  });
});

describe('fact COMBAT — winner', () => {
  it('winner: self / opponent', () => {
    const state = board();
    expect(
      COMBAT({ state, player: player(state, '0') }, { winner: 'self' }).ok,
    ).toBe(true);
    expect(
      COMBAT({ state, player: player(state, '0') }, { winner: 'opponent' }).ok,
    ).toBe(false);
    expect(
      COMBAT({ state, player: player(state, '1') }, { winner: 'opponent' }).ok,
    ).toBe(true);
  });

  it('winner: attacker / defender', () => {
    const state = board();
    expect(COMBAT({ state }, { winner: 'attacker' }).ok).toBe(true);
    expect(COMBAT({ state }, { winner: 'defender' }).ok).toBe(false);
  });

  it('winner: { playerId }', () => {
    const state = board();
    expect(COMBAT({ state }, { winner: { playerId: '0' } }).ok).toBe(true);
    expect(COMBAT({ state }, { winner: { playerId: '1' } }).ok).toBe(false);
  });

  it('нет lastCombat → false', () => {
    expect(COMBAT({ state: createState() }, { winner: 'self' }).ok).toBe(false);
  });
});

describe('fact COMBAT — select', () => {
  it('select attacker / defender', () => {
    const state = board();
    expect(COMBAT({ state }, { select: 'attacker' }).value).toEqual(['medusa']);
    expect(COMBAT({ state }, { select: 'defender' }).value).toEqual(['beta']);
  });

  it('select winner / loser', () => {
    const state = board();
    expect(COMBAT({ state }, { select: 'winner' }).value).toEqual(['medusa']);
    expect(COMBAT({ state }, { select: 'loser' }).value).toEqual(['beta']);
  });
});

describe('fact COMBAT — winner + select', () => {
  it('Взгляд смерти: winner self + select defender', () => {
    const cards = createCardEngine({ facts });
    const state = board();
    const { ok, vars } = cards.evaluateTriggers(
      [
        {
          fact: 'COMBAT',
          params: { winner: 'self', select: 'defender' },
          var: 'defender',
        },
      ],
      { state, player: player(state, '0') },
    );
    expect(ok).toBe(true);
    expect(vars.defender).toEqual(['beta']);
    expect(resolveVar('$defender', vars)).toEqual(['beta']);
  });

  it('winner не совпал → false, var не пишется', () => {
    const cards = createCardEngine({ facts });
    const state = board();
    const { ok, vars } = cards.evaluateTriggers(
      [
        {
          fact: 'COMBAT',
          params: { winner: 'opponent', select: 'defender' },
          var: 'defender',
        },
      ],
      { state, player: player(state, '0') },
    );
    expect(ok).toBe(false);
    expect(vars.defender).toBeUndefined();
  });
});

describe('fact ANSWER', () => {
  it('сравнивает vars.answer', () => {
    expect(ANSWER({ vars: { answer: 'yes' } }, { value: 'yes' }).ok).toBe(true);
  });
});

describe('fact FIGHTERS', () => {
  it('areaOf + side opponent', () => {
    const state = board();
    expect(
      queryFighters(
        state,
        { side: 'opponent', areaOf: 'medusa' },
        { ownerPlayerId: '0' },
      ).map(c => c.fighterId),
    ).toEqual(['beta']);
  });
});
