import { SET_ACTIONS } from '#shared/actions/base.js';
import { SET_CARDS } from '#shared/actions/cards.js';
import { SET_COMBAT } from '#shared/actions/combat.js';
import { SET_MOVEMENT } from '#shared/actions/movement.js';
import { SET_TARGETING } from '#shared/actions/targeting.js';
import { effectBrings, openEffect, runEffectMoment } from '#shared/cards/run.js';
import { HINTS } from '#shared/constants/hints.js';
import { findPlayer } from '#shared/helpers/base.js';
import {
  cardKey,
  hasFighterForCard,
  isAttackCard,
  isEffectCard,
} from '#shared/helpers/cards.js';
import { attackCandidates, attackRejection } from '#shared/helpers/combat.js';
import { windowCount, windowPicked, windowReady } from '#shared/helpers/targeting.js';
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

/**
 * Предлагается ли карта эффектом: **розыгрыш должен хоть что-нибудь изменить** (`effectBrings`).
 * Свойство, которое сейчас не срабатывает («Плач по Амат», пока Амат жива) или собирает пустое окно
 * («Прыжок в лаву» без свободной лавы), действием не предлагается — карта остаётся топливом: её
 * сбрасывают ради усиления. Негатив считается изменением: добор из пустой колоды отнимает здоровье,
 * и карта играется.
 */
const offersAsEffect = (partyState, playerId, card) => effectBrings(partyState, playerId, card);

const hiddenControls = () => ({
  ok: { visible: false, enabled: false, label: null },
  back: { visible: false, enabled: false, label: null },
});

/** Окно вариантов свойства, открытое этому игроку: клик по варианту только отмечает выбор. */
const optionWindowOf = (partyState, playerId) =>
  isTargetingMine(partyState, playerId) && partyState.targeting?.kind === 'options'
    ? partyState.targeting
    : null;

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
 * привязанный боец на поле — и **розыгрыш что-то изменит**. Карта, у которой не происходит ничего,
 * действием не предлагается: она стоит действия и не делает ничего.
 */
const playableEffectCardIds = (partyState, playerId) =>
  handCards(partyState, playerId)
    .filter(isEffectCard)
    .filter(card => card.rules?.some(rule => rule.moment === 'effect'))
    .filter(card => hasFighterForCard(partyState, playerId, card))
    .filter(card => offersAsEffect(partyState, playerId, card))
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

/** Подпись общей кнопки: у окна способности она называет то, что игрок завершает, у свойства — эффект. */
const declineLabel = (partyState, playerId) =>
  skillWindowOf(partyState, playerId) ? 'Завершить умение' : 'Закончить эффект';

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

/** Отмеченные цели окна: клиент обводит их рамкой активности — видно, что именно применит общая кнопка. */
const pickedFighters = (partyState, playerId) =>
  isTargetingMine(partyState, playerId) &&
  partyState.targeting.kind !== 'cells' &&
  partyState.targeting.kind !== 'options'
    ? windowPicked(partyState.targeting)
    : [];

/**
 * Цель отмечена: правила момента `picked` берём у того, чей это выбор — способности или разыгранной карты,
 * дальше окно закрывает движок, а слот разыгранной карты освобождается.
 */
const pickTarget = (partyState, playerId, pick) => {
  const state = SET_TARGETING(partyState, {
    op: 'pick',
    playerId,
    ...pick,
  });

  // окно вариантов свойства клик только отмечает: применяет выбор общая кнопка (`ok.onPress`)
  if (state.targeting?.kind === 'options') return state;
  // окно-переключатель (способности Ифрита, Анубиса и Медузы) клик только отмечает или снимает: применяет кнопка
  if (state.targeting?.toggle === true) return state;
  // окно на несколько целей собирается по отметке за клик: правила `picked` разыгрывает та же кнопка
  if (windowCount(state.targeting) > 1) return state;

  return closePickedWindow(state, playerId);
};

/** Закрыть окно, чья отметка уже разыграна: правила `picked`, закрытие окна, освобождение слота карты. */
const closePickedWindow = (partyState, playerId) => {
  const source = partyState.targeting?.source ?? null;
  const skill = findPlayer(partyState, playerId)?.skill;
  const bySkill = source != null && skill != null && String(source) === String(skill.id);

  let state = bySkill
    ? runSkillMoment(partyState, playerId, 'picked')
    : runEffectMoment(partyState, 'picked');

  state = SET_TARGETING(state, { op: 'close', playerId });
  if (!state.targeting && !state.movement) state.effect = null;

  return state;
};

/** Окно вариантов свойства, отмеченное игроком: отметку подтверждает общая кнопка. */
const pickedOptionOf = (partyState, playerId) => {
  const window = optionWindowOf(partyState, playerId);
  return window && windowReady(window) ? window : null;
};

/**
 * Окно цели (бойцы и клетки), чей выбор готов: общая кнопка разыгрывает правила `picked`.
 * У окна на несколько целей выбор готов, когда набран весь набор, — а у необязательного раньше срока.
 */
const pickedTargetWindow = (partyState, playerId) => {
  if (!isTargetingMine(partyState, playerId)) return null;
  const window = partyState.targeting;
  if (window.kind === 'options') return null;
  return windowReady(window) ? window : null;
};

