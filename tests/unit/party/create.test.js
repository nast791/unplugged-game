import { describe, expect, it } from 'vitest';
import { load } from '../../../server/party.js';
import { createGame } from '../../../server/api/game/create.post.js';

const validBody = {
  mapId: 'arena',
  mode: 'vs_ai',
  heroes: [
    { heroId: 'medusa', team: 'A', order: 1, control: 'human' },
    { heroId: 'beta', team: 'B', order: 2, control: 'ai' },
  ],
};

describe('POST /api/game/create', () => {
  it('валидное тело → id, seed, map.connections, без карт в ответе', () => {
    const res = createGame(validBody, { testId: 'test_game', testSeed: 42 });
    expect(res.id).toBe('test_game');
    expect(res.settings.seed).toBeUndefined();
    expect(res.settings.mode).toBe('vs_ai');
    expect(res.settings.format).toBe('ffa');
    expect(res.turn.playerId).toBe('medusa');
    expect(res.map.connections.length).toBeGreaterThan(0);
    expect(res.players[0].hand).toBeUndefined();

    const state = load('test_game');
    expect(state.players[0].hand.cards).toHaveLength(5);
    expect(state.players[0].heroId).toBe('medusa');
    expect(state.players[1].control).toBe('ai');
  });

  it('mode по умолчанию — vs_ai', () => {
    const res = createGame(
      {
        mapId: 'arena',
        heroes: [
          { heroId: 'medusa', team: 'A', order: 1, control: 'human' },
          { heroId: 'beta', team: 'B', order: 2, control: 'ai' },
        ],
      },
      { testId: 'default_mode', testSeed: 1 },
    );
    expect(res.settings.mode).toBe('vs_ai');
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
    const a = load(
      createGame(validBody, { testId: 'shuffle_a', testSeed: 99 }).id,
    ).players[0].hand.cards.map(c => c.id);
    const b = load(
      createGame(validBody, { testId: 'shuffle_b', testSeed: 99 }).id,
    ).players[0].hand.cards.map(c => c.id);
    expect(a).toEqual(b);
  });
});
