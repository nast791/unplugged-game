import { describe, expect, it } from 'vitest';
import { resolvePhaseHint } from '#shared/helpers/base.js';
import attack from '#shared/phases/attack.js';
import choose from '#shared/phases/choose.js';
import movement from '#shared/phases/movement.js';
import waiting from '#shared/phases/waiting.js';
import { ap, createState, hand, player } from '../../fixtures/state.js';

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(fighter => fighter.id === fighterId);

const swingCard = () => ({
  id: 'swing',
  instanceId: 'swing_0',
  type: 'attack',
  value: 3,
  bonus: 0,
});

/** alpha (attackRange 2) на 8 достаёт beta на 10; карта atk привязана к alpha. */
const attackState = () => {
  const state = createState();
  fighterOf(state, '0', 'alpha').attackRange = 2;
  return state;
};

const uiOf = (phase, state, playerId, clientContext = {}) =>
  phase.ui(state, playerId, clientContext, phase);

describe('phase choose: объявление атаки', () => {
  it('карты атаки с достижимой целью playable, остальные disabled', () => {
    const state = attackState();
    player(state, '0').hand.cards.push(swingCard());

    const ui = uiOf(choose, state, '0');
    expect(ui.playableCardIds).toEqual(['atk_0', 'swing_0']);
    expect(ui.disabledCardIds).toEqual(['def_0', 'fx_0']);
  });

  it('карта, привязанная к бойцу без достижимой цели, недоступна', () => {
    const state = createState();
    const ui = uiOf(choose, state, '0');
    expect(ui.playableCardIds).toEqual([]);
    expect(ui.disabledCardIds).toEqual(['atk_0', 'def_0', 'fx_0']);
  });

  it('клик по карте атаки: −1 действие, карта уходит в закрытую', () => {
    const state = attackState();
    choose.moves.PICK(state, { kind: 'card', id: 'atk_0', playerId: '0' });

    expect(ap(state)).toBe(1);
    expect(hand(player(state, '0')).map(card => card.instanceId)).toEqual([
      'def_0',
      'fx_0',
    ]);
    expect(state.combat.stage).toBe('target');
    expect(state.combat.attackerFighterId).toBe('alpha');
    expect(choose.active(state, '0')).toBe(false);
    expect(attack.active(state, '0')).toBe(true);
    expect(attack.active(state, '1')).toBe(false);
  });

  it('отклоняет карту без целей, эффект и клик по полю', () => {
    expect(() =>
      choose.moves.PICK(createState(), {
        kind: 'card',
        id: 'atk_0',
        playerId: '0',
      }),
    ).toThrow(/не достаёт/);

    const reachable = attackState();
    expect(() =>
      choose.moves.PICK(reachable, {
        kind: 'card',
        id: 'fx_0',
        playerId: '0',
      }),
    ).toThrow(/не атакует/);
    expect(() =>
      choose.moves.PICK(reachable, { kind: 'cell', id: 9, playerId: '0' }),
    ).toThrow(/колода и карта атаки/);
  });
});

describe('phase attack', () => {
  const openSwing = () => {
    const state = attackState();
    player(state, '0').hand.cards.push(swingCard());
    choose.moves.PICK(state, { kind: 'card', id: 'swing_0', playerId: '0' });
    return state;
  };

  it('этапы объявления: кандидаты, выбор атакующего, выбор цели', () => {
    const state = openSwing();
    expect(state.combat.stage).toBe('attacker');

    let ui = uiOf(attack, state, '0');
    expect(ui.highlightedFighterIds).toEqual(['alpha', 'pawn']);
    expect(ui.framedFighterIds).toEqual(['alpha', 'pawn']);
    expect(resolvePhaseHint(attack.hints, state, '0')).toBe(
      'Выберите бойца, который атакует этой картой',
    );

    attack.moves.PICK(state, { kind: 'fighter', id: 'pawn', playerId: '0' });
    expect(state.combat.attackerFighterId).toBe('pawn');
    expect(state.combat.stage).toBe('target');

    ui = uiOf(attack, state, '0');
    expect(ui.highlightedFighterIds).toEqual(['beta']);
    expect(ui.framedFighterIds).toEqual(['pawn']);
    expect(resolvePhaseHint(attack.hints, state, '0')).toBe(
      'Выберите цель среди подсвеченных бойцов противника',
    );

    attack.moves.PICK(state, { kind: 'fighter', id: 'beta', playerId: '0' });
    expect(state.combat.stage).toBe('defense');
    expect(state.combat.targetFighterId).toBe('beta');
    expect(state.combat.defenderPlayerId).toBe('1');
  });

  it('после выбора цели: подсветка цели, ожидание защиты, карты недоступны', () => {
    const state = attackState();
    choose.moves.PICK(state, { kind: 'card', id: 'atk_0', playerId: '0' });
    attack.moves.PICK(state, { kind: 'fighter', id: 'beta', playerId: '0' });

    const ui = uiOf(attack, state, '0');
    expect(ui.highlightedFighterIds).toEqual(['beta']);
    expect(ui.framedFighterIds).toEqual(['alpha']);
    expect(ui.playableCardIds).toEqual([]);
    expect(ui.disabledCardIds).toEqual(['def_0', 'fx_0']);
    expect(ui.deck.clickable).toBe(false);
    expect(ui.controls.ok.visible).toBe(false);
    expect(resolvePhaseHint(attack.hints, state, '0')).toBe(
      'Ожидание защиты игрока Beta',
    );
  });

  it('отклоняет клик не по бойцу и выборы на стадии защиты', () => {
    const state = attackState();
    choose.moves.PICK(state, { kind: 'card', id: 'atk_0', playerId: '0' });
    expect(() =>
      attack.moves.PICK(state, { kind: 'cell', id: 9, playerId: '0' }),
    ).toThrow(/клик по бойцу/);

    attack.moves.PICK(state, { kind: 'fighter', id: 'beta', playerId: '0' });
    expect(() =>
      attack.moves.PICK(state, { kind: 'fighter', id: 'beta', playerId: '0' }),
    ).toThrow(/некого/);
  });

  it('защитник и остальные в бой не вмешиваются', () => {
    const state = attackState();
    choose.moves.PICK(state, { kind: 'card', id: 'atk_0', playerId: '0' });
    attack.moves.PICK(state, { kind: 'fighter', id: 'beta', playerId: '0' });

    expect(attack.active(state, '1')).toBe(false);
    expect(movement.active(state, '1')).toBe(false);
    expect(waiting.active(state, '1')).toBe(true);
  });
});