export default {
  name: 'choose',

  hints: {
    skillWindow: {
      active: (partyState, playerId) => Boolean(skillWindowOf(partyState, playerId)),
      text: (partyState, playerId) => {
        const skill = skillWindowOf(partyState, playerId);
        const window = skill ? partyState.targeting : null;
        return HINTS.choose.skillWindow({
          text: skill?.text,
          toggle: window?.toggle === true,
          picked: windowPicked(window).length,
          required: window?.required === true,
        });
      },
    },
    pickTarget: {
      active: (partyState, playerId) => isTargetingMine(partyState, playerId),
      text: partyState =>
        HINTS.choose.pickTarget({
          cells: partyState.targeting?.kind === 'cells',
          count: windowCount(partyState.targeting),
          picked: windowPicked(partyState.targeting).length,
        }),
    },
    chooseAction: {
      active: () => true,
      text: HINTS.choose.chooseAction,
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
    const picked = Boolean(pickedOptionOf(partyState, playerId));
    const pickedTargets = Boolean(pickedTargetWindow(partyState, playerId));

    // кнопка нужна и там, где от окна можно отказаться, и там, где отметка ждёт подтверждения:
    // готовый выбор (у окна на несколько целей — весь набор) делает кнопку доступной
    const finishable = Boolean(optional) || picked || pickedTargets;

    return {
      deck: { clickable: true },
      highlightedCellIds: targetingCells(partyState, playerId),
      highlightedFighterIds: targets,
      // отмеченные цели окна: доска обводит их рамкой активности, как выбранного бойца
      pickedFighterIds: pickedFighters(partyState, playerId),
      // окно цели с бойцами: клик по бойцу уходит в движок, остальное — выбор для хода
      pickFighters: targets.length > 0,
      playableCardIds: playable,
      disabledCardIds: handCardIds(partyState, playerId).filter(
        cardId => !playable.includes(cardId),
      ),
      controls: finishable
        ? {
            ok: {
              visible: true,
              enabled: true,
              label: declineLabel(partyState, playerId),
            },
            back: { visible: false, enabled: false, label: null },
          }
        : hiddenControls(),
    };
  },

  ok: {
    label: 'Закончить эффект',
    enabled: (partyState, playerId) =>
      Boolean(
        optionalWindowOf(partyState, playerId) ||
        pickedOptionOf(partyState, playerId) ||
        pickedTargetWindow(partyState, playerId),
      ),
    /**
     * Общая кнопка окна: готовый выбор она подтверждает (правила `picked` применяют выбор),
     * окно без отметки — закрывает отказом (необязательное свойство или способность).
     */
    onPress: (partyState, action) => {
      const playerId = action.playerId;
      if (pickedOptionOf(partyState, playerId) || pickedTargetWindow(partyState, playerId)) {
        return endGameIfFinished(closePickedWindow(partyState, playerId));
      }
      if (optionWindowOf(partyState, playerId)?.required === true) {
        throw new Error('UI_OK: обязательное свойство карты закрывается только выбором варианта');
      }
      const window = isTargetingMine(partyState, playerId) ? partyState.targeting : null;
      if (window?.required === true) {
        throw new Error(
          windowCount(window) > 1
            ? 'UI_OK: обязательное окно выбора целей закрывается только полным набором целей'
            : 'UI_OK: обязательное окно выбора цели закрывается только выбором цели',
        );
      }
      return declineTargetingWindow(partyState, playerId);
    },
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
    У окна вариантов свойства (kind: 'options') клик по варианту только **отмечает** его: правила момента
    picked применяет общая кнопка (`UI_OK`) — один и тот же путь для всех окон свойства, и в бою тоже
    (shared/phases/defense.js §5a).
 4. Способность героя: правила скилла прогоняют входы хуков — turnStart (начало хода) и turnEnd (конец
    хода). Если правило открыло окно выбора цели, кандидаты подсвечены, а сверху висит текст способности
    (hint skillWindow). Обычное окно: клик по подсвеченному бойцу отмечает цель (SET_TARGETING pick),
    движок прогоняет момент picked и сам закрывает окно. Окно-переключатель (`SET_TARGETING toggle`,
    «Пламя преисподней» Ифрита, «Взвешивание сердца» Анубиса, «Взгляд Медузы» Медузы): клик только
    отмечает цель или снимает отметку, момент picked разыгрывает общая кнопка, а `auto` рядом с `toggle`
    применяет безальтернативный выбор сам. У необязательного окна без отметки кнопка пропускает
    способность, обязательное (Анубис с несколькими целями) закрывается только выбором. Списка вариантов окну не нужно: «Серебряные башмачки» Дороти
    подсвечивают Дороти и Тото, клик по любому меняет их местами, а выбор здесь симметричный.
 5. Способность необязательна: объявление любого действия (колода или карта) закрывает её окно — правило
    с моментом turnStart больше не сработает, потому что вход в хук был один. В конце хода окно закрывает
    общая кнопка завершения: у окна способности она подписана «Завершить умение», у необязательного окна
    свойства — «Закончить эффект». Вопросов «да или нет» интерфейс не задаёт: подсказка сверху,
    подсвеченные цели и кнопка.
 6. Ход нельзя закрыть, пока в работе любой момент (перемещение, бой, выбор цели) — это держит turn.body,
    а окно способности конца хода держит turnEnd.body.
 7. Кнопки «закончить ход» в фазе нет: в хуке turn закончить ход можно только отходив действия,
    в turnEnd общая кнопка лишь отказывается от окна способности.
 */
