import { rules } from '#shared/constants/rules.js';

/**
 * Реестр **постоянных эффектов на героя**. Это не боевые статусы (`shared/constants/statuses.js`): те
 * висят на бойце и запрещают действия, а эффект — это включённое правило героя, которое действует, пока
 * его не выключат, и **показывается только у того, на кого действует**.
 *
 * Иконок здесь нет намеренно: у гекса героя стоит один круг «на нём есть эффект», а что именно — читается
 * в подсказке. Поэтому у записи три поля: `id`, `title` (короткое имя), `describe` (строчка для подсказки
 * и для «Важно!»), `active` (условие по открытым данным игрока).
 *
 * Числа и названия берутся из состояния (`player.handLimit`, `player.skill.title`), а не пишутся здесь:
 * один и тот же эффект у разных героев выглядит по-разному.
 */
export const EFFECTS = {
  handLimit: {
    id: 'handLimit',
    title: 'Лимит руки снижен',
    active: ({ player, baseHandLimit }) => {
      const limit = Number(player?.handLimit);

      return Number.isFinite(limit) && limit > 0 && limit < baseHandLimit;
    },
    describe: ({ player }) => `Снижен лимит карт в руке до ${Number(player?.handLimit)}`,
  },
  skill: {
    id: 'skill',
    title: 'Умение действует',
    active: ({ player }) => player?.skillActive === true,
    describe: ({ player }) => `Действует умение «${player?.skill?.title || 'героя'}»`,
  },
};

/** Порядок показа: лимит идёт первым, потому что он и есть причина тревоги. */
export const EFFECT_IDS = Object.keys(EFFECTS);

/**
 * Действующие эффекты игрока: `[]` — значит ни круга у гекса, ни строки «Важно!» (и окно подсказок
 * остаётся таким, каким было).
 */
export const persistentEffectsOf = (player, { baseHandLimit = rules.maxHandSize } = {}) => {
  if (player == null) return [];
  const context = { player, baseHandLimit };

  return EFFECT_IDS.map(id => {
    const effect = EFFECTS[id];
    if (effect.active(context) !== true) return null;

    return { id, title: effect.title, text: String(effect.describe(context)) };
  }).filter(Boolean);
};

/**
 * Текст к строке «Важно!»: перечисление эффектов через точку с запятой, без самого слова — фразу даёт
 * словарь подсказок (`shared/constants/hints.js: notice.effects`), чтобы тексты жили в одном месте.
 * «Важно!» выводится **один раз** на всё перечисление.
 */
export const effectsNoticeText = effects =>
  (effects ?? [])
    .map(effect => String(effect?.text ?? '').trim())
    .filter(Boolean)
    .map((text, index) => (index === 0 ? text : text.charAt(0).toLowerCase() + text.slice(1)))
    .join('; ');
