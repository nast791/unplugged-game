export default {
  id: 'alpha',
  name: 'Альфа',
  color: '#3B82F6',
  heroes: [
    {
      id: 'alpha',
      name: 'Альфа',
      hp: 15,
      move: 2,
      attackType: 'melee',
      attackRange: 1,
      size: 1,
    },
  ],
  assistants: [
    {
      id: 'alpha_pawn',
      name: 'Пешка Альфы',
      hp: 4,
      move: 2,
      attackType: 'melee',
      attackRange: 1,
      size: 1,
      count: 1,
    },
  ],
  items: [],
  skill: {
    id: 'alpha_skill',
    name: 'Стойкость',
    text: 'Схематичный скилл. Позже: правила хоста.',
  },
}
