import { describe, expect, it } from 'vitest';
import { adaptPartyView } from '../../../app/utils/adaptPartyView.js';
import { createGame } from '../../../server/create.js';
import { view } from '../../../server/party.js';

/** Дуэль на настоящем сервере: проекция `view()` — ровно то, что приходит клиенту. */
const duel = () =>
  createGame(
    {
      mapId: 'generated',
      mode: 'hotseat',
      heroes: [
        { heroId: 'medusa', team: 'A', order: 1, control: 'human' },
        { heroId: 'tesla', team: 'B', order: 2, control: 'human' },
      ],
    },
    { testId: 'adapt_view', testSeed: 7 },
  );

describe('adaptPartyView: проекция сервера → view клиента', () => {
  it('хук становится phase, объект turn — числами, из зон остаются рука и число карт в колоде', () => {
    const state = duel();
    const [first, second] = state.players;
    const raw = view(state, first.id);
    const adapted = adaptPartyView(raw);

    expect(adapted.phase).toBe(raw.hook);
    expect(adapted.currentPlayer).toBe(raw.turn.playerId);
    expect(adapted.turn).toBe(raw.turn.index);
    expect(adapted.actionsLeft).toBe(raw.turn.actionsLeft);
    expect(adapted.winner).toBeNull();

    const mine = adapted.players.find(p => String(p.id) === String(first.id));
    const enemy = adapted.players.find(p => String(p.id) === String(second.id));

    // своя рука — список карт, чужая закрыта сервером и превращается в пустой список
    expect(mine.hand.length).toBeGreaterThan(0);
    expect(mine.hand[0].instanceId ?? mine.hand[0].id).toBeTruthy();
    expect(enemy.hand).toEqual([]);
    // колода закрыта всем: клиент показывает её размером
    expect(mine.deckCount).toBeGreaterThan(0);
    expect(typeof enemy.deckCount).toBe('number');

    // deck/discard/счётчики клиенту не нужны — адаптер их не считает
    for (const key of ['deck', 'discard', 'handCount', 'discardCount']) {
      expect(mine).not.toHaveProperty(key);
    }
  });

  it('пустой ответ — null: клиент не падает на несостоявшемся запросе', () => {
    expect(adaptPartyView(null)).toBeNull();
    expect(adaptPartyView(undefined)).toBeNull();
  });
});
