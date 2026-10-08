import { SET_CARDS } from '#shared/actions/cards.js';
import { SET_FIGHTER_CELL } from '#shared/actions/fighter.js';
import { SET_HEALTH } from '#shared/actions/health.js';
import { openMovementChoice, finishMovementChoice } from '#shared/actions/combat.js';
import { pathInRadius } from '#shared/helpers/board.js';
import {
  findCardInHand,
  findOwnedFighter,
  findPlayer,
  isEnemyPlayer,
} from '#shared/helpers/base.js';
import {
  blockedCellsForStep,
  bonusCardIds,
  draftFighter,
  movementBudget,
  movementDestinations,
  movementFighterRejection,
} from '#shared/helpers/turn.js';

const playerIdOf = (partyState, action) => action.playerId ?? partyState.turn?.playerId;

/** Бойцы, стоящие на клетке: урон на проходе бьёт по тем, кто оказался на клетках маршрута. */
const fightersOnCell = (partyState, cellId) => {
  const out = [];
  for (const player of partyState.players ?? []) {
    for (const fighter of player.fighters ?? []) {
      if (fighter.currentPosition == null) continue;
      if (String(fighter.currentPosition) !== String(cellId)) continue;
      out.push({ player, fighter });
    }
  }
  return out;
};

/**
 * Маршрут шага: клетки, которые боец проходит внутри своего радиуса. Шаг — «откуда → куда», поэтому
 * маршрут достраивается кратчайшим путём по тем же клеткам, что и подсветка (`blockedCellsForStep`).
 */
const stepRoute = (partyState, movement, playerId, fighter, cellId) => {
  const player = findPlayer(partyState, playerId);
  if (!player) return null;

  return pathInRadius(
    partyState.map?.nodes ?? [],
    fighter.currentPosition,
    cellId,
    movement.origins?.[String(fighter.id)] ?? fighter.currentPosition,
    movementBudget(fighter, movement),
    blockedCellsForStep(partyState, player, fighter.id, movement),
  );
};

/**
 * Урон на проходе (`damageOnPass`): бойцы противника, стоящие на клетках маршрута. Свои не страдают,
 * а один и тот же боец получает такой урон не больше одного раза за окно движения — повторный вход
 * в его клетку (шаг туда и обратно) урона не удваивает. Урон идёт обычным `SET_HEALTH`: герой теряет
 * здоровье, помощник гибнет на нуле (с моментом `lost` его владельца).
 */
const damagePassedFighters = (partyState, movement, playerId, route, damage) => {
  const done = new Set((movement.damagedFighterIds ?? []).map(String));
  const hurt = [];

  for (const cellId of route) {
    for (const { player, fighter } of fightersOnCell(partyState, cellId)) {
      const fighterId = String(fighter.id);
      if (done.has(fighterId) || !isEnemyPlayer(partyState, playerId, player)) continue;
      done.add(fighterId);
      hurt.push(fighterId);
    }
  }

  movement.damagedFighterIds = [...done];
  if (hurt.length === 0) return partyState;

  // смертельный урон объявляет источник: правило `lost` карты, открывшей перемещение, тоже срабатывает
  return SET_HEALTH(partyState, {
    fighterIds: hurt,
    delta: -damage,
    source: movement.source ?? null,
    playedCard: movement.playedCard ?? null,
    playerId,
  });
};

/** Список бойцов из правила (объекты FIGHTERS, id или строка привязки) → список id. */
const fighterIdList = fighters => {
  if (fighters == null) return null;

  const list = Array.isArray(fighters) ? fighters : [fighters];
  return list
    .map(entry => {
      if (entry == null) return null;
      if (typeof entry === 'object') {
        const id = entry.fighterId ?? entry.id;
        return id == null ? null : String(id);
      }
      return String(entry);
    })
    .filter(Boolean);
};

/**
 * Есть ли куда шагнуть: у каждого возможного бойца проверяются его доступные клетки. Черновик
 * собирается здесь же — проверка идёт по тому состоянию, которое черновик задаёт (бюджет, список
 * бойцов, проход сквозь врагов), а не по владельцу.
 */
