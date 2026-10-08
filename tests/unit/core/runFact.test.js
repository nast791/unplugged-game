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

  it('runFacts: $переменная из прошлого условия подставляется в params', () => {
    const state = createState({
      turn: { index: 1, playerId: '0', actedRound: ['0'] },
    });
    const { ok, vars } = runFacts(state, [
      { fact: 'NEXT_PLAYER', params: {}, var: 'enemy' },
      { fact: 'HAND', params: { of: '$enemy', min: 1 }, var: 'enemyCards' },
    ]);

    expect(vars.enemy).toBe('1');
    expect(ok).toBe(true);
    expect(vars.enemyCards.map(card => card.cardId)).toEqual(['bdef_0']);
  });

  it('runFacts: неизвестная $переменная — ошибка, а не пустая подстановка', () => {
    const state = createState();
    expect(() => runFacts(state, [{ fact: 'HAND', params: { of: '$nobody' } }])).toThrow(
      /не задана/,
    );
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

describe('COMBAT: открытый бой и итог', () => {
  /** Бой идёт: итога ещё нет, но бойцы и стороны известны. */
  const openCombat = {
    stage: 'reveal',
    attackerPlayerId: '0',
    defenderPlayerId: '1',
    attackerFighterId: 'alpha',
    targetFighterId: 'beta',
  };

  /** Тот же бой после расчёта: `winner` появляется только здесь. */
  const finishedCombat = {
    attackerPlayerId: '0',
    defenderPlayerId: '1',
    attackerFighterId: 'alpha',
    targetFighterId: 'beta',
    winner: 'attacker',
    winnerPlayerId: '0',
  };

  const stateFor = patch => createState(patch);

  it('во время битвы select видит бойцов: раньше отдавал пусто', () => {
    const state = stateFor({ combat: openCombat, lastCombat: null });

    expect(runFact(state, 'COMBAT', { select: 'self' }, { playerId: '0' }).value).toEqual([
      'alpha',
    ]);
    expect(runFact(state, 'COMBAT', { select: 'opponent' }, { playerId: '0' }).value).toEqual([
      'beta',
    ]);
    expect(runFact(state, 'COMBAT', { select: 'target' }, { playerId: '0' }).value).toEqual([
      'beta',
    ]);
  });

  it('исход открытого боя неизвестен: winner и loser молчат, а не угадывают', () => {
    const state = stateFor({ combat: openCombat, lastCombat: null });

    expect(runFact(state, 'COMBAT', { select: 'winner' }, { playerId: '0' }).ok).toBe(false);
    expect(runFact(state, 'COMBAT', { select: 'loser' }, { playerId: '0' }).ok).toBe(false);
  });

  it('после боя winner и loser — по итогу, а не по открытому бою', () => {
    const state = stateFor({
      combat: { ...openCombat, stage: 'close' },
      lastCombat: finishedCombat,
    });

    expect(runFact(state, 'COMBAT', { select: 'winner' }, { playerId: '0' }).value).toEqual([
      'alpha',
    ]);
    expect(runFact(state, 'COMBAT', { select: 'loser' }, { playerId: '0' }).value).toEqual([
      'beta',
    ]);
  });

  it('победил защитник — winner и loser не меняются местами', () => {
    const state = stateFor({
      combat: { ...openCombat, stage: 'close' },
      lastCombat: { ...finishedCombat, winner: 'defender', winnerPlayerId: '1' },
    });

    expect(runFact(state, 'COMBAT', { select: 'winner' }, { playerId: '0' }).value).toEqual([
      'beta',
    ]);
    expect(runFact(state, 'COMBAT', { select: 'loser' }, { playerId: '0' }).value).toEqual([
      'alpha',
    ]);
  });

  it('факт без параметров — про завершённый бой, а не про идущий', () => {
    expect(runFact(stateFor({ combat: openCombat, lastCombat: null }), 'COMBAT', {}).ok).toBe(
      false,
    );
    expect(
      runFact(
        stateFor({ combat: { ...openCombat, stage: 'close' }, lastCombat: finishedCombat }),
        'COMBAT',
        {},
      ).ok,
    ).toBe(true);
  });
});
