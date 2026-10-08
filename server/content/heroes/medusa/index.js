/**
 * Медуза — контент из Unmatched-pack/heroes/medusa.
 * Область = стихия клетки, на которой стоит герой (node.terrain, см. docs/terrain.md).
 *
 * skill.effects[] — несколько эффектов с разными triggers.
 * var — записать результат факта в переменную ($name в params).
 */
export default {
  id: 'medusa',
  name: 'Медуза',
  color: '#059669',
  heroes: [
    {
      id: 'medusa',
      name: 'Медуза',
      type: 'hero',
      hp: 16,
      move: 3,
      // дальник: дальность задаёт attackRange (прежний признак attackType убран)
      attackRange: 3,
      size: 1,
    },
  ],
  assistants: [
    {
      id: 'harpies',
      name: 'Гарпии',
      type: 'assistant',
      count: 3,
      hp: 1,
      move: 3,
      attackRange: 1,
      size: 1,
    },
  ],
  items: [],
  skill: {
    id: 'medusa_skill',
    type: 'skill',
    fighter: 'medusa',
    title: 'Взгляд Медузы',
    text: 'НАЧАЛО ХОДА: Выберите вражеского бойца в области Медузы — он получает 1 урон.',
    rules: [
      // Начало хода: есть вражеский боец в области Медузы — предлагаем выбрать одного из них.
      // Если Медузы нет на поле, у areaOf нет ориентира и правило не сработает.
      // `auto: true` — выбор без выбора: враг в области один, движок бьёт его сам, окна нет.
      {
        moment: 'turnStart',
        when: [
          {
            fact: 'FIGHTERS',
            params: { side: 'opponent', areaOf: 'medusa' },
            min: 1,
            var: 'targets',
          },
        ],
        then: [
          {
            action: 'SET_TARGETING',
            op: 'open',
            candidates: '$targets',
            count: 1,
            auto: true,
          },
        ],
      },
      // Цель отмечена (факт PICKED отдаёт отмеченных бойцов) — 1 урон каждому отмеченному;
      // окно после этого закрывает движок.
      {
        moment: 'picked',
        when: [{ fact: 'PICKED', var: 'picked' }],
        then: [{ action: 'SET_HEALTH', fighterIds: '$picked', delta: -1 }],
      },
    ],
  },
};
