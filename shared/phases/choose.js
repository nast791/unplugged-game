import { SET_ACTIONS } from '#shared/actions/base.js';
import { SET_CARDS } from '#shared/actions/cards.js';
import { SET_COMBAT } from '#shared/actions/combat.js';
import { SET_MOVEMENT } from '#shared/actions/movement.js';
import { SET_TARGETING } from '#shared/actions/targeting.js';
import { openEffect, runEffectMoment } from '#shared/cards/run.js';
import { findPlayer } from '#shared/helpers/base.js';
import { cardKey, hasFighterForCard, isAttackCard, isEffectCard } from '#shared/helpers/cards.js';
import { attackCandidates, attackRejection } from '#shared/helpers/combat.js';
import {
  endGameIfFinished,
  handCardIds,
  handCards,
  hasAction,
  hasActions,
  isActivePlayer,
  isTargetingMine,
  targetingCandidates,
} from '#shared/helpers/turn.js';
import { runSkillMoment } from '#shared/skills/run.js';

const hiddenControls = () => ({
  ok: { visible: false, enabled: false, label: null },
  back: { visible: false, enabled: false, label: null },
});

/** Окно выбора, от которого можно отказаться («вы можете»): общая кнопка его закрывает. */
const optionalWindowOf = (partyState, playerId) =>
  isTargetingMine(partyState, playerId) && partyState.targeting?.required !== true
    ? partyState.targeting
    : null;

/**
 * Отказ от необязательного окна (способность или свойство вида «вы можете»): окно закрывается,
 * шаг разыгранной эффектной карты помечается отказом, слот освобождается.
 */
export const declineTargetingWindow = (partyState, playerId) => {
  let state = SET_TARGETING(partyState, { op: 'close', playerId });

  if (state.effect) {
    for (const step of state.effect.steps ?? []) {
      if (step.status === 'waiting') step.status = 'declined';
    }
    state.effect = null;
  }

  return endGameIfFinished(state);
};

/** Карты руки, которыми сейчас можно объявить атаку. */
const playableAttackCardIds = (partyState, playerId) =>
  handCards(partyState, playerId)
    .filter(isAttackCard)
    .filter(card => attackCandidates(partyState, playerId, card).length > 0)
    .map(cardKey);

/**
 * Эффектные карты, которые можно разыграть как действие: их правила в моменте `effect` уже написаны,
 * а привязанный боец на поле. Карта без правил `effect` пока не разыгрывается (эффект не перенесён).
 */
const playableEffectCardIds = (partyState, playerId) =>
  handCards(partyState, playerId)
    .filter(isEffectCard)
    .filter(card => card.rules?.some(rule => rule.moment === 'effect'))
    .filter(card => hasFighterForCard(partyState, playerId, card))
    .map(cardKey);

/** Играбельные карты руки: атака и эффект. */
const playableCardIds = (partyState, playerId) => [
  ...playableAttackCardIds(partyState, playerId),
  ...playableEffectCardIds(partyState, playerId),
];

/** Окно выбора цели открыто этим игроком и его обязательно закрыть (эффект уже разыгранной карты). */
const requiredTargetingOf = (partyState, playerId) =>
  isTargetingMine(partyState, playerId) && partyState.targeting.required === true;

/** Способность игрока, если окно выбора открыто именно ею (а не картой). */
const skillWindowOf = (partyState, playerId) => {
  const targeting = partyState.targeting;
  const skill = findPlayer(partyState, playerId)?.skill;
  if (!targeting || !skill) return null;
  if (String(targeting.playerId) !== String(playerId)) return null;
  if (String(targeting.source) !== String(skill.id)) return null;
  return skill;
};

/** Объявлено действие — окно способности начала хода считается пропущенным. */
const closeSkillWindow = (partyState, playerId) =>
  skillWindowOf(partyState, playerId)
    ? SET_TARGETING(partyState, { op: 'close', playerId })
    : partyState;

/** Пока разыгранная карта ждёт цель, объявлять новое действие нельзя — эффект уже оплачен. */
const requireNoPendingEffect = (partyState, playerId) => {
  if (requiredTargetingOf(partyState, playerId)) {
    throw new Error('PICK: сначала выберите цель разыгранной карты');
  }
};

/** Клик по колоде = объявленное перемещение: −1 действие, добор 1 или истощение. */
const startMovement = (partyState, playerId) => {
  requireNoPendingEffect(partyState, playerId);

  const state = SET_ACTIONS(closeSkillWindow(partyState, playerId), {
    playerId,
    delta: -1,
  });
  SET_MOVEMENT(state, { op: 'open', playerId });

  // пустая колода сама бьёт главного героя истощением — это правило действия SET_CARDS
  SET_CARDS(state, { playerId, op: 'draw', count: 1 });
  return state;
};

