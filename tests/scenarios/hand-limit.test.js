import { describe, expect, it } from 'vitest';
import { rules } from '#shared/constants/rules.js';
import { runUi } from '#shared/core.js';
import { runAction } from '#shared/gameEngine.js';
import { ap, createState, hand, PHASES, player } from '../fixtures/state.js';

const extraCard = index => ({
  id: `over${index}`,
  instanceId: `over${index}_0`,
  type: 'effect',
  value: 0,
  bonus: 1,
});

/** Ход игрока 0 с одним действием и переполненной рукой (3 своих + 7 сверх лимита). */
const overLimitState = () => {
  const state = createState({
    phase: PHASES.turn,
    actionsLeft: 1,
    _enteredHooks: { gameStart: true, turn: true },
  });
  const me = player(state, '0');
  me.hand.cards = [
    ...me.hand.cards.slice(0, 3),
    ...Array.from({ length: rules.maxHandSize }, (_, index) => extraCard(index)),
  ];
  return state;
};

describe('scenario: лимит руки в конце хода', () => {
  it('переполненная рука держит ход, сброс отдаёт его следующему игроку', () => {
    let state = overLimitState();
    expect(hand(player(state, '0'))).toHaveLength(rules.maxHandSize + 3);

    // объявляем перемещение (последнее действие) и закрываем его
    state = runAction(state, { type: 'PICK', kind: 'deck', playerId: '0' });
    state = runAction(state, { type: 'UI_OK', playerId: '0' });

    expect(ap(state)).toBe(0);
    expect(hand(player(state, '0'))).toHaveLength(rules.maxHandSize + 4);
    expect(state.hook).toBe(PHASES.turn);

    const ui = runUi(state, '0');
    expect(ui.phase).toBe('handLimit');
    expect(ui.hint).toContain('сбросьте ещё 4');
    expect(ui.playableCardIds).toHaveLength(rules.maxHandSize + 4);
    expect(ui.controls.ok.visible).toBe(false);

    // сбрасываем по одной карте, пока рука не влезет в лимит
    for (const cardId of ui.playableCardIds.slice(0, 4)) {
      state = runAction(state, {
        type: 'PICK',
        kind: 'card',
        id: cardId,
        playerId: '0',
      });
    }

    expect(hand(player(state, '0'))).toHaveLength(rules.maxHandSize);
    expect(state.hook).toBe(PHASES.turn);
    expect(state.turn.playerId).toBe('1');
    expect(ap(state)).toBe(rules.actionsPerTurn);
    expect(runUi(state, '1').phase).toBe('choose');
  });

  it('рука точно в лимите ход не задерживает', () => {
    let state = overLimitState();
    player(state, '0').hand.cards = hand(player(state, '0')).slice(
      0,
      rules.maxHandSize - 1,
    );

    state = runAction(state, { type: 'PICK', kind: 'deck', playerId: '0' });
    state = runAction(state, { type: 'UI_OK', playerId: '0' });

    expect(hand(player(state, '0'))).toHaveLength(rules.maxHandSize);
    expect(state.turn.playerId).toBe('1');
  });
});
