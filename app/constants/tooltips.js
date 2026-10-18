export const TOOLTIPS = {
  playerCard: {
    fighter: ({ name, hp }) => `${name}: ${hp}`,

    fighterStats: ({ move, attackRange }) => `шаг ${move} · удар ${attackRange}`,

    fighterOffField: () => 'не на поле',

    fighterDown: () => 'убит',

    heroSkill: ({ title, text }) => (title ? `${title}: ${text}` : String(text ?? '')),

    player: ({ name }) => `Игрок: ${name}`,

    actions: ({ left, total, bonus }) =>
      bonus > 0
        ? `Осталось действий: ${left} из ${total} (+${bonus} в этом ходу)`
        : `Осталось действий: ${left} из ${total}`,
    health: ({ hp }) => `Здоровье героя: ${hp}`,

    item: ({ name, state }) => (state ? `${name} · ${state}` : String(name)),

    squad: ({ name, hp }) => `Помощник ${name}: ${hp}`,

    handCount: ({ count }) => `Карт в руке: ${count}`,
    deckCount: ({ count }) => `Карт в колоде: ${count}`,

    discardCount: ({ count }) =>
      count > 0 ? `Карт в сбросе: ${count}. Клик — открыть сброс` : 'Сброс пуст',
  },

  card: {
    type: ({ label }) => label,
    bonus: ({ bonus }) => `Усиление карты: +${bonus}`,
    locked: () => 'Карту нельзя разыграть сейчас',
    fighter: ({ name }) => `Боец карты: ${name}`,
    copies: ({ count }) => `Копий в колоде: ${count}`,
  },

  deck: {
    placement: () => 'Колода: до начала партии недоступна',
    count: ({ count }) => `Колода: ${count} карт`,
    click: () => 'Клик — добрать карту и перейти к перемещению',
  },
  discard: {
    placement: () => 'Сброс: до начала партии недоступен',
    empty: () => 'Сброс пуст',
    count: ({ count }) => `Сброс: ${count} карт`,
    click: () => 'Открыть сброс: все сброшенные карты по типам и копиям',

    bonusDrop: () => 'Скинуть эту карту: её усиление прибавится к перемещению в этом действии',

    bonusReady: () => 'Усиление перемещения: поднимите карту с усилением и скиньте её сюда',

    bonusCard: ({ bonus }) =>
      `Усиление перемещения: +${bonus} к шагу. Карта ждёт над сбросом, пока действие не закрыто`,
  },

  battle: {
    minimize: () => 'Свернуть в миниатюру: окно битвы останется, пока вы его не закроете',
    expand: () => 'Развернуть окно битвы',
    resize: () => 'Потяните, чтобы изменить размер (или стрелки с клавиатуры)',
  },

  board: {
    focus: () => 'Поле на весь экран: спрятать карточки, руку и подсказки',
    exit: () => 'Вернуть карточки, руку и подсказки',
  },

  hand: {
    card: () => 'ЛКМ — выдвинуть карту и разыграть, ПКМ — увеличить',
  },

  profile: {
    currency: ({ label }) => `Игровая валюта: ${label}`,
  },
  header: {
    elapsed: () => 'Время с начала партии',
  },
  footer: {
    age: () => 'Возрастной рейтинг',
  },

  heroDetails: {
    item: ({ condition }) => String(condition ?? ''),
  },

  tableSetup: {
    heroPage: ({ name }) => `Открыть страницу героя: ${name}`,
    rollSeed: () => 'Случайный сид',
  },

  placementTray: {
    moveFighter: ({ name }) => `${name} · перетащите на подсвеченную клетку или щёлкните по ней`,
  },
};

export default TOOLTIPS;
