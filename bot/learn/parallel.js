import { cpus } from 'node:os';
import { Worker } from 'node:worker_threads';
import { matchups } from '../play/pool.js';
import { collectSamples } from './samples.js';
import { runSweep } from '../tools/sweep.js';

/**
 * Параллельные прогоны: партии независимы (у каждой свой сид), поэтому делятся между ядрами воркерами
 * (`bot/learn/worker.js`). Нужно для дорогих политик: партия с поиском стоит секунды, и замер на сотни партий
 * без воркеров растягивается на часы. Тем же пулом собирается выборка для обучения оценки
 * (`runSampleGames`, §18).
 *
 * Отчёты ходят через `postMessage` (структурное клонирование): состояние партии остаётся в воркере,
 * наружу уходит только отчёт с `metrics` (или выборка признаков).
 */
const workerUrl = new URL('./worker.js', import.meta.url);

/** Сколько воркеров брать по умолчанию: все ядра, кроме одного (главному тоже нужна работа). */
export const defaultWorkers = () => Math.max(1, cpus().length - 1);

const playOne = spec => {
  try {
    return runSweep([spec.seed], spec)[0];
  } catch (error) {
    return {
      status: 'invalid',
      seed: spec.seed,
      steps: 0,
      log: [],
      detail: `исключение вне партии: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

/**
 * Пул воркеров: каждая задача уходит свободному воркеру, ответы возвращаются в исходном порядке.
 * `prepare` готовит задачу к отправке, `read` превращает ответ воркера в результат, `inline` считает
 * задачу в текущем процессе, когда воркер один.
 */
const runPool = async (
  specs,
  { workers = 0, inline, prepare = spec => spec, read = message => message },
) => {
  if (specs.length === 0) return [];
  const size = Math.max(1, Math.min(workers > 0 ? workers : defaultWorkers(), specs.length));
  if (size === 1) return specs.map(spec => inline(spec));

  const results = new Array(specs.length);
  let next = 0;

  const runWorker = () =>
    new Promise((resolve, reject) => {
      const worker = new Worker(workerUrl);
      const stop = () => {
        worker.removeAllListeners();
        worker.terminate();
      };

      const step = () => {
        const index = next;
        next += 1;
        if (index >= specs.length) {
          stop();
          resolve();
          return;
        }
        worker.once('message', message => {
          results[index] = read(message, specs[index]);
          step();
        });
        worker.postMessage(prepare(specs[index]));
      };

      worker.on('error', error => {
        stop();
        reject(error);
      });
      step();
    });

  await Promise.all(Array.from({ length: size }, runWorker));
  return results;
};

/**
 * Прогнать партии в воркерах и вернуть отчёты в исходном порядке. `workers: 1` (или одна партия) —
 * обычный прогон в текущем процессе, без создания воркеров.
 */
export const runGamesParallel = (specs, { workers = 0 } = {}) =>
  runPool(specs, { workers, inline: playOne });

/**
 * Собрать выборку для обучения (`bot/learn/samples.js`): те же воркеры, но назад едет не отчёт партии,
 * а список размеченных позиций. Отчёт с состоянием в этом режиме не отсылается — он в разы тяжелее
 * самой выборки, а обучению нужны только признаки.
 */
export const runSampleGames = (specs, { workers = 0, sampleEvery = 2 } = {}) =>
  runPool(specs, {
    workers,
    inline: spec => collectSamples(spec, { sampleEvery }),
    prepare: spec => ({ ...spec, collect: sampleEvery }),
    read: message => (message?.detail != null ? [] : (message?.samples ?? [])),
  });

/**
 * Матрица матчапов в воркерах: та же серия сидов на каждую пару, обе стороны (`policy` первым и
 * `policyB` первым) — как в `runMatrix` из `bot/tools/matchup.js`, но партии считаются параллельно.
 */
export const runMatrixParallel = async ({
  heroes,
  seeds,
  mapId = 'generated',
  policy = 'random',
  policyB = null,
  maxSteps = undefined,
  workers = 0,
} = {}) => {
  const pairs = matchups(heroes);
  const jobs = [];

  pairs.forEach((pair, index) => {
    for (const seed of seeds) {
      const base = { seed, heroA: pair.heroA, heroB: pair.heroB, mapId, maxSteps };
      jobs.push({ index, mirror: false, spec: { ...base, policy, policyB } });
      if (policyB)
        jobs.push({ index, mirror: true, spec: { ...base, policy: policyB, policyB: policy } });
    }
  });

  const reports = await runGamesParallel(
    jobs.map(job => job.spec),
    { workers },
  );

  const pairResults = pairs.map(pair => ({ ...pair, reports: [] }));
  const mirrorPairs = policyB ? pairs.map(pair => ({ ...pair, reports: [] })) : null;

  jobs.forEach((job, position) => {
    const report = reports[position];
    if (report == null) return;
    const target = job.mirror ? mirrorPairs[job.index] : pairResults[job.index];
    target.reports.push({ ...report, matchup: `${job.spec.heroA} против ${job.spec.heroB}` });
  });

  return { pairResults, mirrorPairs };
};
