/**
 * Моменты, в которых движок прогоняет правила способностей (`skill.rules[].moment`) и,
 * когда эффекты карт переедут на эту же модель, правила карт.
 *
 * Список — единственный источник имён моментов: движок падает на неизвестном моменте,
 * а тесты проверяют, что контент использует только известные.
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
];

export const isMoment = name => moments.some(entry => entry.name === name);
