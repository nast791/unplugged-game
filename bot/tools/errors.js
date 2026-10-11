#!/usr/bin/env node
/**
 * **Журнал паттернов ошибок** (§44) — проверка идеи «рефлексии» данными, а не на словах.
 *
 * Владелец предложил: «когда я переместился туда, произошло то-то; решение — попробовать то-то». Чтобы это
 * было обучением, а не дневником наблюдений, паттерн обязан **повторяться в разных позициях** (тогда за ним
 * стоит правило, а не разовая случайность) и быть **измеримым** (тогда видно, стало ли лучше). Этот
 * инструмент считает, какие ошибки повторяются, и в каких контекстах.
 *
 *     node bot/tools/errors.js --data=trainer/data/diary-e.jsonl.gz --limit=20000
 *     node bot/tools/errors.js --data=… --examples=12     # те же примеры в формате «было → надо»
 *
 * Термины (их же печатает отчёт):
 * - **решение** — одна точка дневника: позиция, список вариантов, выбор бота и оценки всех вариантов от
 *   медленного перебора (учителя);
 * - **сожаление** — оценка лучшего варианта минус оценка сыгранного: сколько бот потерял на этом решении;
 * - **паттерн** — признак, который отличает **сыгранный** вариант в этом решении: вид действия, класс шага
 *   (`step`/`away`/`closer`/`idle` — признак 3 и позиция), что было главным отличием выбора;
 * - **повтор** — сколько разных решений (не строк) подпадают под паттерн. Паттерн без повторов — случайность.
 *
 * Вторая метрика — **слепота**: доля решений, где оценки всех вариантов совпали (там модель не различает
 * ничего, и «анализ ошибки» учить нечему — надо отдавать решение правилам, что и делает `byKind`).
 */
import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { scoreAction } from '../play/qvalue.js';
import live from '../play/qvalue-weights.js';

const stringArg = (name, fallback) => {
  const found = process.argv.find(value => value.startsWith(`--${name}=`));
  return found == null ? fallback : found.slice(name.length + 3);
};
const numberArg = (name, fallback) => {
  const value = Number(stringArg(name, ''));
  return Number.isFinite(value) ? value : fallback;
};

const data = stringArg('data', 'trainer/data/diary-e.jsonl.gz');
const limit = numberArg('limit', 8000);
const examples = numberArg('examples', 0);
const weightsPath = stringArg('weights', '');
const table =
  weightsPath === ''
    ? live
    : JSON.parse((await import('node:fs')).readFileSync(weightsPath, 'utf8'));

const goalOf = action => Number(action.value) || 0;

/** Действие из строки дневника: в `key` лежит сам `PICK`/`UI_OK` (без владельца). */
const actionOf = entry => {
  try {
    return JSON.parse(entry.key);
  } catch {
    return {};
  }
};

const kindOf = entry => {
  const action = actionOf(entry);
  return action.kind ?? (action.type === 'UI_OK' ? 'ok' : 'other');
};

/** Класс шага по признакам варианта: 3 — «клетка», 17 — «шаг на свою стихию», 20..22 — геометрия шага. */
const stepKindOf = entry => {
  const f = entry.features ?? [];
  if (Number(f[3]) !== 1) return null;
  // признаки клетки: 20 — дистанция до врага, 21 — враг достаёт клетку, 22 — дистанция до своего бойца
  const threat = Number(f[21]) || 0;
  return { away: threat === 0, threat, distance: Number(f[20]) || 0 };
};

const rows = [];
const stream = createReadStream(data).pipe(createGunzip());
let buffer = '';
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
        break;
      }
    }
    index = buffer.indexOf('\n');
  }
  if (rows.length >= limit) break;
}

const patterns = new Map();
const note = (name, context) => {
  const found = patterns.get(name) ?? { decisions: 0, regret: 0, worst: 0, contexts: new Map() };
  found.decisions += 1;
  patterns.set(name, found);
  if (context != null) found.contexts.set(context, (found.contexts.get(context) ?? 0) + 1);
  return found;
};