export const movementHasDestination = (partyState, draft, playerId) => {
  const movable =
    draft.fighters == null
      ? (findPlayer(partyState, playerId)?.fighters ?? [])
          .filter(
            fighter => movementFighterRejection(partyState, draft, playerId, fighter.id) == null,
          )
          .map(fighter => String(fighter.id))
      : draft.fighters.map(String);

  if (movable.length === 0) return false;
  // проверяем на месте: `movementDestinations` читает черновик из состояния
  const previous = partyState.movement;
  partyState.movement = draft;
  try {
    return movable.some(
      fighterId => movementDestinations(partyState, playerId, fighterId).length > 0,
    );
  } finally {
    partyState.movement = previous;
  }
};

/** Есть ли чем усилить перемещение: карта с бонусом в руке добавляет радиус, то есть и клетки. */
const canExtendMovement = (partyState, playerId) => bonusCardIds(partyState, playerId).length > 0;

/**
 * Открыть черновик перемещения.
 * Обычное перемещение (клик по колоде) — бюджет у каждого бойца свой (`fighter.move`).
 * Перемещение от эффекта карты задаёт правило: `budget` (сколько клеток каждому бойцу),
 * `fighters` (кого вообще можно двигать), `optional` (можно не двигать никого),
 * `throughEnemies` (разрешить проход сквозь врагов — «Возрождение стаи») и `damageOnPass`
 * (урон бойцам противника на клетках маршрута — «Метель из осколков»).
 * Внутри боя такое перемещение ещё и ставит бой на паузу — эффект ждёт, пока игрок подвигал.
 *
 * **Пустое перемещение не открывается** (решение владельца): если ни один боец не может шагнуть ни на
 * одну клетку, окно не появляется вовсе — свойство карты просто не срабатывает, а шаг эффекта
 * отмечается сработавшим. Это защита от тупика: в обязательном окне без клеток не было ни одного
 * легального действия, и партия вставала намертво (`ifrit` против `snow-queen`, сид 33). Исключение —
 * обычное перемещение с картой усиления в руке: она расширяет радиус, значит выбор всё-таки есть.
 * params: { op: 'open', playerId?, budget?, fighters?, optional?, throughEnemies?, damageOnPass?, source?,
 *           playedCard? }
 */
const openMovement = (partyState, action) => {
  if (partyState.movement) {
    throw new Error('SET_MOVEMENT: перемещение уже открыто');
  }

  const playerId = playerIdOf(partyState, action);
  if (playerId == null) throw new Error('SET_MOVEMENT: нужен playerId');
  if (!findPlayer(partyState, playerId)) {
    throw new Error(`SET_MOVEMENT: игрок ${playerId} не найден`);
  }

  const fighters = fighterIdList(action.fighters);
  const budget = action.budget == null ? null : Math.max(0, Number(action.budget) || 0);
  // ноль и мусор в damageOnPass — это «урона нет»: без него поведение перемещения прежнее
  const passDamage = Number(action.damageOnPass);
  const damageOnPass = Number.isFinite(passDamage) && passDamage > 0 ? passDamage : null;

  const draft = {
    playerId: String(playerId),
    origins: {},
    bonus: 0,
    bonusUsed: false,
    budget,
    fighters,
    optional: action.optional === true,
    throughEnemies: action.throughEnemies === true,
    damageOnPass,
    damagedFighterIds: [],
    moves: [],
    source: action.source == null ? null : String(action.source),
    playedCard: action.playedCard ?? null,
  };

  // некуда идти — окно не открываем: у эффекта карта просто не срабатывает, у обычного действия
  // остаётся только карта усиления (она и добавляет радиус)
  if (!movementHasDestination(partyState, draft, playerId)) {
    if (draft.source != null || !canExtendMovement(partyState, playerId)) return partyState;
  }

  partyState.movement = draft;

  // пауза боя нужна только внутри боя: эффектная карта ведёт свою очередь шагов
  if (action.source != null && partyState.combat) {
    openMovementChoice(partyState, {
      playerId,
      source: action.source,
      optional: action.optional === true,
      budget,
      fighters,
    });
  }

  return partyState;
};

