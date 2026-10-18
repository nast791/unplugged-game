// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h, nextTick, ref, TransitionGroup } from 'vue';

/**
 * Карточка места — 1в1 с макетом владельца (классы живут в самом `PlayerCard.vue`): слева аватар героя
 * с обводкой по здоровью и места предметов, справа имя со значком роли (человек или ИИ), дальности
 * перемещения и удара, здоровье числами над вдавленной шкалой, справа сверху — пульсирующий кружок
 * и остаток действий (в начале хода «2/2», в расстановке вместо них плашка), справа снизу — панель
 * помощников с числами выбранной копии. **Чужие места носят ярлычок у левого верхнего края** — числа
 * карт в руке, колоде и сбросе, где сброс кликается и открывает модалку за это место (у своего места
 * ярлычка нет: свои числа игрок видит в руке и на стопках).
 *
 * Внешний слой карточки — **рамка активности** (`frameClass`): она охватывает и ярлычок, потому что
 * ярлычок выступает над телом карточки. Обводку ярлычка рисует он сам, цветом рамки (`frameTone`),
 * поэтому в битве и в свой ход карточка читается обведённой **целиком**, а не «рамка плюс серый ярлык».
 * Поэтому рамку проверяем на корне, а тело карточки — внутри.
 *
 * `PlayerCard.vue` — SFC приложения: `computed`/`ref` приходят из автоимпортов Nuxt, в тесте кладём их
 * в `globalThis` до импорта компонента (так же, как `board-clicks.test.js`).
 */
globalThis.computed = computed;
globalThis.ref = ref;
globalThis.nextTick = nextTick;

// Настоящий `useUI` читает конфиг приложения (`app.config.js`), которого в тесте нет, — аватар-атом
// (`AAvatar`) собираем на его же пресете напрямую.
vi.mock('~/composables/ui/useUI', async importOriginal => {
  const { computed, toValue } = await import('vue');
  const actual = await importOriginal();
  const avatar = (await import('../../../app/ui/avatar.js')).default;

  return {
    ...actual,
    useUI: (key, localUi) => ({
      styles: computed(() => actual.resolveUiStyles(avatar, toValue(localUi))),
    }),
  };
});

// Профиль (`useProfile`) держит ник в `useState`, а состояния Nuxt в тесте нет — подставляем ник напрямую.
vi.mock('~/composables/ui/useProfile', async () => {
  const { computed } = await import('vue');
  return { useProfile: () => ({ nick: computed(() => 'Элизиф') }) };
});

/**
 * Тултип — своя обвязка reka-ui, а карточке от него нужен только текст подсказки: заглушка кладёт его
 * в `data-tooltip` на сам элемент (как `piles.test.js`), поэтому в тесте видно, что именно покажется
 * при наведении, — раньше это был нативный `title`.
 */
vi.mock('~/components/atoms/ATooltip.vue', async () => {
  const { defineComponent, h, mergeProps } = await import('vue');
  return {
    default: defineComponent({
      name: 'ATooltip',
      props: { text: { type: String, default: '' } },
      setup(props, { slots, attrs }) {
        return () => h('div', mergeProps(attrs, { 'data-tooltip': props.text }), slots.default?.());
      },
    }),
  };
});

// Чей ход, сколько действий и идёт ли расстановка карточка читает из сессии партии — в тесте она своя.
vi.mock('~/composables/game/useGameSession.js', async () => {
  const { ref } = await import('vue');
  const session = {
    you: ref('medusa'),
    currentPlayerId: ref(null),
    isPlacement: ref(false),
    actionsLeft: ref(0),
    actionsTotal: ref(0),
    actionsBonus: ref(0),
    // метки битвы, окно умения и его отметка: карточка показывает по ним обводки и плашку «Умение»
    battleRoles: ref({
      attackerPlayerId: null,
      defenderPlayerId: null,
      attackerFighterId: null,
      defenderFighterId: null,
    }),
    lastSkill: ref(null),
    steps: ref(0),
    targeting: ref(null),
    movement: ref(null),
  };
  return { useGameSession: () => session, session };
});

const { session } = await import('~/composables/game/useGameSession.js');
const { closeAllModals, getModalPayload, isModalOpen } =
  await import('~/composables/ui/useModal.js');

