import { playDuel } from '../play/duel.js';
import { featuresOf } from '../play/value.js';

/**
 * Партия с размеченными позициями для обучения оценки (`bot/learn/train.js`).
 *
 * Позиция — снимок признаков (`bot/play/value.js`) глазами того, кто в ней ходит, подпись — исход партии:
 * «я выиграл» / «я проиграл». Партии с поиском стоят секунды, поэтому сбор идёт в воркерах
 * (`bot/learn/parallel.js` → `runSampleGames`), а сюда вынесен только сам сбор: он нужен и воркеру, и
 * прогону в один процесс.
 */
export const collectSamples = (spec, { sampleEvery = 2, ...rest } = {}) => {
  const samples = [];
  const report = playDuel({
    ...spec,
    ...rest,
    onStep: ({ step, state, playerId }) => {
      if (step % sampleEvery !== 0) return;
      samples.push({ features: featuresOf(state, playerId), playerId: String(playerId) });
    },
  });

  // незавершённая партия подписи не даёт: у неё нет победителя, а угадывать исход нельзя
  if (report.status !== 'finished' || report.state.winner == null) return [];
  const winner = String(report.state.winner);
  return samples.map(sample => ({
    features: sample.features,
    label: sample.playerId === winner ? 1 : 0,
  }));
};

export default collectSamples;
