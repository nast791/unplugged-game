import { runAction, runUi } from '#shared/gameEngine.js';
import { bfsDistance } from '#shared/helpers/board.js';
import { createGame } from '../../server/create.js';
import { load } from '../../server/party.js';

/**
 * Бот для прогона дуэли: играет партию сам, используя только то, что движок показывает клиенту
 * (`runUi`), — то есть заодно проверяет и контракт интерфейса. Ищет:
 * - `crash` — `runAction` упал;
 * - `deadlock` — партия не закончена, но легальных действий нет (игрок упёрся в пустой экран);
 * - `noop` — действие прошло, но состояние не изменилось (кнопка «ничего не делает»);
 * - `invalid` — нарушен инвариант (боец на чужой клетке, двое на клетке, здоровье выше начального);
 * - `stuck` — партия не завершилась за отведённые шаги.
 *
 * Рандом бота отдельный от игрового (`state.rng`), поэтому прогон воспроизводим по `seed`.
 * Чётные сиды играет Тесла, нечётные — Медуза: порядок героев тоже проверяется.
 */
const nextRandom = state => {
  state.value = (Math.imul(state.value, 1103515245) + 12345) >>> 0;
  return state.value / 0x100000000;
};

const pickWeighted = (rng, options) => {
  const total = options.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = nextRandom(rng) * total;
  for (const entry of options) {
    roll -= entry.weight;
    if (roll <= 0) return entry.action;
  }
  return options[options.length - 1].action;
};

/** Кто сейчас действует: пауза эффекта → окно цели → перемещение → защита → бой → активный игрок. */
export const actorOf = state => {
  if (state.hook === 'gameStart') {
    const waiting = (state.players ?? []).find(player => player.placementReady !== true);
    return waiting?.id ?? null;
  }
  if (state.combat?.choice) return state.combat.choice.playerId;
  if (state.targeting) return state.targeting.playerId;
  if (state.movement) return state.movement.playerId;
  if (state.combat?.stage === 'defense') return state.combat.defenderPlayerId;
  if (state.combat) return state.combat.attackerPlayerId;
  return state.turn?.playerId ?? null;
};

const fightersOf = (state, playerId) =>
  (state.players ?? []).find(player => String(player.id) === String(playerId))?.fighters ?? [];

const enemiesOf = (state, playerId) =>
  (state.players ?? [])
    .filter(player => String(player.id) !== String(playerId))
    .flatMap(player => player.fighters ?? [])
    .filter(fighter => fighter.currentPosition != null && fighter.currentHp > 0);

const distanceToNearestEnemy = (state, playerId, cellId) =>
  enemiesOf(state, playerId).reduce((best, enemy) => {
    const distance = bfsDistance(state.map?.nodes ?? [], cellId, enemy.currentPosition, null);
    return distance < best ? distance : best;
  }, Infinity);

/** Действия на расстановке: поставить бойца на подсвеченную клетку либо подтвердить. */
const placementActions = (state, playerId) => {
  const options = [];

  for (const fighter of fightersOf(state, playerId)) {
    if (fighter.currentPosition != null) continue;
    const ui = runUi(state, playerId, { selectedFighterId: fighter.id });
    for (const cellId of ui.highlightedCellIds ?? []) {
      options.push({
        weight: 1,
        action: {
          type: 'PICK',
          kind: 'cell',
          id: Number(cellId),
          fighterId: fighter.id,
        },
      });
    }
  }

  const ui = runUi(state, playerId);
  if (ui.modals?.pickNumHero) {
    for (const fighter of fightersOf(state, playerId)) {
      if (fighter.type !== 'hero') continue;
      options.push({
        weight: 1,
        action: { type: 'PICK', kind: 'fighter', id: fighter.id },
      });
    }
  }
  if (ui.controls?.ok?.visible && ui.controls.ok.enabled) {
    options.push({ weight: 3, action: { type: 'UI_OK' } });
  }

  return options;
};

