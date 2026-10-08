#!/usr/bin/env node
/**
 * Поставщик партий для тренера: играет партии движком и стримит JSONL-контракт (`trainer/README.md`).
 *
 * Правила остаются здесь, в JS: Python-тренер партии не симулирует, а читает готовые точки решения.
 * Одна строка — одна точка решения: признаки позиции (`bot/play/value.js`), варианты хода с их
 * признаками (`bot/play/actionFeatures.js`), вес политики (`prior`), доли доигрываний поиска (`visits`)
 * и исход партии (`winner`). Первая строка файла — заголовок с именами признаков: он избавляет тренер
 * от дублирования порядка.
 *
 *     node bot/learn/export.js --games=200 --policy=search --out=trainer/data/search.jsonl.gz --gzip
 *     node bot/learn/export.js --games=2000 --policy=greedy --out=trainer/data/greedy.jsonl
 *     node bot/learn/export.js --games=300 --policy=qvalue --out=trainer/data/self.jsonl.gz --gzip
 *
 * `visits` даёт поиск: партия играется поисковой политикой (`search`, `qprior`, …), и `actionsFor` отдаёт
 * варианты последнего решения вместе с долями доигрываний — дневник пишет их как есть, без повторного
 * вызова поиска. Решения без доигрываний можно прореживать флагом `--search-every=N` (тогда у них цель
 * политики — веса предлагателя).
 *
 * `qvalue` — **дневник ученика**: партии играет текущий артефакт тренера (`bot/play/qvalue.js`), а не
 * ручная политика, поэтому состояния в дневнике — свои, а не учительские. Варианты при этом
 * перечисляются жадным предлагателем, как в рантайме (`PROPOSES_GREEDY`), а в заголовок уезжает
 * отпечаток модели: по дневнику видно, какая версия его написала.
 */
import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createGzip } from 'node:zlib';
import {
  ACTION_FEATURES as ACTION_DIM,
  SUMMARY_FEATURES,
  actionFeatures,
  heroOf,
  rivalOf,
} from '../play/actionFeatures.js';
import { actionsFor, playDuel } from '../play/duel.js';
import { PLAN_POLICIES, SEARCH_POLICIES } from '../play/decide.js';
import { cardIdOf } from '../play/metrics.js';
import { heroIds } from '../play/pool.js';
import { hasQValue } from '../play/qvalue.js';
import weights from '../play/qvalue-weights.js';
import { leafScore, searchAction, searchBudget } from '../play/search.js';
import { baseFeatureNames, featuresOf } from '../play/value.js';

const numberArg = (name, fallback) => {
  const found = process.argv.find(value => value.startsWith(`--${name}=`));
  const value = found == null ? Number.NaN : Number(found.slice(name.length + 3));
  return Number.isFinite(value) ? value : fallback;
};
const stringArg = (name, fallback) => {
  const found = process.argv.find(value => value.startsWith(`--${name}=`));
  return found == null ? fallback : found.slice(name.length + 3);
};
const flag = name => process.argv.includes(`--${name}`);

const round = value => Math.round((Number(value) || 0) * 10000) / 10000;

/**
 * Отпечаток модели: без него по дневнику не видно, **какая версия** его написала, а сравнивать потом
 * нужно именно с ней. Модель спрашивают две политики — `qvalue` (она ей играет) и `qprior` (она даёт
 * приор корня поиску). `null` — дневник писала ручная политика.
 */
const modelStamp = policy =>
  (policy === 'qvalue' || policy === 'qprior') && hasQValue(weights)
    ? { kind: weights.kind ?? null, meta: weights.meta ?? {} }
    : null;

const SEARCHING = SEARCH_POLICIES;

/**
 * Ключ действия из шага партии. `onStep` (`bot/play/duel.js`) отдаёт `payload` — само действие плюс
 * `playerId` шага, а варианты в списке кандидатов этого поля не несут: без снятия владельца выбранное
 * действие не находилось в списке и `chosen` молча становился нулём (то есть «ученик всегда выбирает
 * первый вариант» — дневник об этом не говорил, а обучение на нём ехало).
 */
const actionKey = payload => {
  const { playerId: owner, ...action } = payload ?? {};
  return JSON.stringify(action);
};