/** Ход в сессии: `current` — чей ход, `left`/`actionsTotal`/`bonus` — счётчик действий движка. */
const setSession = ({
  current = null,
  placement = false,
  left = 0,
  actionsTotal = 0,
  bonus = 0,
} = {}) => {
  session.currentPlayerId.value = current;
  session.isPlacement.value = placement;
  session.actionsLeft.value = left;
  session.actionsTotal.value = actionsTotal;
  session.actionsBonus.value = bonus;
};

const clearBattleRoles = () => {
  session.battleRoles.value = {
    attackerPlayerId: null,
    defenderPlayerId: null,
    attackerFighterId: null,
    defenderFighterId: null,
  };
};

beforeEach(() => {
  setSession();
  clearBattleRoles();
  closeAllModals();
});

/**
 * Значок предмета карточка берёт глобальным компонентом `Icon` (`@nuxt/icon`): без Nuxt-инстанса он
 * не работает, поэтому подставляем заглушку — имя значка уходит в атрибут.
 */
const IconStub = defineComponent({
  name: 'Icon',
  props: { name: { type: String, default: '' } },
  setup(props) {
    return () => h('i', { 'data-icon': props.name });
  },
});

/** Значки макета — SVG-файлы проекта (`vite-svg-loader` в тесте не работает): подменяем заглушками. */
const letterStub = letter =>
  defineComponent({
    name: `Stub${letter}`,
    setup: () => () => h('i', { 'data-icon': letter }),
  });

vi.mock('~/svg/game/move.svg', () => ({ default: letterStub('move') }));
vi.mock('~/svg/game/attack.svg', () => ({ default: letterStub('attack') }));

const { default: PlayerCard } =
  await import('../../../app/components/molecules/game/PlayerCard.vue');

/** Аватар-оболочка reka-ui в happy-dom не нужна — слота фолбэка достаточно. */
const AvatarRootStub = defineComponent({
  name: 'AvatarRoot',
  props: {
    title: { type: String, default: '' },
    class: { type: [String, Array, Object], default: '' },
  },
  setup(props, { slots, attrs }) {
    return () =>
      h(
        'span',
        {
          ...attrs,
          'class': props.class,
          'title': props.title,
          'data-face': '',
        },
        slots.default?.(),
      );
  },
});

const AvatarFallbackStub = defineComponent({
  name: 'AvatarFallback',
  setup(_props, { slots }) {
    return () => h('span', slots.default?.());
  },
});

const mountCard = (player, props = {}) =>
  mount(PlayerCard, {
    props: { player, ...props },
    global: {
      components: {
        Icon: IconStub,
        AvatarRoot: AvatarRootStub,
        AvatarFallback: AvatarFallbackStub,
        TransitionGroup,
      },
    },
  });

/** Карточка героя из контента: числа бойцов (шаг и удар), умение и значок предмета в состоянии не лежат. */
const catalog = {
  skill: {
    title: 'Взгляд Медузы',
    text: 'Противник не может атаковать Медузу, пока смотрит ей в глаза.',
  },
  fighters: [
    { id: 'medusa', name: 'Медуза', type: 'hero', hp: 16, move: 3, attackRange: 2 },
    { id: 'harpies_1', name: 'Гарпия', type: 'assistant', hp: 1, move: 3, attackRange: 2 },
    { id: 'harpies_2', name: 'Гарпия', type: 'assistant', hp: 1, move: 3, attackRange: 2 },
    { id: 'harpies_3', name: 'Гарпия', type: 'assistant', hp: 1, move: 3, attackRange: 2 },
  ],
  items: [{ id: 'shroud', name: 'Пелена', icon: 'lucide:bandage' }],
};

const hero = (extra = {}) => ({
  id: 'medusa',
  name: 'Медуза',
  type: 'hero',
  group: null,
  copies: 1,
  currentHp: 15,
  startHp: 16,
  currentPosition: 5,
  ...extra,
});

const harpy = (index, extra = {}) => ({
  id: `harpies_${index}`,
  name: 'Гарпия',
  type: 'assistant',
  group: 'harpies',
  copies: 3,
  currentHp: 1,
  startHp: 1,
  currentPosition: 6 + index,
  ...extra,
});

