// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h, ref, TransitionGroup } from 'vue';

/**
 * Карточка места — 1в1 с макетом владельца (классы живут в самом `PlayerCard.vue`): слева аватар героя
 * с обводкой по здоровью и места предметов, справа имя со значком роли (человек или ИИ), дальности
 * перемещения и удара, здоровье числами над вдавленной шкалой, справа сверху — пульсирующий кружок
 * и остаток действий (в начале хода «2/2», в расстановке вместо них плашка), справа снизу — панель
 * помощников с числами выбранной копии.
 *
 * `PlayerCard.vue` — SFC приложения: `computed`/`ref` приходят из автоимпортов Nuxt, в тесте кладём их
 * в `globalThis` до импорта компонента (так же, как `board-clicks.test.js`).
 */
globalThis.computed = computed;
globalThis.ref = ref;

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
vi.mock('~/composables/useProfile', async () => {
  const { computed } = await import('vue');
  return { useProfile: () => ({ nick: computed(() => 'Элизиф') }) };
});

// Чей ход, сколько действий и идёт ли расстановка карточка читает из сессии партии — в тесте она своя.
vi.mock('~/composables/useGameSession.js', async () => {
  const { ref } = await import('vue');
  const session = {
    you: ref('medusa'),
    currentPlayerId: ref(null),
    isPlacement: ref(false),
    actionsLeft: ref(0),
    turn: ref({}),
  };
  return { useGameSession: () => session, session };
});

const { session } = await import('~/composables/useGameSession.js');

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
  session.turn.value = { actionsTotal, bonus: { actions: bonus } };
};