/** Ходы в перемещении: шаги по подсвеченным клеткам (охотнее — в сторону врага) и «закончить». */
const movementActions = (state, playerId, movement) => {
  const options = [];
  // есть ли шаг, который реально приближает к врагу: если да — двигаемся, если нет — заканчиваем
  let closerStep = false;

  for (const fighterId of movement.fighters ?? []) {
    const fighter = fightersOf(state, playerId).find(
      entry => String(entry.id) === String(fighterId),
    );
    if (!fighter) continue;
    const ui = runUi(state, playerId, { selectedFighterId: fighterId });
    for (const cellId of ui.highlightedCellIds ?? []) {
      const closer =
        distanceToNearestEnemy(state, playerId, Number(cellId)) <
        distanceToNearestEnemy(state, playerId, fighter.currentPosition);
      if (closer) closerStep = true;
      options.push({
        weight: closer ? 3 : 1,
        action: {
          type: 'PICK',
          kind: 'cell',
          id: Number(cellId),
          fighterId: fighter.id,
        },
      });
    }
  }

  // завершить перемещение можно всегда, но шаг «весит» больше: бот двигает всех, кого может.
  // Когда приближаться больше некуда — заканчиваем, иначе бот бесконечно ходит туда-обратно
  if (runUi(state, playerId).controls?.ok?.enabled) {
    options.push({ weight: closerStep ? 1 : 10, action: { type: 'UI_OK' } });
  }

  return options;
};

/** Все действия, которые движок сейчас принимает от игрока (по данным `runUi`). */
export const actionsFor = (state, playerId, style = 2, skipAllowed = false) => {
  if (state.hook === 'gameStart') return placementActions(state, playerId);

  // окно вариантов свойства: свойства используем. Отказ — только в «осторожных» прогонах
  // (`skipAllowed`): по умолчанию бот ничего не пропускает, иначе редкие эффекты не проверяются
  const ui = runUi(state, playerId);
  const choices = (ui.choices ?? []).filter(choice => !choice.disabled);
  if (choices.length > 0) {
    const options = choices.map(choice => ({
      weight: 1,
      action: { type: 'PICK', kind: 'option', id: choice.optionId },
    }));
    if (skipAllowed && ui.controls?.ok?.visible && ui.controls.ok.enabled) {
      options.push({ weight: 1, action: { type: 'UI_OK' } });
    }
    return options;
  }

  // окно выбора цели (способность или эффект карты)
  const targeting = state.targeting;
  if (targeting && String(targeting.playerId) === String(playerId)) {
    const options = (targeting.candidates ?? []).map(candidate => ({
      weight: 1,
      action:
        targeting.kind === 'cells'
          ? { type: 'PICK', kind: 'cell', id: Number(candidate.cellId) }
          : targeting.kind === 'options'
            ? { type: 'PICK', kind: 'option', id: candidate.optionId }
            : { type: 'PICK', kind: 'fighter', id: candidate.fighterId },
    }));
    if (skipAllowed && targeting.required !== true) {
      options.push({ weight: 1, action: { type: 'UI_OK' } });
    }
    return options;
  }

  // пауза перемещения от эффекта
  if (state.movement && String(state.movement.playerId) === String(playerId)) {
    return movementActions(state, playerId, state.movement);
  }

  // пауза выбора карты в бою (бонус, сброс)
  if (state.combat?.choice) {
    const options = (ui.playableCardIds ?? []).map(cardId => ({
      weight: 1,
      action: { type: 'PICK', kind: 'card', id: cardId },
    }));
    if (skipAllowed && ui.controls?.ok?.enabled) {
      options.push({ weight: 1, action: { type: 'UI_OK' } });
    }
    return options;
  }

  // выбор атакующего или цели: фаза сама говорит, ждёт ли она клика по бойцу (highlighted — кандидаты)
  if (state.combat && !state.targeting) {
    const options = ui.pickFighters
      ? (ui.highlightedFighterIds ?? []).map(fighterId => ({
          weight: 1,
          action: { type: 'PICK', kind: 'fighter', id: fighterId },
        }))
      : [];
    // цель могла быть выбрана движком сама — тогда остаётся ждать защиту
    if (options.length === 0 && ui.controls?.ok?.enabled) {
      options.push({ weight: 1, action: { type: 'UI_OK' } });
    }
    return options;
  }

  // обычный ход: бой, перемещение, эффектная карта, сброс руки, конец действия.
  // Стиль партии зависит от сида (жёсткость/осторожность), чтобы прогоны не были однообразными
  const options = [];
  for (const cardId of ui.playableCardIds ?? []) {
    const isAttack = playerCards(state, playerId).some(
      card =>
        String(card.instanceId ?? card.id) === String(cardId) &&
        (card.type === 'attack' || card.type === 'hybrid'),
    );
    options.push({
      weight: isAttack ? 2 + style * 2 : 6 - style,
      action: { type: 'PICK', kind: 'card', id: cardId },
    });
  }
  if (ui.deck?.clickable) {
    options.push({ weight: 6 - style, action: { type: 'PICK', kind: 'deck' } });
  }
  if (ui.controls?.ok?.visible && ui.controls.ok.enabled) {
    options.push({ weight: style, action: { type: 'UI_OK' } });
  }

  return options;
};

