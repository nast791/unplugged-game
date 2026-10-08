import { heroes } from '../../server/content/index.js';
import { factsOf } from './resources.js';

/**
 * Оси героя, которые видны **из его пака**, а не из весов: сейчас это покой.
 *
 * Покой — условие, а не стиль игры: «Погребальный звон» (Анубис) бьёт на 6, только если герой не
 * двигался, «Наотмашь» (Дороти) — та же история, а умение Анубиса судит только стоя. Поэтому шаг для
 * таких героев не нейтрален: он ломает условие их карт, и оценка листа обязана это знать. Проверяется
 * по фактам правил пака (`FIGHTERS { …, movedThisTurn }`) — ни список героев, ни хардкод состояний не
 * нужны: новому герою с таким условием ничего править не придётся.
 */
const cache = new Map();

/** Читает ли пак своего героя через `movedThisTurn` — то есть важен ли ему покой. */
export const stillnessMatters = heroId => {
  const key = String(heroId ?? '');
  if (cache.has(key)) return cache.get(key);

  const pack = heroes[key] ?? null;
  const rules = [pack?.skill, ...(pack?.cards ?? [])].map(entry => entry?.rules ?? []);
  const matters = rules.some(entry =>
    factsOf(entry).some(fact => fact?.params?.movedThisTurn != null),
  );

  cache.set(key, matters);
  return matters;
};

/** Вес покоя для оценки листа: у героя без условий покоя его нет вовсе (нулевой). */
export const stillnessWeight = (heroId, base = 0.1) => (stillnessMatters(heroId) ? base : 0);

export default stillnessMatters;
