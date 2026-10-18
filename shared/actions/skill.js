import { findPlayer } from '#shared/helpers/base.js';

/**
 * SET_SKILL — состояние **продолжительного** умения героя: «умение действует / перестало действовать».
 *
 * Зачем отдельный флаг: у точечного умения признак «можно разыграть» — открытое окно выбора
 * (`state.targeting` с `source === skill.id`), и клиенту больше ничего не нужно. У продолжительного
 * умения окна нет вовсе (например «Вечная мерзлота» Снежной королевы: на конце хода она ставит
 * противникам лимит руки, а при четырёх осколках снимает его) — поэтому «действует» должно быть
 * видно в состоянии. Ставит и снимает флаг **само правило умения** своими действиями: контент знает
 * условие, движок не должен его переписывать.
 *
 * params: { playerId?, active }
 */
export const SET_SKILL = (partyState, action = {}) => {
  const playerId = action.playerId ?? partyState.turn?.playerId;
  const player = findPlayer(partyState, playerId);
  if (!player) throw new Error(`SET_SKILL: игрок ${playerId} не найден`);

  player.skillActive = action.active === true;
  return partyState;
};

export default SET_SKILL;