const playerCards = (state, playerId) =>
  (state.players ?? []).find(player => String(player.id) === String(playerId))?.hand?.cards ?? [];

/** Идентификатор карты без номера копии (`medusa_04_1` → `medusa_04`) — для отчёта о покрытии. */
export const cardIdOf = cardId => String(cardId ?? '').replace(/_\d+$/, '');

/** Что бот успел потрогать за прогон: сыгранные карты и выбранные варианты свойств. */
export const coverageOf = logs => {
  const cards = new Set();
  const options = new Set();

  for (const action of logs) {
    if (action.kind === 'card') cards.add(cardIdOf(action.id));
    if (action.kind === 'option') options.add(String(action.id));
  }

  return { cards: [...cards].sort(), options: [...options].sort() };
};

/** Отпечаток состояния: по нему видно, изменилось ли что-то после действия. */
const signature = state =>
  JSON.stringify({
    hook: state.hook,
    round: state.round,
    turn: [state.turn?.playerId, state.turn?.actionsLeft],
    combat: [
      state.combat?.stage,
      state.combat?.attackerFighterId,
      state.combat?.targetFighterId,
      state.combat?.choice?.playerId,
      state.combat?.choice?.picked ?? null,
      state.combat?.effects?.map(step => step.status),
    ],
    targeting: [state.targeting?.playerId, state.targeting?.picked ?? null],
    movement: [state.movement?.playerId, state.movement?.moves?.length ?? 0],
    effect: [state.effect?.source ?? null, state.effect?.steps?.map(step => step.status)],
    fighters: (state.players ?? []).map(player =>
      (player.fighters ?? []).map(fighter => [
        fighter.id,
        fighter.currentPosition,
        fighter.currentHp,
      ]),
    ),
    zones: (state.players ?? []).map(player => [
      player.hand?.cards?.length ?? 0,
      player.deck?.cards?.length ?? 0,
      player.discard?.cards?.length ?? 0,
    ]),
    items: (state.players ?? []).map(player => (player.items ?? []).map(item => item.state)),
  });

/**
 * Проверки, которые должны выполняться в любой момент партии: бойцы на существующих клетках,
 * один боец на клетку, здоровье не выше начального. Нарушение — такой же баг, как падение.
 */
export const invariantViolation = state => {
  const nodes = new Set((state.map?.nodes ?? []).map(node => String(node.id)));
  const occupied = new Map();

  for (const player of state.players ?? []) {
    for (const fighter of player.fighters ?? []) {
      if (fighter.currentPosition == null) continue;
      const cell = String(fighter.currentPosition);
      if (!nodes.has(cell)) {
        return `боец ${fighter.id} стоит на несуществующей клетке ${cell}`;
      }
      if (occupied.has(cell)) {
        return `на клетке ${cell} двое: ${occupied.get(cell)} и ${fighter.id}`;
      }
      occupied.set(cell, fighter.id);

      if (fighter.startHp != null && Number(fighter.currentHp) > Number(fighter.startHp)) {
        return `${fighter.id}: здоровье ${fighter.currentHp} выше начального ${fighter.startHp}`;
      }
    }
  }

  return null;
};

