/**
 * Медуза — контент из Unmatched-pack/heroes/medusa.
 * Область = клетки одного цвета (node.areas).
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
      attackType: 'ranged',
      attackRange: 1,
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
      attackType: 'melee',
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
    text: 'Начало хода: вы можете нанести 1 урон вражескому бойцу в одной области с Медузой.',
    rules: [
      // Начало хода: есть вражеский боец в области Медузы — предлагаем выбрать одного из них.
      // Если Медузы нет на поле, у areaOf нет ориентира и правило не сработает.
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
