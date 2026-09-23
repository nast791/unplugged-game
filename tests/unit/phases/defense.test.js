import { describe, expect, it } from 'vitest';
import { resolvePhaseHint } from '#shared/helpers/base.js';
import turn from '#shared/lifecycle/turn.js';
import attack from '#shared/phases/attack.js';
import choose from '#shared/phases/choose.js';
import defense from '#shared/phases/defense.js';
import { ap, createState, discard, player } from '../../fixtures/state.js';

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(fighter => fighter.id === fighterId);

/** Бой: alpha (attackRange 2) бьёт beta картой atk_0; защитник — игрок 1. */
const battleState = (patch = {}) => {
  const state = createState();
  fighterOf(state, '0', 'alpha').attackRange = 2;
  if (patch.defenderHp != null) {
    fighterOf(state, '1', 'beta').currentHp = patch.defenderHp;
  }

  choose.moves.PICK(state, { kind: 'card', id: 'atk_0', playerId: '0' });
  attack.moves.PICK(state, { kind: 'fighter', id: 'beta', playerId: '0' });
  return state;
};

/** Как core выбирает фазу: первая активная в hook.phases. */
const activePhase = (state, playerId) =>
  turn.phases.find(phase => phase.active?.(state, playerId)) ?? null;

const uiOf = (phase, state, playerId, clientContext = {}) =>
  phase.ui(state, playerId, clientContext, phase);

describe('phase defense', () => {
  it('активна только у защитника; приоритет фаз отдаёт её вместо waiting', () => {
    const state = battleState();
    expect(defense.active(state, '1')).toBe(true);
    expect(defense.active(state, '0')).toBe(false);
    expect(activePhase(state, '1')?.name).toBe('defense');
    expect(activePhase(state, '0')?.name).toBe('attack');
  });

  it('подсказки: с картой защиты и без неё', () => {
    const state = battleState();
    expect(resolvePhaseHint(defense.hints, state, '1')).toMatch(
      /Защититесь картой/,
    );

    player(state, '1').hand.cards = [];
    expect(resolvePhaseHint(defense.hints, state, '1')).toMatch(
      /Карт защиты нет/,
    );
  });

  it('ui: playable только карты защиты, подсвечен атакующий, кнопка активна', () => {
    const state = battleState();
    const ui = uiOf(defense, state, '1');

    expect(ui.playableCardIds).toEqual(['bdef_0']);
    expect(ui.disabledCardIds).toEqual([]);
    expect(ui.highlightedFighterIds).toEqual(['alpha']);
    expect(ui.framedFighterIds).toEqual(['beta']);
    expect(ui.deck.clickable).toBe(false);
    expect(ui.controls.ok).toEqual({
      visible: true,
      enabled: true,
      label: 'Закончить действие',
    });
  });

  it('клик по карте защиты: урон уменьшается, бой закрыт, карты в сбросе', () => {
    const state = battleState();
    defense.moves.PICK(state, { kind: 'card', id: 'bdef_0', playerId: '1' });

    expect(state.combat).toBeNull();
    expect(fighterOf(state, '1', 'beta').currentHp).toBe(12);
    expect(state.lastCombat.combatDamage).toBe(1);
    expect(state.lastCombat.defendedWithCard).toBe(true);
    expect(discard(player(state, '0')).map(card => card.instanceId)).toEqual([
      'atk_0',
    ]);
    expect(discard(player(state, '1')).map(card => card.instanceId)).toEqual([
      'bdef_0',
    ]);
    expect(activePhase(state, '0')?.name).toBe('choose');
    expect(activePhase(state, '1')?.name).toBe('waiting');
  });

  it('пас кнопкой: весь урон, своё действие защитник не тратит', () => {
    const state = battleState();
    const actionsBefore = ap(state);

    defense.ok.onPress(state, { type: 'UI_OK', playerId: '1' });

    expect(fighterOf(state, '1', 'beta').currentHp).toBe(9);
    expect(state.lastCombat.defendedWithCard).toBe(false);
    expect(state.lastCombat.combatDamage).toBe(4);
    expect(ap(state)).toBe(actionsBefore);
    expect(state.combat).toBeNull();
  });

  it('отклоняет клик не по карте и попытки атакующего', () => {
    const state = battleState();
    expect(() =>
      defense.moves.PICK(state, { kind: 'fighter', id: 'beta', playerId: '1' }),
    ).toThrow(/карте защиты/);
    expect(() =>
      attack.moves.PICK(state, { kind: 'fighter', id: 'beta', playerId: '0' }),
    ).toThrow(/некого/);
  });

  it('после смертельного урона партия завершается', () => {
    const state = battleState({ defenderHp: 1 });

    defense.ok.onPress(state, { type: 'UI_OK', playerId: '1' });

    expect(player(state, '1').fighters).toHaveLength(0);
    expect(state.hook).toBe('gameEnd');
    expect(state.winner).toBe('0');
    // Действия и моменты нормализует gameEnd.enter в runLifecycle, фаза только помечает финал.
    expect(ap(state)).toBe(1);
  });
});
