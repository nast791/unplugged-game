import { describe, expect, it } from 'vitest';
import { runFact, runFacts } from '#shared/core.js';
import { isPlayerAlive } from '#shared/helpers/base.js';
import { createState, fighter, player } from '../../fixtures/state.js';

describe('runFact / runFacts', () => {
  it('PLAYERS: alive + min', () => {
    const state = createState();
    const alive = runFact(state, 'PLAYERS', { alive: true, min: 2 });
    expect(alive.ok).toBe(true);
    expect(alive.value.map(entry => entry.playerId)).toEqual(['0', '1']);
  });

  it('PLAYERS: мёртвый герой не попадает в alive', () => {
    const state = createState();
    player(state, '1').fighters[0].currentHp = 0;
    const alive = runFact(state, 'PLAYERS', { alive: true });
    expect(alive.value.map(entry => entry.playerId)).toEqual(['0']);
    expect(runFact(state, 'PLAYERS', { alive: true, min: 2 }).ok).toBe(false);
  });

  it('NEXT_PLAYER: playerId null — первый живой по order', () => {
    const state = createState({
      phase: 'turnStart',
      turn: { index: 0, playerId: null, actedRound: [] },
    });
    const next = runFact(state, 'NEXT_PLAYER', {});
    expect(next.ok).toBe(true);
    expect(next.value).toBe('0');
  });

  it('NEXT_PLAYER: следующий живой по order', () => {
    const state = createState({
      phase: 'turnStart',
      turn: { index: 1, playerId: '0', actedRound: ['0'] },
    });
    expect(runFact(state, 'NEXT_PLAYER', {}).value).toBe('1');
  });

  it('runFacts: цепочка AND + var', () => {
    const state = createState({
      turn: { playerId: null },
    });
    const { ok, vars } = runFacts(state, [
      { fact: 'PLAYERS', params: { alive: true, min: 2 }, var: 'alive' },
      { fact: 'NEXT_PLAYER', params: {}, var: 'next' },
    ]);
    expect(ok).toBe(true);
    expect(vars.alive).toHaveLength(2);
    expect(vars.next).toBe('0');
  });

  it('runFacts: false на втором триггере', () => {
    const state = createState();
    player(state, '1').fighters[0].currentHp = 0;
    const { ok, vars } = runFacts(state, [
      { fact: 'PLAYERS', params: { alive: true }, var: 'alive' },
      { fact: 'PLAYERS', params: { alive: true, min: 2 } },
    ]);
    expect(ok).toBe(false);
    expect(vars.alive).toHaveLength(1);
  });

  it('NEXT_PLAYER пропускает мёртвого', () => {
    const state = createState({
      phase: 'turnStart',
      turn: { index: 1, playerId: '0', actedRound: ['0'] },
    });
    player(state, '1').fighters[0].currentHp = 0;
    expect(runFact(state, 'NEXT_PLAYER', {}).value).toBe('0');
  });

  it('команда: без своего героя и помощников игрок выбывает, союзник жив', () => {
    const state = createState({
      settings: { format: 'teams_2v2' },
      players: [
        {
          id: '0',
          order: 1,
          team: 'A',
          fighters: [fighter({ id: 'a', type: 'hero', currentHp: 0 })],
        },
        {
          id: '1',
          order: 2,
          team: 'A',
          fighters: [fighter({ id: 'b', type: 'hero', currentHp: 10 })],
        },
      ],
    });
    expect(isPlayerAlive(state, player(state, '0'))).toBe(false);
    expect(isPlayerAlive(state, player(state, '1'))).toBe(true);
    expect(runFact(state, 'PLAYERS', { alive: true }).value).toHaveLength(1);
  });

  it('команда: без героя в team мёртв, даже с живыми помощниками', () => {
    const state = createState({
      settings: { format: 'teams_2v2' },
      players: [
        {
          id: '0',
          order: 1,
          team: 'A',
          fighters: [
            fighter({ id: 'a', type: 'hero', currentHp: 0 }),
            fighter({ id: 'pawn', type: 'assistant', currentHp: 3 }),
          ],
        },
        {
          id: '1',
          order: 2,
          team: 'B',
          fighters: [fighter({ id: 'b', type: 'hero', currentHp: 10 })],
        },
      ],
    });
    expect(isPlayerAlive(state, player(state, '0'))).toBe(false);
  });

  it('команда: мёртвый герой + помощники + живой герой союзника', () => {
    const state = createState({
      settings: { format: 'teams_2v2' },
      players: [
        {
          id: '0',
          order: 1,
          team: 'A',
          fighters: [
            fighter({ id: 'a', type: 'hero', currentHp: 0 }),
            fighter({ id: 'pawn', type: 'assistant', currentHp: 3 }),
          ],
        },
        {
          id: '1',
          order: 2,
          team: 'A',
          fighters: [fighter({ id: 'b', type: 'hero', currentHp: 10 })],
        },
      ],
    });
    expect(isPlayerAlive(state, player(state, '0'))).toBe(true);
  });
});
