import { describe, expect, it } from 'vitest';
import { rules } from '#shared/constants/rules.js';
import turn from '#shared/lifecycle/turn.js';
import { runAction, runLifecycle } from '#shared/publicApi.js';
import { createState, PHASES } from '../../fixtures/state.js';

const card = index => ({
  id: `c${index}`,
  instanceId: `c${index}_0`,
  type: 'effect',
  value: 0,
  bonus: 1,
});

const handOf = count => ({
  visibility: [],
  cards: Array.from({ length: count }, (_, index) => card(index)),
});

const turnState = patch => createState({ phase: PHASES.turn, ...patch });

describe('lifecycle turn: каркас хука', () => {
  it('enter помечает вход и не повторяется внутри хода', () => {
    const entered = turn.enter(turnState());
    expect(entered._enteredHooks.turn).toBe(true);

    entered.movement = { playerId: '0', origins: {}, bonus: 0 };
    const again = turn.enter(entered);
    expect(again.movement).toEqual({ playerId: '0', origins: {}, bonus: 0 });
  });

  it('enter снимает моменты прошлого действия', () => {
    const state = turnState();
    state.movement = { playerId: '0', origins: {}, bonus: 0 };
    state.combat = { stage: 'defense' };
    state.targeting = { playerId: '0', candidates: [] };

    const entered = turn.enter(state);
    expect(entered.movement).toBeNull();
    expect(entered.combat).toBeNull();
    expect(entered.targeting).toBeNull();
  });

  it('enter сохраняет итог последнего действия: его снимает объявление нового', () => {
    const state = turnState();
    state.lastCombat = { combatDamage: 1 };

    const entered = turn.enter(state);
    expect(entered.lastCombat).toEqual({ combatDamage: 1 });
  });

  it('body: ход не закрыт, пока есть действия', () => {
    const state = turn.enter(turnState({ actionsLeft: 1 }));
    expect(turn.body(state)).toBe(false);
  });

  it('body: ход не закрыт, пока идёт момент', () => {
    const moments = [
      { movement: { playerId: '0', origins: {}, bonus: 0 } },
      { combat: { stage: 'defense' } },
      { targeting: { playerId: '0', candidates: [] } },
    ];
    for (const moment of moments) {
      const state = { ...turnState({ actionsLeft: 0 }), ...moment };
      expect(turn.body(state)).toBe(false);
    }
  });

  it('body: ход не закрыт, пока рука сверх лимита', () => {
    const state = turnState({ actionsLeft: 0 });
    state.players[0].hand = handOf(rules.maxHandSize + 1);
    expect(turn.body(state)).toBe(false);
  });

  it('body: ход закрыт при 0 действий, без моментов и в лимите руки', () => {
    const state = turn.enter(turnState({ actionsLeft: 0 }));
    expect(turn.body(state)).toBe(true);
  });

  it('exit снимает моменты, флаг входа и активную фазу игроков', () => {
    const state = turnState({ actionsLeft: 0 });
    state.movement = { playerId: '0', origins: {}, bonus: 0 };
    state.players[0]._activePhase = 'movement';

    const exited = turn.exit(turn.enter(state));
    expect(exited.movement).toBeNull();
    expect(exited._enteredHooks.turn).toBe(false);
    expect(exited.players[0]._activePhase).toBeNull();
  });
});

/**
 * Счётчик действий хода: **знаменатель — это весь ход**, он не меняется, пока ход не кончился.
 * Объявленное действие списывает только остаток (`actionsLeft`), а `actionsTotal` растёт лишь тогда,
 * когда карта или умение выдаёт добавочное действие. Клиент рисует «осталось/всего», поэтому по
 * знаменателю игрок видит план хода, а не остаток (жалоба владельца на «1/1» посреди хода).
 */
describe('lifecycle turn: счётчик действий', () => {
  it('объявленное действие уменьшает остаток, а знаменатель хода не трогает', () => {
    let state = runLifecycle(turnState({ turn: { playerId: '0', actionsLeft: 2, actionsTotal: 2 } }));
    expect(`${state.turn.actionsLeft}/${state.turn.actionsTotal}`).toBe('2/2');

    state = runAction(state, { type: 'PICK', kind: 'deck', playerId: '0' });
    expect(`${state.turn.actionsLeft}/${state.turn.actionsTotal}`).toBe('1/2');

    state = runAction(state, { type: 'UI_OK', playerId: '0' });
    expect(`${state.turn.actionsLeft}/${state.turn.actionsTotal}`).toBe('1/2');
  });

  /**
   * Отметка сработавшего умения (`lastSkill`) живёт до первого объявленного действия своего хода:
   * объявление действия снимает её вместе с итогами прошлого действия. Раньше она оставалась в
   * состоянии навсегда, и плашка «Умение» на карточке висела до конца хода (жалоба владельца).
   */
  it('объявленное действие снимает отметку сработавшего умения', () => {
    const marked = runLifecycle(
      turnState({
        turn: { playerId: '0', actionsLeft: 2, actionsTotal: 2 },
        lastSkill: { playerId: '0', skillId: 'ifrit_skill', moment: 'turnStart' },
      }),
    );
    expect(marked.lastSkill).toEqual({ playerId: '0', skillId: 'ifrit_skill', moment: 'turnStart' });

    const declared = runAction(marked, { type: 'PICK', kind: 'deck', playerId: '0' });
    expect(declared.lastSkill).toBeNull();
    // вход не тронут: отметка снята на форке
    expect(marked.lastSkill).not.toBeNull();
  });
});