/**
 * **Обратная связь по контексту** (§45): ошибки группируются не по нашим ручным правилам, а по тому, что
 * видит **сама модель**: разброс её оценок в решении (уверена / слабо различает / слепа), вес сыгранного
 * варианта у политики (признак 19) и состав решения (только клетки / есть карты). Это те же сигналы,
 * которыми модель пользуется сама, поэтому их можно класть в цель обучения, не изобретая признаков.
 */
const contexts = new Map();
const noteContext = (key, regret, worst) => {
  const found = contexts.get(key) ?? { decisions: 0, regret: 0, worst: 0 };
  found.decisions += 1;
  found.regret += regret;
  if (worst) found.worst += 1;
  contexts.set(key, found);
};

const contextOf = (offered, chosen, scores) => {
  const kinds = new Set(offered.map(entry => kindOf(entry.action)));
  const composition =
    kinds.size === 1 && kinds.has('cell')
      ? 'только клетки'
      : kinds.has('card')
        ? 'есть карты'
        : 'прочее';
  const spread = Math.max(...scores) - Math.min(...scores);
  const certainty =
    spread > 0.2 ? 'модель уверена' : spread > 0.05 ? 'модель слабо различает' : 'модель слепа';
  const prior = Number(chosen?.prior) || 0;
  const priorShare =
    prior < 0.2 ? 'слабый у политики' : prior > 0.8 ? 'сильный у политики' : 'средний у политики';
  return `${composition} | ${certainty} | ${priorShare}`;
};

let decisions = 0;
let blind = 0;
let totalRegret = 0;
let withCards = 0;
let cellsOnly = 0;
const exampleLines = [];

for (const row of rows) {
  const offered = row.actions
    .map((action, index) => ({ action, index }))
    .filter(entry => Number(entry.action.prior) > 0);
  if (offered.length < 2) continue;

  const goals = offered.map(entry => goalOf(entry.action));
  const best = Math.max(...goals);
  const worst = Math.min(...goals);
  if (best <= 0) continue;
  decisions += 1;

  const scores = offered.map(entry =>
    scoreAction(table, {
      stateFeatures: row.state,
      action: entry.action.features,
      hero: row.player,
      rival: row.rival,
      card: entry.action.card,
    }),
  );
  const flat = new Set(scores).size === 1;
  if (flat) blind += 1;

  const chosenSlot = offered.findIndex(entry => entry.index === row.chosen);
  const regret = best - (chosenSlot < 0 ? 0 : goals[chosenSlot]);
  totalRegret += regret;

  const kinds = new Set(offered.map(entry => kindOf(entry.action)));
  const cellsOnlyHere = kinds.size === 1 && kinds.has('cell');
  if (cellsOnlyHere) cellsOnly += 1;
  else withCards += 1;

  const modelBest = scores.indexOf(Math.max(...scores));
  const modelWantsAnother = modelBest !== chosenSlot;

  // паттерн: что отличает сыгранный вариант
  const chosen = offered[chosenSlot];
  if (chosen == null) continue;
  const kind = kindOf(chosen.action);
  const step = kind === 'cell' ? stepKindOf(chosen.action) : null;
  const names = [];
  names.push(`вид: ${kind}`);
  if (step != null) {
    names.push(step.away ? 'шаг: уход из-под удара' : 'шаг: под ударом');
    names.push(`шаг: дистанция ${step.distance > 1 ? 'дальняя' : 'ближняя'}`);
  }
  if (row.player === row.rival) names.push('герой: зеркало');
  // обратная связь по контексту: те же решения, но сгруппированные по тому, что видит сама модель
  noteContext(contextOf(offered, chosen.action, scores), regret, goals[chosenSlot] === worst);
  if (regret === 0) {
    // ошибки нет: считаем только «модель хотела другое», это материал для правил
    if (modelWantsAnother) {
      const found = note('модель предпочла бы другой вариант (сыграно лучше)', null);
      found.regret += 0;
    }
    continue;
  }
  if (modelWantsAnother) {
    const found = note('ошибка: модель хотела другое', null);
    found.regret += regret;
  }
  if (flat) {
    const found = note('ошибка при полной слепоте модели (все оценки равны)', null);
    found.regret += regret;
  }
  if (goals[chosenSlot] === worst) {
    const found = note('ошибка: выбран худший вариант', null);
    found.regret += regret;
    found.worst += 1;
  }
  for (const name of names) {
    const found = note(name, null);
    found.regret += regret;
    if (goals[chosenSlot] === worst) found.worst += 1;
  }
  if (examples > 0 && exampleLines.length < examples && regret > 0.05) {
    const bestAction = offered[goals.indexOf(best)];
    exampleLines.push(
      `партия ${row.game} шаг ${row.step} (${row.player} против ${row.rival}): ` +
        `сыграно ${JSON.stringify(actionOf(chosen.action))} ` +
        `(цена ${goals[chosenSlot].toFixed(3)}), ` +
        `учитель советовал ${JSON.stringify(actionOf(bestAction.action))} ` +
        `(цена ${best.toFixed(3)}, потеря ${regret.toFixed(3)}); ` +
        `оценки бота: сыграно ${scores[chosenSlot]?.toFixed(3)}, ` +
        `у совета ${scores[goals.indexOf(best)]?.toFixed(3)}`,
    );
  }
}

