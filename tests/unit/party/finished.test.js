import { describe, expect, it } from 'vitest';
import { load, save } from '../../../server/party.js';

describe('party: завершённая партия', () => {
  it('партия на gameEnd в памяти не остаётся', () => {
    save({ id: 'finished_1', hook: 'gameEnd', winner: '0', players: [] });
    expect(load('finished_1')).toBeNull();
  });

  it('идущая партия хранится', () => {
    save({ id: 'running_1', hook: 'turn', winner: null, players: [] });
    expect(load('running_1')?.hook).toBe('turn');
  });
});
