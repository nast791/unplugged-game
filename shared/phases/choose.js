import { SET_ACTIONS } from '#shared/actions-new/base.js';
import { SET_CARDS } from '#shared/actions-new/cards.js';
import { SET_COMBAT } from '#shared/actions-new/combat.js';
import { SET_HEALTH } from '#shared/actions-new/health.js';
import { SET_MOVEMENT } from '#shared/actions-new/movement.js';
import { SET_TARGETING } from '#shared/actions-new/targeting.js';
import { rules } from '#shared/constants/rules.js';
import { canDraw, findPlayer } from '#shared/helpers/base.js';
import { cardKey, isAttackCard } from '#shared/helpers/cards.js';
import { attackCandidates, attackRejection } from '#shared/helpers/combat.js';
import {
  handCardIds,
  handCards,
  hasAction,
  hasActions,
  heroFighterIds,
  isActivePlayer,
  isHandOverLimit,
  isTargetingMine,
  targetingCandidates,
} from '#shared/helpers/turn.js';

const hiddenControls = () => ({
  ok: { visible: false, enabled: false, label: null },
  back: { visible: false, enabled: false, label: null },
});

/** Карты руки, которыми сейчас можно объявить атаку. */
const playableAttackCardIds = (partyState, playerId) =>
  handCards(partyState, playerId)
    .filter(isAttackCard)
    .filter(card => attackCandidates(partyState, playerId, card).length > 0)
    .map(cardKey);

/** Клик по колоде = объявленное перемещение: −1 действие, добор 1 или истощение. */
const startMovement = (partyState, playerId) => {
  const state = SET_ACTIONS(partyState, { playerId, delta: -1 });
  SET_MOVEMENT(state, { op: 'open', playerId });

  const player = findPlayer(state, playerId);
  if (canDraw(player)) {
    SET_CARDS(state, { playerId, op: 'draw', count: 1 });
    return state;
  }

  const heroIds = heroFighterIds(player);
  if (heroIds.length > 0) {
    SET_HEALTH(state, { fighterIds: heroIds, delta: -rules.exhaustionDamage });
  }
  return state;
};

/** Клик по карте атаки = объявление боя: −1 действие, карта в закрытую. */
const startAttack = (partyState, playerId, cardId) => {
  const reason = attackRejection(partyState, playerId, cardId);
  if (reason) throw new Error(`PICK: ${reason}`);

  const state = SET_ACTIONS(partyState, { playerId, delta: -1 });
  return SET_COMBAT(state, { op: 'open', playerId, cardId });
};

export default {
  name: 'choose',

  hints: {
    pickTarget: {
      active: (partyState, playerId) => isTargetingMine(partyState, playerId),
      text: () => 'Выберите цель среди подсвеченных бойцов',
    },
    chooseAction: {
      active: () => true,
      text: () =>
        'Ваш ход: возьмите карту из колоды, чтобы переместиться, или разыграйте карту атаки',
    },
  },

  active: (partyState, playerId) =>
    isActivePlayer(partyState, playerId) &&
    hasActions(partyState) &&
    !hasAction(partyState) &&
    !isHandOverLimit(partyState, playerId),

  ui(partyState, playerId) {
    const playable = playableAttackCardIds(partyState, playerId);

    return {
      deck: { clickable: true },
      highlightedCellIds: [],
      highlightedFighterIds: targetingCandidates(partyState, playerId),
      playableCardIds: playable,
      disabledCardIds: handCardIds(partyState, playerId).filter(
        cardId => !playable.includes(cardId),
      ),
      controls: hiddenControls(),
    };
  },

  moves: {
    PICK: (partyState, action) => {
      if (action.kind === 'deck') {
        return startMovement(partyState, action.playerId);
      }
      if (action.kind === 'card') {
        return startAttack(partyState, action.playerId, action.id);
      }
      if (action.kind === 'fighter') {
        if (!isTargetingMine(partyState, action.playerId)) {
          throw new Error('PICK: сейчас выбирать некого');
        }
        return SET_TARGETING(partyState, {
          op: 'pick',
          playerId: action.playerId,
          fighterId: action.id,
        });
      }
      throw new Error(
        `PICK: в фазе объявления доступны колода и карта атаки (пришло "${action.kind}")`,
      );
    },
  },
};

/*
 Фаза choose: объявление действия активным игроком.

 1. Активна, когда ход мой, есть действия, не идёт объявленное действие (перемещение или бой)
    и рука в лимите. Открытый выбор цели объявить действие не мешает — так способность пропускается
    началом другого действия.
 2. Клик по колоде — объявление перемещения: −1 действие, открывается черновик перемещения
    (SET_MOVEMENT open), затем добор 1 карты; при пустой колоде вместо добора все свои герои получают
    rules.exhaustionDamage (помощники урон не получают), а перемещение всё равно доступно.
 3. Клик по карте attack|hybrid, которой хоть кто-то из своих бойцов достаёт врага, — объявление боя:
    −1 действие и SET_COMBAT open (карта уходит из руки в закрытую). Карты, которыми никто не достаёт,
    и карты других типов отдаются в ui как disabledCardIds.
 4. Если выбор цели (targeting) открыт этим игроком, его кандидаты подсвечены, подсказка сверху меняется
    на «Выберите цель среди подсвеченных бойцов», а клик по подсвеченному бойцу отмечает цель
    (SET_TARGETING pick). Сам эффект применяет и закрывает выбор тот, кто его открыл.
 5. Ход нельзя закрыть, пока в работе любой момент (перемещение, бой, выбор цели) — это держит turn.body.
 6. Кнопки в фазе нет: закончить ход можно только отходив действия.
 */
