import { describe, expect, it } from 'vitest';
import { rules } from '#shared/constants/rules.js';
import { runFact } from '#shared/core.js';
import { createState, player } from '../../fixtures/state.js';

describe('facts хода (facts-new)', () => {
  it('ACTIVE_PLAYER: чей ход', () => {
    const state = createState();
    expect(runFact(state, 'ACTIVE_PLAYER', {}, { playerId: '0' }).ok).toBe(true);
    expect(runFact(state, 'ACTIVE_PLAYER', {}, { playerId: '1' }).ok).toBe(false);
    expect(runFact(state, 'ACTIVE_PLAYER', { id: '1' }).ok).toBe(false);
    expect(runFact(state, 'ACTIVE_PLAYER', {}).value).toBe('0');
  });

  it('AP: остаток действий с минимумом', () => {
    const state = createState({ actionsLeft: 2 });
    expect(runFact(state, 'AP', {}).value).toBe(2);
    expect(runFact(state, 'AP', { min: 2 }).ok).toBe(true);
    expect(runFact(state, 'AP', { min: 3 }).ok).toBe(false);
  });

  it('IN_PROGRESS: момент в работе и чей он', () => {
    const state = createState();
    state.movement = { playerId: '0', origins: {}, bonus: 0 };

    expect(
      runFact(state, 'IN_PROGRESS', { has: 'movement' }, { playerId: '0' }).ok,
    ).toBe(true);
    expect(
      runFact(state, 'IN_PROGRESS', { has: 'movement' }, { playerId: '1' }).ok,
    ).toBe(false);
    expect(
      runFact(
        state,
        'IN_PROGRESS',
        { has: 'movement', mine: false },
        { playerId: '1' },
      ).ok,
    ).toBe(true);
    expect(runFact(state, 'IN_PROGRESS', { has: 'combat' }).ok).toBe(false);
    expect(runFact(state, 'IN_PROGRESS', {}, { playerId: '0' }).value.name).toBe(
      'movement',
    );
  });

  it('IN_PROGRESS: бой принадлежит обеим сторонам', () => {
    const state = createState();
    state.combat = { attackerPlayerId: '0', defenderPlayerId: '1' };
    expect(runFact(state, 'IN_PROGRESS', { has: 'combat' }, { playerId: '1' }).ok).toBe(
      true,
    );
    expect(runFact(state, 'IN_PROGRESS', { has: 'combat' }, { playerId: '2' }).ok).toBe(
      false,
    );
  });

  it('TARGETING: открытый выбор цели и чей он', () => {
    const state = createState();
    expect(runFact(state, 'TARGETING', {}, { playerId: '0' }).ok).toBe(false);

    state.targeting = {
      playerId: '0',
      source: 'skill',
      required: false,
      candidates: [{ fighterId: 'beta', playerId: '1', position: 10 }],
      picked: null,
    };

    expect(runFact(state, 'TARGETING', {}, { playerId: '0' }).ok).toBe(true);
    expect(runFact(state, 'TARGETING', {}, { playerId: '1' }).ok).toBe(false);
    expect(runFact(state, 'TARGETING', { mine: false }, { playerId: '1' }).ok).toBe(
      true,
    );
    expect(
      runFact(state, 'TARGETING', { mine: false }).value.candidates,
    ).toHaveLength(1);
  });

  it('PICKED: отмеченные бойцы открытого окна', () => {
    const state = createState();
    expect(runFact(state, 'PICKED', {}).ok).toBe(false);

    state.targeting = {
      playerId: '0',
      source: 'medusa_skill',
      required: false,
      count: 1,
      candidates: [{ fighterId: 'beta', playerId: '1', position: 10 }],
      picked: 'beta',
    };
    expect(runFact(state, 'PICKED', {}).value).toEqual(['beta']);

    state.targeting.picked = ['beta', 'pawn'];
    expect(runFact(state, 'PICKED', { min: 2 }).value).toEqual([
      'beta',
      'pawn',
    ]);
  });

  it('HAND: карты руки по типу', () => {
    const state = createState();
    const attacks = runFact(state, 'HAND', { type: 'attack' }, { playerId: '0' });
    expect(attacks.value.map(card => card.cardId)).toEqual(['atk_0']);
    expect(runFact(state, 'HAND', { min: 4 }, { playerId: '0' }).ok).toBe(false);
    expect(runFact(state, 'HAND', {}, { playerId: '0' }).value).toHaveLength(3);
  });

  it('HAND_OVER_LIMIT: лимит руки', () => {
    const state = createState();
    const inLimit = runFact(state, 'HAND_OVER_LIMIT', {}, { playerId: '0' });
    expect(inLimit.ok).toBe(false);
    expect(inLimit.value.mustDiscard).toBe(0);

    player(state, '0').hand.cards = Array.from(
      { length: rules.maxHandSize + 2 },
      (_, index) => ({
        id: `x${index}`,
        instanceId: `x${index}_0`,
        type: 'effect',
      }),
    );
    const over = runFact(state, 'HAND_OVER_LIMIT', {}, { playerId: '0' });
    expect(over.ok).toBe(true);
    expect(over.value.mustDiscard).toBe(2);
  });

  it('FIGHTERS: side, type, reachableTo, min', () => {
    const state = createState();
    const own = runFact(state, 'FIGHTERS', { side: 'self' }, { playerId: '0' });
    expect(own.value.map(entry => entry.fighterId)).toEqual(['alpha', 'pawn']);

    const enemies = runFact(
      state,
      'FIGHTERS',
      { side: 'opponent' },
      { playerId: '0' },
    );
    expect(enemies.value.map(entry => entry.fighterId)).toEqual(['beta']);

    const assistants = runFact(state, 'FIGHTERS', { type: 'assistant' });
    expect(assistants.value.map(entry => entry.fighterId)).toEqual(['pawn']);

    const canReachBeta = runFact(
      state,
      'FIGHTERS',
      { side: 'self', reachableTo: 'beta' },
      { playerId: '0' },
    );
    expect(canReachBeta.value.map(entry => entry.fighterId)).toEqual(['pawn']);

    expect(runFact(state, 'FIGHTERS', { min: 4 }).ok).toBe(false);
  });

  it('FIGHTERS: areaOf — бойцы одной области', () => {
    const state = createState();
    state.map.nodes = [
      { id: 8, neighbors: [9], areas: ['#111'] },
      { id: 9, neighbors: [8, 10], areas: ['#111'] },
      { id: 10, neighbors: [9], areas: ['#222'] },
    ];
    const same = runFact(state, 'FIGHTERS', { areaOf: 'alpha' });
    expect(same.value.map(entry => entry.fighterId)).toEqual(['alpha', 'pawn']);
  });

  it('FIGHTERS: нерасставленный ориентир даёт пустой список', () => {
    const state = createState();
    player(state, '0').fighters[0].currentPosition = null;
    expect(runFact(state, 'FIGHTERS', { areaOf: 'alpha' }).value).toEqual([]);
  });

  it('ALIVE_SIDES: сколько сторон живо', () => {
    const state = createState();
    expect(runFact(state, 'ALIVE_SIDES', {}).value).toBe(2);
    expect(runFact(state, 'ALIVE_SIDES', { max: 1 }).ok).toBe(false);

    player(state, '1').fighters[0].currentHp = 0;
    expect(runFact(state, 'ALIVE_SIDES', { max: 1 }).ok).toBe(true);
  });
});
