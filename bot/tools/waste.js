#!/usr/bin/env node
/**
 * Замер «карты не впустую и партия не тянется»: те же партии, но с разбором **что дала каждая
 * эффектная карта**. Нужен потому, что винрейт этого не показывает: политика может выигрывать 54%,
 * играя половину эффектов в пустоту, — и тогда против живого агрессивного игрока она рассыпается.
 *
 * Считается по каждой партии:
 * - длина партии и её конец (бой или истощение: смерть от истощения не даёт `firstBlood`);
 * - сколько эффектных карт сыграно и у скольких ни одно правило не сработало (`effectWorth.fires === 0`);
 * - у сработавших — обещанная польза (`effectWorth.value`): медиана и максимум.
 *
 * Запуск: `node bot/tools/waste.js --games=40 --heroes=ifrit,snow-queen --policy=greedy`
 */
import { effectWorth } from '../play/cards.js';
import { playDuel } from '../play/duel.js';
import { runGamesParallel } from '../learn/parallel.js';
import { heroIds as poolHeroIds, heroName } from '../play/pool.js';
import { percent } from '../play/metrics.js';

const numberArg = (name, fallback = null) => {
  const found = process.argv.find(value => value.startsWith(`--${name}=`));
  if (found == null) return fallback;
  const value = Number(found.slice(name.length + 3));
  return Number.isFinite(value) ? value : fallback;
};
const stringArg = (name, fallback = null) => {
  const found = process.argv.find(value => value.startsWith(`--${name}=`));
  return found == null ? fallback : found.slice(name.length + 3);
};

const games = numberArg('games', 40);
const from = numberArg('from', 1);
const workers = numberArg('workers', 1);
const maxSteps = numberArg('max-steps', null);
const policy = stringArg('policy', 'greedy');
const policyB = stringArg('policy-b', null);
const requested = (stringArg('heroes') ?? '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);
const unknown = requested.filter(heroId => !poolHeroIds.includes(heroId));
if (unknown.length > 0) {
  console.error(`неизвестные герои: ${unknown.join(', ')} (в контенте: ${poolHeroIds.join(', ')})`);
  process.exit(1);
}

const heroes = requested.length === 0 ? poolHeroIds : requested;
const seeds = Array.from({ length: Math.max(1, games) }, (_, index) => from + index);

/** Свои карты игрока: по ним находим карту действия и считаем её обещание. */
const cardsOf = (state, playerId) =>
  (state.players ?? []).find(player => String(player.id) === String(playerId))?.hand?.cards ?? [];

/** Разбор одного шага: эффектные карты пишем отдельным списком, остальное не трогаем. */
const inspect = spec => {
  const played = [];
  const report = playDuel({
    ...spec,
    onStep: ({ state, playerId, payload }) => {
      if (payload?.kind !== 'card') return;
      const card = cardsOf(state, playerId).find(
        entry => String(entry.instanceId ?? entry.id) === String(payload.id),
      );
      // разбираем только эффекты: у атаки, гибрида и защиты свойство живёт в бою, и там его
      // срабатывание решает сам бой, а не выбор карты
      if (card == null || card.type !== 'effect') return;

      const worth = effectWorth(card, state, playerId);
      played.push({
        playerId: String(playerId),
        cardId: String(card.id),
        fires: worth.fires,
        value: worth.value,
        known: worth.known,
      });
    },
  });

  return { report, played };
};

const specs = [];
for (const heroA of heroes) {
  for (const heroB of heroes) {
    if (heroA === heroB) continue;
    for (const seed of seeds) {
      specs.push({
        seed,
        heroA,
        heroB,
        policy,
        ...(policyB == null ? {} : { policyB }),
        ...(maxSteps == null ? {} : { maxSteps }),
      });
    }
  }
}

const results =
  workers > 1 ? await runGamesParallel(specs, { workers }) : specs.map(spec => inspect(spec));
const withPlayed = results.map(result => {
  if (result?.played) return result;
  // в воркере шаги не собираются: считаем картами, но без разбора (для быстрых прогонов)
  return { report: result, played: [] };
});

const reports = withPlayed.map(entry => entry.report).filter(Boolean);
const played = withPlayed.flatMap(entry => entry.played);
const finished = reports.filter(report => report.status === 'finished');
const lengths = finished.map(report => report.steps);
const median = list => {
  if (list.length === 0) return 0;
  const sorted = [...list].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
};

const exhausted = finished.filter(report => report.metrics?.firstBlood == null).length;
const empty = played.filter(step => step.fires === 0);
const fired = played.filter(step => step.fires > 0);

console.log(
  `партий ${reports.length}: до конца ${finished.length}, застряло ${reports.filter(r => r.status === 'stuck').length}, ` +
    `падений ${reports.filter(r => ['crash', 'deadlock', 'invalid'].includes(r.status)).length}`,
);
console.log(
  `длина: медиана ${median(lengths)}, средняя ${(lengths.reduce((sum, value) => sum + value, 0) / Math.max(1, lengths.length)).toFixed(0)}`,
);
console.log(
  `истощением (без первого убийства): ${exhausted} из ${finished.length} (${percent(exhausted, finished.length)}%)`,
);
console.log(
  `эффектных карт сыграно ${played.length}: впустую ${empty.length} (${percent(empty.length, played.length)}%), ` +
    `сработало ${fired.length}`,
);
if (fired.length > 0) {
  const values = fired.map(step => step.value);
  console.log(
    `польза сработавших: медиана ${median(values).toFixed(1)}, средняя ${(values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)}, ` +
      `максимум ${Math.max(...values).toFixed(1)}`,
  );
}

const byHero = new Map();
for (const step of played) {
  const row = byHero.get(step.playerId) ?? { all: 0, empty: 0 };
  row.all += 1;
  if (step.fires === 0) row.empty += 1;
  byHero.set(step.playerId, row);
}
for (const [heroId, row] of byHero) {
  console.log(
    `  ${heroName(heroId)}: ${row.all} эффектов, впустую ${row.empty} (${percent(row.empty, row.all)}%)`,
  );
}

const byCard = new Map();
for (const step of played) {
  const row = byCard.get(step.cardId) ?? { all: 0, empty: 0 };
  row.all += 1;
  if (step.fires === 0) row.empty += 1;
  byCard.set(step.cardId, row);
}
console.log('по картам (только те, что игрались впустую):');
for (const [cardId, row] of [...byCard.entries()]
  .filter(([, row]) => row.empty > 0)
  .sort((left, right) => right[1].empty - left[1].empty)) {
  console.log(
    `  ${cardId}: ${row.all} раз, впустую ${row.empty} (${percent(row.empty, row.all)}%)`,
  );
}
