/**
 * DEATH — боец, который только что ушёл с поля (момент `lost`).
 *
 * Данные момента правила получают фактом, а не переменными снаружи: движок на время прогона правил
 * кладёт сведения о погибшем в `state._death` (`shared/rules/run.js`), а факт их читает.
 * Поле служебное: в `stateFields` его нет, значит наружу оно не отдаётся.
 * params: { group, type, source, min } — как у LOST: группа помощников или id бойца, тип бойца,
 * id источника смертельного урона (карта или умение) — «погибает от этого эффекта».
 */
export const DEATH = (ctx, params = {}) => {
  const death = ctx.state?._death ?? null;
  if (!death) return { ok: false, value: [] };

  const group = params.group;
  const type = params.type == null ? null : String(params.type);
  const source = params.source == null ? null : String(params.source);
  const matchesGroup =
    group == null ||
    String(death.group) === String(group) ||
    String(death.fighterId) === String(group);
  const matchesType = type == null || String(death.type) === type;
  const matchesSource = source == null || (death.source != null && String(death.source) === source);
  const ok = matchesGroup && matchesType && matchesSource;
  const min = params.min ?? 1;

  return { ok: ok && min <= 1, value: ok ? [{ ...death }] : [] };
};

export default DEATH;
