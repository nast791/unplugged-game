import { parentPort } from 'node:worker_threads';
import { playDuel } from '../play/duel.js';
import { collectSamples } from './samples.js';

/**
 * Воркер для параллельных прогонов (`bot/learn/parallel.js`): играет партию и отсылает отчёт назад.
 * Партии независимы (свой сид у каждой), поэтому делятся между ядрами без общей памяти.
 *
 * Режим `collect` — сбор выборки для обучения (`bot/learn/train.js`): назад едет только список размеченных
 * позиций, без состояния партии, иначе `postMessage` был бы дороже самой партии.
 */
parentPort.on('message', spec => {
  if (Number(spec?.collect) > 0) {
    try {
      parentPort.postMessage({
        samples: collectSamples(spec, { sampleEvery: Number(spec.collect) }),
      });
    } catch (error) {
      parentPort.postMessage({
        samples: [],
        detail: `исключение в воркере: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
    return;
  }

  let report;

  try {
    report = playDuel(spec);
  } catch (error) {
    report = {
      status: 'invalid',
      seed: spec.seed,
      steps: 0,
      log: [],
      detail: `исключение в воркере: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  parentPort.postMessage(report);
});
