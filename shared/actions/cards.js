import { SET_HEALTH } from '#shared/actions/health.js';
import { rules } from '#shared/constants/rules.js';
import {
  findPlayer,
  playerByRole,
  playerHeroes,
  setZoneCards,
  zoneCards,
} from '#shared/helpers/base.js';
import { cardKey } from '#shared/helpers/cards.js';
import { randomPick, randomValue } from '#shared/helpers/random.js';

const ZONES = ['deck', 'hand', 'discard'];

const zoneName = value => {
  const name = value ?? 'hand';
  if (!ZONES.includes(name)) {
    throw new Error(`SET_CARDS: зона "${name}" (нужны ${ZONES.join(' | ')})`);
  }
  return name;
};

/**
 * Ключи карт из параметра: принимаем и строку, и объект факта (`CARDS` и `HAND` отдают
 * `{ cardId, bonus, … }`) — правило подставляет в `cardIds` то, что вернуло условие.
 */
const cardIdsOf = action => {
  const list = Array.isArray(action.cardIds)
    ? action.cardIds
    : action.cardId == null
      ? []
      : [action.cardId];

  return list
    .map(entry =>
      entry != null && typeof entry === 'object'
        ? (entry.cardId ?? entry.instanceId ?? entry.id)
        : entry,
    )
    .filter(entry => entry != null)
    .map(String);
};

/** Забрать конкретные карты из зоны (порядок сохраняется). */
const takeCards = (player, name, cardIds) => {
  const zone = zoneCards(player[name]);
  const taken = [];
  for (const cardId of cardIds) {
    const index = zone.findIndex(card => cardKey(card) === String(cardId));
    if (index < 0) {
      throw new Error(`SET_CARDS: карты "${cardId}" нет в зоне "${name}"`);
    }
    taken.push(...zone.splice(index, 1));
  }
  setZoneCards(player, name, zone);
  return taken;
};

/** Забрать count карт с верха зоны (верх — конец массива). */
const takeTopCards = (player, name, count) => {
  const zone = zoneCards(player[name]);
  const size = Math.min(Math.max(0, Number(count) || 0), zone.length);
  const taken = zone.splice(zone.length - size, size);
  setZoneCards(player, name, zone);
  return taken;
};

const putCards = (player, name, cards) => {
  if (cards.length === 0) return;
  const zone = zoneCards(player[name]);
  zone.push(...cards);
  setZoneCards(player, name, zone);
};

/** Истощение: за карту, которой не нашлось в колоде, платит главный герой (помощники — нет). */
const exhaust = (partyState, player) => {
  const heroIds = playerHeroes(player)
    .filter(fighter => Number(fighter.currentHp) > 0)
    .map(fighter => String(fighter.id));
  if (heroIds.length === 0) return;

  SET_HEALTH(partyState, { fighterIds: heroIds, delta: -rules.exhaustionDamage });
};

/**
 * SET_CARDS — карты игрока: добор, сброс, перенос между зонами и запись готовых карт в зону.
 * params: { playerId | of, op: 'draw' | 'discard' | 'move' | 'put' | 'shuffle', count?, cardId?, cardIds?,
 *           cards?, from?, to?, zone?, random?, remember? }
 * `of` — чей зоной распоряжаемся: нужно эффектам вида «противник сбрасывает карту» (у действия уже есть
 * свой `playerId` — владелец правила). Кроме id игрока `of` понимает роль (`'opponent'`, `'enemy'`,
 * `'self'`) — так правило момента `picked` называет противника, не заводя переменную: `$enemy` из
 * условия другого правила не переносится (правила независимы, `shared/helpers/base.js: playerByRole`).
 * Добор обязательный: если колода кончилась, за каждую недостающую
 * карту главный герой игрока получает rules.exhaustionDamage (истощение), помощники урон не получают.
 * Сброс колоду не перетасовывает. `random: true` берёт карту из зоны случайно (последовательность партии,
 * helpers/random.js) — так работает «сбрасывает 1 случайную карту»: игрок её не выбирает.
 * Переносом discard → deck | hand закрываются эффекты «вернуть карту из сброса» (верх колоды — конец массива).
 * `cardIds` / `cardId` — ключи карт или объекты факта (`CARDS`, `HAND`): из объекта берётся его `cardId`.
 * `remember` — ключ служебного транзиента `state._remember`: сброшенная карта кладётся туда целиком,
 * и правило читает её поля как `$remembered.<ключ>.<поле>` (`shared/helpers/vars.js`). Транзиент живёт
 * только на время прогона правил момента: слой правил вычищает его из состояния (`shared/rules/run.js`).
 */
