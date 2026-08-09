import { describe, expect, it } from 'vitest';
import { SPEND_AP } from '#shared/events/spendAp.js';
import { ap, createState } from '../../fixtures/state.js';

describe('SPEND_AP', () => {
  it('уменьшает actionsLeft на 1', () => {
    const state = createState({ actionsLeft: 2 });
    SPEND_AP(state);
    expect(ap(state)).toBe(1);
  });

  it('бросает, если AP уже 0', () => {
    const state = createState({ actionsLeft: 0 });
    expect(() => SPEND_AP(state)).toThrow(/actionsLeft уже 0/);
  });
});
