import { describe, expect, it } from 'vitest';
import { createCardEngine } from '@nast791/cards/core';
import { PHASE, MOMENT } from '#shared/facts/moment.js';
import { FIGHTERS, queryFighters } from '#shared/facts/fighters.js';
import { ANSWER } from '#shared/facts/answer.js';
import { resolveVar } from '#shared/facts/vars.js';
import { createState, fighter, player } from '../../fixtures/state.js';

const facts = { PHASE, MOMENT, FIGHTERS, ANSWER };

const areaMap = {
  id: 'areas',
  nodes: [
    { id: 1, neighbors: [2], areas: ['#blue'] },
    { id: 2, neighbors: [1, 3], areas: ['#blue'] },
    { id: 3, neighbors: [2], areas: ['#red'] },
  ],
};

const board = () => {
  const state = createState({ map: structuredClone(areaMap) });
  player(state, '0').fighters = [
    fighter({ id: 'medusa', position: 1, currentHp: 16 }),
  ];
  player(state, '1').fighters = [
    fighter({ id: 'beta', position: 2, currentHp: 13 }),
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

describe('fact ANSWER', () => {
  it('сравнивает vars.answer', () => {
    expect(ANSWER({ vars: { answer: 'yes' } }, { value: 'yes' }).ok).toBe(true);
    expect(ANSWER({ vars: {} }, { value: 'yes' }).ok).toBe(false);
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

describe('evaluateTriggers (cards)', () => {
  it('PHASE + FIGHTERS → var', () => {
    const cards = createCardEngine({ facts });
    const state = board();
    state.phase = 'turnStart';
    const { ok, vars } = cards.evaluateTriggers(
      [
        { fact: 'PHASE', params: { id: 'turnStart' } },
        {
          fact: 'FIGHTERS',
          params: { side: 'opponent', areaOf: 'medusa' },
          min: 1,
          var: 'candidates',
        },
      ],
      { state, player: player(state, '0'), phase: 'turnStart' },
    );
    expect(ok).toBe(true);
    expect(vars.candidates.map(c => c.fighterId)).toEqual(['beta']);
  });
});

describe('resolveVar', () => {
  it('$name', () => {
    expect(resolveVar('$candidates', { candidates: [1] })).toEqual([1]);
  });
});
