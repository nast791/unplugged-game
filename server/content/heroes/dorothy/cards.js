import { commonCard } from '../../common/cards.js';

/**
 * Колода Дороти: 25 геройских копий плюс пять общих — два «Обманных манёвра» (отмена свойств),
 * два «Залпа» (ответ на рой) и одна «Подмога» (возврат Тото). Разбор колоды — `passport.md` §7.
 */
export default [
  {
    // Тото — приманка: боец противника из этой битвы меняется с ним местами, а Дороти получает
    // лишнее действие. Так врага, который держал дистанцию, затаскивают в её ближний бой
    id: 'dorothy_01',
    title: 'Тото отвлекает',
    type: 'attack',
    value: 4,
    bonus: 4,
    quantity: 3,
    fighter: 'dorothy',
    text: 'ПОСЛЕ БИТВЫ: Поменяйте местами бойца оппонента, участвовавшего в битве, и Тото. Получите 1 дополнительное действие. Если обмен не состоялся (Тото или участвовавшего в битве бойца оппонента нет на поле или они заморожены), получите 2 дополнительных действия вместо 1.',
    rules: [
      {
        moment: 'afterCombat',
        when: [
          { fact: 'COMBAT', params: { select: 'opponent' }, var: 'foe' },
          // боец противника мог погибнуть в бою, а Тото — не стоять на поле: тогда меняться не с кем;
          // замороженному движок закрывает и обмен, и телепорт, поэтому таких бойцов сюда не пускаем
          { fact: 'FIGHTERS', params: { fighterIds: '$foe', frozen: false }, min: 1, var: 'foes' },
          { fact: 'FIGHTERS', params: { group: 'toto', frozen: false }, min: 1, var: 'toto' },
        ],
        then: [{ action: 'SWAP_FIGHTERS', a: 'toto', b: '$foe' }],
      },
      {
        // обмен состоялся — одно действие
        moment: 'afterCombat',
        when: [
          { fact: 'COMBAT', params: { select: 'opponent' }, var: 'foe' },
          { fact: 'FIGHTERS', params: { fighterIds: '$foe', frozen: false }, min: 1 },
          { fact: 'FIGHTERS', params: { group: 'toto', frozen: false }, min: 1 },
        ],
        then: [{ action: 'SET_ACTIONS', delta: 1 }],
      },
      {
        // обмен не сложился (нет Тото или бойца противника, либо кто-то из них заморожен) —
        // два действия вместо одного
        moment: 'afterCombat',
        any: [
          [{ fact: 'FIGHTERS', params: { group: 'toto' }, max: 0 }],
          [{ fact: 'FIGHTERS', params: { group: 'toto', frozen: true }, min: 1 }],
          [
            { fact: 'COMBAT', params: { select: 'opponent' }, var: 'foe' },
            { fact: 'FIGHTERS', params: { fighterIds: '$foe' }, max: 0 },
          ],
          [
            { fact: 'COMBAT', params: { select: 'opponent' }, var: 'foe' },
            { fact: 'FIGHTERS', params: { fighterIds: '$foe', frozen: true }, min: 1 },
          ],
        ],
        then: [{ action: 'SET_ACTIONS', delta: 2 }],
      },
    ],
  },
  {
    // она не воин, она импровизирует: вода против огня и сухого песка
    id: 'dorothy_02',
    title: 'Ведро воды',
    type: 'attack',
    value: 4,
    bonus: 1,
    quantity: 3,
    fighter: 'any',
    text: 'ВО ВРЕМЯ БИТВЫ: Если цель стоит на клетке со стихией лавы или пустыни, значение карты +3.',
    rules: [
      {
        moment: 'duringCombat',
        when: [{ fact: 'COMBAT', params: { select: 'opponent' }, var: 'foe' }],
        // две стихии — две ветки «или»: на клетке с двумя стихиями +3 приходит один раз, а не дважды
        any: [
          [{ fact: 'FIGHTERS', params: { fighterIds: '$foe', terrain: 'lava' }, min: 1 }],
          [{ fact: 'FIGHTERS', params: { fighterIds: '$foe', terrain: 'desert' }, min: 1 }],
        ],
        then: [{ action: 'SET_COMBAT', op: 'value', side: 'self', delta: 3 }],
      },
    ],
  },
  {
    // держится, пока рядом есть живое плечо: Тото, другой помощник, союзник по команде
    id: 'dorothy_03',
    title: 'Ни шагу назад',
    type: 'defense',
    value: 3,
    bonus: 2,
    quantity: 3,
    fighter: 'any',
    text: 'ВО ВРЕМЯ БИТВЫ: Если рядом с защищающимся бойцом стоит другой дружественный боец, значение карты +2.',
    rules: [
      {
        moment: 'duringCombat',
        when: [{ fact: 'COMBAT', params: { select: 'self' }, var: 'self' }],
        // «другой»: сама клетка бойца в подсчёт не идёт (adjacentTo отбрасывает расстояние 0)
        any: [
          [{ fact: 'FIGHTERS', params: { side: 'self', adjacentTo: '$self' }, min: 1 }],
          [{ fact: 'FIGHTERS', params: { side: 'teammate', adjacentTo: '$self' }, min: 1 }],
        ],
        then: [{ action: 'SET_COMBAT', op: 'value', side: 'self', delta: 2 }],
      },
    ],
  },
  {
    // развилка вместо линейного эффекта: залечиться, добрать карту или оттолкнуть атакующего
    id: 'dorothy_04',
    title: 'Смена караула',
    type: 'hybrid',
    value: 4,
    bonus: 1,
    quantity: 2,
    fighter: 'dorothy',
    text: 'ПОСЛЕ БИТВЫ: Выберите одно свойство:',
    options: [
      { id: 'heal', text: 'Восстановите Дороти 2 здоровья.' },
      { id: 'draw', text: 'Возьмите 1 карту.' },
      { id: 'push', text: 'Сдвиньте атакующего бойца на 1 клетку.' },
    ],
    rules: [
      {
        moment: 'afterCombat',
        // выбор необязательный: можно отказаться и не тратить свойство
        then: [
          {
            action: 'SET_TARGETING',
            op: 'open',
            kind: 'options',
            count: 1,
            required: false,
            candidates: ['heal', 'draw', 'push'],
          },
        ],
      },
      {
        moment: 'picked',
        when: [
          { fact: 'PICKED', params: { is: 'heal' } },
          { fact: 'FIGHTERS', params: { side: 'self', type: 'hero' }, min: 1, var: 'heroes' },
        ],
        then: [{ action: 'SET_HEALTH', fighterIds: '$heroes', delta: 2 }],
      },
      {
        moment: 'picked',
        when: [{ fact: 'PICKED', params: { is: 'draw' } }],
        then: [{ action: 'SET_CARDS', op: 'draw', count: 1 }],
      },
      {
        moment: 'picked',
        when: [
          { fact: 'PICKED', params: { is: 'push' } },
          { fact: 'COMBAT', params: { select: 'opponent' }, var: 'foe' },
          // атакующий мог погибнуть в бою — тогда двигать некого
          { fact: 'FIGHTERS', params: { fighterIds: '$foe' }, min: 1, var: 'foes' },
        ],
        then: [
          { action: 'SET_MOVEMENT', op: 'open', fighters: '$foes', budget: 1, optional: true },
        ],
      },
    ],
  },
  {
    // контр-игра: против героя противника защита крепче, против его своры — обычная
    id: 'dorothy_05',
    title: 'Чужая земля',
    type: 'defense',
    value: 4,
    bonus: 2,
    quantity: 2,
    fighter: 'any',
    text: 'ВО ВРЕМЯ БИТВЫ: Если атакует герой противника, значение карты +2.',
    rules: [
      {
        moment: 'duringCombat',
        when: [
          { fact: 'COMBAT', params: { select: 'opponent' }, var: 'foe' },
          { fact: 'FIGHTERS', params: { fighterIds: '$foe', type: 'hero' }, min: 1 },
        ],
        then: [{ action: 'SET_COMBAT', op: 'value', side: 'self', delta: 2 }],
      },
    ],
  },
  {
    // собака работает, пока у хозяйки есть чем играть: награда за широкую руку
    id: 'dorothy_06',
    title: 'Грызёт за пятки',
    type: 'hybrid',
    value: 3,
    bonus: 1,
    quantity: 2,
    fighter: 'toto',
    text: 'ВО ВРЕМЯ БИТВЫ: Если в руке 4 карты или больше, значение карты +2.',
    rules: [
      {
        moment: 'duringCombat',
        when: [{ fact: 'HAND', params: { min: 4 } }],
        then: [{ action: 'SET_COMBAT', op: 'value', side: 'self', delta: 2 }],
      },
    ],
  },
  {
    // темп: выигранная битва не заканчивает ход, а двигает собаку
    id: 'dorothy_07',
    title: 'Взять след',
    type: 'hybrid',
    value: 2,
    bonus: 2,
    quantity: 3,
    fighter: 'toto',
    text: 'ПОСЛЕ БИТВЫ: Если вы победили, получите 1 действие и переместите Тото на расстояние до 3 клеток.',
    rules: [
      {
        moment: 'afterCombat',
        when: [
          { fact: 'COMBAT', params: { winner: 'self' } },
          // Тото убит — карта гаснет: это его карта, и действие не выдаётся
          { fact: 'FIGHTERS', params: { group: 'toto' }, min: 1, var: 'toto' },
        ],
        then: [
          { action: 'SET_ACTIONS', delta: 1 },
          { action: 'SET_MOVEMENT', op: 'open', fighters: '$toto', budget: 3, optional: true },
        ],
      },
    ],
  },
  {
    // удар «наотмашь» достаёт даже проигранный бой: 2 урона бойцу противника из этой битвы,
    // а если это помощник — ещё 1 урон его герою (условия правил читаются до действий,
    // поэтому помощника можно снять первым уроном и всё равно задеть хозяйского героя)
    id: 'dorothy_08',
    title: 'Наотмашь',
    type: 'attack',
    value: 3,
    bonus: 2,
    quantity: 3,
    fighter: 'dorothy',
    text: 'ПОСЛЕ БИТВЫ: Нанесите 2 урона бойцу противника, участвовавшему в битве. Если этот боец — помощник, нанесите также 1 урон герою этого противника.',
    rules: [
      {
        moment: 'afterCombat',
        when: [
          { fact: 'COMBAT', params: { select: 'opponent' }, var: 'foe' },
          // боец противника мог погибнуть в бою — тогда добивать некого
          { fact: 'FIGHTERS', params: { fighterIds: '$foe' }, min: 1, var: 'foes' },
        ],
        then: [{ action: 'SET_HEALTH', fighterIds: '$foes', delta: -2 }],
      },
      {
        moment: 'afterCombat',
        when: [
          // помощник противника в этой битве: тип читается и у погибшего — из записи боя
          // (`COMBAT { select, type }`), поэтому ветка работает и когда 2 урона выше его уже сняли
          { fact: 'COMBAT', params: { select: 'opponent', type: 'assistant' }, var: 'foe' },
          // герой того же противника: `of` берёт бойцов одного игрока
          { fact: 'COMBAT', params: { player: 'opponent' }, var: 'enemy' },
          { fact: 'FIGHTERS', params: { of: '$enemy', type: 'hero' }, min: 1, var: 'heroes' },
        ],
        then: [{ action: 'SET_HEALTH', fighterIds: '$heroes', delta: -1 }],
      },
    ],
  },
  {
    id: 'dorothy_09',
    title: 'Зелёные очки',
    type: 'effect',
    value: null,
    bonus: 3,
    quantity: 2,
    fighter: 'any',
    text: 'Возьмите 2 карты.',
    rules: [
      {
        moment: 'effect',
        then: [{ action: 'SET_CARDS', op: 'draw', count: 2 }],
      },
    ],
  },
  {
    // обезьяны переносят пару: один розыгрыш — два перемещения, чтобы собраться в одной области
    id: 'dorothy_11',
    title: 'Золотая шапка',
    type: 'effect',
    value: null,
    // бонус 3 — единственная такая карта колоды (правило `docs/hero-algorithm.md` §6)
    bonus: 3,
    quantity: 2,
    fighter: 'dorothy',
    text: 'Сдвиньте Дороти и Тото: каждый может пройти до 4 клеток.',
    rules: [
      {
        moment: 'effect',
        // Тото убит — шапка несёт одну Дороти: список строится из тех, кто на поле
        when: [
          {
            fact: 'FIGHTERS',
            params: { side: 'self', fighterIds: ['dorothy', 'toto'] },
            min: 1,
            var: 'pair',
          },
        ],
        then: [
          { action: 'SET_MOVEMENT', op: 'open', fighters: '$pair', budget: 4, optional: true },
        ],
      },
    ],
  },
  commonCard('common_feint', 2),
  commonCard('common_volley', 2),
  commonCard('common_recall', 1),
];
