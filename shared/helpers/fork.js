/**
 * Форк состояния на один ход.
 *
 * Кирпичи движка правят вложенные объекты на месте: `SET_HEALTH` вырезает убитого бойца из
 * `player.fighters`, `SET_ITEM` и табло осколков меняют `item.state`, фазы пишут `player._activePhase`.
 * Поэтому `runAction` считает ход на форке — входное состояние остаётся прежним, а «до» и «после»
 * перестают быть одним и тем же объектом (иначе сравнение состояний, откат хода и отладка молча
 * ломаются: числа «до» меняются вместе с состоянием).
 *
 * Форк обязан повторять состояние **один в один**: движок различает `null` и `[]` (`movement.fighters`:
 * `null` — ходят все, `[]` — не ходит никто), поэтому незаданные поля остаются собой, а не превращаются
 * в пустые списки. Проверяет `tests/unit/core/immutability.test.js` — и совпадение значений, и то, что
 * правки не утекают во вход.
 *
 * Копируются только ветки, которые движок действительно правит: глубокий `structuredClone` всего
 * состояния стоил бы 7,5× (замер: 200 партий дуэли — 3,1 с против 23,3 с), потому что копировал бы и
 * неизменное — карты вместе с их `rules` и карту поля. Сам форк бесплатен: A/B в одном процессе дал
 * 2762 мс против 2771 мс на 200 партий при том же счёте побед.
 */
const isObject = value => typeof value === 'object' && value !== null;

/** Копия списка: элементы-объекты копируются, примитивы остаются собой, `null` остаётся `null`. */
const forkList = list =>
  Array.isArray(list) ? list.map(entry => (isObject(entry) ? { ...entry } : entry)) : list;

/** Копия записи (`origins`, `bonus`, `cancelled`). */
const forkMap = record => (isObject(record) ? { ...record } : record);

/** Зона карт: и массив, и `{ visibility, cards }`; сами карты переиспользуются — их не правят. */
const forkZone = zone => {
  if (Array.isArray(zone)) return [...zone];
  if (!isObject(zone)) return zone;
  return { ...zone, cards: Array.isArray(zone.cards) ? [...zone.cards] : zone.cards };
};

/** Игрок: правятся бойцы, павшие, предметы (состояние копии) и три зоны карт. */
const forkPlayer = player => ({
  ...player,
  fighters: forkList(player.fighters),
  lost: forkList(player.lost),
  items: forkList(player.items),
  hand: forkZone(player.hand),
  deck: forkZone(player.deck),
  discard: forkZone(player.discard),
});

/** Бой: правится сам объект, очередь свойств и паузы выбора (бонус, сброс, замена защиты). */
const forkCombat = combat => {
  if (!isObject(combat)) return combat;
  return {
    ...combat,
    effects: forkList(combat.effects),
    choice: forkMap(combat.choice),
    cancelled: forkMap(combat.cancelled),
    recalled: forkMap(combat.recalled),
  };
};

/**
 * Окно перемещения: правится сам объект, список шагов, бюджет, истоки бойцов и уже получившие
 * урон на проходе. `fighters: null` значит «ходят все» — его нельзя превратить в пустой список.
 */
const forkMovement = movement => {
  if (!isObject(movement)) return movement;
  return {
    ...movement,
    fighters: forkList(movement.fighters),
    moves: forkList(movement.moves),
    origins: forkMap(movement.origins),
    damagedFighterIds: forkList(movement.damagedFighterIds),
  };
};

export const forkState = state => ({
  ...state,
  turn: isObject(state.turn)
    ? {
        ...state.turn,
        bonus: forkMap(state.turn.bonus),
        actedRound: forkList(state.turn.actedRound),
      }
    : state.turn,
  players: Array.isArray(state.players) ? state.players.map(forkPlayer) : state.players,
  combat: forkCombat(state.combat),
  movement: forkMovement(state.movement),
  targeting: isObject(state.targeting)
    ? { ...state.targeting, candidates: forkList(state.targeting.candidates) }
    : state.targeting,
  effect: isObject(state.effect)
    ? { ...state.effect, steps: forkList(state.effect.steps) }
    : state.effect,
  reveal: forkList(state.reveal),
});

export default forkState;
