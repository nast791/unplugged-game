/**
 * Колода Анубиса: 14 уникальных карт, 30 копий, общих карт пула нет. Разбор — `passport.md` §7.
 *
 * Оси героя: **позиция** (покой, своя область, песок — «Погребальный звон», «Суд молчит», пелена)
 * и **контроль** (Амат ест карты: «Амат ждёт», «Печать Маат», «Немой приговор», «Амат разрывает»).
 * Третья ось — **суд весов**: карты с меткой `scales` получают Помилование или Наказание, пока
 * пелена активна; их правила сравнивают усиления карт боя (`COMBAT { bonus, max|over }`).
 * Весы — только у карт, на которые оппонент отвечает картой из боя; на эффекте весов не бывает:
 * сравнивать усиления не с чем, поэтому «Зал суда» сжигает улики — урон в лицо по числу карт
 * эффектов в сбросе, и сама в сбросе остаётся навсегда (`noReturn`).
 * Пелену выключает умение «Суд Осириса» (`index.js`), а судят карты.
 */
export default [
  {
    // главный удар: существует только у стоящего — шагнул, и карта снова 3
    id: 'anubis_01',
    title: 'Погребальный звон',
    type: 'attack',
    value: 3,
    bonus: 1,
    quantity: 3,
    fighter: 'anubis',
    text: 'ВО ВРЕМЯ БИТВЫ: Если Анубис не двигался в этом ходу, значение карты становится 5.',
    rules: [
      {
        moment: 'duringCombat',
        text: 'Если Анубис не двигался в этом ходу, значение карты становится 5.',
        when: [
          { fact: 'FIGHTERS', params: { fighterIds: ['anubis'], movedThisTurn: true }, max: 0 },
        ],
        // `to`, а не `delta`: значение ровно 5, его нельзя случайно сложить с чужими прибавками
        then: [{ action: 'SET_COMBAT', op: 'value', side: 'self', to: 5 }],
      },
    ],
  },
  {
    // значение и урон: карту не спасает высокая защита, ноги врага решает песок под ними
    id: 'anubis_02',
    title: 'Песчаная буря',
    type: 'attack',
    value: 5,
    bonus: 3,
    quantity: 3,
    fighter: 'anubis',
    text: 'МГНОВЕННО: Если боец оппонента в этой битве стоит на клетке со стихией пустыни, он получает дополнительно 2 урона.',
    rules: [
      {
        moment: 'immediately',
        text: 'Если боец оппонента в этой битве стоит на клетке со стихией пустыни, он получает дополнительно 2 урона.',
        when: [
          { fact: 'COMBAT', params: { select: 'opponent' }, var: 'foe' },
          { fact: 'FIGHTERS', params: { fighterIds: '$foe', terrain: 'desert' }, min: 1 },
        ],
        then: [{ action: 'SET_HEALTH', fighterIds: '$foe', delta: -2 }],
      },
    ],
  },
  {
    // суд над излишком: чем больше враг копит, тем меньше у него останется на ответ.
    // Весы: «помилование» наказывает за страх перед сильной картой, «наказание» — за сам страх
    id: 'anubis_03',
    title: 'Печать Маат',
    type: 'attack',
    value: 4,
    bonus: 2,
    quantity: 2,
    fighter: 'anubis',
    tags: ['scales'],
    text: 'МГНОВЕННО: Если в руке оппонента 4 карты или больше, он сбрасывает 1 случайную карту. Помилование. ПОСЛЕ БИТВЫ: Возьмите 1 карту. Наказание. ПОСЛЕ БИТВЫ: Оппонент сбрасывает ещё 1 случайную карту.',
    rules: [
      {
        moment: 'immediately',
        text: 'Если в руке оппонента 4 карты или больше, он сбрасывает 1 случайную карту.',
        when: [
          { fact: 'COMBAT', params: { player: 'opponent' }, var: 'enemy' },
          { fact: 'HAND', params: { of: '$enemy', min: 4 } },
        ],
        then: [{ action: 'SET_CARDS', of: '$enemy', op: 'discard', random: true, count: 1 }],
      },
      {
        // усиление чужой карты не больше нашего — суд милует и даёт карту
        moment: 'afterCombat',
        text: 'Помилование: возьмите 1 карту.',
        when: [
          { fact: 'ITEMS', params: { group: 'shroud', state: 'active' }, min: 1 },
          { fact: 'COMBAT', params: { bonus: 'self' }, var: 'mine' },
          { fact: 'COMBAT', params: { bonus: 'opponent', max: '$mine' } },
        ],
        then: [{ action: 'SET_CARDS', op: 'draw', count: 1 }],
      },
      {
        // враг защищался картой сильнее нашей — суд карает и опустошает руку до конца
        moment: 'afterCombat',
        text: 'Наказание: оппонент сбрасывает ещё 1 случайную карту.',
        when: [
          { fact: 'ITEMS', params: { group: 'shroud', state: 'active' }, min: 1 },
          { fact: 'COMBAT', params: { bonus: 'self' }, var: 'mine' },
          { fact: 'COMBAT', params: { bonus: 'opponent', over: '$mine' } },
          { fact: 'COMBAT', params: { player: 'opponent' }, var: 'enemy' },
        ],
        then: [{ action: 'SET_CARDS', of: '$enemy', op: 'discard', random: true, count: 1 }],
      },
    ],
  },
  {
    // зеркальная защита: сила карты — чужая, её берут из усиления атаки оппонента.
    // С целой пеленой зеркало ещё и приносит карту, а против сильного удара становится непреодолимым
    id: 'anubis_04',
    title: 'Саван',
    type: 'defense',
    value: 0,
    bonus: 2,
    quantity: 3,
    fighter: 'anubis',
    tags: ['scales'],
    text: 'ВО ВРЕМЯ БИТВЫ: Значение карты становится равным бонусу карты, которой напали на вас. Помилование. ПОСЛЕ БИТВЫ: Возьмите 1 карту. Наказание. ВО ВРЕМЯ БИТВЫ: Значение этой карты +3 (прибавляется к скопированному бонусу).',
    rules: [
      {
        moment: 'duringCombat',
        text: 'Значение карты становится равным бонусу карты, которой напали на вас.',
        when: [{ fact: 'COMBAT', params: { bonus: 'opponent' }, var: 'bonus' }],
        then: [{ action: 'SET_COMBAT', op: 'value', side: 'self', to: '$bonus' }],
      },
      {
        moment: 'afterCombat',
        text: 'Помилование: возьмите 1 карту.',
        when: [
          { fact: 'ITEMS', params: { group: 'shroud', state: 'active' }, min: 1 },
          { fact: 'COMBAT', params: { bonus: 'self' }, var: 'mine' },
          { fact: 'COMBAT', params: { bonus: 'opponent', max: '$mine' } },
        ],
        then: [{ action: 'SET_CARDS', op: 'draw', count: 1 }],
      },
      {
        // яростная атака (усиление строго больше нашего зеркала) — и саван укрепляется на +3
        moment: 'duringCombat',
        text: 'Наказание: значение этой карты +3 (прибавляется к скопированному бонусу).',
        when: [
          { fact: 'ITEMS', params: { group: 'shroud', state: 'active' }, min: 1 },
          { fact: 'COMBAT', params: { bonus: 'self' }, var: 'mine' },
          { fact: 'COMBAT', params: { bonus: 'opponent', over: '$mine' } },
        ],
        then: [{ action: 'SET_COMBAT', op: 'value', side: 'self', delta: 3 }],
      },
    ],
  },
  {
    // выигранная битва выселяет врага на песок: постановка без прохода (`teleport`), потому что
    // «на свободную клетку пустыни» — это не шаг по радиусу, а перенос в его же пустыню.
    // Бойца из боя берём переменной, клетку выбирает игрок: цепочку «боец → клетка» движок не умеет
    id: 'anubis_05',
    title: 'Врата',
    type: 'hybrid',
    value: 3,
    bonus: 2,
    quantity: 2,
    fighter: 'anubis',
    tags: ['scales'],
    text: 'ПОСЛЕ БИТВЫ: Если вы победили, можете поместить бойца оппонента из этой битвы на свободную клетку пустыни. Помилование. ВО ВРЕМЯ БИТВЫ: Значение карты оппонента становится равным 0. Наказание. ВО ВРЕМЯ БИТВЫ: Свойства карты оппонента не действуют.',
    rules: [
      {
        moment: 'afterCombat',
        text: 'Если вы победили, можете поместить бойца оппонента из этой битвы на свободную клетку пустыни.',
        when: [
          { fact: 'COMBAT', params: { winner: 'self' } },
          { fact: 'COMBAT', params: { select: 'opponent' }, var: 'foe' },
          // боец противника мог погибнуть в бою, а замороженному постановка закрыта
          { fact: 'FIGHTERS', params: { fighterIds: '$foe', frozen: false }, min: 1 },
          // свободная клетка песка: нет её — свойства нет и окна нет
          { fact: 'CELLS', params: { terrain: 'desert', free: true, min: 1 }, var: 'cells' },
        ],
        then: [
          {
            action: 'SET_TARGETING',
            op: 'open',
            kind: 'cells',
            candidates: '$cells',
            count: 1,
            // «можете поместить»: окно необязательное, кнопка «Закончить эффект» — отказ от переноса
            required: false,
            // свободный песок может быть один: тогда движок отмечает его сам
            auto: true,
          },
        ],
      },
      {
        moment: 'picked',
        text: 'Поместите бойца оппонента на выбранную клетку пустыни.',
        when: [
          { fact: 'PICKED', var: 'picked' },
          { fact: 'COMBAT', params: { select: 'opponent' }, var: 'foe' },
        ],
        then: [
          { action: 'SET_FIGHTER_CELL', fighterId: '$foe', cellId: '$picked', teleport: true },
        ],
      },
      {
        // помилование обнуляет чужую карту: враг защищается не сильнее нашей — его число становится 0
        moment: 'duringCombat',
        text: 'Помилование: значение карты оппонента становится равным 0.',
        when: [
          { fact: 'ITEMS', params: { group: 'shroud', state: 'active' }, min: 1 },
          { fact: 'COMBAT', params: { bonus: 'self' }, var: 'mine' },
          { fact: 'COMBAT', params: { bonus: 'opponent', max: '$mine' } },
        ],
        then: [{ action: 'SET_COMBAT', op: 'value', side: 'opponent', to: 0 }],
      },
      {
        // наказание отменяет свойства чужой карты: тяжёлая атака объявляется незаконной
        moment: 'duringCombat',
        text: 'Наказание: свойства карты оппонента не действуют.',
        when: [
          { fact: 'ITEMS', params: { group: 'shroud', state: 'active' }, min: 1 },
          { fact: 'COMBAT', params: { bonus: 'self' }, var: 'mine' },
          { fact: 'COMBAT', params: { bonus: 'opponent', over: '$mine' } },
        ],
        then: [{ action: 'SET_COMBAT', op: 'cancelEffects', side: 'opponent' }],
      },
    ],
  },
  {
    // пустая рука врага — плата за продолжение: контроль превращается в удар по герою.
    // Весы: против тяжёлой карты суд карает бойца, против лёгкой — двигает своих
    id: 'anubis_06',
    title: 'Немой приговор',
    type: 'hybrid',
    value: 3,
    bonus: 2,
    quantity: 2,
    fighter: 'anubis',
    tags: ['scales'],
    text: 'ПОСЛЕ БИТВЫ: Если в руке оппонента 1 карта или меньше, нанесите герою оппонента 4 урона. Помилование. ВО ВРЕМЯ БИТВЫ: Если вы защищаетесь, уменьшите боевой урон на 1. ПОСЛЕ БИТВЫ: Переместите Анубиса или Амат на расстояние до 2 клеток (без прохода). Наказание. ПОСЛЕ БИТВЫ: Нанесите участвовавшему в битве бойцу оппонента 2 урона.',
    rules: [
      {
        moment: 'afterCombat',
        text: 'Если в руке оппонента 1 карта или меньше, нанесите герою оппонента 4 урона.',
        when: [
          { fact: 'COMBAT', params: { player: 'opponent' }, var: 'enemy' },
          { fact: 'HAND', params: { of: '$enemy', max: 1 } },
          // герой противника мог уже погибнуть — тогда судить некого
          {
            fact: 'FIGHTERS',
            params: { of: '$enemy', type: 'hero', min: 1 },
            var: 'enemyHero',
          },
        ],
        then: [{ action: 'SET_HEALTH', fighterIds: '$enemyHero', delta: -4 }],
      },
      {
        // помилование щитом: в защиту урон боя меньше на 1 (значение своей карты выше на 1)
        moment: 'duringCombat',
        text: 'Если вы защищаетесь, уменьшите боевой урон на 1.',
        when: [
          { fact: 'ITEMS', params: { group: 'shroud', state: 'active' }, min: 1 },
          { fact: 'COMBAT', params: { bonus: 'self' }, var: 'mine' },
          { fact: 'COMBAT', params: { bonus: 'opponent', max: '$mine' } },
          { fact: 'COMBAT', params: { role: 'defender' } },
        ],
        then: [{ action: 'SET_COMBAT', op: 'value', side: 'self', delta: 1 }],
      },
      {
        // помилование двигает своих: окно перемещения выбирает, кого из двоих вести
        moment: 'afterCombat',
        text: 'Помилование: переместите Анубиса или Амат на расстояние до 2 клеток (без прохода).',
        when: [
          { fact: 'ITEMS', params: { group: 'shroud', state: 'active' }, min: 1 },
          { fact: 'COMBAT', params: { bonus: 'self' }, var: 'mine' },
          { fact: 'COMBAT', params: { bonus: 'opponent', max: '$mine' } },
          {
            fact: 'FIGHTERS',
            params: { fighterIds: ['anubis', 'amat'], frozen: false },
            min: 1,
            var: 'movers',
          },
        ],
        then: [
          {
            action: 'SET_MOVEMENT',
            op: 'open',
            fighters: '$movers',
            budget: 2,
            optional: true,
            teleport: true,
            // ведут одного из двоих: шаг второго возвращает первого на исходную клетку
            oneOf: true,
          },
        ],
      },
      {
        // наказание бьёт бойца, которым враг пытался спастись от приговора
        moment: 'afterCombat',
        text: 'Наказание: нанесите участвовавшему в битве бойцу оппонента 2 урона.',
        when: [
          { fact: 'ITEMS', params: { group: 'shroud', state: 'active' }, min: 1 },
          { fact: 'COMBAT', params: { bonus: 'self' }, var: 'mine' },
          { fact: 'COMBAT', params: { bonus: 'opponent', over: '$mine' } },
          { fact: 'COMBAT', params: { select: 'opponent' }, var: 'foe' },
          { fact: 'FIGHTERS', params: { fighterIds: '$foe' }, min: 1 },
        ],
        then: [{ action: 'SET_HEALTH', fighterIds: '$foe', delta: -2 }],
      },
    ],
  },
  {
    // единственная карта без привязки к бойцу: играется и за Амат, и за Анубиса
    id: 'anubis_07',
    title: 'Тайна бальзамирования',
    type: 'hybrid',
    value: 3,
    bonus: 3,
    quantity: 2,
    fighter: 'any',
    text: 'ПОСЛЕ БИТВЫ: Можете вернуть 1 карту эффекта из вашего сброса в руку.',
    rules: [
      {
        moment: 'afterCombat',
        text: 'Можете вернуть 1 карту эффекта из вашего сброса в руку.',
        // в сбросе нет карт эффекта — возвращать нечего, свойства нет и окна нет;
        // `returnable` отсекает карты, которые не возвращаются в руку никогда («Зал суда»)
        when: [
          {
            fact: 'CARDS',
            params: { zone: 'discard', type: 'effect', returnable: true, min: 1 },
            var: 'spells',
          },
        ],
        then: [
          {
            action: 'SET_TARGETING',
            // карты сброса приходят готовыми кандидатами окна: `optionId` — ключ копии,
            // `title` — название карты (его рисует клиент), им же карта возвращается через `SET_CARDS`
            op: 'open',
            kind: 'options',
            candidates: '$spells',
            count: 1,
            required: false,
          },
        ],
      },
      {
        moment: 'picked',
        text: 'Верните выбранную карту эффекта из вашего сброса в руку.',
        when: [{ fact: 'PICKED', var: 'picked' }],
        then: [
          {
            action: 'SET_CARDS',
            op: 'move',
            from: 'discard',
            to: 'hand',
            cardIds: '$picked',
          },
        ],
      },
    ],
  },
  {
    // усиление работает ресурсом: шаг Анубиса равен тому, что лежало сверху колоды.
    // Цена — карту видят все, и она уходит под низ колоды, то есть вернётся не скоро
    id: 'anubis_08',
    title: 'Канопа',
    type: 'hybrid',
    value: 3,
    bonus: 3,
    quantity: 3,
    fighter: 'anubis',
    text: 'ПОСЛЕ БИТВЫ: Раскройте верхнюю карту своей колоды. Анубис может пройти на расстояние, равное бонусу раскрытой карты, затем положите раскрытую карту под низ колоды.',
    rules: [
      {
        moment: 'afterCombat',
        text: 'Раскройте верхнюю карту своей колоды.',
        // колода уже раскрыта (второй «Канопой» в той же битве, «Раскрытием» противника): раскрывать
        // её заново нельзя — `SET_REVEAL open` на открытую колоду падает. Свойства тогда просто нет
        when: [
          { fact: 'FIGHTERS', params: { fighterIds: ['anubis'] }, min: 1 },
          { fact: 'DECK', params: { min: 1 } },
          { fact: 'REVEALED', params: { of: 'self', select: 'cards' }, max: 0 },
        ],
        then: [{ action: 'SET_REVEAL', op: 'open', of: 'self', count: 1 }],
      },
      {
        // движение — своим правилом: `budget` читается из снимка (`REVEALED → $bonus`), а снимок
        // появляется только после того, как предыдущее правило его открыло
        moment: 'afterCombat',
        text: 'Анубис может пройти на расстояние, равное бонусу раскрытой карты.',
        when: [
          { fact: 'REVEALED', params: { of: 'self', select: 'bonus' }, min: 1, var: 'bonus' },
          // погибшего в бою двигать нечем, а окно перемещения открывать некому
          { fact: 'FIGHTERS', params: { fighterIds: ['anubis'] }, min: 1, var: 'hero' },
        ],
        then: [
          {
            action: 'SET_MOVEMENT',
            op: 'open',
            fighters: '$hero',
            budget: '$bonus',
            optional: true,
          },
        ],
      },
      {
        // «затем положите раскрытую карту под низ колоды» — шаг после движения: движение открывает
        // окно, очередь боя ждёт его конца и продолжает со следующего правила. Правило одно на все
        // исходы: два «убирающих» сработали бы подряд — первое снимает снимок, второе убирает то,
        // чего в раскрытии уже нет
        moment: 'afterCombat',
        text: 'Положите раскрытую карту под низ колоды.',
        when: [{ fact: 'REVEALED', params: { of: 'self', select: 'cards' }, min: 1 }],
        then: [{ action: 'SET_REVEAL', op: 'bottom', of: 'self' }],
      },
    ],
  },
  {
    // покой как ресурс: карта за розыгрыш, а тихий ход даёт выбор из двух верхних
    id: 'anubis_09',
    title: 'Суд молчит',
    type: 'effect',
    value: null,
    bonus: 2,
    quantity: 3,
    fighter: 'anubis',
    text: 'Возьмите 1 карту. Если Анубис не двигался в этом ходу, посмотрите 2 верхние карты колоды, возьмите 1 из них, а вторую положите под низ колоды.',
    rules: [
      {
        moment: 'effect',
        text: 'Возьмите 1 карту.',
        then: [{ action: 'SET_CARDS', op: 'draw', count: 1 }],
      },
      {
        // окно выбора открывается само: кандидаты — две верхние карты колоды (колода-верх = конец массива)
        moment: 'effect',
        text: 'Если Анубис не двигался в этом ходу, посмотрите 2 верхние карты колоды, возьмите 1 из них, а вторую положите под низ колоды.',
        when: [
          { fact: 'FIGHTERS', params: { fighterIds: ['anubis'], movedThisTurn: true }, max: 0 },
          { fact: 'CARDS', params: { zone: 'deck', limit: 2, min: 1 }, var: 'top' },
        ],
        then: [
          {
            action: 'SET_TARGETING',
            op: 'open',
            kind: 'options',
            candidates: '$top',
            count: 1,
            required: true,
            auto: true,
          },
        ],
      },
      {
        moment: 'picked',
        text: 'Возьмите выбранную карту.',
        when: [{ fact: 'PICKED', var: 'picked' }],
        then: [{ action: 'SET_CARDS', op: 'move', from: 'deck', to: 'hand', cardIds: '$picked' }],
      },
      {
        // вторая из двух верхних уходит под низ; её ключ — верх колоды без выбранной карты
        moment: 'picked',
        text: 'Вторую карту положите под низ колоды.',
        when: [
          { fact: 'PICKED', var: 'picked' },
          {
            fact: 'CARDS',
            params: { zone: 'deck', exclude: '$picked', limit: 1, min: 1 },
            var: 'rest',
          },
        ],
        then: [{ action: 'SET_CARDS', op: 'bottom', from: 'deck', cardIds: '$rest' }],
      },
    ],
  },
  {
    // план Б: возврата у Амат нет, поэтому потеря зверя оплачивается здоровьем Анубиса и пеленой
    id: 'anubis_10',
    title: 'Плач по Амат',
    type: 'effect',
    value: null,
    bonus: 1,
    quantity: 1,
    fighter: 'anubis',
    text: 'Если Амат убита, восстановите 2 здоровья Анубису и сделайте Пелену активной до начала вашего следующего хода.',
    rules: [
      {
        moment: 'effect',
        text: 'Если Амат убита, восстановите 2 здоровья Анубису и сделайте Пелену активной до начала вашего следующего хода.',
        when: [
          { fact: 'LOST', params: { type: 'assistant' }, min: 1 },
          // лечить некого, если Анубиса уже нет на поле: свойства тогда нет
          { fact: 'FIGHTERS', params: { fighterIds: ['anubis'] }, min: 1, var: 'hero' },
        ],
        then: [
          { action: 'SET_HEALTH', fighterIds: '$hero', delta: 2 },
          // пелена поднимается временно: к началу своего следующего хода вернётся в прежнее состояние
          { action: 'SET_ITEM', group: 'shroud', to: 'active', until: 'turnStart' },
        ],
      },
    ],
  },
  {
    // сожжение улик: удар в лицо за каждую карту эффекта, уже ушедшую в сброс.
    // `noReturn` — карта остаётся в сбросе навсегда: «Тайна бальзамирования» её не вернёт
    // (факт `CARDS { returnable: true }`), поэтому петли «вернул → сжёг снова» нет
    id: 'anubis_11',
    title: 'Зал суда',
    type: 'effect',
    value: null,
    bonus: 3,
    quantity: 1,
    fighter: 'anubis',
    noReturn: true,
    text: 'Если Анубис не двигался в этом ходу, нанесите герою оппонента урон, равный количеству карт эффектов в вашем сбросе. Когда эта карта уходит в сброс, она навсегда остаётся там и не может быть возвращена в руку владельца никаким способом.',
    rules: [
      {
        moment: 'effect',
        text: 'Если Анубис не двигался в этом ходу, нанесите герою оппонента урон, равный количеству карт эффектов в вашем сбросе.',
        when: [
          // сжигать можно только стоя: шаг гасит приговор, как и у «Погребального звона»
          { fact: 'FIGHTERS', params: { fighterIds: ['anubis'], movedThisTurn: true }, max: 0 },
          // карта уже в сбросе, когда разыгрываются её правила, — минимум 1 урона
          {
            fact: 'CARDS',
            params: { zone: 'discard', type: 'effect', count: true },
            min: 1,
            var: 'n',
          },
          { fact: 'FIGHTERS', params: { of: 'opponent', type: 'hero' }, min: 1, var: 'hero' },
        ],
        then: [{ action: 'SET_HEALTH', fighterIds: '$hero', damage: '$n' }],
      },
      {
        // проба «сработает ли эффект» считает сброс без самой карты: тогда бьём ровно на 1
        moment: 'effect',
        text: 'Если Анубис не двигался в этом ходу, нанесите герою оппонента урон, равный количеству карт эффектов в вашем сбросе.',
        when: [
          { fact: 'FIGHTERS', params: { fighterIds: ['anubis'], movedThisTurn: true }, max: 0 },
          { fact: 'CARDS', params: { zone: 'discard', type: 'effect', count: true }, max: 0 },
          { fact: 'FIGHTERS', params: { of: 'opponent', type: 'hero' }, min: 1, var: 'hero' },
        ],
        then: [{ action: 'SET_HEALTH', fighterIds: '$hero', damage: 1 }],
      },
    ],
  },
  {
    // выход из окружения на любое расстояние: постановка без прохода (`teleport`), поэтому покой
    // не ломается — «Суд молчит» и «Погребальный звон» в этом же ходу ещё работают
    id: 'anubis_12',
    title: 'Путь на закат',
    type: 'effect',
    value: null,
    bonus: 1,
    quantity: 2,
    fighter: 'anubis',
    text: 'Поставьте Анубиса на свободную клетку пустыни.',
    rules: [
      {
        moment: 'effect',
        text: 'Поставьте Анубиса на свободную клетку пустыни.',
        // замороженный не телепортируется: без проверки окно открывалось, а клик падал
        when: [
          { fact: 'FIGHTERS', params: { fighterIds: ['anubis'], frozen: false }, min: 1 },
          { fact: 'CELLS', params: { terrain: 'desert', free: true, min: 1 }, var: 'cells' },
        ],
        then: [
          {
            action: 'SET_TARGETING',
            op: 'open',
            kind: 'cells',
            candidates: '$cells',
            count: 1,
            required: true,
            // свободный песок может быть один: тогда движок отмечает его сам
            auto: true,
          },
        ],
      },
      {
        moment: 'picked',
        text: 'Поставьте Анубиса на выбранную клетку пустыни.',
        when: [{ fact: 'PICKED', var: 'picked' }],
        then: [
          { action: 'SET_FIGHTER_CELL', fighterId: 'anubis', cellId: '$picked', teleport: true },
        ],
      },
    ],
  },
  {
    // карта Амат, но id — героя: у помощников своих префиксов нет (`.docs/hero-algorithm.md` §7).
    // Первая форма «поедания»: победа Амат стоит врагу карты. Весы: мир лечит зверя, злоба — бьёт героя
    id: 'anubis_13',
    title: 'Амат ждёт',
    type: 'attack',
    value: 4,
    bonus: 3,
    quantity: 2,
    fighter: 'amat',
    tags: ['scales'],
    text: 'ПОСЛЕ БИТВЫ: Если вы победили, оппонент сбрасывает 1 случайную карту. Помилование. ПОСЛЕ БИТВЫ: Восстановите 2 здоровья Анубису или Амат. Наказание. ПОСЛЕ БИТВЫ: Нанесите герою оппонента 3 урона.',
    rules: [
      {
        moment: 'afterCombat',
        text: 'Если вы победили, оппонент сбрасывает 1 случайную карту.',
        when: [
          { fact: 'COMBAT', params: { winner: 'self' } },
          { fact: 'COMBAT', params: { player: 'opponent' }, var: 'enemy' },
        ],
        then: [{ action: 'SET_CARDS', of: '$enemy', op: 'discard', random: true, count: 1 }],
      },
      {
        // высокий бонус карты делает помилование обычным исходом: лечат любого из двоих, кого выберут
        moment: 'afterCombat',
        text: 'Помилование: восстановите 2 здоровья Анубису или Амат.',
        when: [
          { fact: 'ITEMS', params: { group: 'shroud', state: 'active' }, min: 1 },
          { fact: 'COMBAT', params: { bonus: 'self' }, var: 'mine' },
          { fact: 'COMBAT', params: { bonus: 'opponent', max: '$mine' } },
          {
            fact: 'FIGHTERS',
            params: { fighterIds: ['anubis', 'amat'] },
            min: 1,
            var: 'targets',
          },
        ],
        then: [
          {
            action: 'SET_TARGETING',
            op: 'open',
            kind: 'fighters',
            candidates: '$targets',
            count: 1,
            required: true,
            // живой остался один — движок отмечает его сам
            auto: true,
          },
        ],
      },
      {
        moment: 'picked',
        text: 'Восстановите 2 здоровья выбранному бойцу.',
        when: [
          { fact: 'PICKED', var: 'picked' },
          { fact: 'ITEMS', params: { group: 'shroud', state: 'active' }, min: 1 },
          { fact: 'COMBAT', params: { bonus: 'self' }, var: 'mine' },
          { fact: 'COMBAT', params: { bonus: 'opponent', max: '$mine' } },
          { fact: 'FIGHTERS', params: { fighterIds: '$picked' }, min: 1 },
        ],
        then: [{ action: 'SET_HEALTH', fighterIds: '$picked', delta: 2 }],
      },
      {
        // наказание — только против сильнейших козырей: прямой урон герою оппонента
        moment: 'afterCombat',
        text: 'Наказание: нанесите герою оппонента 3 урона.',
        when: [
          { fact: 'ITEMS', params: { group: 'shroud', state: 'active' }, min: 1 },
          { fact: 'COMBAT', params: { bonus: 'self' }, var: 'mine' },
          { fact: 'COMBAT', params: { bonus: 'opponent', over: '$mine' } },
          { fact: 'COMBAT', params: { player: 'opponent' }, var: 'enemy' },
          { fact: 'FIGHTERS', params: { of: '$enemy', type: 'hero', min: 1 }, var: 'hero' },
        ],
        then: [{ action: 'SET_HEALTH', fighterIds: '$hero', delta: -3 }],
      },
    ],
  },
  {
    // вторая форма «поедания»: зверь вырывает защиту из рук. Экшен сам решает,
    // есть ли защитнику чем меняться: нет — защиты нет, есть — окно обязательное.
    // Тип — атака, а не гибрид (решение владельца): свойство говорит про защищающегося,
    // то есть работает только когда бьёт зверь; в защиту карта была бы мёртвым текстом
    id: 'anubis_14',
    title: 'Амат разрывает',
    type: 'attack',
    value: 5,
    bonus: 2,
    quantity: 1,
    fighter: 'amat',
    text: 'ВО ВРЕМЯ БИТВЫ: Защищающийся сбрасывает выложенную карту и защищается другой картой защиты или гибридом; если такой карты нет — защита 0.',
    rules: [
      {
        moment: 'duringCombat',
        text: 'Защищающийся сбрасывает выложенную карту и защищается другой картой защиты или гибридом; если такой карты нет — защита 0.',
        then: [{ action: 'SET_COMBAT', op: 'replaceDefense' }],
      },
    ],
  },
];
