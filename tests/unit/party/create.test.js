import { describe, expect, it } from 'vitest';
import { load, view } from '../../../server/party.js';
import { createGame } from '../../../server/create.js';
import { sortPlayersByTeam } from '../../../server/builders.js';
import { maps } from '../../../server/content/index.js';

const validBody = {
  mapId: 'generated',
  mode: 'vs_ai',
  heroes: [
    { heroId: 'medusa', team: 'A', order: 1, control: 'human' },
    { heroId: 'tesla', team: 'B', order: 2, control: 'ai' },
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
      v.players.find(p => p.id === 'tesla').fighters.find(f => f.type === 'hero').currentPosition,
    ).toBeNull();
    expect(
      v.players.find(p => p.id === 'medusa').fighters.find(f => f.type === 'hero').currentPosition,
    ).not.toBeNull();
    expect(state._enteredHooks?.gameStart).toBe(true);
    expect(v.ui?.phase).toBe('place');
  });

  it('mode по умолчанию — vs_ai', () => {
    createGame(
      {
        mapId: 'generated',
        heroes: [
          { heroId: 'medusa', team: 'A', order: 1, control: 'human' },
          { heroId: 'tesla', team: 'B', order: 2, control: 'ai' },
        ],
      },
      { testId: 'default_mode', testSeed: 1 },
    );
    expect(load('default_mode').settings.mode).toBe('vs_ai');
  });

  it('vs_ai: два human → ошибка', () => {
    expect(() =>
      createGame({
        mapId: 'generated',
        mode: 'vs_ai',
        heroes: [
          { heroId: 'medusa', team: 'A', order: 1, control: 'human' },
          { heroId: 'tesla', team: 'B', order: 2, control: 'human' },
        ],
      }),
    ).toThrow(/vs_ai/);
  });

  it('hotseat: ai слот → ошибка', () => {
    expect(() =>
      createGame({
        mapId: 'generated',
        mode: 'hotseat',
        heroes: validBody.heroes,
      }),
    ).toThrow(/hotseat/);
  });

  it('ffa: одинаковая team → ошибка', () => {
    expect(() =>
      createGame({
        mapId: 'generated',
        mode: 'hotseat',
        heroes: [
          { heroId: 'medusa', team: 'A', order: 1, control: 'human' },
          { heroId: 'tesla', team: 'A', order: 2, control: 'human' },
        ],
      }),
    ).toThrow(/FFA/);
  });

  it('невалидное тело → ошибка', () => {
    expect(() => createGame({ mapId: 'unknown', heroes: [] })).toThrow();
  });

  it('карта с клеткой без стихии или с чужой стихией не берётся в партию', () => {
    maps.broken_missing = {
      id: 'broken_missing',
      name: 'Битая карта',
      nodes: [
        { id: 1, neighbors: [2], terrain: 'ice', heroStart: true, position: 1 },
        { id: 2, neighbors: [1], terrain: null },
      ],
      settings: { nodeSize: 120 },
    };
    maps.broken_unknown = {
      id: 'broken_unknown',
      name: 'Карта с чужой стихией',
      nodes: [
        { id: 1, neighbors: [2], terrain: 'ice', heroStart: true, position: 1 },
        { id: 2, neighbors: [1], terrain: ['ice', 'нет-такой'] },
      ],
      settings: { nodeSize: 120 },
    };
    try {
      expect(() => createGame({ ...validBody, mapId: 'broken_missing' })).toThrow(/нет стихии/);
      expect(() => createGame({ ...validBody, mapId: 'broken_unknown' })).toThrow(
        /неизвестная стихия/,
      );
    } finally {
      delete maps.broken_missing;
      delete maps.broken_unknown;
    }
  });

  it('shuffle детерминирован при одном seed', () => {
    createGame(validBody, { testId: 'shuffle_a', testSeed: 99 });
    createGame(validBody, { testId: 'shuffle_b', testSeed: 99 });
    const a = load('shuffle_a').players[0].hand.cards.map(c => c.id);
    const b = load('shuffle_b').players[0].hand.cards.map(c => c.id);
    expect(a).toEqual(b);
  });

  it('сид, размер поля и лимит времени из лобби попадают в настройки партии', () => {
    const state = createGame(
      { ...validBody, seed: 777, cells: 30, turnLimit: 60, mode: 'table' },
      { testId: 'lobby_settings' },
    );
    expect(state.settings.seed).toBe(777);
    expect(state.settings.cells).toBe(30);
    expect(state.settings.turnLimit).toBe(60);
    // «Авто» — размер выбирает генератор по сиду, а лимита нет: в настройках это null и 0.
    const auto = createGame({ ...validBody, mode: 'table' }, { testId: 'lobby_auto', testSeed: 5 });
    expect(auto.settings.cells).toBeNull();
    expect(auto.settings.turnLimit).toBe(0);
    expect(view(auto, 'medusa').settings.turnLimit).toBe(0);
  });

  it('тот же сид из лобби даёт то же поле и тот же порядок карт', () => {
    const body = { ...validBody, seed: 4242, mode: 'table' };
    const first = createGame(body, { testId: 'same_seed_a' });
    const second = createGame(body, { testId: 'same_seed_b' });
    expect(second.map.nodes.map(node => node.id)).toEqual(first.map.nodes.map(node => node.id));
    expect(second.players[0].hand.cards.map(card => card.id)).toEqual(
      first.players[0].hand.cards.map(card => card.id),
    );
  });

  it('сломанные сид, размер поля и лимит времени → ошибка', () => {
    expect(() => createGame({ ...validBody, seed: -1 })).toThrow(/seed/);
    expect(() => createGame({ ...validBody, seed: 1.5 })).toThrow(/seed/);
    expect(() => createGame({ ...validBody, cells: 27 })).toThrow(/cells/);
    expect(() => createGame({ ...validBody, cells: 39 })).toThrow(/cells/);
    expect(() => createGame({ ...validBody, turnLimit: -5 })).toThrow(/turnLimit/);
  });

  it('sortPlayersByTeam: A,A,B,B → A,B,A,B', () => {
    const playerSlots = sortPlayersByTeam([
      { heroId: 'medusa', team: 'A', order: 1, control: 'human' },
      { heroId: 'alice', team: 'A', order: 2, control: 'human' },
      { heroId: 'tesla', team: 'B', order: 3, control: 'ai' },
      { heroId: 'gamma', team: 'B', order: 4, control: 'ai' },
    ]);
    expect(playerSlots.map(slot => slot.team)).toEqual(['A', 'B', 'A', 'B']);
    expect(playerSlots.map(slot => slot.heroId)).toEqual(['medusa', 'tesla', 'alice', 'gamma']);
    expect(playerSlots.map(slot => slot.order)).toEqual([1, 2, 3, 4]);
  });

  it('sortPlayersByTeam: уже чередуются — порядок внутри команд сохраняется', () => {
    const playerSlots = sortPlayersByTeam([
      { heroId: 'medusa', team: 'A', order: 1, control: 'human' },
      { heroId: 'tesla', team: 'B', order: 2, control: 'ai' },
      { heroId: 'alice', team: 'A', order: 3, control: 'human' },
      { heroId: 'gamma', team: 'B', order: 4, control: 'ai' },
    ]);
    expect(playerSlots.map(slot => slot.heroId)).toEqual(['medusa', 'tesla', 'alice', 'gamma']);
  });
});
