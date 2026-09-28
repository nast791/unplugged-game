import { cardTypes } from '#shared/constants/deck.js';

/** Ключ карты: instanceId, иначе id. */
export const cardKey = card => String(card?.instanceId ?? card?.id);

/** Моменты хода, на которых применяется тип карты (constants/deck.js → cardTypes). */
export const cardMoments = card => cardTypes.find(type => type.name === card?.type)?.turn ?? [];

export const isAttackCard = card => cardMoments(card).includes('attack');
export const isDefenseCard = card => cardMoments(card).includes('defense');
export const isEffectCard = card => cardMoments(card).includes('effect');

export const cardValue = card => Math.max(0, Number(card?.value) || 0);
export const cardBonus = card => Math.max(0, Number(card?.bonus) || 0);

/** Привязка карты к бойцу: пустое значение и 'any' — без привязки, иначе id своего бойца. */ export const cardFighterId =
  card => {
    const bound = card?.fighter;
    if (bound == null || String(bound) === '' || String(bound) === 'any') {
      return null;
    }
    return String(bound);
  };

/**
 * Текст варианта свойства карты (`card.options`): карта хранит свои варианты один раз,
 * а правила ссылаются на их id. Клиент рисует эти тексты списком и ставит галочку у выбранного.
 */
export const cardOptionText = (card, optionId) => {
  const option = (card?.options ?? []).find(entry => String(entry.id) === String(optionId));
  return option?.text ?? null;
};

/**
 * Варианты выбора для клиента: id + текст с карты (или запасной title из правила) + пометка `disabled`,
 * если вариант сейчас недоступен (условие `options[].when` не сошлось): клиент рисует его неактивным.
 */
export const cardChoices = (card, candidates = []) =>
  candidates.map(entry => ({
    optionId: String(entry.optionId ?? entry.id),
    title:
      cardOptionText(card, entry.optionId ?? entry.id) ??
      entry.title ??
      String(entry.optionId ?? entry.id),
    disabled: entry.disabled === true,
  }));

/**
 * Подходит ли боец под привязку (id бойца или группа помощников). `binding` — строка привязки:
 * пустая и 'any' значат «любой». Нужно и картам, и эффектам вроде воскрешения Гарпии.
 */
export const fighterMatchesBinding = (fighter, binding) => {
  if (binding == null || String(binding) === '' || String(binding) === 'any') {
    return true;
  }
  if (fighter == null) return false;
  return String(fighter.id) === String(binding) || String(fighter.group) === String(binding);
};

/**
 * Подходит ли боец под привязку карты: по id бойца или по его группе.
 * Помощники одного вида (три Гарпии) получают id `harpies_1..3` и общую группу `harpies`,
 * поэтому карта «Гарпий» подходит любой из них.
 */
export const fighterMatchesCard = (fighter, card) =>
  fighterMatchesBinding(fighter, cardFighterId(card));

/**
 * Может ли игрок играть карту как своё действие: привязанный боец должен быть жив и стоять на поле.
 * Карты ушедшего бойца играть нельзя — они остаются только на усиление (bonus) и на сброс по эффекту.
 */
export const hasFighterForCard = (partyState, playerId, card) => {
  if (cardFighterId(card) == null) return true;

  const player = (partyState?.players ?? []).find(entry => String(entry.id) === String(playerId));

  return (player?.fighters ?? []).some(
    fighter =>
      fighterMatchesCard(fighter, card) &&
      Number(fighter.currentHp) > 0 &&
      fighter.currentPosition != null,
  );
};
