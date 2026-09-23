import { describe, expect, it } from 'vitest';
import { rules } from '#shared/constants/rules.js';
import { resolvePhaseHint } from '#shared/helpers/base.js';
import turn from '#shared/lifecycle/turn.js';
import choose from '#shared/phases/choose.js';
import handLimit from '#shared/phases/handLimit.js';
import { createState, hand, player } from '../../fixtures/state.js';

const overLimitState = (extra = 2) => {
  const state = createState({ actionsLeft: 0 });
  player(state, '0').hand.cards = Array.from(
    { length: rules.maxHandSize + extra },
    (_, index) => ({
      id: `x${index}`,
      instanceId: `x${index}_0`,
      type: 'effect',
      value: 0,
      bonus: 0,
    }),
  );
  return state;
};

const activePhaseOf = (state, playerId) =>
  turn.phases.find(phase => phase.active?.(state, playerId)) ?? null;

describe('phase handLimit', () => {
  it('активна только при переполненной руке в конце хода', () => {
    expect(handLimit.active(overLimitState(), '0')).toBe(true);
    expect(handLimit.active(overLimitState(), '1')).toBe(false);
    expect(handLimit.active(overLimitState(0), '0')).toBe(false);

    const inLimit = createState({ actionsLeft: 0 });
    expect(handLimit.active(inLimit, '0')).toBe(false);

    const withActions = overLimitState();
    withActions.turn.actionsLeft = 1;
    expect(handLimit.active(withActions, '0')).toBe(false);

    const withMoment = overLimitState();
    withMoment.movement = { playerId: '0', origins: {}, bonus: 0 };
    expect(handLimit.active(withMoment, '0')).toBe(false);
  });

  it('стоит первой в hook.phases и перебивает choose', () => {
    const state = overLimitState();
    expect(turn.phases[0].name).toBe('handLimit');
    expect(activePhaseOf(state, '0')?.name).toBe('handLimit');
    expect(choose.active(state, '0')).toBe(false);
  });

  it('подсказка считает, сколько сбросить; все карты playable', () => {
    const state = overLimitState(2);
    expect(resolvePhaseHint(handLimit.hints, state, '0')).toContain(
      'сбросьте ещё 2',
    );

    const ui = handLimit.ui(state, '0', {}, handLimit);
    expect(ui.playableCardIds).toHaveLength(rules.maxHandSize + 2);
    expect(ui.disabledCardIds).toEqual([]);
    expect(ui.controls.ok.visible).toBe(false);
    expect(ui.deck.clickable).toBe(false);
  });

  it('клик по карте сбрасывает её, пока рука не влезет в лимит', () => {
    const state = overLimitState(2);
    handLimit.moves.PICK(state, { kind: 'card', id: 'x0_0', playerId: '0' });

    expect(hand(player(state, '0'))).toHaveLength(rules.maxHandSize + 1);
    expect(handLimit.active(state, '0')).toBe(true);

    handLimit.moves.PICK(state, { kind: 'card', id: 'x1_0', playerId: '0' });

    expect(hand(player(state, '0'))).toHaveLength(rules.maxHandSize);
    expect(handLimit.active(state, '0')).toBe(false);
    expect(turn.body(state)).toBe(true);
  });

  it('отклоняет клик не по карте', () => {
    const state = overLimitState();
    expect(() =>
      handLimit.moves.PICK(state, { kind: 'deck', playerId: '0' }),
    ).toThrow(/клик по карте/);
  });
});
