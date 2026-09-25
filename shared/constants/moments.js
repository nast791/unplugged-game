/**
 * Моменты, в которых движок прогоняет правила способностей героев и карт
 * (`<skill|card>.rules[].moment`).
 *
 * Список — единственный источник имён моментов: движок падает на неизвестном моменте,
 * а тесты проверяют, что контент использует только известные.
 * `combat: true` — момент боя: их порядок задаёт очередь эффектов разыгранных карт.
 */
export const moments = [
  {
    name: 'turnStart',
    order: 1,
    title: 'начало хода игрока',
    where: 'lifecycle/turn.js → enter, до первого действия',
  },
  {
    name: 'picked',
    order: 2,
    title: 'цель отмечена в открытом окне выбора',
    where: 'phases/choose.js → moves.PICK (kind: fighter)',
    note: 'окно ещё открыто: отмеченных бойцов отдаёт факт PICKED (движок закрывает окно после прогона)',
  },
  {
    name: 'immediately',
    order: 3,
    combat: 'reveal',
    title: 'немедленно: карты вскрыты, числа и урон ещё не считались',
    where: 'phases/defense.js → окно до расчёта чисел',
    note: 'окно «немедленно»: операций отмены чужих эффектов пока нет, окно заведено, чтобы имя момента не менялось',
  },
  {
    name: 'duringCombat',
    order: 4,
    combat: 'reveal',
    title: 'во время боя: правила меняют числа боя до расчёта',
    where: 'phases/defense.js → второе окно до расчёта чисел',
    note: 'значения считаются финальными после обоих эффектов окна; число меняет SET_COMBAT { op: value }',
  },
  {
    name: 'afterCombat',
    order: 5,
    combat: 'close',
    title: 'после битвы: карты вскрыты, числа и урон уже разыграны',
    where: 'phases/defense.js → окно после расчёта чисел, до закрытия боя',
    note: 'эффекты доигрываются, даже если боец погиб: сгорает только то, что требует бойца на поле; итог боя — факт COMBAT',
  },
];

/** Моменты боя по порядку: ими движок строит очередь эффектов разыгранных карт. */
export const combatMoments = moments
  .filter(entry => entry.combat != null)
  .sort((left, right) => left.order - right.order)
  .map(entry => entry.name);

/**
 * Моменты боя, которые разыгрываются на этой стадии боя (`combat.stage`).
 * До расчёта чисел — immediately и duringCombat, после расчёта — afterCombat.
 */
export const combatMomentsAt = stage =>
  moments
    .filter(entry => entry.combat === stage)
    .sort((left, right) => left.order - right.order)
    .map(entry => entry.name);

export const isMoment = name => moments.some(entry => entry.name === name);