/**
 * Политики, которые варианты **не взвешивают сами**: поиск и планировщик хода выбирают из жадного
 * списка, `qvalue` переставляет готовые веса моделью (`bot/play/decide.js: actionsFor`). Перечислять для
 * дневника нужно ровно тот же список, что видит рантайм: признак «мнение политики»
 * (`bot/play/actionFeatures.js`) считается по весам варианта, и у `qvalue` в игре это веса жадного
 * предлагателя, а не собственный softmax модели. Иначе в дневник уехали бы другие числа.
 *
 * **`trade` — предлагатель рантайма** (`bot/play/ai.js: think` перечисляет ей): это тот же жадный плюс
 * оценка размена (§36–§38), поэтому дневник, собранный ей, учит ученика ровно на том мнении политики,
 * которое он видит в игре. Без этого признаки (§35–§38) до ученика не доезжали: он учился на весах
 * старого жадного.
 */
const PROPOSES_GREEDY = new Set([...SEARCHING, ...PLAN_POLICIES, 'qvalue', 'trade']);

/**
 * Один прогон партии: играет `policy`, а рядом с каждым решением собирает контракт.
 * Возвращает строки JSONL (исход партии дописывается после её конца).
 *
 * Кроме точки решения пишется **ценность хода** (`turn`): оценка позиции сразу после того, как ход
 * игрока закончился (`leafScore` глазами того же игрока). Это то, чего не хватало обучению на своих
 * партиях: исход партии один на сотню решений, а «что принёс ход» известно после каждого хода — и это
 * плотная цель для оценки, а не редкая и шумная.
 */
const exportGame = (spec, { policy, policyB, searchEvery, oracle }) => {
  const rows = [];
  let decisions = 0;
  let missed = 0;
  const seed = Number(spec.seed) || 1;
  // ход, который ещё не кончился: игрок → индексы его строк, ждущих оценку на границе хода
  const pending = new Map();
  let owner = null;

  /** Ход игрока кончился на этом состоянии — все его решения в ходу получают ценность хода. */
  const closeTurn = (playerId, state) => {
    const waiting = pending.get(playerId);
    if (waiting == null) return;
    const value = round(leafScore(state, playerId));
    for (const index of waiting) rows[index].turn = value;
    pending.delete(playerId);
  };

  const report = playDuel({
    ...spec,
    policy,
    policyB,
    // перечисление должно совпасть с тем, что делала партия: у поиска и `qvalue` оно жадное
    // (`PROPOSES_GREEDY`), у остальных — своё, плюс те же производные от сида `style` и `skipAllowed`,
    // что считает `playDuel`
    onStep: ({ step, state, playerId, payload, options }) => {
      // смена активного игрока — граница хода: предыдущий ход закрывается оценкой этого состояния
      const active = state.turn?.playerId == null ? null : String(state.turn.playerId);
      if (active !== owner) {
        if (owner != null) closeTurn(owner, state);
        owner = active;
      }

      const candidates = actionsFor(state, playerId, {
        policy: PROPOSES_GREEDY.has(policy) ? 'greedy' : policy,
        style: (seed % 4) + 1,
        skipAllowed: seed % 5 === 0,
      });
      const key = actionKey(payload);
      const chosen = candidates.findIndex(entry => JSON.stringify(entry.action) === key);
      if (chosen < 0) missed += 1;
      const priorScale = Math.max(...candidates.map(entry => Number(entry.weight) || 0), 1);

      // Источник цели: сама партия (если играет поиск) или **оракул** — поиск, запущенный на моём
      // состоянии. Оракул нужен для партий ученика: тогда ценность есть у **каждого** варианта, а не
      // только у сыгранного, и по ней можно учиться «какой ход был бы лучше», а не «этот ход вышел
      // удачным». Это и есть «учиться на своих ошибках» с критиком: ученик ходит сам, критик оценивает.
      let source = null;
      if (oracle != null) {
        const decision = searchAction(
          state,
          playerId,
          candidates.map(entry => ({ action: entry.action, weight: entry.weight })),
          oracle === 'qprior' ? { ...searchBudget(), priorFrom: 'qvalue' } : searchBudget(),
        );
        source = new Map(
          (decision?.rows ?? []).map(row => [
            row.key,
            { visits: Number(row.visits) || 0, value: round(row.mean) },
          ]),
        );
      } else if (SEARCHING.has(policy) && decisions % Math.max(1, searchEvery) === 0) {
        source = new Map(
          options.map(entry => [
            JSON.stringify(entry.action),
            { visits: Number(entry.visits) || 0, value: round(entry.value ?? 0) },
          ]),
        );
      }
      if (SEARCHING.has(policy)) decisions += 1;

      rows.push({
        v: 1,
        game: seed,
        step,
        player: heroOf(state, playerId),
        rival: rivalOf(state, playerId),
        state: featuresOf(state, playerId).map(round),
        winner: null, // допишем, когда партия закончится
        turn: null, // ценность хода: допишем, когда ход кончится
        chosen: chosen < 0 ? 0 : chosen,
        actions: candidates.map(entry => {
          const actionKeyOf = JSON.stringify(entry.action);
          const goal = source?.get(actionKeyOf);
          return {
            key: actionKeyOf,
            card: entry.action.kind === 'card' ? cardIdOf(String(entry.action.id)) : null,
            prior: round(entry.weight),
            visits: goal == null ? 0 : goal.visits,
            value: goal == null ? 0 : goal.value,
            features: actionFeatures(state, playerId, entry, { priorScale }),
          };
        }),
      });

      // ценность хода считается только у решений **своего** хода: защита в чужом бою к ходу не относится
      if (active != null && active === String(playerId)) {
        const waiting = pending.get(active) ?? [];
        waiting.push(rows.length - 1);
        pending.set(active, waiting);
      }
    },
  });

  const winner = report.state?.winner == null ? null : String(report.state.winner);
  // ход, оборванный концом партии, границы не имеет: его ценность — сам исход
  for (const [playerId, waiting] of pending) {
    const value = winner == null ? null : playerId === winner ? 1 : -1;
    for (const index of waiting) rows[index].turn = value;
  }

  return { rows: rows.map(row => ({ ...row, winner })), missed };
};

