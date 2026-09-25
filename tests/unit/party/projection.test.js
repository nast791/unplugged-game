import { describe, expect, it } from 'vitest';
import { view } from '../../../server/party.js';
import { createState, player } from '../../fixtures/state.js';

const fighterOf = (state, playerId, fighterId) =>
  player(state, playerId).fighters.find(fighter => fighter.id === fighterId);

describe('party.view: приватность хода', () => {
  it('карта атаки: видит атакующий, не видит защитник до вскрытия', () => {
    const state = createState();
    state.combat = {
      stage: 'defense',
      attackerPlayerId: '0',
      defenderPlayerId: '1',
      attackerFighterId: 'alpha',
      targetFighterId: 'beta',
      attackCard: { id: 'atk', instanceId: 'atk_0' },
      defenseCard: null,
      attackValue: 4,
    };

    const attackerView = view(state, '0');
    expect(attackerView.combat.attackCard.instanceId).toBe('atk_0');
    expect(attackerView.combat.attackValue).toBe(4);

    const defenderView = view(state, '1');
    expect(defenderView.combat.attackCard).toBeUndefined();
    expect(defenderView.combat.attackValue).toBeUndefined();
    expect(defenderView.combat.targetFighterId).toBe('beta');
    expect(defenderView.combat.stage).toBe('defense');
  });

  it('после вскрытия карты и числа видны обоим', () => {
    const state = createState();
    state.combat = {
      stage: 'reveal',
      attackerPlayerId: '0',
      defenderPlayerId: '1',
      attackCard: { id: 'atk', instanceId: 'atk_0' },
      defenseCard: { id: 'def', instanceId: 'def_0' },
      attackValue: 4,
      defenseValue: 2,
    };

    const defenderView = view(state, '1');
    expect(defenderView.combat.attackCard.instanceId).toBe('atk_0');
    expect(defenderView.combat.defenseCard.instanceId).toBe('def_0');
    expect(defenderView.combat.defenseValue).toBe(2);
  });

  it('перемещение: владелец видит черновик и позиции, чужой — нет', () => {
    const state = createState();
    fighterOf(state, '0', 'alpha').currentPosition = 9;
    state.movement = { playerId: '0', origins: { alpha: 8 }, bonus: 2 };

    const ownerView = view(state, '0');
    expect(ownerView.movement.bonus).toBe(2);
    expect(
      ownerView.players.find(p => p.id === '0').fighters.find(f => f.id === 'alpha')
        .currentPosition,
    ).toBe(9);

    const otherView = view(state, '1');
    expect(otherView.movement).toBeNull();
    expect(
      otherView.players.find(p => p.id === '0').fighters.find(f => f.id === 'alpha')
        .currentPosition,
    ).toBe(8);
  });

  it('цель: кандидатов видит только владелец выбора', () => {
    const state = createState();
    state.targeting = {
      playerId: '0',
      source: 'medusa_skill',
      required: false,
      candidates: [{ fighterId: 'beta', playerId: '1', position: 10 }],
    };

    expect(view(state, '0').targeting.candidates).toHaveLength(1);

    const otherView = view(state, '1');
    expect(otherView.targeting.playerId).toBe('0');
    expect(otherView.targeting.candidates).toBeUndefined();
  });

  it('окно эффекта боя: карты для усиления видит только владелец окна', () => {
    const state = createState();
    state.combat = {
      stage: 'reveal',
      attackerPlayerId: '0',
      defenderPlayerId: '1',
      attackCard: { id: 'atk', instanceId: 'atk_0' },
      defenseCard: { id: 'def', instanceId: 'def_0' },
      attackValue: 4,
      defenseValue: 2,
      effects: [
        {
          order: 1,
          moment: 'duringCombat',
          side: 'attacker',
          cardId: 'atk_0',
          playerId: '0',
          status: 'waiting',
        },
      ],
      choice: {
        playerId: '0',
        source: 'atk_0',
        side: 'attack',
        optional: true,
        candidates: [{ cardId: 'quiet_0', bonus: 2 }],
        picked: null,
      },
    };

    const ownerView = view(state, '0');
    expect(ownerView.combat.choice.candidates).toEqual([
      { cardId: 'quiet_0', bonus: 2 },
    ]);
    expect(ownerView.combat.effects[0].status).toBe('waiting');

    // противник видит, что эффект ждёт решения, но не видит чужих карт для усиления
    const otherView = view(state, '1');
    expect(otherView.combat.choice).toBeUndefined();
    expect(otherView.combat.effects[0].status).toBe('waiting');
  });

  it('сдавшийся игрок виден всем', () => {
    const state = createState();
    player(state, '1').resigned = true;

    const enemyView = view(state, '0');
    expect(enemyView.players.find(entry => entry.id === '1').resigned).toBe(true);
    expect(enemyView.players.find(entry => entry.id === '0').resigned).toBeFalsy();
  });
});
