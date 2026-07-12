import { describe, expect, it } from 'vitest';
import { APPLY_BONUS } from '#shared/events/bonus.js';
import { createState, player } from '../../fixtures/state.js';

describe('APPLY_BONUS', () => {
  it('сбрасывает карту и добавляет bonus к movement', () => {
    const state = createState();
    const p = player(state);
    const card = p.hand.find(c => c.id === 'fx');
    APPLY_BONUS(state, { cardId: card.instanceId, stat: 'movement' }, { player: p });
    expect(state.movement.bonus).toBe(2);
    expect(state.movement.bonusApplied).toBe(true);
    expect(p.hand.find(c => c.id === 'fx')).toBeUndefined();
    expect(p.discard.some(c => c.id === 'fx')).toBe(true);
  });

  it('не применяет events карты', () => {
    const state = createState();
    const p = player(state);
    const handBefore = p.hand.length;
    const deckBefore = p.deck.length;
    const card = p.hand.find(c => c.id === 'fx');
    APPLY_BONUS(state, { cardId: card.instanceId }, { player: p });
    // сброс −1 hand; DRAW из events не сработал
    expect(p.hand.length).toBe(handBefore - 1);
    expect(p.deck.length).toBe(deckBefore);
  });

  it('второй bonus за перемещение запрещён', () => {
    const state = createState();
    const p = player(state);
    APPLY_BONUS(
      state,
      { cardId: p.hand[0].instanceId },
      { player: p },
    );
    expect(() =>
      APPLY_BONUS(state, { cardId: p.hand[0].instanceId }, { player: p }),
    ).toThrow(/уже усилено/);
  });
});
