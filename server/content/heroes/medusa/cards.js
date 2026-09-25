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
    text: 'ПОСЛЕ БИТВЫ: В случае вашей победы нанесите 8 урона атакованному бойцу.',
    rules: [
      {
        moment: 'afterCombat',
        when: [
          // победителем боя объявлен атакующий (эту карту играет только атакующий)
          { fact: 'COMBAT', params: { winner: 'attacker' } },
          // атакованный боец — тот, кого выбрали целью атаки (герой или помощник)
          { fact: 'COMBAT', params: { select: 'target' }, var: 'victims' },
        ],
        then: [{ action: 'SET_HEALTH', fighterIds: '$victims', delta: -8 }],
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
    "text": "ВО ВРЕМЯ БИТВЫ: Можете сбросить 1 карту с руки, чтобы прибавить ее бонусное значение к значению атаки этой карты.",
    "rules": [
      {
        moment: "duringCombat",
        // усиливать нечем, если в руке нет другой карты с бонусом: тогда эффект не срабатывает
        when: [
          { fact: "HAND", params: { bonusMin: 1 }, min: 1, var: "cards" },
        ],
        then: [
          {
            action: "SET_COMBAT",
            op: "choice",
            effect: "bonus",
            side: "attack",
            max: 1,
            candidates: "$cards",
            optional: true,
          },
        ],
      },
    ]
  },
  {
    "id": "medusa_03",
    "title": "Шепот змей",
    "type": "defense",
    "value": 4,
    "bonus": 3,
    "quantity": 3,
    "fighter": "medusa",
    "text": "ПОСЛЕ БИТВЫ: Оппонент, чей боец участвовал в этой битве, должен сбросить 1 карту.",
    "rules": [
      {
        moment: "afterCombat",
        when: [
          // кто враг в этом бою: id игрока (не список), чтобы подставить его и в руку, и в окно
          { fact: "COMBAT", params: { player: "opponent" }, var: "enemy" },
          // без карт в руке сбрасывать нечего: эффект не срабатывает, штрафов никаких
          { fact: "HAND", params: { of: "$enemy", min: 1 }, var: "enemyCards" },
        ],
        then: [
          {
            action: "SET_COMBAT",
            op: "choice",
            effect: "discard",
            actor: "$enemy",
            max: 1,
            candidates: "$enemyCards",
            optional: false,
          },
        ],
      },
    ]
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
    "rules": [
      {
        moment: "afterCombat",
        // живых Гарпий нет — двигать некого, эффект не срабатывает
        when: [
          {
            fact: "FIGHTERS",
            params: { side: "self", group: "harpies" },
            min: 1,
            var: "harpies",
          },
        ],
        then: [
          {
            action: "SET_MOVEMENT",
            op: "open",
            budget: 3,
            fighters: "$harpies",
            optional: true,
          },
        ],
      },
    ]
  },
  {
    "id": "medusa_05",
    "title": "Капкан",
    "type": "hybrid",
    "value": 3,
    "bonus": 2,
    "quantity": 3,
    "fighter": "harpies",
    "text": "ПОСЛЕ БИТВЫ: Оппонент, чей боец участвовал в этой битве, должен сбросить 1 карту.",
    "rules": [
      {
        moment: "afterCombat",
        when: [
          // враг в этом бою — тот, кто играл против этой карты (карта hybrid: играет любая сторона)
          { fact: "COMBAT", params: { player: "opponent" }, var: "enemy" },
          // без карт в руке сбрасывать нечего: эффект не срабатывает, штрафов никаких
          { fact: "HAND", params: { of: "$enemy", min: 1 }, var: "enemyCards" },
        ],
        then: [
          {
            action: "SET_COMBAT",
            op: "choice",
            effect: "discard",
            actor: "$enemy",
            max: 1,
            candidates: "$enemyCards",
            optional: false,
          },
        ],
      },
    ]
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
    "rules": [
      {
        moment: "afterCombat",
        when: [
          // свой боец в этом бою: у атакующего — атакующий, у защитника — тот, кого били
          { fact: "COMBAT", params: { select: "self" }, var: "battleFighters" },
          // боец погиб в бою — двигать нечего, эффект сгорает
          {
            fact: "FIGHTERS",
            params: { side: "self", fighterIds: "$battleFighters" },
            min: 1,
            var: "fighters",
          },
        ],
        then: [
          {
            action: "SET_MOVEMENT",
            op: "open",
            budget: 3,
            fighters: "$fighters",
            optional: true,
          },
        ],
      },
    ]
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
