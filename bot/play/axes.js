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

/**
 * **Хрупкая механика**: пак гасит свой предмет по смерти бойца — у Анубиса правило умения выключает пелену
 * «не активной навсегда», когда мертва Амат (`LOST` → `SET_ITEM`). Признак читается из правил пака, а не
 * из списка героев: новому герою с такой же связкой править бота не придётся.
 *
 * Зачем отдельная ось (§72). Убывающий ресурс и выключенный навсегда выключатель — разные вещи: первый
 * собирается и тратится, второй либо цел, либо потерян. Пока оба считались признаком `resource`, потеря
 * пелены читалась моделью как «ресурс убыл» и **прибавляла** оценку. Цену потери теперь задаёт пак.
 */
const fragileCache = new Map();

export const fragileMechanic = heroId => {
  const key = String(heroId ?? '');
  if (fragileCache.has(key)) return fragileCache.get(key);

  const pack = heroes[key] ?? null;
  const rules = [pack?.skill, ...(pack?.items ?? []), ...(pack?.cards ?? [])].flatMap(
    entry => entry?.rules ?? [],
  );
  // `SET_ITEM` в `then` и `LOST` в условиях — связка «смерть бойца выключает предмет»; разбор по тексту
  // правила, как в `bot/play/pool.js: assistantImportance`
  const fragile = rules.some(
    rule =>
      factsOf([rule]).some(fact => fact?.fact === 'LOST') &&
      JSON.stringify(rule?.then ?? []).includes('"SET_ITEM"'),
  );

  fragileCache.set(key, fragile);
  return fragile;
};

/** Цена потерянной навсегда механики в единицах листа (`0` — терять нечего). */
export const mechanicLossWeight = (heroId, base = 1.2) => (fragileMechanic(heroId) ? base : 0);

export default stillnessMatters;