const main = async () => {
  const games = Math.max(1, numberArg('games', 200));
  const policy = stringArg('policy', 'search');
  const policyB = stringArg('policy-b', '') || null;
  const from = Math.max(1, numberArg('from', 1));
  const searchEvery = Math.max(1, numberArg('search-every', 1));
  // оракул: политика, которая на каждом решении ученика считает ценность всех вариантов (обычно `search`)
  const oracle = stringArg('oracle', '') || null;
  const out = stringArg('out', 'trainer/data/samples.jsonl');
  const gzip = flag('gzip') || out.endsWith('.gz');
  const requested = stringArg('heroes', '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  const heroes = requested.length > 0 ? requested : heroIds;

  // поток, а не массив: 3000 партий дают сотни тысяч строк, и держать их в памяти незачем
  mkdirSync(dirname(out), { recursive: true });
  const file = createWriteStream(out);
  const sink = gzip ? createGzip() : null;
  if (sink) sink.pipe(file);
  const write = line => (sink ?? file).write(`${line}\n`);
  const finished = new Promise(resolve => file.on('finish', resolve));

  let rows = 0;
  let missed = 0;
  write(
    // заголовок: по нему тренер узнаёт имена признаков позиции и порядок «сводки», которую модель
    // скрещивает с признаками действия — дублировать этот порядок в Python не нужно
    JSON.stringify({
      v: 1,
      header: true,
      baseFeatures: baseFeatureNames,
      summaryFeatures: SUMMARY_FEATURES,
      actionFeatureDim: ACTION_DIM,
      heroes,
      policy,
      policyB,
      model: modelStamp(policy),
      // контракт несёт ценность хода и (с оракулом) ценность **каждого** варианта
      turnValue: true,
      oracle,
    }),
  );

  for (let index = 0; index < games; index += 1) {
    const heroA = heroes[index % heroes.length];
    const heroB = heroes[(index + 1) % heroes.length];
    const seed = from + index;
    const game = exportGame({ seed, heroA, heroB }, { policy, policyB, searchEvery, oracle });
    missed += game.missed;
    for (const row of game.rows) {
      write(JSON.stringify(row));
      rows += 1;
    }
    if ((index + 1) % 100 === 0) console.log(`  партий ${index + 1}/${games}, строк ${rows}`);
  }

  (sink ?? file).end();
  await finished;
  console.log(
    `экспорт: ${out} — партий ${games}, точек решения ${rows}, политика ${policy}` +
      (policyB ? ` против ${policyB}` : ''),
  );
  // выбранное действие обязано находиться в списке вариантов: не нашлось — дневник учит не тому
  console.log(
    missed === 0
      ? 'выбранное действие нашлось во всех точках решения'
      : `ВНИМАНИЕ: выбранное действие не нашлось в ${missed} точках решения (chosen = 0)`,
  );
  console.log(`проверка контракта: python trainer/train.py --data=${out} --check`);
};

await main();