/** Клик по карте атаки = объявление боя: −1 действие, карта в закрытую. */
const startAttack = (partyState, playerId, cardId) => {
  requireNoPendingEffect(partyState, playerId);

  const reason = attackRejection(partyState, playerId, cardId);
  if (reason) throw new Error(`PICK: ${reason}`);

  const state = SET_ACTIONS(closeSkillWindow(partyState, playerId), {
    playerId,
    delta: -1,
  });
  return SET_COMBAT(state, { op: 'open', playerId, cardId });
};

/**
 * Клик по эффектной карте = действие: −1 действие, карта открыто уходит в сброс и в слот `state.effect`,
 * её правила идут шаг за шагом (момент `effect`), а очередь шагов видна всем — как очередь эффектов боя.
 * Если правило открыло обязательное окно выбора, слот живёт до отметки цели, иначе эффект закончен сразу.
 */
const startEffectCard = (partyState, playerId, cardId) => {
  requireNoPendingEffect(partyState, playerId);

  const card = handCards(partyState, playerId).find(entry => cardKey(entry) === String(cardId));
  if (!card) throw new Error(`PICK: карты "${cardId}" нет в руке`);
  if (!isEffectCard(card)) throw new Error(`PICK: карта "${cardId}" не эффект`);
  if (!hasFighterForCard(partyState, playerId, card)) {
    throw new Error(`PICK: карта "${cardId}" привязана к бойцу, которого нет на поле`);
  }
  if (!card.rules?.some(rule => rule.moment === 'effect')) {
    throw new Error(`PICK: у карты "${cardId}" не описан розыгрыш`);
  }

  let state = SET_ACTIONS(closeSkillWindow(partyState, playerId), {
    playerId,
    delta: -1,
  });
  SET_CARDS(state, {
    playerId,
    op: 'move',
    from: 'hand',
    to: 'discard',
    cardIds: [cardId],
  });

  openEffect(state, { playerId, card });
  state = runEffectMoment(state, 'effect');
  if (!state.targeting && !state.movement) state.effect = null;

  return state;
};

/** Кандидаты выбора цели: бойцы — для подсветки бойцов, клетки — для подсветки клеток. */
const targetingCells = (partyState, playerId) =>
  isTargetingMine(partyState, playerId) && partyState.targeting.kind === 'cells'
    ? (partyState.targeting.candidates ?? []).map(entry => String(entry.cellId))
    : [];

const targetingFighters = (partyState, playerId) =>
  partyState.targeting?.kind === 'cells' ? [] : targetingCandidates(partyState, playerId);

/**
 * Цель отмечена: правила момента `picked` берём у того, чей это выбор — способности или разыгранной карты,
 * дальше окно закрывает движок, а слот разыгранной карты освобождается.
 */
const pickTarget = (partyState, playerId, pick) => {
  let state = SET_TARGETING(partyState, {
    op: 'pick',
    playerId,
    ...pick,
  });

  const source = state.targeting?.source ?? null;
  const skill = findPlayer(state, playerId)?.skill;
  const bySkill = source != null && skill != null && String(source) === String(skill.id);

  state = bySkill ? runSkillMoment(state, playerId, 'picked') : runEffectMoment(state, 'picked');

  state = SET_TARGETING(state, { op: 'close', playerId });
  if (!state.targeting && !state.movement) state.effect = null;

  return state;
};

