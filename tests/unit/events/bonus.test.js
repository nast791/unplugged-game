import { describe, expect, it } from 'vitest';
import { APPLY_BONUS } from '#shared/events/bonus.js';
import { createState, deck, discard, hand, player } from '../../fixtures/state.js';

describe('APPLY_BONUS', () => {
  it('сбрасывает карту и добавляет bonus к movement', () => {
    const state = createState();
    const p = player(state);
    const card = hand(p).find(c => c.id === 'fx');
    APPLY_BONUS(state, { cardId: card.instanceId, stat: 'movement' }, { player: p });
    expect(state.movement.bonus).toBe(2);
    expect(state.movement.bonusApplied).toBe(true);
    expect(hand(p).find(c => c.id === 'fx')).toBeUndefined();
    expect(discard(p).some(c => c.id === 'fx')).toBe(true);
  });

  it('не применяет events карты', () => {
    const state = createState();
    const p = player(state);
    const handBefore = hand(p).length;
    const deckBefore = deck(p).length;
    const card = hand(p).find(c => c.id === 'fx');
    APPLY_BONUS(state, { cardId: card.instanceId }, { player: p });
    expect(hand(p).length).toBe(handBefore - 1);
    expect(deck(p).length).toBe(deckBefore);
  });

  it('второй bonus за перемещение запрещён', () => {
    const state = createState();
    const p = player(state);
    APPLY_BONUS(
      state,
      { cardId: hand(p)[0].instanceId },
      { player: p },
    );
    expect(() =>
      APPLY_BONUS(state, { cardId: hand(p)[0].instanceId }, { player: p }),
    ).toThrow(/уже усилено/);
  });
});
