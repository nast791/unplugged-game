import { describe, expect, it } from 'vitest';
import { load, view } from '../../../server/party.js';
import { createGame } from '../../../server/api/game/create.post.js';
import { sortPlayersByTeam } from '../../../server/builders.js';

const validBody = {
  mapId: 'arena',
  mode: 'vs_ai',
  heroes: [
    { heroId: 'medusa', team: 'A', order: 1, control: 'human' },
    { heroId: 'beta', team: 'B', order: 2, control: 'ai' },
  ],
};

describe('POST /api/game/create', () => {
  it('createGame → state на сервере; view скрывает чужие позиции на gameStart', () => {
    createGame(validBody, { testId: 'test_game', testSeed: 42 });
    const state = load('test_game');
    expect(state.settings.seed).toBe(42);
    expect(state.players[0].hand.cards).toHaveLength(5);

    const v = view(state, 'medusa');
    expect(v.id).toBe('test_game');
    expect(v.settings.seed).toBeUndefined();
    expect(
      v.players.find(p => p.id === 'beta').fighters.find(f => f.type === 'hero')
        .currentPosition,
    ).toBeNull();
    expect(
      v.players.find(p => p.id === 'medusa').fighters.find(f => f.type === 'hero')
        .currentPosition,
    ).toBe(6);
    expect(state._enteredHooks?.gameStart).toBe(true);
    expect(v.ui?.phase).toBe('place');
  });

  it('mode по умолчанию — vs_ai', () => {
    createGame(
      {
        mapId: 'arena',
        heroes: [
          { heroId: 'medusa', team: 'A', order: 1, control: 'human' },
          { heroId: 'beta', team: 'B', order: 2, control: 'ai' },
        ],
      },
      { testId: 'default_mode', testSeed: 1 },
    );
    expect(load('default_mode').settings.mode).toBe('vs_ai');
  });

  it('vs_ai: два human → ошибка', () => {
    expect(() =>
      createGame({
        mapId: 'arena',
        mode: 'vs_ai',
        heroes: [
          { heroId: 'medusa', team: 'A', order: 1, control: 'human' },
          { heroId: 'beta', team: 'B', order: 2, control: 'human' },
        ],
      }),
    ).toThrow(/vs_ai/);
  });

  it('hotseat: ai слот → ошибка', () => {
    expect(() =>
      createGame({
        mapId: 'arena',
        mode: 'hotseat',
        heroes: validBody.heroes,
      }),
    ).toThrow(/hotseat/);
  });

  it('ffa: одинаковая team → ошибка', () => {
    expect(() =>
      createGame({
        mapId: 'arena',
        mode: 'hotseat',
        heroes: [
          { heroId: 'medusa', team: 'A', order: 1, control: 'human' },
          { heroId: 'beta', team: 'A', order: 2, control: 'human' },
        ],
      }),
    ).toThrow(/FFA/);
  });

  it('невалидное тело → ошибка', () => {
    expect(() => createGame({ mapId: 'unknown', heroes: [] })).toThrow();
  });

  it('shuffle детерминирован при одном seed', () => {
    createGame(validBody, { testId: 'shuffle_a', testSeed: 99 });
    createGame(validBody, { testId: 'shuffle_b', testSeed: 99 });
    const a = load('shuffle_a').players[0].hand.cards.map(c => c.id);
    const b = load('shuffle_b').players[0].hand.cards.map(c => c.id);
    expect(a).toEqual(b);
  });

  it('sortPlayersByTeam: A,A,B,B → A,B,A,B', () => {
    const playerSlots = sortPlayersByTeam([
      { heroId: 'medusa', team: 'A', order: 1, control: 'human' },
      { heroId: 'alice', team: 'A', order: 2, control: 'human' },
      { heroId: 'beta', team: 'B', order: 3, control: 'ai' },
      { heroId: 'gamma', team: 'B', order: 4, control: 'ai' },
    ]);
    expect(playerSlots.map(slot => slot.team)).toEqual(['A', 'B', 'A', 'B']);
    expect(playerSlots.map(slot => slot.heroId)).toEqual([
      'medusa',
      'beta',
      'alice',
      'gamma',
    ]);
    expect(playerSlots.map(slot => slot.order)).toEqual([1, 2, 3, 4]);
  });

  it('sortPlayersByTeam: уже чередуются — порядок внутри команд сохраняется', () => {
    const playerSlots = sortPlayersByTeam([
      { heroId: 'medusa', team: 'A', order: 1, control: 'human' },
      { heroId: 'beta', team: 'B', order: 2, control: 'ai' },
      { heroId: 'alice', team: 'A', order: 3, control: 'human' },
      { heroId: 'gamma', team: 'B', order: 4, control: 'ai' },
    ]);
    expect(playerSlots.map(slot => slot.heroId)).toEqual([
      'medusa',
      'beta',
      'alice',
      'gamma',
    ]);
  });
});
