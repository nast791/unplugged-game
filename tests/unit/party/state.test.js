import { describe, expect, it } from 'vitest';
import { runAction } from '#shared/gameEngine.js';
import { load, save } from '../../../server/party.js';
import { createGame } from '../../../server/api/game/create.post.js';

const vsAiBody = {
  mapId: 'arena',
  mode: 'vs_ai',
  heroes: [
    { heroId: 'medusa', team: 'A', order: 1, control: 'human' },
    { heroId: 'beta', team: 'B', order: 2, control: 'ai' },
  ],
};

describe('party state', () => {
  it('save сохраняет next state после PLACE_FIGHTER', () => {
    createGame(vsAiBody, { testId: 'state_place', testSeed: 3 });
    const current = load('state_place');
    const medusa = current.players.find(player => player.id === 'medusa');
    const assistant = medusa.fighters.find(
      fighterEntry =>
        fighterEntry.type === 'assistant' && fighterEntry.currentPosition == null,
    );
    const cellId = current.map.nodes.find(
      node => Number(node.id) === 1,
    )?.id;

    const next = runAction(current, {
      type: 'PLACE_FIGHTER',
      playerId: 'medusa',
      fighterId: assistant.id,
      cellId,
    });
    save(structuredClone(next));

    const stored = load('state_place');
    expect(
      stored.players
        .find(player => player.id === 'medusa')
        .fighters.find(fighterEntry => fighterEntry.id === assistant.id)
        ?.currentPosition,
    ).toBe(cellId);
  });
});
