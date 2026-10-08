/**
 * Колода Снежной королевы: **13 уникальных карт, 30 копий** — план целиком в `passport.md` §7,
 * число копий стережёт `tests/unit/content/deck-size.test.js`.
 *
 * Механики всех тринадцати карт в движке есть: пороги осколков, заморозка, отмена свойств, добор,
 * обмен картой в бою, клетка льда, замешивание, усиление только что сброшенной карты (`remember` →
 * `$remembered`), «погибла от этой карты» (момент `lost` карты-источника), обзор чужой руки
 * (окно `kind: 'options'` по `CARDS { zone: 'hand' }`) и проход с уроном (`damageOnPass`).
 *
 * Оси героя: **ресурс** (осколки в сбросе: метка `shard` на карте становится осколком, когда карта
 * уходит в сброс) и **контроль** (заморозка, отмена, выбивание карты). Умение — лимит руки — не
 * повторяет ни одна карта (`index.js`).
 */
export default [
  {
    // оба исхода работают на движок: проиграли — бьём по руке, выиграли — платим колодой и тащим врага на лёд
    id: 'snow-queen_01',
    title: 'Зеркальный скол',
    type: 'attack',
    value: 3,
    bonus: 1,
    quantity: 3,
    fighter: 'snow-queen',
    tags: ['shard'],
    text: 'ПОСЛЕ БИТВЫ: Если вы проиграли эту битву, оппонент сбрасывает 1 карту из руки на свой выбор. Если выиграли — сбросьте верхнюю карту своей колоды и можете поставить участвовавшего в битве бойца оппонента на любую свободную клетку льда.',
    rules: [
      {
        moment: 'afterCombat',
        when: [
          { fact: 'COMBAT', params: { winner: 'opponent' } },
          { fact: 'COMBAT', params: { player: 'opponent' }, var: 'enemy' },
          // сбрасывать нечего, если рука пуста: окно не открывается
          { fact: 'HAND', params: { of: '$enemy', min: 1 }, var: 'enemyCards' },
        ],
        then: [
          {
            action: 'SET_COMBAT',
            op: 'choice',
            effect: 'discard',
            // выбирает противник: карта уходит в сброс из его руки (как «Шепот змей» Медузы)
            actor: '$enemy',
            max: 1,
            candidates: '$enemyCards',
            optional: false,
          },
        ],
      },
      {
        moment: 'afterCombat',
        when: [
          { fact: 'COMBAT', params: { winner: 'self' } },
          { fact: 'DECK', params: { min: 1 } },
          { fact: 'COMBAT', params: { select: 'opponent' }, var: 'foe' },
          { fact: 'FIGHTERS', params: { fighterIds: '$foe' }, min: 1, var: 'alive' },
          { fact: 'CELLS', params: { terrain: 'ice', free: true, min: 1 }, var: 'cells' },
        ],
        then: [
          { action: 'SET_CARDS', op: 'discard', from: 'deck', count: 1 },
          {
            action: 'SET_TARGETING',
            op: 'open',
            kind: 'cells',
            candidates: '$cells',
            count: 1,
            required: false,
          },
        ],
      },
      {
        // клетка отмечена: враг уезжает на лёд (телепорт, а не шаг)
        moment: 'picked',
        when: [
          { fact: 'PICKED', var: 'picked' },
          { fact: 'COMBAT', params: { select: 'opponent' }, var: 'foe' },
        ],
        then: [
          { action: 'SET_FIGHTER_CELL', fighterId: '$foe', cellId: '$picked', teleport: true },
        ],
      },
    ],
  },
  {
    // защита-заморозка: не пускает атакующего ни шагом, ни телепортом до конца его хода
    id: 'snow-queen_02',
    title: 'Оцепенение',
    type: 'defense',
    value: 3,
    bonus: 2,
    quantity: 2,
    fighter: 'snow-queen',
    text: 'ВО ВРЕМЯ БИТВЫ: При 4 и более осколках атакующий заморожен — он не может перемещаться или телепортироваться до конца своего хода. ПОСЛЕ БИТВЫ: При 8 и более осколков он ещё и получает 1 урон.',
    rules: [
      {
        moment: 'duringCombat',
        when: [
          { fact: 'CARDS', params: { zone: 'discard', tag: 'shard', min: 4 } },
          { fact: 'COMBAT', params: { select: 'attacker' }, var: 'foe' },
        ],
        then: [{ action: 'SET_STATUS', fighterIds: '$foe', status: 'frozen', value: true }],
      },
      {
        moment: 'afterCombat',
        when: [
          { fact: 'CARDS', params: { zone: 'discard', tag: 'shard', min: 8 } },
          { fact: 'COMBAT', params: { select: 'attacker' }, var: 'foe' },
          // атакующий мог погибнуть в бою — тогда добивать некого
          { fact: 'FIGHTERS', params: { fighterIds: '$foe' }, min: 1, var: 'alive' },
        ],
        then: [{ action: 'SET_HEALTH', fighterIds: '$alive', delta: -1 }],
      },
    ],
  },
  {
    // вороны «пьют кровь»: победа вороны выбивает карту из чужой руки на выбор противника
    id: 'snow-queen_03',
    title: 'Клёв в темноте',
    type: 'attack',
    value: 3,
    bonus: 2,
    quantity: 3,
    fighter: 'crow',
    text: 'ПОСЛЕ БИТВЫ: Если ворона победила, оппонент сбрасывает 1 карту из руки на свой выбор.',
    rules: [
      {
        moment: 'afterCombat',
        when: [
          { fact: 'COMBAT', params: { winner: 'self' } },
          { fact: 'COMBAT', params: { player: 'opponent' }, var: 'enemy' },
          { fact: 'HAND', params: { of: '$enemy', min: 1 }, var: 'enemyCards' },
        ],
        then: [
          {
            action: 'SET_COMBAT',
            op: 'choice',
            effect: 'discard',
            actor: '$enemy',
            max: 1,
            candidates: '$enemyCards',
            optional: false,
          },
        ],
      },
    ],
  },
  {
    // управляемый сброс осколков прямо в бою: платишь картой с меткой — держишь удар
    id: 'snow-queen_04',
    title: 'Хрустальный барьер',
    type: 'defense',
    value: 2,
    bonus: 3,
    quantity: 3,
    fighter: 'any',
    tags: ['shard'],
    text: 'ВО ВРЕМЯ БИТВЫ: Можете сбросить карту с меткой осколка из руки — значение карты становится 4.',
    rules: [
      {
        moment: 'duringCombat',
        when: [{ fact: 'HAND', params: { tag: 'shard', min: 1 }, var: 'shards' }],
        then: [
          {
            action: 'SET_COMBAT',
            op: 'choice',
            effect: 'discard',
            max: 1,
            candidates: '$shards',
            optional: true,
          },
        ],
      },
      {
        // карта отмечена и ушла в сброс — защита выросла (это же и осколок: сброс стал на карту длиннее)
        moment: 'picked',
        when: [{ fact: 'PICKED', var: 'picked' }],
        then: [{ action: 'SET_COMBAT', op: 'value', side: 'self', to: 4 }],
      },
    ],
  },
  {
    // щит, который растёт от чужой карты: враг теряет карту, защита становится сильнее
    id: 'snow-queen_05',
    title: 'Стужа в сердце',
    type: 'defense',
    value: 3,
    bonus: 1,
    quantity: 2,
    fighter: 'snow-queen',
    text: 'ВО ВРЕМЯ БИТВЫ: Оппонент сбрасывает 1 случайную карту из руки; значение карты увеличивается на усиление сброшенной карты.',
    rules: [
      {
        moment: 'duringCombat',
        when: [{ fact: 'COMBAT', params: { player: 'opponent' }, var: 'enemy' }],
        then: [
          // сброс и прибавка — шаги одной цепочки: транзиент `$remembered` живёт ровно один прогон правил
          {
            action: 'SET_CARDS',
            op: 'discard',
            of: '$enemy',
            from: 'hand',
            random: true,
            count: 1,
            remember: 'stuzha',
          },
          { action: 'SET_COMBAT', op: 'value', side: 'self', delta: '$remembered.stuzha.bonus' },
        ],
      },
    ],
  },
  {
    // «хлеб» колоды: 2 на старте, 4 на льду, 7 на верхнем пороге — предел игры
    id: 'snow-queen_06',
    title: 'Сосулька',
    type: 'hybrid',
    value: 2,
    bonus: 2,
    quantity: 3,
    fighter: 'any',
    tags: ['shard'],
    text: 'ВО ВРЕМЯ БИТВЫ: Если ваш боец в этой битве стоит на клетке со стихией льда, значение карты становится 4. При 9 и более осколках значение становится 7 на любой клетке.',
    rules: [
      {
        moment: 'duringCombat',
        when: [
          { fact: 'COMBAT', params: { select: 'self' }, var: 'ours' },
          { fact: 'FIGHTERS', params: { fighterIds: '$ours', terrain: 'ice' }, min: 1 },
        ],
        then: [{ action: 'SET_COMBAT', op: 'value', side: 'self', to: 4 }],
      },
      {
        // Лёд и порог осколков независимы: правило не требует стоять на льду. Если сработали оба,
        // значение выставит последнее правило (7) — поэтому порядок здесь важен, а не накопителен.
        moment: 'duringCombat',
        when: [{ fact: 'CARDS', params: { zone: 'discard', tag: 'shard', min: 9 } }],
        then: [{ action: 'SET_COMBAT', op: 'value', side: 'self', to: 7 }],
      },
    ],
  },
  {
    // добор на победе: колода не выдыхается, пока бои выиграны
    id: 'snow-queen_07',
    title: 'Снежная тропа',
    type: 'hybrid',
    value: 3,
    bonus: 2,
    quantity: 2,
    fighter: 'any',
    text: 'ПОСЛЕ БИТВЫ: Если вы победили, возьмите карту.',
    rules: [
      {
        moment: 'afterCombat',
        when: [{ fact: 'COMBAT', params: { winner: 'self' } }],
        then: [{ action: 'SET_CARDS', op: 'draw', count: 1 }],
      },
    ],
  },
  {
    // управляемое самоубийство: ворона уходит сама, а её гибель тянет осколок из колоды и лишнее действие
    id: 'snow-queen_08',
    title: 'Жертва',
    type: 'attack',
    value: 3,
    bonus: 1,
    quantity: 2,
    fighter: 'crow',
    text: 'ПОСЛЕ БИТВЫ: Нанесите этой вороне 1 урон. Если она погибает от этого эффекта, получите 1 действие в этом ходу.',
    rules: [
      {
        moment: 'afterCombat',
        when: [
          { fact: 'COMBAT', params: { select: 'self' }, var: 'ours' },
          // бьём именно ворону: герой карты не играет, но правило не должно его задевать
          {
            fact: 'FIGHTERS',
            params: { fighterIds: '$ours', group: 'crow' },
            min: 1,
            var: 'alive',
          },
        ],
        then: [{ action: 'SET_HEALTH', fighterIds: '$alive', delta: -1 }],
      },
      {
        // сработает только если ворона погибла от урона выше: движок зовёт `lost` карты-источника
        moment: 'lost',
        when: [{ fact: 'DEATH', params: { group: 'crow', source: 'snow-queen_08' } }],
        then: [{ action: 'SET_ACTIONS', delta: 1 }],
      },
    ],
  },
  {
    // подглядывание и выбивание: в защите ломает заготовку, в атаке снимает лучшую защиту
    id: 'snow-queen_09',
    title: 'Ледяное зеркало',
    type: 'hybrid',
    value: 3,
    bonus: 2,
    quantity: 3,
    fighter: 'snow-queen',
    tags: ['shard'],
    text: 'ВО ВРЕМЯ БИТВЫ: Посмотрите руку противника и выберите из неё 1 карту — противник сбрасывает её.',
    rules: [
      {
        moment: 'duringCombat',
        when: [
          { fact: 'COMBAT', params: { player: 'opponent' }, var: 'enemy' },
          // пустая рука — выбирать нечего, окно не открывается
          { fact: 'CARDS', params: { of: '$enemy', zone: 'hand', min: 1 }, var: 'mirror' },
        ],
        then: [
          {
            action: 'SET_TARGETING',
            op: 'open',
            kind: 'options',
            candidates: '$mirror',
            count: 1,
            required: true,
          },
        ],
      },
      {
        // противника называем ролью: переменная из условия другого правила сюда не переносится
        moment: 'picked',
        when: [{ fact: 'PICKED', var: 'choice' }],
        then: [{ action: 'SET_CARDS', of: 'opponent', op: 'discard', cardIds: '$choice' }],
      },
    ],
  },
  {
    // контр-игра включается с пяти осколков — раньше умения
    id: 'snow-queen_10',
    title: 'Трещина',
    type: 'hybrid',
    value: 4,
    bonus: 1,
    quantity: 2,
    fighter: 'snow-queen',
    text: 'ВО ВРЕМЯ БИТВЫ: При 5 и более осколках отмените эффекты карты оппонента.',
    rules: [
      {
        moment: 'duringCombat',
        when: [
          { fact: 'CARDS', params: { zone: 'discard', tag: 'shard', min: 5 } },
          // отменять нечего, если у карты противника нет свойств
          { fact: 'COMBAT', params: { effects: 'opponent' }, min: 1 },
        ],
        then: [{ action: 'SET_COMBAT', op: 'cancelEffects', side: 'opponent' }],
      },
    ],
  },
  {
    // разовый рывок: одна копия на колоду, сквозь врагов и с уроном каждому на маршруте
    id: 'snow-queen_11',
    title: 'Метель из осколков',
    type: 'effect',
    value: null,
    bonus: 1,
    quantity: 1,
    fighter: 'snow-queen',
    text: 'Снежная королева может пройти до 4 клеток сквозь бойцов оппонента; каждый, через кого она прошла, получает 2 урона.',
    rules: [
      {
        moment: 'effect',
        when: [
          // замороженная королева не ходит: карта, которая двигает бойца, проверяет статус сама
          {
            fact: 'FIGHTERS',
            params: { fighterIds: 'snow-queen', frozen: false },
            min: 1,
            var: 'queen',
          },
        ],
        then: [
          {
            action: 'SET_MOVEMENT',
            op: 'open',
            fighters: '$queen',
            budget: 4,
            throughEnemies: true,
            damageOnPass: 2,
          },
        ],
      },
    ],
  },
  {
    // пороговая разрядка: урон по своей области, а осколки возвращаются в колоду — клапан от истощения
    id: 'snow-queen_12',
    title: 'Кристальный резонанс',
    type: 'effect',
    value: null,
    bonus: 1,
    quantity: 2,
    fighter: 'snow-queen',
    text: 'При 6 и более осколках нанесите 2 урона каждому бойцу оппонента в области королевы, затем замешайте 3 карты с осколком из сброса в колоду.',
    rules: [
      {
        moment: 'effect',
        when: [
          { fact: 'CARDS', params: { zone: 'discard', tag: 'shard', min: 6 } },
          {
            fact: 'FIGHTERS',
            params: { side: 'opponent', areaOf: 'snow-queen' },
            min: 1,
            var: 'foes',
          },
        ],
        then: [{ action: 'SET_HEALTH', fighterIds: '$foes', delta: -2 }],
      },
      {
        moment: 'effect',
        when: [
          { fact: 'CARDS', params: { zone: 'discard', tag: 'shard', min: 6 } },
          {
            fact: 'CARDS',
            params: { zone: 'discard', tag: 'shard', min: 1 },
            var: 'shards',
          },
        ],
        then: [
          {
            action: 'SET_CARDS',
            op: 'move',
            from: 'discard',
            to: 'deck',
            cardIds: '$shards',
            count: 3,
          },
          { action: 'SET_CARDS', op: 'shuffle', zone: 'deck' },
        ],
      },
    ],
  },
  {
    // возврат вороны: сначала на свободный лёд, если льда нет — в область королевы
    id: 'snow-queen_13',
    title: 'Вечность',
    type: 'effect',
    value: null,
    bonus: 1,
    quantity: 2,
    fighter: 'snow-queen',
    text: 'Верните поверженную Кристальную ворону на любую свободную клетку льда с 1 здоровьем, затем возьмите карту.',
    rules: [
      {
        moment: 'effect',
        when: [
          { fact: 'LOST', params: { group: 'crow' }, min: 1 },
          { fact: 'CELLS', params: { terrain: 'ice', free: true, min: 1 }, var: 'cells' },
        ],
        then: [
          {
            action: 'SET_TARGETING',
            op: 'open',
            kind: 'cells',
            candidates: '$cells',
            count: 1,
            required: true,
          },
        ],
      },
      {
        // свободного льда нет — ворона возвращается в область королевы
        moment: 'effect',
        when: [
          { fact: 'LOST', params: { group: 'crow' }, min: 1 },
          { fact: 'CELLS', params: { terrain: 'ice', free: true }, max: 0 },
          { fact: 'CELLS', params: { areaOf: 'snow-queen', free: true, min: 1 }, var: 'cells' },
        ],
        then: [
          {
            action: 'SET_TARGETING',
            op: 'open',
            kind: 'cells',
            candidates: '$cells',
            count: 1,
            required: true,
          },
        ],
      },
      {
        moment: 'picked',
        when: [{ fact: 'PICKED', var: 'picked' }],
        then: [
          { action: 'REVIVE_FIGHTER', group: 'crow', cellId: '$picked' },
          { action: 'SET_CARDS', op: 'draw', count: 1 },
        ],
      },
    ],
  },
];
