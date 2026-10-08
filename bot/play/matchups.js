/**
 * Матрица матчапов: веса оценки **для конкретной пары** «мой герой против этого соперника».
 *
 * Источник — обученная модель (`bot/play/value.js`): внутри пары индикаторы героя и соперника постоянны,
 * поэтому линейная оценка сводится к коэффициентам базовых признаков плюс константа. `bot/learn/train.js`
 * считает эту проекцию и пишет её в `bot/play/matchups.json` (читаемый артефакт) и в `bot/play/matchup-weights.js`
 * (зеркало для бандла: в браузере нет `fs`, а импорт JSON с атрибутами бандлер принимает не везде).
 *
 * Проекция **точная** по построению, а не приблизительная: `pairScore` даёт то же число, что `scoreOf`
 * на полных весах (в артефакте числа округлены до трёх знаков, поэтому расхождение до ~0,01). Это
 * стережёт тест `tests/unit/bot/matchups.test.js`. Поэтому артефакт можно читать глазами («как Анубис
 * играет против Медузы») и использовать там, где полный вектор не нужен.
 *
 * Только 2 стороны: в партии на 3–4 игроков берётся первый соперник по порядку мест, а для остальных
 * веса остаются общими — парная матрица честно говорит, что знает только пару.
 */
import generated from './matchup-weights.js';
import { baseFeatureNames, featuresOf } from './value.js';

/** Полный список пар, для которых есть посчитанные веса (пусто — обучение ещё не писáло артефакт). */
export const matchupPairs = (table = generated) =>
  Object.entries(table?.pairs ?? {}).flatMap(([mine, entry]) =>
    Object.keys(entry?.vs ?? {}).map(rival => ({ mine, rival })),
  );

/** Герои пары глазами `viewerId`: свой и первый соперник по порядку мест. */
const heroesOf = (state, viewerId) => {
  const players = [...(state?.players ?? [])].sort(
    (a, b) => (Number(a.order) || 0) - (Number(b.order) || 0),
  );
  const key = String(viewerId);
  const mine = players.find(player => String(player.id) === key) ?? null;
  const rival = players.find(player => String(player.id) !== key) ?? null;
  const heroOf = player => String(player?.heroId ?? player?.id ?? '');

  return { mine: heroOf(mine), rival: heroOf(rival) };
};

/** Веса пары `{ weights, constant }` или `null`, если такой пары в артефакте нет. */
export const pairWeights = (myHeroId, rivalHeroId, table = generated) =>
  table?.pairs?.[String(myHeroId)]?.vs?.[String(rivalHeroId)] ?? null;

/**
 * Проекция полного вектора признаков на коэффициенты пары: базовые признаки получают свои веса плюс
 * взаимодействия (со своим героем и с соперником), а всё постоянное внутри пары уходит в константу.
 * Так строится и артефакт (`bot/learn/train.js`), и его проверка на точность.
 */
export const projectPair = (weights, myHeroId, rivalHeroId) => {
  const mine = String(myHeroId ?? '');
  const rival = String(rivalHeroId ?? '');
  const of = name => Number(weights?.[name]) || 0;
  const constant = of(`hero:${mine}`) + of(`rival:${rival}`);

  return {
    weights: Object.fromEntries(
      baseFeatureNames.map(name => [
        name,
        of(name) + of(`${name}@${mine}`) + of(`${name}@rival:${rival}`),
      ]),
    ),
    constant,
  };
};

/**
 * Оценка позиции весами пары: то же `[-1, 1]`, что у модели. `null` — пары в артефакте нет (или в
 * партии нет соперника): вызывающий тогда берёт ручную формулу, а не догадку.
 */
export const pairScore = (state, viewerId, table = generated) => {
  // терминал важнее признаков — как в самой модели (`scoreOf`) и ручной формуле (`leafScore`)
  if (state?.hook === 'gameEnd') return String(state.winner) === String(viewerId) ? 1 : -1;

  const { mine, rival } = heroesOf(state, viewerId);
  if (mine === '' || rival === '') return null;
  const pair = pairWeights(mine, rival, table);
  if (pair == null) return null;

  const base = featuresOf(state, viewerId).slice(0, baseFeatureNames.length);
  let total = Number(pair.constant) || 0;
  baseFeatureNames.forEach((name, index) => {
    total += (Number(pair.weights?.[name]) || 0) * base[index];
  });

  return Math.max(-1, Math.min(1, Math.tanh(total)));
};

export default pairScore;