/** Место как в проекции партии: игрок Элизиф за Медузу, три копии гарпий, два предмета. */
const player = (extra = {}) => ({
  id: 'medusa',
  name: 'Элизиф',
  color: '#059669',
  control: 'human',
  order: 1,
  resigned: false,
  fighters: [hero(), harpy(1), harpy(2), harpy(3)],
  items: [
    { id: 'shroud', name: 'Пелена', group: 'shroud', state: 'active', color: '#F5CA6E' },
    { id: 'shroud_2', name: 'Пелена', group: 'shroud', state: 'inactive' },
  ],
  ...extra,
});

/**
 * Аватарки помощников. Ищем по `data-face-id`: `data-face` носят ещё и обёртки подсказок, и в список
 * попадало бы лишнее; выбранная копия стоит последней, и её числа подписаны слева.
 */
const faces = wrapper => wrapper.findAll('[data-face-id]');

/** Подсказка в тесте — атрибут заглушки `ATooltip` (`data-tooltip`): так видно текст, который покажется. */
const tooltips = wrapper =>
  wrapper.findAll('[data-tooltip]').map(node => node.attributes('data-tooltip'));
const tooltip = (wrapper, text) => tooltips(wrapper).some(value => value.includes(text));

describe('PlayerCard: герой', () => {
  it('показывает имя героя, имя игрока и здоровья числами', () => {
    const wrapper = mountCard(player(), { catalog });

    expect(wrapper.text()).toContain('Медуза');
    expect(wrapper.text()).toContain('Элизиф');
    expect(wrapper.text()).toContain('15/16');
  });

  it('у места компьютера только имя героя: имени игрока нет', () => {
    const wrapper = mountCard(player({ name: 'Компьютер', control: 'ai' }), { catalog });

    expect(wrapper.text()).toContain('Медуза');
    expect(wrapper.text()).not.toContain('Компьютер');
  });

  it('полоса считается от стартового здоровья, а цвет — по остатку', () => {
    const wrapper = mountCard(player(), { catalog });
    const bar = wrapper.get('[data-hp-bar]');

    expect(bar.attributes('style')).toContain('width: 93.75%');
    expect(bar.attributes('style')).toContain('--hp-color: var(--color-success)');
  });

  it('рамка аватара героя — цветом героя, а не шкалой здоровья; у убитого карточка гаснет', () => {
    const alive = mountCard(player(), { catalog });
    expect(alive.find('.size-74').classes().join(' ')).toContain('border-[var(--hero-color)]');

    // смерть видна по тому, что карточка гаснет, а не по цвету кольца: кольцо героя — это место стороны
    const dead = mountCard(player({ fighters: [hero({ currentHp: 0 }), harpy(1)] }), { catalog });
    expect(dead.classes().join(' ')).toContain('opacity-60');
  });

  it('показывает дальности перемещения и удара значками макета', () => {
    const wrapper = mountCard(player(), { catalog });

    expect(wrapper.html()).toContain('data-icon="move"');
    expect(wrapper.html()).toContain('data-icon="attack"');
    expect(wrapper.text()).toContain('3');
    expect(wrapper.text()).toContain('2');
  });

  it('без каталога не выдумывает числа: пустое место вместо прочерка и нуля', () => {
    const wrapper = mountCard(player());

    expect(wrapper.text()).not.toContain('undefined');
    expect(wrapper.find('.size-74').exists()).toBe(true);
  });
});