export const SET_CARDS = (partyState, action = {}) => {
  const actingId = action.playerId ?? partyState.turn?.playerId;
  const owner = action.of ?? actingId;
  const player = findPlayer(partyState, playerByRole(partyState, actingId, owner));
  if (!player) {
    throw new Error(`SET_CARDS: игрок ${owner} не найден`);
  }

  if (action.op === 'draw') {
    const count = Math.max(0, Number(action.count ?? 1));
    for (let index = 0; index < count; index += 1) {
      if (zoneCards(player.deck).length === 0) {
        exhaust(partyState, player);
        continue;
      }
      putCards(player, 'hand', takeTopCards(player, 'deck', 1));
    }
    return partyState;
  }

  if (action.op === 'discard') {
    const from = zoneName(action.from);
    const to = zoneName(action.to ?? 'discard');
    let cards;

    if (action.random === true) {
      // случайную карту выбирает последовательность партии, а не игрок
      const card = randomPick(partyState, zoneCards(player[from]));
      cards = card ? takeCards(player, from, [cardKey(card)]) : [];
    } else {
      const cardIds = cardIdsOf(action);
      cards = cardIds.length
        ? takeCards(player, from, cardIds)
        : takeTopCards(player, from, action.count ?? 1);
    }

    putCards(player, to, cards);

    // запоминается первая ушедшая карта (при count: 1 — она и есть): её поля правило читает
    // как `$remembered.<ключ>.<поле>`; карт не нашлось — ключа в транзиенте не будет
    if (action.remember != null && cards.length > 0) {
      partyState._remember = {
        ...(partyState._remember ?? {}),
        [String(action.remember)]: cards[0],
      };
    }

    return partyState;
  }

  if (action.op === 'move') {
    const from = zoneName(action.from);
    const to = zoneName(action.to);
    const cardIds = cardIdsOf(action);
    if (cardIds.length === 0) throw new Error('SET_CARDS: move требует cardIds');
    // count ограничивает перенос: «замешайте 3 карты с осколком» берёт первые три из списка
    const limit = action.count == null ? cardIds.length : Math.max(0, Number(action.count) || 0);
    putCards(player, to, takeCards(player, from, cardIds.slice(0, limit)));
    return partyState;
  }

  if (action.op === 'shuffle') {
    // Перемешивание — той же последовательностью партии (Фишер–Йетс): тот же сид — тот же порядок.
    const name = zoneName(action.zone ?? 'deck');
    const zone = zoneCards(player[name]);
    for (let index = zone.length - 1; index > 0; index -= 1) {
      const swap = randomValue(partyState) % (index + 1);
      [zone[index], zone[swap]] = [zone[swap], zone[index]];
    }
    setZoneCards(player, name, zone);
    return partyState;
  }

  if (action.op === 'put') {
    const to = zoneName(action.to);
    const cards = Array.isArray(action.cards) ? action.cards : [];
    if (cards.length === 0) throw new Error('SET_CARDS: put требует cards');
    putCards(player, to, cards);
    return partyState;
  }

  throw new Error('SET_CARDS: op (нужны draw | discard | move | put | shuffle)');
};

export default SET_CARDS;
