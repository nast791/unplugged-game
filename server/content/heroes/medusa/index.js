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
    heroId: 'medusa',
    name: 'Взгляд Медузы',
    text: 'Начало хода: вы можете нанести 1 урон вражескому бойцу в одной области с Медузой.',
    effects: [
      {
        id: 'gaze',
        triggers: [
          { fact: 'PHASE', params: { id: 'turnStart' } },
          {
            fact: 'FIGHTERS',
            params: { side: 'opponent', areaOf: 'medusa' },
            min: 1,
            var: 'candidates',
          },
        ],
        events: [
          {
            type: 'PROMPT',
            message: 'Применить «Взгляд Медузы»?',
            answers: [
              { value: 'yes', text: 'Да' },
              { value: 'no', text: 'Нет' },
            ],
          },
        ],
      },
      {
        id: 'gaze_yes',
        triggers: [{ fact: 'ANSWER', params: { value: 'yes' } }],
        events: [
          {
            type: 'HIGHLIGHT_TARGETS',
            params: { target: '$candidates' },
            count: 1,
          },
          {
            type: 'DEAL_DAMAGE',
            damage: 1,
            target: 1,
          },
        ],
      },
      {
        id: 'gaze_no',
        triggers: [{ fact: 'ANSWER', params: { value: 'no' } }],
        events: [],
      },
    ],
  },
};