export const createDuel = (seed, testId, { teslaFirst = false, mapId = 'arena' } = {}) => {
  const medusa = {
    heroId: 'medusa',
    team: teslaFirst ? 'B' : 'A',
    order: teslaFirst ? 2 : 1,
    control: 'human',
  };
  const tesla = {
    heroId: 'tesla',
    team: teslaFirst ? 'A' : 'B',
    order: teslaFirst ? 1 : 2,
    control: 'human',
  };

  createGame(
    {
      mapId,
      mode: 'hotseat',
      heroes: teslaFirst ? [tesla, medusa] : [medusa, tesla],
    },
    { testId, testSeed: seed },
  );
  return load(testId);
};

/**
 * Один прогон партии: бот играет до `gameEnd`, до пустого экрана или до лимита шагов.
 * Возвращает отчёт: статус, шаги, лог действий (по нему баг воспроизводится) и подробности.
 * `onStep` — точка для отладки: вызывается перед каждым действием.
 */
export const playDuel = ({
  seed = 1,
  maxSteps = 400,
  testId = `fuzz_${seed}`,
  mapId = 'arena',
  onStep = null,
} = {}) => {
  const rng = { value: (Number(seed) || 1) >>> 0 };
  const teslaFirst = (Number(seed) || 1) % 2 === 0;
  // стиль партии: одни сиды играют агрессивно, другие осторожно
  const style = ((Number(seed) || 1) % 4) + 1;
  // каждый пятый прогон «осторожный»: там бот отказывается от свойств (проверяем и путь отказа)
  const skipAllowed = (Number(seed) || 1) % 5 === 0;
  let state = createDuel(seed, testId, { teslaFirst, mapId });
  const log = [];
  let previous = signature(state);

  for (let step = 0; step < maxSteps; step += 1) {
    if (state.hook === 'gameEnd') {
      if (state.winner == null) {
        return {
          status: 'invalid',
          seed,
          steps: step,
          log,
          state,
          detail: 'партия закончилась без победителя (ничьих быть не должно)',
        };
      }
      return { status: 'finished', seed, steps: step, log, state };
    }

    const broken = invariantViolation(state);
    if (broken) {
      return { status: 'invalid', seed, steps: step, log, state, detail: broken };
    }

    const playerId = actorOf(state);
    if (playerId == null) {
      return {
        status: 'deadlock',
        seed,
        steps: step,
        log,
        state,
        detail: 'не нашёлся игрок, который действует',
      };
    }

    const options = actionsFor(state, playerId, style, skipAllowed);
    if (options.length === 0) {
      return {
        status: 'deadlock',
        seed,
        steps: step,
        log,
        state,
        detail: `нет легальных действий у ${playerId} (hook ${state.hook}, фаза ${
          runUi(state, playerId).phase ?? '—'
        })`,
      };
    }

    const action = pickWeighted(rng, options);
    const payload = { ...action, playerId };
    if (onStep) onStep({ step, state, playerId, payload });

    let next;
    try {
      next = runAction(state, payload);
    } catch (error) {
      return {
        status: 'crash',
        seed,
        steps: step,
        log,
        state,
        action: payload,
        detail: error instanceof Error ? error.message : String(error),
      };
    }

    const current = signature(next);
    if (current === previous) {
      return {
        status: 'noop',
        seed,
        steps: step,
        log,
        state,
        action: payload,
        detail: 'действие не изменило состояние',
      };
    }
    previous = current;
    log.push(payload);
    state = next;
  }

  return { status: 'stuck', seed, steps: maxSteps, log, state };
};

export default playDuel;