/** Шаг бойца: origin запоминается при первом шаге, радиус считается от него. */
const stepMovement = (partyState, action) => {
  const movement = partyState.movement;
  if (!movement) throw new Error('SET_MOVEMENT: перемещение не открыто');

  const playerId = playerIdOf(partyState, action);
  if (String(movement.playerId) !== String(playerId)) {
    throw new Error('SET_MOVEMENT: это чужое перемещение');
  }

  // список из правила важнее владельца: принудительное перемещение двигает чужих бойцов
  const reason = movementFighterRejection(partyState, movement, playerId, action.fighterId);
  if (reason) throw new Error(`SET_MOVEMENT: ${reason}`);

  const fighter = draftFighter(partyState, movement, playerId, action.fighterId);
  if (fighter.currentPosition == null) {
    throw new Error('SET_MOVEMENT: боец не расставлен');
  }

  const fighterId = String(action.fighterId);
  if (movement.origins[fighterId] == null) {
    movement.origins[fighterId] = fighter.currentPosition;
  }

  const from = fighter.currentPosition;

  // урон на проходе: маршрут нужен только тому перемещению, которое его наносит
  const damage = Number(movement.damageOnPass) || 0;
  const route =
    damage > 0 ? stepRoute(partyState, movement, playerId, fighter, action.cellId) : null;

  const state = SET_FIGHTER_CELL(partyState, {
    fighterId: action.fighterId,
    cellId: action.cellId,
  });

  const move = { fighterId, from, to: action.cellId };
  // запись маршрута — только там, где он что-то значит: шаг с уроном на проходе
  if (route) move.route = route;
  movement.moves.push(move);

  if (!route?.length) return state;

  return damagePassedFighters(state, movement, playerId, route, damage);
};

/** Усиление перемещения: карта из руки в сброс, её bonus — всему действию, один раз. */
const applyMovementBonus = (partyState, action) => {
  const movement = partyState.movement;
  if (!movement) throw new Error('SET_MOVEMENT: перемещение не открыто');

  const playerId = playerIdOf(partyState, action);
  if (String(movement.playerId) !== String(playerId)) {
    throw new Error('SET_MOVEMENT: это чужое перемещение');
  }
  if (movement.bonusUsed) {
    throw new Error('SET_MOVEMENT: усиление уже использовано');
  }
  if (action.cardId == null) throw new Error('SET_MOVEMENT: нужен cardId');

  const card = findCardInHand(findPlayer(partyState, playerId), action.cardId);
  if (!card) {
    throw new Error(`SET_MOVEMENT: карты "${action.cardId}" нет в руке`);
  }

  const amount = Number(card.bonus) || 0;
  if (amount <= 0) {
    throw new Error(`SET_MOVEMENT: у карты "${action.cardId}" нет усиления`);
  }

  SET_CARDS(partyState, {
    playerId,
    op: 'discard',
    cardIds: [action.cardId],
  });
  movement.bonus = (Number(movement.bonus) || 0) + amount;
  movement.bonusUsed = true;
  return partyState;
};

const closeMovement = (partyState, action) => {
  const movement = partyState.movement;
  const playerId = playerIdOf(partyState, action);
  if (movement && playerId != null && String(movement.playerId) !== String(playerId)) {
    throw new Error('SET_MOVEMENT: это чужое перемещение');
  }

  /** Перемещение от эффекта карты: ходы забирает пауза боя, её и закрывает фаза. */
  if (movement?.source != null) {
    finishMovementChoice(partyState, movement.moves ?? []);
  }

  partyState.movement = null;
  return partyState;
};

/**
 * SET_MOVEMENT — черновик перемещения: открыть, шагнуть бойцом, усилить, закрыть.
 * params: { op: 'open' | 'step' | 'bonus' | 'close', playerId?, fighterId?, cellId?, cardId?,
 *           budget?, fighters?, optional?, throughEnemies?, damageOnPass? }
 */
export const SET_MOVEMENT = (partyState, action = {}) => {
  const op = action.op ?? 'open';
  if (op === 'open') return openMovement(partyState, action);
  if (op === 'step') return stepMovement(partyState, action);
  if (op === 'bonus') return applyMovementBonus(partyState, action);
  if (op === 'close') return closeMovement(partyState, action);
  throw new Error(`SET_MOVEMENT: op "${op}" (нужны open | step | bonus | close)`);
};

export default SET_MOVEMENT;
