import { PHASES } from '@nast791/engine/constants';
import { cardTypes } from '#shared/constants/deck.js';
import { SPEND_AP } from '#shared/events/index.js';
import {
  assertNoPendingCombat,
  assertNoPendingMovement,
  discardFromHand,
  findFighter,
  findInHand,
  findOwnedFighter,
} from '#shared/helpers.js';
import { bfsDistance } from './move.js';

/**
 * ATTACK — { fighterId, targetId, cardId }
 * Если у карты есть fighter — атакует он (не выбранный помощник).
 */
export const attack = (state, action, api) => {
  if (state.phase !== PHASES.turn) {
    throw new Error(`ATTACK только в phase=turn, сейчас "${state.phase}"`);
  }
  assertNoPendingCombat(state, 'ATTACK');
  assertNoPendingMovement(state, 'ATTACK');

  const { targetId, cardId } = action;
  if (targetId == null || cardId == null) {
    throw new Error('ATTACK: нужны targetId и cardId');
  }

  const attackerPlayer = state.players.find(
    p => String(p.id) === String(action.playerId),
  );
  if (!attackerPlayer) {
    throw new Error(`ATTACK: игрок ${action.playerId} не найден`);
  }

  const { card } = findInHand(attackerPlayer, cardId);
  if (!card) {
    throw new Error(`ATTACK: карты "${cardId}" нет в hand`);
  }
  if (!cardTypes.find(t => t.name === card.type)?.turn?.includes('attack')) {
    throw new Error(
      `ATTACK: карта type="${card.type}" (нужен attack|hybrid)`,
    );
  }

  // Карта привязана к герою/бойцу — атакует он, даже если в UI выбран помощник.
  const fighterId =
    card.fighter != null ? String(card.fighter) : action.fighterId;
  if (fighterId == null) {
    throw new Error('ATTACK: нужен fighterId (или card.fighter)');
  }

  const { fighter: attacker, index } = findOwnedFighter(
    state,
    action.playerId,
    fighterId,
  );
  if (!attacker) {
    throw new Error(
      `ATTACK: fighter "${fighterId}" не принадлежит игроку ${action.playerId}`,
    );
  }
  if (attacker.currentPosition == null) {
    throw new Error(
      `ATTACK: ${attacker.name || fighterId} не на клетке — подведите его к цели`,
    );
  }

  const { player: defenderPlayer, fighter: target } = findFighter(state, targetId);
  if (!defenderPlayer || !target) {
    throw new Error(`ATTACK: цель "${targetId}" не найдена`);
  }
  if (String(defenderPlayer.id) === String(action.playerId)) {
    throw new Error('ATTACK: нельзя атаковать своего бойца');
  }
  if (target.currentPosition == null) {
    throw new Error(`ATTACK: цель "${targetId}" не на клетке`);
  }

  const range = Number(attacker.attackRange ?? 1);
  const from = attacker.currentPosition;
  const to = target.currentPosition;
  const dist = bfsDistance(state.map?.nodes ?? [], from, to, range);
  if (dist === Infinity || dist > range) {
    throw new Error(
      `ATTACK: out of range ${attacker.name || attacker.id}@${from} -> ${target.name || target.id}@${to} (dist=${dist === Infinity ? 'inf' : dist}, range=${range})`,
    );
  }

  const attackCard = discardFromHand(attackerPlayer, cardId);

  state.combat = {
    attackerPlayerId: String(action.playerId),
    defenderPlayerId: String(defenderPlayer.id),
    attackerFighterId: String(fighterId),
    targetFighterId: String(targetId),
    attackValue: Number(attackCard?.value ?? card.value) || 0,
    attackCardId: attackCard?.instanceId ?? attackCard?.id ?? card.id,
    attackCard: attackCard ?? card,
  };

  SPEND_AP(state);
  return state;
};

export default attack;