describe('PlayerCard: действия и фазы', () => {
  it('у чужого хода кружка нет, у своего — пульсирующий кружок и остаток действий «2/2»', () => {
    const waiting = mountCard(player(), { catalog });
    expect(waiting.find('.before\\:animate-ping').exists()).toBe(false);
    expect(waiting.text()).not.toContain('2/2');

    setSession({ current: 'medusa', left: 2, actionsTotal: 2 });
    const current = mountCard(player(), { catalog });
    // кружок пульсирует: само кольцо — псевдоэлемент с анимацией
    expect(current.find('.before\\:animate-ping').exists()).toBe(true);
    expect(current.attributes('aria-current')).toBe('true');
    expect(current.text()).toContain('2/2');
  });

  it('у чужого хода рамки нет, у своего — коралловая (акцентная)', () => {
    const waiting = mountCard(player(), { catalog });
    expect(waiting.classes().join(' ')).toContain('border-line');

    setSession({ current: 'medusa' });
    const current = mountCard(player(), { catalog });
    const classes = current.classes().join(' ');
    expect(classes).toContain('border-accent');
    expect(classes).toContain('border-2');
    expect(classes).not.toContain('border-line');
  });

  it('счётчик показывает остаток действий, а знаменатель включает добавленные', () => {
    // начало хода: не потрачено ничего — «3/3»
    setSession({ current: 'medusa', left: 3, actionsTotal: 3 });
    const first = mountCard(player(), { catalog });
    expect(first.text()).toContain('3/3');
    expect(tooltip(first, 'Осталось действий: 3 из 3')).toBe(true);

    // одно действие объявлено — осталось два из трёх (жалоба владельца: «1/1» посреди хода)
    setSession({ current: 'medusa', left: 2, actionsTotal: 3 });
    const second = mountCard(player(), { catalog });
    expect(second.text()).toContain('2/3');
    expect(tooltip(second, 'Осталось действий: 2 из 3')).toBe(true);

    // добавочное действие движок выдаёт ростом хода: знаменатель становится четырём
    setSession({ current: 'medusa', left: 1, actionsTotal: 4, bonus: 1 });
    const third = mountCard(player(), { catalog });
    expect(third.text()).toContain('1/4');
    expect(tooltip(third, 'Осталось действий: 1 из 4 (+1 в этом ходу)')).toBe(true);
  });

  it('в расстановке вместо действий — плашка фазы, а у подтвердившего её нет', () => {
    setSession({ current: 'medusa', placement: true, left: 2, actionsTotal: 2 });
    const ready = player();
    ready.placementReady = false;
    const wrapper = mountCard(ready, { catalog });

    expect(wrapper.text()).toContain('Расстановка');
    expect(wrapper.find('.before\\:animate-ping').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('2/2');

    const done = player();
    done.placementReady = true;
    expect(mountCard(done, { catalog }).text()).not.toContain('Расстановка');
  });

  /**
   * Чужую расстановку проекция не отдаёт (`currentPosition: null` у соперника), поэтому по позиции нельзя
   * утверждать, что боец не выставлен: у подтвердившегося слота карточка обязана молчать про «не на поле»,
   * иначе уже расставившийся компьютер выглядит как «ещё не поставил».
   */
  it('у чужого подтвердившегося слота в подсказке нет «не на поле», хотя позиции скрыты', () => {
    setSession({ placement: true });
    const rival = player({
      id: 'anubis',
      name: 'Компьютер',
      control: 'ai',
      placementReady: true,
      fighters: [hero({ id: 'anubis', name: 'Анубис', currentPosition: null })],
    });
    const wrapper = mountCard(rival, { catalog });

    const avatar = wrapper.find('.size-74');
    expect(avatar.exists()).toBe(true);
    expect(avatar.element.closest('[data-tooltip]').getAttribute('data-tooltip')).not.toContain(
      'не на поле',
    );
    expect(wrapper.text()).not.toContain('Расстановка');
  });

  it('свой не выставленный боец по-прежнему помечен «не на поле»', () => {
    setSession({ placement: true });
    const mine = player({
      placementReady: false,
      fighters: [hero({ currentPosition: null }), harpy(1)],
    });
    const wrapper = mountCard(mine, { catalog });

    expect(
      wrapper.find('.size-74').element.closest('[data-tooltip]').getAttribute('data-tooltip'),
    ).toContain('не на поле');
  });
});

describe('PlayerCard: предметы', () => {
  it('рисует место на каждую копию и берёт значок из пака', () => {
    const wrapper = mountCard(player(), { catalog });
    const items = wrapper.findAll('[data-item]');

    expect(items).toHaveLength(2);
    expect(items[0].html()).toContain('lucide:bandage');
  });

  it('без каталога место предмета есть, а чужого значка в нём нет', () => {
    const wrapper = mountCard(player());
    const items = wrapper.findAll('[data-item]');

    expect(items).toHaveLength(2);
    expect(items[0].find('[data-icon]').exists()).toBe(false);
  });
});

describe('PlayerCard: помощники', () => {
  it('рисует аватары копий и числа выбранной — по умолчанию последней', () => {
    const wrapper = mountCard(player(), { catalog });

    expect(faces(wrapper)).toHaveLength(3);
    expect(wrapper.text()).toContain('Гарпия');
    // числа выбранной копии: здоровье 1/1, шаг 3, удар 2
    expect(wrapper.text()).toContain('1/1');
  });

  it('клик по аватару ставит его крайним справа и показывает его числа', async () => {
    const squad = player();
    squad.fighters = [
      hero(),
      harpy(1, { name: 'Первая', currentHp: 1 }),
      harpy(2, { name: 'Вторая', currentHp: 0 }),
    ];
    const wrapper = mountCard(squad, { catalog });

    // по умолчанию крайняя справа — последняя копия, её числа и подписаны слева
    expect(wrapper.text()).toContain('Вторая');

    const first = faces(wrapper)[0];
    first.trigger('click');
    await nextTick();
    const order = faces(wrapper).map(face => face.attributes('data-face-id'));
    expect(order[order.length - 1], `порядок: ${order.join(', ')}`).toBe('harpies_1');
    expect(wrapper.text()).toContain('Первая');
    // клик по аватару не открывает карточку героя
    expect(isModalOpen('heroDetails')).toBe(false);
  });

  it('обводка копии — по остатку здоровья, убитая копия серая и кликабельна', async () => {
    const squad = player();
    squad.fighters = [
      hero(),
      harpy(1, { startHp: 10, currentHp: 10 }),
      harpy(2, { startHp: 10, currentHp: 4 }),
      harpy(3, { startHp: 10, currentHp: 0 }),
    ];
    const wrapper = mountCard(squad, { catalog });

    const tones = faces(wrapper).map(node => node.classes().join(' '));
    expect(tones[0]).toContain('border-success');
    expect(tones[1]).toContain('border-gold');
    expect(tones[2]).toContain('border-line');
    // гаснет не прозрачностью: кольцо плотное, портрет убитой копии обесцвечен
    expect(tones[2]).not.toContain('opacity-50');
    expect(wrapper.findAll('.grayscale')).toHaveLength(1);

    // убитая копия остаётся кликабельной: клик выбирает её, а не открывает героя
    await faces(wrapper)[2].trigger('click');
    expect(isModalOpen('heroDetails')).toBe(false);
  });

  it('место без помощников и предметов не рисует ни панель, ни кружков', () => {
    const lonely = player({ fighters: [hero()], items: [] });
    const wrapper = mountCard(lonely, { catalog });

    expect(faces(wrapper)).toHaveLength(0);
    expect(wrapper.findAll('[data-item]')).toHaveLength(0);
    expect(wrapper.find('[data-hp-bar]').exists()).toBe(true);
  });
});

describe('PlayerCard: клик по карточке', () => {
  it('открывает шторку героя через реестр модалок', async () => {
    const wrapper = mountCard(player(), { catalog });
    await wrapper.trigger('click');

    expect(isModalOpen('heroDetails')).toBe(true);
    expect(getModalPayload('heroDetails')).toBe('medusa');
  });
});

describe('PlayerCard: ярлычок счётчиков карт', () => {
  /** Чужое место: у смотрящего в сессии `medusa`, поэтому карточка соседа — другой id. */
  const other = extra => player({ id: 'tesla', name: 'Гамлет', ...extra });
  const counts = wrapper => wrapper.find('[data-card-counts]');

  it('своё место ярлычка не носит', () => {
    const wrapper = mountCard(player({ handCount: 5, deckCount: 24, discardCount: 3 }));

    expect(counts(wrapper).exists()).toBe(false);
    expect(wrapper.classes()).not.toContain('mt-28');
  });

  it('чужое место показывает числа руки, колоды и сброса', () => {
    const wrapper = mountCard(other({ handCount: 5, deckCount: 24, discardCount: 3 }));

    // ярлычок выступает над карточкой, поэтому место под него взято отступом
    expect(wrapper.classes()).toContain('mt-28');
    // фон ярлычка — тот же, что у карточки: её цвет, её блик и её зерно точками по той же сетке
    expect(counts(wrapper).find('svg').exists()).toBe(true);
    const shape = counts(wrapper).find('.fill-surface');
    expect(shape.exists()).toBe(true);
    // скос сглажен дугой, а не оставлен острым углом
    expect(shape.attributes('d')).toContain('Q36 0');
    expect(counts(wrapper).find('.stroke-line').exists()).toBe(true);
    expect(counts(wrapper).find('svg').html()).toContain('fill-white/4');

    const skin = counts(wrapper).find('[data-card-counts-skin]');
    expect(skin.classes().join(' ')).toContain('radial-gradient');
    expect(skin.attributes('style')).toContain('clip-path');
    expect(skin.attributes('style')).toContain('10px 10px');
    expect(counts(wrapper).text()).toContain('5');
    expect(counts(wrapper).text()).toContain('24');
    expect(counts(wrapper).text()).toContain('3');
    expect(tooltip(wrapper, 'Карт в руке: 5')).toBe(true);
    expect(tooltip(wrapper, 'Карт в колоде: 24')).toBe(true);
    expect(tooltip(wrapper, 'Карт в сбросе: 3')).toBe(true);
  });

  it('обводка ярлычка берёт цвет рамки: в битве — красный и голубой, без роли — линейный', async () => {
    const wrapper = mountCard(other({ handCount: 2, deckCount: 10, discardCount: 0 }));
    expect(counts(wrapper).find('.stroke-line').exists()).toBe(true);

    session.battleRoles.value = {
      attackerPlayerId: 'tesla',
      defenderPlayerId: null,
      attackerFighterId: 'tesla',
      defenderFighterId: null,
    };
    await nextTick();
    expect(wrapper.classes()).toContain('border-danger');
    expect(counts(wrapper).find('.stroke-danger').exists()).toBe(true);
    expect(counts(wrapper).find('.stroke-line').exists()).toBe(false);

    session.battleRoles.value = {
      attackerPlayerId: null,
      defenderPlayerId: 'tesla',
      attackerFighterId: null,
      defenderFighterId: 'tesla',
    };
    await nextTick();
    expect(wrapper.classes()).toContain('border-info');
    expect(counts(wrapper).find('.stroke-info').exists()).toBe(true);
    expect(counts(wrapper).find('.stroke-danger').exists()).toBe(false);
  });

  it('клик по сбросу открывает сброс этого места, а не смотрящего', async () => {
    const wrapper = mountCard(other({ handCount: 5, deckCount: 24, discardCount: 3 }));
    await counts(wrapper).find('[data-discard-open]').trigger('click');

    expect(isModalOpen('discard')).toBe(true);
    expect(getModalPayload('discard')).toEqual({ playerId: 'tesla' });
    // у карточки свой клик — шторка героя от ярлычка не открывается
    expect(isModalOpen('heroDetails')).toBe(false);
  });

  it('пустой сброс открывать нечем — и клик молчит, и подсказка говорит об этом', async () => {
    const wrapper = mountCard(other({ handCount: 5, deckCount: 24, discardCount: 0 }));
    const chip = counts(wrapper).find('[data-discard-open]');

    expect(tooltip(wrapper, 'Сброс пуст')).toBe(true);
    // цвет значка не зависит от числа: пустой сброс просто не открывается
    expect(chip.find('i').classes()).toContain('text-dim');
    expect(chip.html()).not.toContain('text-gray');

    await chip.trigger('click');
    expect(isModalOpen('discard')).toBe(false);
    expect(isModalOpen('heroDetails')).toBe(false);
  });
});

describe('PlayerCard: расстановка', () => {
  /** Боец без клетки: в расстановке у него `currentPosition == null` — это и есть «ещё не на поле». */
  const unplaced = fighter => ({ ...fighter, currentPosition: null });

  it('помощник без клетки обведён как выбывший, поставленный — по здоровью', () => {
    setSession({ placement: true });
    const squad = player();
    squad.fighters = [unplaced(hero()), unplaced(harpy(1)), harpy(2)];
    const wrapper = mountCard(squad, { catalog });

    const rings = faces(wrapper).map(face => face.classes().join(' '));
    expect(rings[0]).toContain('border-line');
    expect(rings[0]).not.toContain('border-success');
    expect(rings[0]).not.toContain('opacity-50');
    expect(rings[0]).not.toContain('grayscale');

    // grayscale — на портрете, а не на кольце: ждут места герой и первый помощник
    expect(wrapper.findAll('.grayscale')).toHaveLength(2);
    const portrait = wrapper.find('[data-face-id] .grayscale');
    // портрет обесцвечен целиком (фолбэк растянут на весь кружок), а не только буквы
    expect(portrait.classes().join(' ')).toContain('size-full');
    expect(portrait.classes().join(' ')).toContain('bg-surface-2');

    expect(rings[1]).toContain('border-success');
    expect(rings[1]).not.toContain('border-line');
  });

  it('голубое кольцо ждущего — только у полки расстановки, не у карточки', () => {
    setSession({ placement: true });
    const squad = player();
    squad.fighters = [unplaced(hero()), unplaced(harpy(1))];
    const wrapper = mountCard(squad, { catalog });

    expect(faces(wrapper)[0].classes().join(' ')).not.toContain('border-info');
    expect(faces(wrapper)[0].classes().join(' ')).toContain('size-46');
  });

  it('герой без клетки теряет цвет героя: серое кольцо и обесцвеченный портрет', () => {
    setSession({ placement: true });
    const waiting = player({ fighters: [unplaced(hero()), harpy(1)] });
    const wrapper = mountCard(waiting, { catalog });

    const avatar = wrapper.find('.size-74');
    expect(avatar.classes().join(' ')).toContain('border-line');
    expect(avatar.classes().join(' ')).not.toContain('opacity-50');
    expect(avatar.classes().join(' ')).not.toContain('border-[var(--hero-color)]');
    expect(avatar.find('.grayscale').exists()).toBe(true);
  });

  it('вне расстановки место не влияет на обводку: цвет героя и здоровье помощника', () => {
    const squad = player({ fighters: [unplaced(hero()), unplaced(harpy(1))] });
    const wrapper = mountCard(squad, { catalog });

    // вне расстановки отсутствие клетки — не «полка»: и кольцо, и портрет обычные
    expect(wrapper.find('.size-74').classes().join(' ')).toContain('border-[var(--hero-color)]');
    expect(faces(wrapper)[0].classes().join(' ')).toContain('border-success');
    expect(wrapper.findAll('.grayscale')).toHaveLength(0);
  });
});

describe('PlayerCard: роль в битве', () => {
  const roles = (extra = {}) => ({
    attackerPlayerId: null,
    defenderPlayerId: null,
    attackerFighterId: null,
    defenderFighterId: null,
    ...extra,
  });

  it('карточка атакующего обведена красным, защитника — голубым, остальных — как обычно', async () => {
    const wrapper = mountCard(player());
    expect(wrapper.classes()).toContain('border-line');

    session.battleRoles.value = roles({ attackerPlayerId: 'medusa', attackerFighterId: 'medusa' });
    await nextTick();
    expect(wrapper.classes()).toContain('border-danger');
    expect(wrapper.classes()).not.toContain('border-line');

    session.battleRoles.value = roles({ defenderPlayerId: 'medusa', defenderFighterId: 'medusa' });
    await nextTick();
    expect(wrapper.classes()).toContain('border-info');
    expect(wrapper.classes()).not.toContain('border-danger');

    session.battleRoles.value = roles({ attackerPlayerId: 'other' });
    await nextTick();
    expect(wrapper.classes()).toContain('border-line');
  });

  /**
   * Плашка «Умение» — только про смотрящего: открытое окно умения и черновик перемещения от умения
   * принадлежат тому, кто ходит, а `lastSkill` — публичное поле партии. Раньше она висела на карточке
   * соседа после чужого умения (жалоба владельца: «на Анубисе висит умение, хотя пелена не активна»).
   */
  it('плашку «Умение» показывает только место смотрящего, и только по своему умению', async () => {
    const rival = mountCard(
      player({ id: 'anubis', name: 'Анубис', skill: { id: 'anubis_skill' } }),
      { catalog },
    );

    session.lastSkill.value = { playerId: 'anubis', skillId: 'anubis_skill', moment: 'turnEnd' };
    await nextTick();
    expect(rival.find('[data-skill-badge]').exists()).toBe(false);

    // своё продолжительное умение видно всегда: это состояние героя, а не момент решения
    const mine = mountCard(player({ skill: { id: 'medusa_skill' }, skillActive: true }), {
      catalog,
    });
    expect(mine.find('[data-skill-badge]').exists()).toBe(true);
  });

  /**
   * Отметку сработавшего умения держит и снимает движок (`lastSkill`, `SET_ACTIONS −1`), а плашка
   * читает её напрямую. Раньше клиент считал её сам по номеру шага и сравнивал отметки по ссылке:
   * после каждого ответа сервера приходил новый объект с тем же содержимым, плашка вставала заново и
   * висела до конца хода (жалоба владельца: «умение висит и не снимается, а это уже второе действие»).
   */
  it('плашка «Умение» гаснет вместе с отметкой движка и встаёт на новую', async () => {
    const card = mountCard(player({ skill: { id: 'medusa_skill' } }), { catalog });
    const badge = () => card.find('[data-skill-badge]').exists();
    expect(badge()).toBe(false);

    // умение сработало в начале хода — отметка стоит
    session.lastSkill.value = { playerId: 'medusa', skillId: 'medusa_skill', moment: 'turnStart' };
    await nextTick();
    expect(badge()).toBe(true);

    // объявлено действие: движок снял отметку — плашка гаснет без новых шагов и ответов сервера
    session.lastSkill.value = null;
    await nextTick();
    expect(badge()).toBe(false);

    // умение сработало снова в новом ходу — отметка та же по содержимому, и плашка снова встаёт
    session.lastSkill.value = { playerId: 'medusa', skillId: 'medusa_skill', moment: 'turnStart' };
    await nextTick();
    expect(badge()).toBe(true);

    // то же содержимое, но чужого умения, и своё умение у чужого места — не повод для плашки
    session.lastSkill.value = { playerId: 'anubis', skillId: 'anubis_skill', moment: 'turnStart' };
    await nextTick();
    expect(badge()).toBe(false);
  });
});

describe('PlayerCard: урон числом', () => {
  /** Бойцы с запасом здоровья: помощнику нужно куда терять, иначе урон не покажешь. */
  const squad = (hpHero = 15, hpFace = 3) => [
    hero({ currentHp: hpHero }),
    harpy(1, { currentHp: hpFace, startHp: 3 }),
    harpy(2),
    harpy(3),
  ];

  afterEach(() => vi.useRealTimers());

  it('урон героя всплывает числом над шкалой и гаснет сам', async () => {
    vi.useFakeTimers();
    const wrapper = mountCard(player({ fighters: squad() }));
    expect(wrapper.find('[data-hp-damage]').exists()).toBe(false);

    await wrapper.setProps({ player: player({ fighters: squad(11) }) });

    const float = wrapper.find('[data-hp-damage]');
    expect(float.exists()).toBe(true);
    expect(float.text()).toBe('−4');
    expect(wrapper.find('[data-hp-bar]').classes()).toContain('player-card-hp-hit');

    vi.advanceTimersByTime(1200);
    await nextTick();
    expect(wrapper.find('[data-hp-damage]').exists()).toBe(false);
  });

  it('урон помощника всплывает числом на его аватарке', async () => {
    vi.useFakeTimers();
    const wrapper = mountCard(player({ fighters: squad(15, 3) }));

    await wrapper.setProps({ player: player({ fighters: squad(15, 1) }) });

    const float = wrapper.find('[data-face-damage]');
    expect(float.exists()).toBe(true);
    expect(float.text()).toBe('−2');
    // у героя урона нет — числа при нём не появляется
    expect(wrapper.find('[data-hp-damage]').exists()).toBe(false);

    vi.advanceTimersByTime(1200);
    await nextTick();
    expect(wrapper.find('[data-face-damage]').exists()).toBe(false);
  });

  it('лечение числа не показывает: урон — это потеря здоровья', async () => {
    const wrapper = mountCard(player({ fighters: squad(11) }));

    await wrapper.setProps({ player: player({ fighters: squad(14) }) });

    expect(wrapper.find('[data-hp-damage]').exists()).toBe(false);
    expect(wrapper.find('[data-face-damage]').exists()).toBe(false);
  });
});
