import { runAction, runUi } from '#shared/publicApi.js';
import { createGame } from '../../server/create.js';
import { load, remove, view } from '../../server/party.js';
import { heroes as HEROES } from '../../server/content/index.js';
import { actionsFor, actorOf, pickWeighted } from './decide.js';
import { invariantViolation, signature } from './duel.js';

/**
 * Прогон стола, за которым играют **четыре человека** (hotseat, каждый сам за себя): те же действия,
 * что шлёт клиент (`runAction`), и та же проекция, что он получает (`party.view` на каждое место).
 *
 * Ищет то же, что `playDuel`, плюс то, что видно только за общим столом:
 * - `view` — проекция смотрящего отдала чужое (руку, колоду, чужую расстановку) или скрыла свою;
 * - `invalid` — карт у игрока стало больше, чем было в колоде (карта из ниоткуда).
 *
 * Ход выбирает политика `random` (`bot/play/decide.js`): фаззинг должен ходить так, как человек
 * не додумается, — на этом и ловятся падения.
 */

const HERO_IDS = Object.keys(HEROES);

/** Четыре места: свой герой, своя команда, порядок 1–4 (`TableSetupModal` собирает стол так же). */
export const hotseatSlots = (players, seed) => {
  const start = Math.abs(Number(seed) || 1) % HERO_IDS.length;
  return Array.from({ length: players }, (_, index) => ({
    heroId: HERO_IDS[(start + index) % HERO_IDS.length],
    team: String.fromCharCode(65 + index),
    order: index + 1,
    control: 'human',
  }));
};

const zoneCount = player =>
  ['deck', 'hand', 'discard'].reduce((sum, zone) => sum + (player?.[zone]?.cards?.length ?? 0), 0);

/** Что смотрящий видеть не должен: чужая рука, любая колода, чужая расстановка. */
export const projectionLeak = (state, viewerId) => {
  const seen = view(state, viewerId);
  if (String(seen.you) !== String(viewerId)) {
    return `view(${viewerId}).you = ${seen.you}`;
  }

  for (const player of seen.players ?? []) {
    const own = String(player.id) === String(viewerId);
    if (!own && player.hand?.cards != null) {
      return `смотрящий ${viewerId} видит руку игрока ${player.id}`;
    }
    if (player.deck?.cards != null) {
      return `смотрящий ${viewerId} видит колоду игрока ${player.id}`;
    }
    if (own && player.hand?.cards == null) {
      return `смотрящий ${viewerId} не видит свою руку (игрок ${player.id})`;
    }
    if (!own && state.hook === 'gameStart') {
      const placed = (player.fighters ?? []).filter(fighter => fighter.currentPosition != null);
      if (placed.length > 0) {
        return `смотрящий ${viewerId} видит расстановку игрока ${player.id}`;
      }
    }
  }

  return null;
};

/** Битое действие того же вида: клиент мог прислать устаревший клик — цели у него уже нет. */
const brokenAction = action => {
  if (action.type !== 'PICK') return null;
  const kind =
    action.kind === 'card' || action.kind === 'cell' || action.kind === 'fighter'
      ? action.kind
      : 'option';
  return { ...action, id: `нет_такого_${kind}` };
};

/**
 * Битый или чужой клик: движок вправе отказать (или промолчать), но **тронуть состояние** он не имеет
 * права — иначе испорченным останется host-state клиента, а за общим экраном это конец партии.
 */
const rejectionClean = (state, payload) => {
  const before = signature(state);
  try {
    runAction(state, payload);
  } catch {}
  return signature(state) === before ? null : `состояние изменилось от ${JSON.stringify(payload)}`;
};

/**
 * Одна партия стола: играем до `gameEnd`, до пустого экрана или до лимита шагов.
 * Отчёт — как у `playDuel` (`status`, `seed`, `steps`, `log`), плюс `players`.
 */