export default {
  name: 'choose',

  hints: {
    skillWindow: {
      active: (partyState, playerId) => Boolean(skillWindowOf(partyState, playerId)),
      text: (partyState, playerId) => skillWindowOf(partyState, playerId)?.text ?? '',
    },
    pickTarget: {
      active: (partyState, playerId) => isTargetingMine(partyState, playerId),
      text: partyState =>
        partyState.targeting?.kind === 'cells'
          ? 'Выберите клетку среди подсвеченных'
          : 'Выберите цель среди подсвеченных бойцов',
    },
    chooseAction: {
      active: () => true,
      text: () =>
        'Ваш ход: возьмите карту из колоды, чтобы переместиться, или разыграйте карту атаки',
    },
  },

  /**
   * Ход активен, пока есть действия и не идёт объявленное действие. Исключение — открытое окно выбора:
   * эффектная карта могла потратить последнее действие, но её окно (цель, вариант, перемещение) всё равно
   * нужно закрыть, поэтому такое окно держит фазу активной даже с нулём действий.
   */
  active: (partyState, playerId) =>
    isActivePlayer(partyState, playerId) &&
    !hasAction(partyState) &&
    (hasActions(partyState) || isTargetingMine(partyState, playerId) || Boolean(partyState.effect)),

  ui(partyState, playerId) {
    const playable = playableCardIds(partyState, playerId);
    const targets = targetingFighters(partyState, playerId);
    const optional = optionalWindowOf(partyState, playerId);

    return {
      deck: { clickable: true },
      highlightedCellIds: targetingCells(partyState, playerId),
      highlightedFighterIds: targets,
      // окно цели с бойцами: клик по бойцу уходит в движок, остальное — выбор для хода
      pickFighters: targets.length > 0,
      playableCardIds: playable,
      disabledCardIds: handCardIds(partyState, playerId).filter(
        cardId => !playable.includes(cardId),
      ),
      // от необязательного окна («вы можете») можно отказаться общей кнопкой
      controls: optional
        ? {
            ok: {
              visible: true,
              enabled: true,
              label: 'Пропустить',
            },
            back: { visible: false, enabled: false, label: null },
          }
        : hiddenControls(),
    };
  },

  ok: {
    label: 'Пропустить',
    enabled: (partyState, playerId) => Boolean(optionalWindowOf(partyState, playerId)),
    onPress: (partyState, action) => declineTargetingWindow(partyState, action.playerId),
  },

  moves: {
    PICK: (partyState, action) => {
      if (action.kind === 'deck') {
        return startMovement(partyState, action.playerId);
      }
      if (action.kind === 'card') {
        const card = handCards(partyState, action.playerId).find(
          entry => cardKey(entry) === String(action.id),
        );
        return card && isEffectCard(card)
          ? startEffectCard(partyState, action.playerId, action.id)
          : startAttack(partyState, action.playerId, action.id);
      }
      if (action.kind === 'fighter') {
        if (!isTargetingMine(partyState, action.playerId)) {
          throw new Error('PICK: сейчас выбирать некого');
        }
        return pickTarget(partyState, action.playerId, { fighterId: action.id });
      }
      if (action.kind === 'cell') {
        if (!isTargetingMine(partyState, action.playerId)) {
          throw new Error('PICK: сейчас выбирать некого');
        }
        return pickTarget(partyState, action.playerId, { cellId: action.id });
      }
      if (action.kind === 'option') {
        if (!isTargetingMine(partyState, action.playerId)) {
          throw new Error('PICK: сейчас выбирать некого');
        }
        return pickTarget(partyState, action.playerId, { optionId: action.id });
      }
      throw new Error(
        `PICK: в фазе объявления доступны колода, карта из руки, боец, клетка и вариант свойства (пришло "${action.kind}")`,
      );
    },
  },
};

/*
 Фаза choose: объявление действия активным игроком.

 1. Активна, когда ход мой, есть действия и не идёт объявленное действие (перемещение или бой).
    Лимит руки здесь НЕ проверяется: перебор разбирает фаза handLimit в конце хода, иначе игрок с семью
    картами после добора терял бы возможность ходить. Открытый выбор цели объявить действие не мешает —
    так способность пропускается началом другого действия.
 2. Клик по колоде — объявление перемещения: −1 действие, открывается черновик перемещения
    (SET_MOVEMENT open), затем добор 1 карты; при пустой колоде вместо добора все свои герои получают
    rules.exhaustionDamage (помощники урон не получают), а перемещение всё равно доступно.
 3. Клик по карте attack|hybrid, которой хоть кто-то из своих бойцов достаёт врага, — объявление боя:
    −1 действие и SET_COMBAT open (карта уходит из руки в закрытую). Карты, которыми никто не достаёт,
    и карты других типов отдаются в ui как disabledCardIds.
 3a. Клик по эффектной карте (type effect, с правилами момента effect) — действие: −1 действие, карта
    уходит в сброс и в открытый слот state.effect, а её правила идут шаг за шагом — очередь шагов
    (state.effect.steps) устроена как очередь эффектов боя: pending → waiting → applied | skipped.
    Если правило открыло обязательное окно выбора (SET_TARGETING required), слот живёт до отметки цели
    в момент picked, иначе эффект заканчивается сразу. Пока такое окно открыто, другое действие объявить
    нельзя (эффект оплачен), а цель разбирается по source окна: правила способности или правила карты.
 4. Способность начала хода: хук turn на входе прогоняет правила скилла (момент turnStart) — если правило
    открыло окно выбора цели, кандидаты подсвечены, а сверху висит текст способности. Клик по подсвеченному
    бойцу отмечает цель (SET_TARGETING pick), движок прогоняет момент picked и сам закрывает окно.
 5. Способность необязательна: объявление любого действия (колода или карта) закрывает её окно — правило
    с моментом turnStart больше не сработает, потому что вход в хук был один.
 6. Ход нельзя закрыть, пока в работе любой момент (перемещение, бой, выбор цели) — это держит turn.body.
 7. Кнопки в фазе нет: закончить ход можно только отходив действия.
 */
