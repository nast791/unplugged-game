import { describe, expect, it } from 'vitest';
import { PHASES } from '@nast791/engine/constants';
import { onPhase, resolveEffect } from '#shared/actions/resolveEffect.js';
import { createApi, createState, fighter, player } from '../../fixtures/state.js';

const areaMap = {
  id: 'areas',
  nodes: [
    { id: 1, neighbors: [2], areas: ['#blue'] },
    { id: 2, neighbors: [1, 3], areas: ['#blue'] },
    { id: 3, neighbors: [2], areas: ['#red'] },
  ],
};

const medusaSkill = {
  id: 'medusa_skill',
  heroId: 'medusa',
  name: 'Взгляд Медузы',
  effects: [
    {
      id: 'gaze',
      triggers: [
        { fact: 'PHASE', params: { id: 'turnStart' } },
        {
          fact: 'FIGHTERS',
          params: { side: 'opponent', areaOf: 'medusa' },
          min: 1,
          var: 'candidates',
        },
      ],
      events: [
        {
          type: 'PROMPT',
          message: 'Применить?',
          answers: [
            { value: 'yes', text: 'Да' },
            { value: 'no', text: 'Нет' },
          ],
        },
      ],
    },
    {
      id: 'gaze_yes',
      triggers: [{ fact: 'ANSWER', params: { value: 'yes' } }],
      events: [
        {
          type: 'HIGHLIGHT_TARGETS',
          params: { target: '$candidates' },
          count: 1,
        },
        { type: 'DEAL_DAMAGE', damage: 1, target: 1 },
      ],
    },
    {
      id: 'gaze_no',
      triggers: [{ fact: 'ANSWER', params: { value: 'no' } }],
      events: [],
    },
  ],
};

const gazeState = () => {
  const state = createState({
    map: structuredClone(areaMap),
    effectPrompt: null,
    phase: PHASES.turnStart,
  });
  const p0 = player(state, '0');
  p0.skill = medusaSkill;
  p0.fighters = [
    fighter({ id: 'medusa', name: 'Медуза', currentPosition: 1, currentHp: 16 }),
  ];
  player(state, '1').fighters = [
    fighter({ id: 'beta', name: 'Beta', currentPosition: 2, currentHp: 13 }),
  ];
  return state;
};

describe('onPhase → cards.dispatch / resume', () => {
  it('фаза не turnStart → нет prompt', () => {
    const state = gazeState();
    state.phase = PHASES.turn;
    onPhase(state, createApi());
    expect(state.effectPrompt).toBeNull();
  });

  it('триггеры не прошли → нет prompt', () => {
    const state = gazeState();
    player(state, '1').fighters[0].currentPosition = 3;
    onPhase(state, createApi());
    expect(state.effectPrompt).toBeNull();
  });

  it('turnStart + враг в области → PROMPT', () => {
    const state = gazeState();
    onPhase(state, createApi());
    expect(state.effectPrompt?.kind).toBe('PROMPT');
  });

  it('yes → HIGHLIGHT → DEAL_DAMAGE', () => {
    const state = gazeState();
    onPhase(state, createApi());
    resolveEffect(state, { playerId: '0', answer: 'yes' }, createApi());
    expect(state.effectPrompt?.kind).toBe('HIGHLIGHT_TARGETS');
    resolveEffect(state, { playerId: '0', targetId: 'beta' }, createApi());
    expect(state.effectPrompt).toBeNull();
    expect(player(state, '1').fighters[0].currentHp).toBe(12);
  });
});