export const playHotseat = ({
  seed = 1,
  players = 4,
  maxSteps = 1500,
  mode = 'table',
  testId = null,
  viewEvery = 5,
  probeEvery = 25,
  onStep = null,
} = {}) => {
  const id = testId ?? `hotseat_${players}_${seed}`;
  const log = [];
  const step = { value: 0 };
  let state;
  const report = (status, detail, extra = {}) => ({
    status,
    seed,
    players,
    steps: step.value,
    detail,
    log: [...log],
    state,
    ...extra,
  });

  try {
    createGame(
      { mapId: 'generated', mode, heroes: hotseatSlots(players, seed) },
      {
        testId: id,
        testSeed: seed,
      },
    );
    state = load(id);
  } catch (error) {
    return report('invalid', `стол не собрался: ${error instanceof Error ? error.message : error}`);
  }
  if (!state) return report('invalid', 'партия не сохранилась в реестре сервера');

  const initialCards = new Map(
    (state.players ?? []).map(player => [String(player.id), zoneCount(player)]),
  );
  const rng = { value: (Number(seed) || 1) >>> 0 };
  const style = ((Number(seed) || 1) % 4) + 1;
  const skipAllowed = (Number(seed) || 1) % 5 === 0;
  let previous = signature(state);
  let lastActor = null;

  try {
    for (; step.value < maxSteps; step.value += 1) {
      if (state.hook === 'gameEnd') {
        return state.winner == null
          ? report('invalid', 'партия закончилась без победителя (ничьих быть не должно)')
          : report('finished', null);
      }

      const broken = invariantViolation(state);
      if (broken) return report('invalid', broken);

      for (const player of state.players ?? []) {
        const now = zoneCount(player);
        const was = initialCards.get(String(player.id)) ?? 0;
        if (now > was) {
          return report(
            'invalid',
            `у игрока ${player.id} карт больше, чем было в колоде (${now} > ${was})`,
          );
        }
      }

      const playerId = actorOf(state);
      if (playerId == null) return report('deadlock', 'не нашёлся игрок, который действует');

      // смена действующего — это и есть передача экрана в hotseat: проверяем проекцию всех мест
      const handoff = String(playerId) !== String(lastActor);
      if (handoff || step.value % viewEvery === 0) {
        for (const player of state.players ?? []) {
          let leak = null;
          try {
            leak = projectionLeak(state, player.id);
          } catch (error) {
            leak = `view(${player.id}) упал: ${error instanceof Error ? error.message : error}`;
          }
          if (leak) return report('view', leak);
        }
      }

      const options = actionsFor(state, playerId, { policy: 'random', style, skipAllowed });
      if (options.length === 0) {
        const phase = runUi(state, playerId).phase ?? '—';
        return report(
          'deadlock',
          `нет легальных действий у ${playerId} (hook ${state.hook}, фаза ${phase})`,
        );
      }

      const action = pickWeighted(rng, options);
      const payload = { ...action, playerId };
      if (onStep) {
        const stopped = onStep({ step: step.value, state, playerId, payload, options });
        if (stopped) return report('stopped', String(stopped));
      }

      // битые и чужие клики: состояние после отказа обязано остаться прежним
      if (probeEvery > 0 && step.value % probeEvery === 0) {
        const broken = brokenAction(payload);
        const dirty = broken ? rejectionClean(state, broken) : null;
        if (dirty) return report('reject', dirty, { action: payload });

        const foreign = (state.players ?? [])
          .map(player => String(player.id))
          .find(id => id !== String(playerId));
        const stolen =
          foreign == null ? null : rejectionClean(state, { ...payload, playerId: foreign });
        if (stolen) return report('foreign', stolen, { action: payload, foreign });
      }

      let next;
      try {
        next = runAction(state, payload);
      } catch (error) {
        return report('crash', error instanceof Error ? error.message : String(error), {
          action: payload,
        });
      }

      const current = signature(next);
      if (current === previous) {
        return report('noop', 'действие не изменило состояние', { action: payload });
      }

      previous = current;
      lastActor = playerId;
      log.push(payload);
      state = next;
    }
  } finally {
    remove(id);
  }

  return report('stuck', `партия не завершилась за ${maxSteps} шагов`);
};

export default playHotseat;
