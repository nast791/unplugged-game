#!/usr/bin/env node
/**
 * Мера «различает ли модель варианты» — для аудита, а не для замера силы.
 *
 * Внутри одного решения варианты сравниваются по цели дневника (веса политики, доли доигрываний или
 * ценность варианта), и считается доля пар, где модель согласна с целью. Случайная база — 50%:
 * она и есть точка отсчёта. Так видно, где конвейер работает (на предсказуемой цели согласие высокое),
 * а где цель выведена из поиска и линейная модель её не берёт (согласие **ниже** 50% — модель выучила
 * не тот порядок, а не «недоучилась»).
 *
 * Пара с **равными** оценками считается несогласием (модель варианты не различила). Читая ноль, сначала
 * проверь, не близнецы ли варианты в признаках: у действий-клеток вектор отличается только стихией и весом
 * политики, поэтому «0%» там значит «слепа», а не «порядок перевёрнут» (§28 `docs/hero-balance.md`).
 *
 *     node bot/tools/rank.js --data=trainer/data/greedy.jsonl.gz --target=prior
 *     node bot/tools/rank.js --data=trainer/data/oracle-a.jsonl.gz --target=value --weights=trainer/artifacts/oracle-linear.json
 */
import { createReadStream, readFileSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { scoreAction } from '../play/qvalue.js';
import live from '../play/qvalue-weights.js';

const stringArg = (name, fallback) => {
  const found = process.argv.find(value => value.startsWith(`--${name}=`));
  return found == null ? fallback : found.slice(name.length + 3);
};

const target = stringArg('target', 'prior');
const weightsPath = stringArg('weights', '');
const table = weightsPath === '' ? live : JSON.parse(readFileSync(weightsPath, 'utf8'));
const limit = Number(stringArg('limit', '6000'));
const data = stringArg('data', 'trainer/data/greedy.jsonl.gz');

const GOALS = {
  prior: action => Number(action.prior) || 0,
  visits: action => Number(action.visits) || 0,
  value: action => Number(action.value) || 0,
  // «сыгранное действие» — цель, у которой значение есть только у выбора ученика
  chosen: (action, index, row) => (index === row.chosen ? 1 : 0),
};
const goalOf = GOALS[target];
if (goalOf == null) {
  console.error(`--target: неизвестная цель "${target}" (нужны ${Object.keys(GOALS).join(' | ')})`);
  process.exit(1);
}

/** Первые `limit` точек решения: дневники большие, читаем потоком и закрываем файл досрочно. */
const readRows = async path => {
  const rows = [];
  const stream = createReadStream(path).pipe(createGunzip());
  let buffer = '';
  try {
    for await (const chunk of stream) {
      buffer += chunk;
      let index = buffer.indexOf('\n');
      while (index >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (line.length > 0) {
          const row = JSON.parse(line);
          if (!row.header) rows.push(row);
          if (rows.length >= limit) {
            stream.destroy();
            return rows;
          }
        }
        index = buffer.indexOf('\n');
      }
    }
  } catch {
    /* поток закрыт досрочно — это нормально */
  }
  return rows;
};

let decisions = 0;
let top1 = 0;
let pairs = 0;
let right = 0;
let randomRight = 0;
let totalRegret = 0;
let worstPicks = 0;
let state = 1;

/**
 * Разрез по **составу решения**: все варианты — клетки, или среди них есть карты. Нужен потому, что
 * мера «согласие по парам» слепа к одинаковым оценкам, а именно на клетках они и совпадали: до блока
 * признаков клетки (`bot/play/actionFeatures.js`, §28) 86,7% таких решений получали одну и ту же оценку,
 * и ноль согласия читался как «порядок перевёрнут». Здесь видно и то, и другое: доля равных пар и доля
 * решений, где модель не различила ни одного варианта.
 */
const byKind = new Map();
const kindOf = offered => {
  if (offered.every(entry => Number(entry.action.features?.[3]) === 1)) return 'только клетки';
  if (offered.some(entry => Number(entry.action.features?.[0]) === 1)) return 'есть карты';
  return 'прочее';
};
const kindRow = name => {
  const found = byKind.get(name) ?? {
    decisions: 0,
    top1: 0,
    pairs: 0,
    right: 0,
    equalPairs: 0,
    flat: 0,
    distinct: 0,
  };
  byKind.set(name, found);
  return found;
};

const byHero = new Map();
for (const row of await readRows(data)) {
  const offered = row.actions
    .map((action, index) => ({ action, index }))
    .filter(entry => Number(entry.action.prior) > 0);
  if (offered.length < 2) continue;

  const goals = offered.map(entry => goalOf(entry.action, entry.index, row));
  const best = Math.max(...goals);
  const worst = Math.min(...goals);
  if (best <= 0) continue;

  const scores = offered.map(entry =>
    scoreAction(table, {
      stateFeatures: row.state,
      action: entry.action.features,
      hero: row.player,
      rival: row.rival,
      card: entry.action.card,
    }),
  );

  const chosenSlot = offered.findIndex(entry => entry.index === row.chosen);
  const regret = best - (chosenSlot < 0 ? 0 : goals[chosenSlot]);
  const rowOf = hero => {
    const found = byHero.get(hero) ?? {
      decisions: 0,
      top1: 0,
      pairs: 0,
      right: 0,
      regret: 0,
      worst: 0,
    };
    byHero.set(hero, found);
    return found;
  };
  const mine = rowOf(row.player);
  const kind = kindRow(kindOf(offered));

  decisions += 1;
  totalRegret += regret;
  if (chosenSlot >= 0 && goals[chosenSlot] === worst) worstPicks += 1;
  const hit = goals[scores.indexOf(Math.max(...scores))] === best;
  if (hit) top1 += 1;
  mine.decisions += 1;
  mine.regret += regret;
  if (chosenSlot >= 0 && goals[chosenSlot] === worst) mine.worst += 1;
  if (hit) mine.top1 += 1;
  kind.decisions += 1;
  if (hit) kind.top1 += 1;
  const distinct = new Set(scores).size;
  kind.distinct += distinct;
  if (distinct === 1) kind.flat += 1;

  for (let x = 0; x < offered.length; x += 1) {
    for (let y = x + 1; y < offered.length; y += 1) {
      if (goals[x] === goals[y]) continue;
      pairs += 1;
      mine.pairs += 1;
      kind.pairs += 1;
      // «монетка» — точка отсчёта: она бросается на **каждой** паре с разными целями, поэтому база выходит
      // ровно 50%. Раньше бросок стоял после проверки равных оценок, и пары-близнецы попадали в `pairs`,
      // но не в базу — она печаталась как 35% и «монеткой» уже не была (ГПСЧ здесь xorshift, младший бит)
      state ^= state << 13;
      state >>>= 0;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      if (goals[x] > goals[y] === (state % 2 === 1)) randomRight += 1;

      if (scores[x] === scores[y]) {
        kind.equalPairs += 1;
        continue;
      }
      if (goals[x] > goals[y] === scores[x] > scores[y]) {
        right += 1;
        mine.right += 1;
        kind.right += 1;
      }
    }
  }
}

const share = (part, total) => `${((part / Math.max(1, total)) * 100).toFixed(1)}%`;
console.log(
  `${data} (цель ${target}, артефакт ${weightsPath || 'живой'}): решений ${decisions}, ` +
    `лучший вариант угадан ${share(top1, decisions)}, пар ${pairs}, ` +
    `согласие с целью ${share(right, pairs)} (случайная база ${share(randomRight, pairs)})`,
);
console.log(
  `  сожаление (лучший минус выбранный): ${(totalRegret / Math.max(1, decisions)).toFixed(4)} в среднем ` +
    `на решение; выбран худший вариант в ${share(worstPicks, decisions)} решений`,
);
for (const [hero, row] of [...byHero.entries()].sort(
  (left, right) => right[1].decisions - left[1].decisions,
)) {
  console.log(
    `  ${hero}: решений ${row.decisions}, лучший угадан ${share(row.top1, row.decisions)}, ` +
      `согласие ${share(row.right, row.pairs)}, сожаление ${(row.regret / Math.max(1, row.decisions)).toFixed(4)}, ` +
      `худший выбор ${share(row.worst, row.decisions)}`,
  );
}
for (const [kind, row] of [...byKind.entries()].sort(
  (left, right) => right[1].decisions - left[1].decisions,
)) {
  console.log(
    `  ${kind}: решений ${row.decisions}, лучший угадан ${share(row.top1, row.decisions)}, ` +
      `согласие ${share(row.right, row.pairs)}, равных пар ${share(row.equalPairs, row.pairs)}, ` +
      `все оценки равны ${share(row.flat, row.decisions)}, ` +
      `различных оценок ${(row.distinct / Math.max(1, row.decisions)).toFixed(2)}`,
  );
}
