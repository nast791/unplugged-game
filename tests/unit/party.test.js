import { describe, expect, it } from 'vitest';
import { load } from '../../server/party.js';
import { view } from '../../server/party.js';
import { createGame } from '../../server/create.js';

const heroes = [
  { heroId: 'medusa', team: 'A', order: 1, control: 'human' },
  { heroId: 'tesla', team: 'B', order: 2, control: 'human' },
];

const makeGame = (id, seed, heroList = heroes) => {
  createGame({ mapId: 'arena', mode: 'hotseat', heroes: heroList }, { testId: id, testSeed: seed });
  return load(id);
};

describe('party', () => {
  it('create: medusa/tesla, зоны, log', () => {
    const state = makeGame('test_party_1', 7);
    expect(state.hook).toBe('gameStart');
    expect(state.players.map(p => p.id)).toEqual(['medusa', 'tesla']);
    expect(state.turn.actionsTotal).toBe(2);
    expect(state.players[0].hand.cards).toHaveLength(5);
    expect(state.players[0].hand.cards[0].instanceId).toMatch(/_[1-9]\d*$/);
    expect(state.players[0].fighters.filter(f => f.group === 'harpies')).toHaveLength(3);
  });

  it('view: рука союзника видна', () => {
    const state = makeGame('test_party_team', 11);
    state.players.find(p => p.id === 'tesla').team = 'A';
    state.settings.heroes.find(h => h.heroId === 'tesla').team = 'A';
    const v = view(state, 'medusa');
    expect(v.players.find(p => p.id === 'tesla').hand.cards).toHaveLength(5);
  });

  it('view: чужая рука скрыта, attackCard срезан', () => {
    const state = makeGame('test_party_2', 3);
    state.combat = {
      attackerPlayerId: 'medusa',
      defenderPlayerId: 'tesla',
      attackValue: 2,
      attackCard: { id: 'x' },
      defenseCard: null,
    };
    const v = view(state, 'tesla');
    expect(v.players.find(p => p.id === 'medusa').hand.cards).toBeUndefined();
    expect(v.players.find(p => p.id === 'tesla').hand.cards).toHaveLength(5);
    expect(v.combat.attackCard).toBeUndefined();
    expect(
      v.players.find(p => p.id === 'medusa').fighters.find(f => f.type === 'hero').currentPosition,
    ).toBeNull();
  });
});
