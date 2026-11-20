/** Кто видит поле: roles.visibility — 'self' | 'team' | 'enemy'. */

export const stateFields = {
  id: ['self', 'team', 'enemy'],
  hook: ['self', 'team', 'enemy'],
  round: ['self', 'team', 'enemy'],
  winner: ['self', 'team', 'enemy'],
  turn: ['self', 'team', 'enemy'],
  map: ['self', 'team', 'enemy'],
  settings: ['self', 'team', 'enemy'],
  combat: ['self', 'team', 'enemy'],
  effect: ['self', 'team', 'enemy'],
  // раскрытые карты — публичная информация: «Раскройте» значит «покажите всем»
  reveal: ['self', 'team', 'enemy'],
  movement: ['self', 'team', 'enemy'],
  targeting: ['self', 'team', 'enemy'],
  lastCombat: ['self', 'team', 'enemy'],
  // итог битвы ещё не закрыт окном: пока он есть, ход остаётся за атакующим (`UI_CLOSE_BATTLE`)
  awaitingBattleClose: ['self', 'team', 'enemy'],
  lastBonus: ['self', 'team', 'enemy'],
  // последнее сработавшее умение: карточка героя показывает по нему плашку «Умение»
  lastSkill: ['self', 'team', 'enemy'],
  log: ['self', 'team', 'enemy'],
};

export const playerFields = {
  id: ['self', 'team', 'enemy'],
  heroId: ['self', 'team', 'enemy'],
  order: ['self', 'team', 'enemy'],
  control: ['self', 'team', 'enemy'],
  name: ['self', 'team', 'enemy'],
  team: ['self', 'team', 'enemy'],
  color: ['self', 'team', 'enemy'],
  skill: ['self', 'team', 'enemy'],
  // продолжительное умение действует сейчас: ставит и снимает само правило умения (`SET_SKILL`)
  skillActive: ['self', 'team', 'enemy'],
  // лимит руки игрока: своё число, а не `rules.maxHandSize` — умение ставит чужой стороне 5 вместо 7
  // (`SET_HAND_LIMIT`). Открыт всем: это свойство правила, а не скрытая карта, и по нему рисуется круг
  // «на герое действует эффект» и строка «Важно!» в подсказке (`shared/constants/effects.js`).
  handLimit: ['self', 'team', 'enemy'],
  items: ['self', 'team', 'enemy'],
  fighters: ['self', 'team', 'enemy'],
  // павшие бойцы — публичный факт: карточка игрока и окно битвы показывают их убитыми
  lost: ['self', 'team', 'enemy'],
  placementReady: ['self', 'team', 'enemy'],
  resigned: ['self', 'team', 'enemy'],
  deck: [],
  hand: ['self', 'team'],
  discard: ['self', 'team', 'enemy'],
};
