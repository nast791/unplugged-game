/**
 * Анубис — контент сезона 1 (глава «Дороти и компания»). Разбор героя, числа и пул карт — `passport.md`.
 *
 * Умение «Взвешивание сердца» — конец хода: пока Анубис не двигался, он бьёт бойца противника в своей
 * области (1 урон, 2 — пока цела пелена). Пелена — предмет с двумя состояниями: её кладёт карта
 * «Погребальная пелена», а рвёт начало хода, если Анубис ушёл с пустыни.
 *
 * Телепорт движением не считается (правило владельца): обмен местами и постановка без прохода
 * `movedThisTurn` не ставят, поэтому переставленный Анубис сохраняет право суда.
 */
export default {
  id: 'anubis',
  name: 'Анубис',
  /**
   * Цвет героя — лазурит (lapis): в палитре сезона синего не было (`docs/ui-plan.md` §9.2 — серый,
   * коралловый, cyan знака), а прежний тёмно-горчичный `#A16207` на тёмной поверхности выглядел грязным
   * и спорил с золотой текстурой лавы. Лазурит — классический египетский цвет рядом с золотом и пеленой.
   */
  color: '#3B82F6',
  heroes: [
    {
      id: 'anubis',
      name: 'Анубис',
      type: 'hero',
      hp: 15,
      move: 2,
      // дальность 2: судит подошедшего, но не дальник с дистанции 3
      attackRange: 2,
      size: 1,
    },
  ],
  assistants: [
    {
      id: 'amat',
      name: 'Амат',
      type: 'assistant',
      count: 1,
      hp: 8,
      move: 2,
      attackRange: 1,
      size: 1,
    },
  ],
  items: [
    {
      id: 'shroud',
      name: 'Пелена',
      type: 'item',
      count: 1,
      color: '#E7E5E4',
      // Пелена — не расходуемая карта, а индикатор продолжительного эффекта: карта «Погребальная
      // пелена» включает её, а начало хода вне пустыни рвёт. `states` и `condition` игрок видит
      // в панели предметов — условие всегда перед глазами.
      state: 'inactive',
      // в начале партии пелены ещё нет, поэтому `inactive` — «отсутствует», а не «порвана»
      states: { active: 'цела', inactive: 'отсутствует' },
      condition:
        'Появляется картой «Погребальная пелена»; цела, пока Анубис начинает ход на клетке со стихией пустыни',
      icon: 'bi:bandage-fill',
    },
  ],
  // подсказка игрокам: у героя есть карты, которые сильнее на пустыне. Генератор поле не читает
  // и привилегий стихиям не даёт (`docs/terrain.md`)
  terrainAffinity: ['desert'],
  skill: {
    id: 'anubis_skill',
    type: 'skill',
    fighter: 'anubis',
    title: 'Взвешивание сердца',
    text: 'КОНЕЦ ХОДА: Если Анубис не двигался в этом ходу, выберите бойца противника в его области — он получает 1 урон (2, пока цела пелена). НАЧАЛО ХОДА: Если Анубис не стоит на клетке со стихией пустыни, пелена рвётся.',
    rules: [
      // Начало хода: пелена держится только на песке. Телепорт сюда не спасает — проверяется клетка,
      // на которой герой начинает ход.
      {
        moment: 'turnStart',
        when: [
          { fact: 'ITEMS', params: { group: 'shroud', state: 'active' }, min: 1 },
          { fact: 'FIGHTERS', params: { fighterIds: ['anubis'], terrain: 'desert' }, max: 0 },
        ],
        then: [{ action: 'SET_ITEM', group: 'shroud', to: 'inactive' }],
      },
      // Конец хода, пелена цела: суд тяжелее — 2 урона выбранному бойцу противника в области Анубиса
      {
        moment: 'turnEnd',
        when: [
          { fact: 'FIGHTERS', params: { fighterIds: ['anubis'], movedThisTurn: true }, max: 0 },
          { fact: 'ITEMS', params: { group: 'shroud', state: 'active' }, min: 1 },
          {
            fact: 'FIGHTERS',
            params: { side: 'opponent', areaOf: 'anubis' },
            min: 1,
            var: 'foes',
          },
        ],
        then: [
          {
            action: 'SET_TARGETING',
            op: 'open',
            kind: 'fighters',
            candidates: '$foes',
            count: 1,
            required: false,
            // враг в области один — движок отмечает его сам, окна игрок не видит
            auto: true,
          },
        ],
      },
      {
        moment: 'picked',
        when: [
          { fact: 'PICKED', var: 'picked' },
          { fact: 'ITEMS', params: { group: 'shroud', state: 'active' }, min: 1 },
        ],
        then: [{ action: 'SET_HEALTH', fighterIds: '$picked', delta: -2 }],
      },
      // Конец хода, пелены нет: обычный суд — 1 урон
      {
        moment: 'turnEnd',
        when: [
          { fact: 'FIGHTERS', params: { fighterIds: ['anubis'], movedThisTurn: true }, max: 0 },
          { fact: 'ITEMS', params: { group: 'shroud', state: 'inactive' }, min: 1 },
          {
            fact: 'FIGHTERS',
            params: { side: 'opponent', areaOf: 'anubis' },
            min: 1,
            var: 'foes',
          },
        ],
        then: [
          {
            action: 'SET_TARGETING',
            op: 'open',
            kind: 'fighters',
            candidates: '$foes',
            count: 1,
            required: false,
            auto: true,
          },
        ],
      },
      {
        moment: 'picked',
        when: [
          { fact: 'PICKED', var: 'picked' },
          { fact: 'ITEMS', params: { group: 'shroud', state: 'inactive' }, min: 1 },
        ],
        then: [{ action: 'SET_HEALTH', fighterIds: '$picked', delta: -1 }],
      },
    ],
  },
};