beforeEach(() => setSession());

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
  setup(props, { slots }) {
    return () =>
      h('span', { 'class': props.class, 'title': props.title, 'data-face': '' }, slots.default?.());
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

/** Карточка героя из контента: числа бойцов (шаг и удар) и значок предмета в состоянии хода не лежат. */
const catalog = {
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

const faces = wrapper => wrapper.findAll('[data-face]');

describe('PlayerCard: герой', () => {
  it('показывает имя героя, имя игрока и здоровья числами', () => {
    const wrapper = mountCard(player(), { catalog });

    expect(wrapper.text()).toContain('Медуза');
    expect(wrapper.text()).toContain('Элизиф');
    expect(wrapper.text()).toContain('15/16');
  });

  it('у места компьютера только имя героя: имени игрока нет', () => {
    const wrapper = mountCard(player({ control: 'ai' }), { catalog });

    expect(wrapper.text()).toContain('Медуза');
    expect(wrapper.text()).not.toContain('Элизиф');
  });

  it('полоса считается от стартового здоровья, а цвет — по остатку', () => {
    const whole = mountCard(player(), { catalog }).find('[data-hp-bar]');
    expect(whole.attributes('style')).toContain('width: 93.75%');
    expect(whole.attributes('style')).toContain('--hp-color: var(--color-success)');

    // 9 из 16 — меньше 60 %: полоса золотая
    const hurt = player();
    hurt.fighters[0].currentHp = 9;
    const mid = mountCard(hurt, { catalog }).find('[data-hp-bar]');
    expect(mid.attributes('style')).toContain('--hp-color: var(--color-gold)');

    // 3 из 16 — меньше 25 %: полоса цвета опасности
    const dying = player();
    dying.fighters[0].currentHp = 3;
    const low = mountCard(dying, { catalog }).find('[data-hp-bar]');
    expect(low.attributes('style')).toContain('--hp-color: var(--color-danger)');
  });

  it('рамка аватара героя — цветом героя, а не шкалой здоровья; у убитого карточка гаснет', () => {
    const alive = mountCard(player(), { catalog });
    expect(alive.find('.border-\\[var\\(--hero-color\\)\\]').exists()).toBe(true);

    const down = player();
    down.fighters[0].currentHp = 0;
    const downed = mountCard(down, { catalog });
    // обводка героя не меняется от здоровья — гаснет только карточка целиком
    expect(downed.find('.border-\\[var\\(--hero-color\\)\\]').exists()).toBe(true);
    expect(downed.classes().join(' ')).toContain('opacity-60');
  });

  it('показывает дальности перемещения и удара значками макета', () => {
    const wrapper = mountCard(player(), { catalog });

    expect(wrapper.find('[data-icon="move"]').exists()).toBe(true);
    expect(wrapper.find('[data-icon="attack"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('3');
    expect(wrapper.text()).toContain('2');
  });

  it('без каталога не выдумывает числа: пустое место вместо прочерка и нуля', () => {
    const wrapper = mountCard(player());

    expect(wrapper.text()).not.toContain('—');
    expect(wrapper.find('[data-icon="move"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('15/16');
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
    expect(first.find('[title="Осталось действий: 3 из 3"]').exists()).toBe(true);

    // одно действие объявлено — осталось два из трёх, плюс добавленное в этом ходу
    setSession({ current: 'medusa', left: 2, actionsTotal: 2, bonus: 1 });
    const second = mountCard(player(), { catalog });
    expect(second.text()).toContain('2/3');
    expect(second.find('[title="Осталось действий: 2 из 3 (+1 в этом ходу)"]').exists()).toBe(true);
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
});

describe('PlayerCard: предметы', () => {
  it('рисует место на каждую копию и берёт значок из пака', () => {
    const wrapper = mountCard(player(), { catalog });
    const items = wrapper.findAll('[data-item]');

    expect(items).toHaveLength(2);
    expect(items[0].find('[data-icon="lucide:bandage"]').exists()).toBe(true);
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

    await faces(wrapper)[0].trigger('click');

    const order = faces(wrapper).map(face => face.attributes('title'));
    expect(order[order.length - 1]).toContain('Первая');
    expect(wrapper.text()).toContain('Первая');
    // клик по аватару не открывает карточку героя
    expect(wrapper.emitted('open-hero')).toBeUndefined();
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
    expect(wrapper.emitted('open-hero')).toBeUndefined();
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
  it('открывает карточку героя', async () => {
    const wrapper = mountCard(player(), { catalog });
    await wrapper.trigger('click');

    expect(wrapper.emitted('open-hero')).toEqual([['medusa']]);
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
    const portrait = wrapper.find('[data-face] .grayscale');
    // портрет обесцвечен целиком (фолбэк растянут на весь кружок), а не только буквы
    expect(portrait.classes().join(' ')).toContain('size-full');
    expect(portrait.classes().join(' ')).toContain('bg-surface-2');

    expect(rings[1]).toContain('border-success');
    expect(rings[1]).not.toContain('border-line');
  });

  it('герой без клетки теряет цвет героя: плотное серое кольцо и обесцвеченный портрет', () => {
    setSession({ placement: true });
    const waiting = player({ fighters: [unplaced(hero()), harpy(1)] });
    const wrapper = mountCard(waiting, { catalog });

    const avatar = wrapper.find('.size-80');
    expect(avatar.classes().join(' ')).toContain('border-line');
    expect(avatar.classes().join(' ')).not.toContain('opacity-50');
    expect(wrapper.find('.border-\\[var\\(--hero-color\\)\\]').exists()).toBe(false);
    expect(avatar.find('.grayscale').exists()).toBe(true);
  });

  it('вне расстановки место не влияет на обводку: цвет героя и здоровье помощника', () => {
    const squad = player({ fighters: [unplaced(hero()), unplaced(harpy(1))] });
    const wrapper = mountCard(squad, { catalog });

    expect(wrapper.find('.border-\\[var\\(--hero-color\\)\\]').exists()).toBe(true);
    expect(faces(wrapper)[0].classes().join(' ')).toContain('border-success');
    expect(wrapper.findAll('.grayscale')).toHaveLength(0);
  });
});
