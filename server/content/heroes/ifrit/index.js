/**
 * Ифрит — контент из сезона 1 (глава «Дороти и компания»).
 * Область = стихия клетки, на которой стоит боец (`docs/terrain.md`); разбор героя и числа — `passport.md`.
 *
 * Умение «Пламя преисподней» — начало хода: можно убить своего пепельного духа и получить действие
 * до конца хода. Плата настоящая: дух держит проход, бьёт сам и открывает две карты колоды —
 * без живого духа карты духов объявить нельзя. Воскрешения духов в колоде нет, так что разгонов
 * за партию ровно три.
 */
export default {
  id: 'ifrit',
  name: 'Ифрит',
  color: '#EA580C',
  heroes: [
    {
      id: 'ifrit',
      name: 'Ифрит',
      type: 'hero',
      hp: 14,
      move: 2,
      // дальний бой — attackRange больше 1: достаёт цель на расстоянии до трёх клеток
      attackRange: 3,
      size: 1,
    },
  ],
  assistants: [
    {
      id: 'ash',
      name: 'Пепельные духи',
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
    id: 'ifrit_skill',
    type: 'skill',
    fighter: 'ifrit',
    title: 'Пламя преисподней',
    text: 'НАЧАЛО ХОДА: Можете убить своего пепельного духа — получите 1 действие до конца хода.',
    rules: [
      // Начало хода: есть живой дух — подсвечиваем своих духов. `required: false` — от окна можно
      // отказаться общей кнопкой; дух один — движок отмечает его сам, окна игрок не видит.
      {
        moment: 'turnStart',
        when: [
          {
            fact: 'FIGHTERS',
            params: { side: 'self', group: 'ash', min: 1 },
            var: 'spirits',
          },
        ],
        then: [
          {
            action: 'SET_TARGETING',
            op: 'open',
            candidates: '$spirits',
            count: 1,
            required: false,
            auto: true,
          },
        ],
      },
      // Дух отмечен: он уходит в `lost` (боец с 0 hp), ифрит получает действие до конца хода
      // (`actionsLeft`, а вместе с ним `actionsTotal` — на него смотрит «Счёт ударов»).
      {
        moment: 'picked',
        when: [{ fact: 'PICKED', var: 'picked' }],
        then: [
          { action: 'SET_HEALTH', fighterIds: '$picked', delta: -1 },
          { action: 'SET_ACTIONS', delta: 1 },
        ],
      },
    ],
  },
};
