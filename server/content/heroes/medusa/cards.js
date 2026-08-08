/** Колода Медузы. */
export default [
  {
    id: 'medusa_01',
    title: 'Взгляд смерти',
    type: 'attack',
    value: 2,
    bonus: 4,
    quantity: 3,
    fighter: 'medusa',
    text: 'ПОСЛЕ БИТВЫ: В случае вашей победы враг, которого вы атаковали, получает 8 урона.',
    hook: 'after_combat',
    effects: [
      {
        id: 'death_gaze',
        triggers: [
          { fact: 'PHASE', params: { id: 'after_combat' } },
          {
            fact: 'COMBAT',
            params: { winner: 'self', select: 'defender' },
            var: 'defender',
          },
        ],
        events: [
          { type: 'DEAL_DAMAGE', targets: '$defender', damage: 8 },
        ],
      },
    ],
  },
  {
    "id": "medusa_02",
    "title": "Град стрел",
    "type": "attack",
    "value": 3,
    "bonus": 3,
    "quantity": 3,
    "fighter": "medusa",
    "text": "ВО ВРЕМЯ БИТВЫ: Можете прибавить бонусное значение другой карты к силе этой атаки.",
    "hook": "during_combat"
  },
  {
    "id": "medusa_03",
    "title": "Шепот змей",
    "type": "defense",
    "value": 4,
    "bonus": 3,
    "quantity": 3,
    "fighter": "medusa",
    "text": "ПОСЛЕ БИТВЫ: Ваш враг, участвовавший в битве, должен сбросить 1 карту.",
    "hook": "after_combat"
  },
  {
    "id": "medusa_04",
    "title": "Зов стаи",
    "type": "hybrid",
    "value": 4,
    "bonus": 3,
    "quantity": 2,
    "fighter": "harpies",
    "text": "ПОСЛЕ БИТВЫ: Можете передвинуть каждую Гарпию на расстояние до 3 клеток.",
    "hook": "after_combat"
  },
  {
    "id": "medusa_05",
    "title": "Капкан",
    "type": "hybrid",
    "value": 3,
    "bonus": 2,
    "quantity": 3,
    "fighter": "harpies",
    "text": "ПОСЛЕ БИТВЫ: Ваш оппонент, участвовавший в битве, должен сбросить 1 карту.",
    "hook": "after_combat"
  },
  {
    "id": "medusa_06",
    "title": "Ускорение",
    "type": "hybrid",
    "value": 3,
    "bonus": 1,
    "quantity": 3,
    "fighter": "any",
    "text": "ПОСЛЕ БИТВЫ: Можете передвинуть своего бойца, участвовавшего в этой битве, на расстояние до 3 клеток.",
    "hook": "after_combat"
  },
  {
    "id": "medusa_07",
    "title": "Ядовитая стрела",
    "type": "hybrid",
    "value": 3,
    "bonus": 1,
    "quantity": 3,
    "fighter": "any",
    "text": "ПОСЛЕ БИТВЫ: Доберите 1 карту из колоды.",
    "hook": "after_combat"
  },
  {
    "id": "medusa_08",
    "title": "Обманный маневр",
    "type": "hybrid",
    "value": 2,
    "bonus": 2,
    "quantity": 3,
    "fighter": "any",
    "text": "МГНОВЕННО: Игнорируйте все текстовые свойства на карте оппонента.",
    "hook": "instant"
  },
  {
    "id": "medusa_09",
    "title": "Второе дыхание",
    "type": "hybrid",
    "value": 1,
    "bonus": 2,
    "quantity": 3,
    "fighter": "any",
    "text": "ПОСЛЕ БИТВЫ: Доберите 1 карту из колоды. В случае вашей победы, вместо 1 карты доберите 2.",
    "hook": "after_combat"
  },
  {
    "id": "medusa_10",
    "title": "Роковая встреча",
    "type": "effect",
    "value": null,
    "bonus": 4,
    "quantity": 2,
    "fighter": "medusa",
    "text": "Выберите любого бойца в одной области с Медузой: он получает 2 урона.",
    "hook": "instant"
  },
  {
    "id": "medusa_11",
    "title": "Возрождение стаи",
    "type": "effect",
    "value": null,
    "bonus": 2,
    "quantity": 2,
    "fighter": "any",
    "text": "Передвиньте всех своих бойцов на расстояние до 3 клеток. Допускается проход сквозь клетки с врагами. Потом воскресите 1 убитую Гарпию на любой свободной клетке в области Медузы.",
    "hook": "instant"
  }
]