const share = (part, total) => `${((part / Math.max(1, total)) * 100).toFixed(1)}%`;
console.log(
  `${data}: решений ${decisions}, из них только клетки ${cellsOnly} (${share(cellsOnly, decisions)}), ` +
    `с картами ${withCards}`,
);
console.log(
  `сожаление всего ${totalRegret.toFixed(1)}, в среднем ${(totalRegret / Math.max(1, decisions)).toFixed(4)} ` +
    `на решение; слепых решений (все оценки равны) ${blind} (${share(blind, decisions)})`,
);

console.log('\nпаттерны (по частоте):');
const sorted = [...patterns]
  .filter(([, found]) => found.decisions >= 20)
  .sort((left, right) => right[1].decisions - left[1].decisions);
for (const [name, found] of sorted.slice(0, 14)) {
  console.log(
    `  ${String(found.decisions).padStart(6)}  сожаление ${(found.regret / found.decisions).toFixed(3)} ` +
      `худших ${share(found.worst, found.decisions).padStart(6)}  ${name}`,
  );
}

const weak = [...patterns]
  .filter(([, found]) => found.decisions >= 20)
  .sort((left, right) => right[1].regret / right[1].decisions - left[1].regret / left[1].decisions);
console.log('\nгде бот теряет больше всего (сожаление на решение):');
for (const [name, found] of weak.slice(0, 8)) {
  console.log(
    `  ${(found.regret / found.decisions).toFixed(3)}  решений ${String(found.decisions).padStart(5)}  ${name}`,
  );
}

const contextRows = [...contexts]
  .filter(([, found]) => found.decisions >= 20)
  .sort((left, right) => right[1].regret / right[1].decisions - left[1].regret / left[1].decisions);
console.log('\nконтекст глазами самой модели (композиция | её уверенность | вес у политики):');
for (const [name, found] of contextRows) {
  console.log(
    `  потеря ${(found.regret / found.decisions).toFixed(3)} | решений ${String(found.decisions).padStart(5)} | ` +
      `худших ${share(found.worst, found.decisions).padStart(6)} | ${name}`,
  );
}

if (exampleLines.length > 0) {
  console.log('\nпримеры «сыграно → совет учителя»:');
  for (const line of exampleLines) console.log(`  ${line}`);
}
