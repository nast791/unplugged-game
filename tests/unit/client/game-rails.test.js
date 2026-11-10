// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  computed,
  defineComponent,
  h,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';

/**
 * Экран партии держится на трёх правилах чтения партии, которые стерегутся здесь:
 * 1) **свой ход виден на гексе героя**, чужой — нет: акцентная рамка стоит только у того, чей ход, иначе
 *    за столом на четверых непонятно, кто сейчас играет;
 * 2) **у гекса две карты-кнопки над верхней гранью**: «i» (открывает панель `HeroInfo` вверх над
 *    гексом; разделы «герой / помощники / предметы» переключаются вкладками уже внутри панели) и карта
 *    стопок с числом карт в руке (открывает окно `PilesInfo` с рукой, колодой и сбросом, откуда большие
 *    окна стопок открываются по одной) — нажатость у каждой своя;
 * 3) **гекс несёт аватар героя** — портрет берётся из вида партии, а не из пака героя.
 *
 * `HeroRail.vue`/`TopRail.vue`/`HandFan.vue` — SFC приложения: `ref`/`computed`/`watch`/`onMounted`
 * приходят автоимпортами Nuxt, в тесте кладём их в `globalThis` до импорта компонентов (как
 * `board-clicks.test.js`).
 */
globalThis.ref = ref;
globalThis.computed = computed;
globalThis.watch = watch;
globalThis.nextTick = nextTick;
globalThis.onMounted = onMounted;
globalThis.onBeforeUnmount = onBeforeUnmount;

const hero = (id, name, hp, startHp = hp) => ({
  id,
  group: id,
  type: 'hero',
  name,
  currentHp: hp,
  startHp,
  image: `${id}.png`,
});

const sidekick = (id, name, hp, startHp) => ({
  id,
  group: id,
  type: 'sidekick',
  name,
  currentHp: hp,
  startHp,
  image: `${id}.png`,
});

const players = [
  {
    id: 'anubis',
    order: 1,
    control: 'human',
    name: 'Я',
    color: '#e5c07b',
    fighters: [hero('anubis-hero', 'Анубис', 14, 15)],
    lost: [],
    items: [],
    hand: [{ id: 'a', instanceId: 'h1', title: 'Суд молчит', type: 'attack', value: 4, bonus: 2 }],
    handCount: 1,
    deckCount: 12,
    discardCount: 1,
  },
  {
    id: 'medusa',
    order: 2,
    control: 'ai',
    name: '',
    color: '#8b5cf6',
    fighters: [hero('medusa-hero', 'Медуза', 16), sidekick('gorgon', 'Горгона', 0, 4)],
    lost: [sidekick('harpy', 'Гарпия', 0, 5)],
    items: [{ id: 'bow', name: 'Лук', state: 'active' }],
    hand: [
      { id: 'b', instanceId: 'h2', title: 'Взгляд', type: 'scheme', value: 2, bonus: 1 },
      { id: 'c', instanceId: 'h3', title: 'Щит', type: 'defense', value: 3, bonus: 1 },
    ],
    handCount: 2,
    deckCount: 10,
    discardCount: 0,
  },
];

const openModal = vi.fn();
const openGameMenu = vi.fn();
const onDeckClick = vi.fn();
const onFinishAction = vi.fn();
const playCard = vi.fn();

vi.mock('~/composables/game/useGameSession.js', async () => {
  const { computed, ref } = await import('vue');
  const session = {
    players: ref(players),
    you: ref('anubis'),
    currentPlayerId: ref('anubis'),
    actionsLeft: ref(2),
    actionsTotal: ref(2),
    actionsBonus: ref(0),
    isPlacement: ref(false),
    choices: ref([]),
    targetingChoices: ref([]),
    movement: ref(null),
    movementBonus: ref(0),
    deckClickable: computed(() => true),
    okControl: ref({ visible: false, enabled: false, label: null }),
    choicePicked: ref([]),
    choiceComplete: ref(false),
    pending: ref(false),
    isGameOver: ref(false),
    onDeckClick,
    onFinishAction,
    myHand: ref([...players[0].hand]),
    isCardPlayable: () => true,
    onCardClick: playCard,
    canDiscardBonus: ref(false),
    armBonusCard: vi.fn(),
    onBonusDiscard: vi.fn(),
  };
  return { useGameSession: () => session, session };
});

vi.mock('~/composables/api/heroes.js', () => ({
  useHeroPacks: () => ({ load: vi.fn(), heroPack: () => ({}) }),
}));

vi.mock('~/composables/ui/useModal.js', () => ({
  openModal,
  closeModal: vi.fn(),
  isAnyModalOpen: () => ref(false),
  getActiveModals: () => ref([]),
  useModalPayload: () => ref(null),
}));

vi.mock('~/composables/ui/useGameMenu.js', async () => {
  const { ref } = await import('vue');
  return {
    openGameMenu,
    closeGameMenu: vi.fn(),
    useGameMenu: () => ({ open: ref(false) }),
  };
});

vi.mock('~/components/atoms/ATooltip.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'ATooltip',
      props: { text: { type: String, default: '' } },
      setup(props, { slots }) {
        return () => h('div', { 'data-tooltip': props.text }, slots.default?.());
      },
    }),
  };
});

// Гекс героя: здесь проверяется только его состояние, гексагон и аватар рисует он сам.
vi.mock('~/components/molecules/game/HeroHex.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'HeroHex',
      props: {
        name: { type: String, default: '' },
        color: { type: String, default: '' },
        hp: { type: [Number, String], default: null },
        actions: { type: String, default: '' },
        actionLeft: { type: Number, default: null },
        actionTotal: { type: Number, default: null },
        active: { type: Boolean, default: false },
        dead: { type: Boolean, default: false },
        silent: { type: Boolean, default: false },
        portrait: { type: String, default: '' },
      },
      setup(props) {
        return () =>
          h('button', {
            'type': 'button',
            'data-hex': props.name,
            'data-active': String(props.active),
            'data-dead': String(props.dead),
            'data-silent': String(props.silent),
            'data-color': props.color,
            'data-hp': String(props.hp ?? ''),
            'data-actions': props.actions,
            'data-action-left': props.actionLeft == null ? '' : String(props.actionLeft),
            'data-action-total': props.actionTotal == null ? '' : String(props.actionTotal),
            'data-portrait': props.portrait,
          });
      },
    }),
  };
});

// Карта-кнопка: состояние наружу — атрибутами, вид рисует она сама.
vi.mock('~/components/molecules/game/SlotCard.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'SlotCard',
      props: {
        icon: { type: String, default: '' },
        iconClass: { type: String, default: '' },
        countClass: { type: String, default: '' },
        count: { type: Number, default: null },
        label: { type: String, default: '' },
        disabled: { type: Boolean, default: false },
        empty: { type: Boolean, default: false },
        out: { type: Boolean, default: false },
      },
      emits: ['click'],
      setup(props, { emit }) {
        return () =>
          h('button', {
            'type': 'button',
            'data-slot': props.label,
            'data-icon': props.icon,
            'data-count': props.count == null ? '' : String(props.count),
            'data-icon-class': props.iconClass,
            'data-count-class': props.countClass,
            'data-disabled': String(props.disabled),
            'data-empty': String(props.empty),
            'data-out': String(props.out),
            'onClick': () => emit('click'),
          });
      },
    }),
  };
});

vi.mock('~/components/molecules/game/HeroInfo.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'HeroInfo',
      props: {
        mode: { type: String, default: '' },
        player: { type: Object, default: () => ({}) },
        moveBonus: { type: Number, default: 0 },
      },
      emits: ['switch'],
      setup(props, { emit }) {
        return () =>
          h(
            'div',
            {
              'data-info': props.mode,
              'data-info-player': props.player?.id,
              'data-move-bonus': String(props.moveBonus),
            },
            [
              h('button', {
                'type': 'button',
                'data-info-switch': 'fighters',
                'onClick': () => emit('switch', 'fighters'),
              }),
            ],
          );
      },
    }),
  };
});

vi.mock('~/components/molecules/game/PilesInfo.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'PilesInfo',
      props: { player: { type: Object, default: () => ({}) } },
      emits: ['open'],
      setup(props, { emit }) {
        return () =>
          h('div', { 'data-piles': props.player?.id }, [
            ...['hand', 'deck', 'discard'].map(key =>
              h('button', {
                'type': 'button',
                'data-piles-open': key,
                'onClick': () => emit('open', key),
              }),
            ),
          ]);
      },
    }),
  };
});

vi.mock('~/components/molecules/game/Card.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'Card',
      props: {
        card: { type: Object, required: true },
        disabled: { type: Boolean, default: false },
        boost: { type: Boolean, default: false },
      },
      setup(props) {
        return () => h('div', { 'data-testid': 'card', 'data-card': props.card.instanceId });
      },
    }),
  };
});

const { default: HeroRail } = await import('../../../app/components/organisms/game/HeroRail.vue');
const { default: TopRail } = await import('../../../app/components/organisms/game/TopRail.vue');
const { default: HandFan } = await import('../../../app/components/organisms/game/HandFan.vue');
const { session } = await import('~/composables/game/useGameSession.js');
const IconStub = defineComponent({
  name: 'Icon',
  props: { name: { type: String, default: '' } },
  setup(props) {
    return () => h('span', { 'data-icon-name': props.name });
  },
});

const wrappers = [];

const mountRail = () => {
  const wrapper = mount(HeroRail, { global: { components: { Icon: IconStub } } });
  wrappers.push(wrapper);
  return wrapper;
};

const rowsOf = wrapper => wrapper.findAll('[data-hex]');

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount());
  vi.clearAllMocks();
  session.players.value = players;
  session.you.value = 'anubis';
  session.choices.value = [];
  session.targetingChoices.value = [];
  session.isPlacement.value = false;
  session.currentPlayerId.value = 'anubis';
});

const slotsOf = wrapper => wrapper.findAll('[data-slot]');
const slotByLabel = (wrapper, label) =>
  slotsOf(wrapper).find(node => node.attributes('data-slot') === label);

const INFO = 'Сведения о герое, помощниках и предметах';

const pilesLabel = player =>
  `Карты: в руке ${player.handCount}, в колоде ${player.deckCount}, в сбросе ${player.discardCount}. Клик — окно карт`;

describe('рельс героев', () => {
  it('рисует по гексу на каждого героя, активный — крайним справа', () => {
    const wrapper = mountRail();
    const names = rowsOf(wrapper).map(node => node.attributes('data-hex'));

    expect(names).toEqual(['Медуза', 'Анубис']);
    expect(rowsOf(wrapper).map(node => node.attributes('data-color'))).toEqual([
      '#8b5cf6',
      '#e5c07b',
    ]);
  });

  it('сдвигает ряд на одно место, когда ход переходит дальше', async () => {
    const wrapper = mountRail();

    session.currentPlayerId.value = 'medusa';
    await nextTick();

    expect(rowsOf(wrapper).map(node => node.attributes('data-hex'))).toEqual(['Анубис', 'Медуза']);
  });

  it('держит гексы внизу слева экрана', () => {
    const wrapper = mountRail();
    const rail = wrapper.find('section');
    const classes = rail.classes();

    expect(classes).toEqual(expect.arrayContaining(['absolute', 'bottom-14']));
    expect(classes.some(name => name.startsWith('left-'))).toBe(true);
  });

  it('подсвечивает гекс героя, чей ход, и гасит остальные', () => {
    const wrapper = mountRail();
    const [medusa, anubis] = rowsOf(wrapper);

    expect(anubis.attributes('data-active')).toBe('true');
    expect(medusa.attributes('data-active')).toBe('false');
  });

  it('отдаёт гексу аватар героя из вида партии', () => {
    const wrapper = mountRail();

    expect(rowsOf(wrapper).map(node => node.attributes('data-portrait'))).toEqual([
      'medusa-hero.png',
      'anubis-hero.png',
    ]);
  });

  it('отдаёт гексу текущее здоровье героя', () => {
    const wrapper = mountRail();

    expect(rowsOf(wrapper).map(node => node.attributes('data-hp'))).toEqual(['16', '14']);
  });

  it('считает действие в подсказке только у того гекса, чей ход', () => {
    const wrapper = mountRail();
    const [medusa, anubis] = rowsOf(wrapper);

    expect(anubis.attributes('data-actions')).toBe('Осталось действий: 2 из 2');
    expect(medusa.attributes('data-actions')).toBe('');
  });

  it('отдаёт гексу счёт действий числами — их показывает пузырёк', () => {
    const wrapper = mountRail();
    const [medusa, anubis] = rowsOf(wrapper);

    expect(anubis.attributes('data-action-left')).toBe('2');
    expect(anubis.attributes('data-action-total')).toBe('2');
    expect(medusa.attributes('data-action-left')).toBe('');
    expect(medusa.attributes('data-action-total')).toBe('');
  });

  it('показывает остаток действий: потратил действие — пузырёк стал 1/2', async () => {
    const wrapper = mountRail();

    session.actionsLeft.value = 1;
    await nextTick();

    const [medusa, anubis] = rowsOf(wrapper);
    expect(anubis.attributes('data-action-left')).toBe('1');
    expect(anubis.attributes('data-actions')).toBe('Осталось действий: 1 из 2');
    expect(medusa.attributes('data-actions')).toBe('');
  });

  it('отмечает убитого героя', () => {
    session.players.value = [
      { ...players[0], fighters: [hero('anubis-hero', 'Анубис', 0, 15)] },
      players[1],
    ];
    const wrapper = mountRail();

    expect(rowsOf(wrapper)[1].attributes('data-dead')).toBe('true');
  });

  it('держит над гексом две карты-кнопки: сведения и стопки', () => {
    const wrapper = mountRail();
    const top = wrapper.findAll('.-top-31');

    expect(top).toHaveLength(2);
    expect(wrapper.findAll('.-rotate-60')).toHaveLength(0);
    expect(top[0].findAll('[data-slot]').map(node => node.attributes('data-slot'))).toEqual([
      INFO,
      pilesLabel(players[1]),
    ]);
  });

  it('держит карты-кнопки над гексом, а не на его грани', () => {
    const wrapper = mountRail();
    const top = wrapper.findAll('.-top-31');

    expect(top[0].classes()).toEqual(expect.arrayContaining(['absolute', '-top-31', 'left-1/2']));
    expect(rowsOf(wrapper)[0].classes()).toContain('z-20');
    expect(rowsOf(wrapper)[1].classes()).toContain('z-20');
  });

  it('не нажимает карту сведений, когда открыто окно стопок', async () => {
    const wrapper = mountRail();

    await slotByLabel(wrapper, pilesLabel(players[1])).trigger('click');

    expect(wrapper.findAll('[data-piles]')).toHaveLength(1);
    expect(slotByLabel(wrapper, pilesLabel(players[1])).attributes('data-out')).toBe('true');
    expect(slotByLabel(wrapper, INFO).attributes('data-out')).toBe('false');
  });

  it('открывает сводку о герое вверх над гексом и закрывает её той же картой', async () => {
    const wrapper = mountRail();

    expect(wrapper.findAll('[data-info]')).toHaveLength(0);

    await slotByLabel(wrapper, INFO).trigger('click');

    const opened = wrapper.findAll('[data-info]');
    expect(opened).toHaveLength(1);
    expect(opened[0].attributes('data-info')).toBe('hero');
    expect(opened[0].attributes('data-info-player')).toBe('medusa');
    expect(slotByLabel(wrapper, INFO).attributes('data-out')).toBe('true');

    await slotByLabel(wrapper, INFO).trigger('click');

    expect(wrapper.findAll('[data-info]')).toHaveLength(0);
    expect(slotByLabel(wrapper, INFO).attributes('data-out')).toBe('false');
  });

  it('переключает разделы сводки вкладкой внутри неё, не открывая второе окно', async () => {
    const wrapper = mountRail();

    await slotByLabel(wrapper, INFO).trigger('click');
    expect(wrapper.find('[data-info]').attributes('data-info')).toBe('hero');

    await wrapper.find('[data-info-switch]').trigger('click');

    const opened = wrapper.findAll('[data-info]');
    expect(opened).toHaveLength(1);
    expect(opened[0].attributes('data-info')).toBe('fighters');
    expect(opened[0].attributes('data-info-player')).toBe('medusa');
  });

  it('молчит подсказкой, пока над гексом открыто окно', async () => {
    const wrapper = mountRail();
    const hexOf = () => wrapper.findAll('[data-hex]')[0].attributes('data-silent');

    expect(hexOf()).toBe('false');

    await slotByLabel(wrapper, INFO).trigger('click');
    expect(hexOf()).toBe('true');

    await slotByLabel(wrapper, INFO).trigger('click');
    expect(hexOf()).toBe('false');
  });

  it('переносит открытое окно вместе с гексом, когда ход переходит дальше', async () => {
    const wrapper = mountRail();

    await slotByLabel(wrapper, INFO).trigger('click');
    session.currentPlayerId.value = 'medusa';
    await nextTick();

    const cells = wrapper.findAll('div.pointer-events-auto.relative');
    expect(cells).toHaveLength(2);
    expect(cells[1].find('[data-info-player]').attributes('data-info-player')).toBe('medusa');
    expect(wrapper.findAll('[data-info]')).toHaveLength(1);
  });

  it('держит карту сведений нажатой у любого героя — пустые разделы гасятся вкладками', () => {
    const wrapper = mountRail();
    const anubis = slotsOf(wrapper).slice(2, 3);

    expect(anubis.map(node => node.attributes('data-disabled'))).toEqual(['false']);
    expect(anubis.map(node => node.attributes('data-icon'))).toEqual(['lucide:info']);
  });

  it('отдаёт бонус шага окну того гекса, чья карта сведений нажата', async () => {
    session.movementBonus.value = 3;
    const wrapper = mountRail();

    await slotsOf(wrapper)[2].trigger('click');
    expect(wrapper.find('[data-info-player="anubis"]').attributes('data-move-bonus')).toBe('3');

    await slotsOf(wrapper)[0].trigger('click');
    expect(wrapper.find('[data-info-player="medusa"]').attributes('data-move-bonus')).toBe('0');
  });
});

describe('стопки героя', () => {
  it('держит карту-кнопку с числом карт в руке', () => {
    const wrapper = mountRail();
    const piles = slotByLabel(wrapper, pilesLabel(players[0]));

    expect(piles.attributes('data-count')).toBe(String(players[0].handCount));
    expect(piles.attributes('data-count-class')).toBe('text-18');
  });

  it('называет все три стопки в подсказке одной карты', () => {
    const wrapper = mountRail();
    const labels = slotsOf(wrapper).map(node => node.attributes('data-slot'));

    expect(labels).toEqual([INFO, pilesLabel(players[1]), INFO, pilesLabel(players[0])]);
  });

  it('помечает карту пустой руки своей подложкой', () => {
    session.players.value = players.map(player => ({ ...player, hand: [], handCount: 0 }));
    const wrapper = mountRail();
    const empties = slotsOf(wrapper)
      .filter(node => node.attributes('data-slot').startsWith('Карты:'))
      .map(node => node.attributes('data-empty'));

    expect(empties).toEqual(['true', 'true']);
  });

  it('открывает окно стопок той же картой и закрывает его повторным кликом', async () => {
    const wrapper = mountRail();

    expect(wrapper.findAll('[data-piles]')).toHaveLength(0);

    await slotByLabel(wrapper, pilesLabel(players[0])).trigger('click');

    const opened = wrapper.findAll('[data-piles]');
    expect(opened).toHaveLength(1);
    expect(opened[0].attributes('data-piles')).toBe('anubis');
    expect(slotByLabel(wrapper, pilesLabel(players[0])).attributes('data-out')).toBe('true');

    await slotByLabel(wrapper, pilesLabel(players[0])).trigger('click');

    expect(wrapper.findAll('[data-piles]')).toHaveLength(0);
    expect(slotByLabel(wrapper, pilesLabel(players[0])).attributes('data-out')).toBe('false');
  });

  it('держит открытым одно окно над гексом: сведения и стопки сменяют друг друга', async () => {
    const wrapper = mountRail();

    await slotByLabel(wrapper, INFO).trigger('click');
    await slotByLabel(wrapper, pilesLabel(players[0])).trigger('click');

    expect(wrapper.findAll('[data-info]')).toHaveLength(0);
    expect(wrapper.findAll('[data-piles]')).toHaveLength(1);
    expect(slotByLabel(wrapper, INFO).attributes('data-out')).toBe('false');
  });

  it('открывает большую руку из окна стопок и закрывает само окно', async () => {
    const wrapper = mountRail();

    await slotByLabel(wrapper, pilesLabel(players[0])).trigger('click');
    await wrapper.find('[data-piles-open="hand"]').trigger('click');

    expect(openModal).toHaveBeenCalledWith('hand', { playerId: 'anubis' });
    expect(wrapper.findAll('[data-piles]')).toHaveLength(0);
  });

  it('открывает сброс того героя, чья карта стопок нажата', async () => {
    const wrapper = mountRail();

    await slotByLabel(wrapper, pilesLabel(players[1])).trigger('click');
    await wrapper.find('[data-piles-open="discard"]').trigger('click');

    expect(openModal).toHaveBeenCalledWith('discard', { playerId: 'medusa' });
  });

  it('молчит подсказкой под открытым окном стопок', async () => {
    const wrapper = mountRail();
    const hexOf = () => wrapper.findAll('[data-hex]')[0].attributes('data-silent');

    await slotByLabel(wrapper, pilesLabel(players[1])).trigger('click');

    expect(hexOf()).toBe('true');
  });

  it('открывает модалку героя по клику на гекс', async () => {
    const wrapper = mountRail();
    await rowsOf(wrapper)[1].trigger('click');

    expect(openModal).toHaveBeenCalledWith('heroDetails', 'anubis');
  });
});

describe('верхний рельс', () => {
  const mountTop = (props = {}) => {
    const wrapper = mount(TopRail, {
      props,
      global: { stubs: { NuxtIcon: IconStub }, components: { Icon: IconStub } },
    });
    wrappers.push(wrapper);
    return wrapper;
  };

  const topButtons = wrapper => wrapper.findAll('button');

  it('ставит настройки правым слотом и открывает ими меню', async () => {
    const wrapper = mountTop();
    const icons = wrapper
      .findAll('[data-icon-name]')
      .map(node => node.attributes('data-icon-name'));

    expect(icons).toEqual([
      'lucide:check',
      'lucide:maximize-2',
      'lucide:scroll-text',
      'lucide:settings',
    ]);

    await topButtons(wrapper)[4].trigger('click');
    expect(openGameMenu).toHaveBeenCalled();
  });

  it('держит галку выключенной, пока движок не разрешает подтвердить', async () => {
    const wrapper = mountTop();
    const ok = () => topButtons(wrapper)[0];

    expect(ok().attributes('disabled')).toBeDefined();
    expect(ok().find('span.animate-pulse').exists()).toBe(false);

    session.okControl.value = { visible: true, enabled: true, label: 'Завершить битву' };
    await nextTick();

    expect(ok().attributes('disabled')).toBeUndefined();
    expect(ok().find('span.animate-pulse').exists()).toBe(true);

    await ok().trigger('click');
    expect(onFinishAction).toHaveBeenCalled();
  });

  it('мигает акцентной рамкой галки, как только её можно нажать', async () => {
    const wrapper = mountTop();
    const ok = () => topButtons(wrapper)[0];

    session.okControl.value = { visible: true, enabled: true, label: 'Завершить битву' };
    await nextTick();

    const frame = ok().find('span.animate-pulse');
    expect(frame.classes()).toEqual(
      expect.arrayContaining(['absolute', '-inset-2', 'border-accent']),
    );
    expect(ok().find('span.text-accent').exists()).toBe(true);
    expect(ok().classes()).toContain('border-line');
    expect(ok().classes()).toContain('translate-y-8');
  });

  it('показывает выбранное перемещение выдвинутым слотом', async () => {
    const wrapper = mountTop();
    const move = () => topButtons(wrapper)[1];

    expect(move().attributes('aria-pressed')).toBe('false');

    session.movement.value = { source: null, bonus: 0, bonusUsed: false, card: null };
    await nextTick();

    expect(move().attributes('aria-pressed')).toBe('true');
  });

  it('переключает вид иконкой, а в компактном виде показывает выход из него', async () => {
    const wrapper = mountTop();
    await topButtons(wrapper)[2].trigger('click');
    expect(wrapper.emitted('toggle-view')).toHaveLength(1);

    const compact = mountTop({ compact: true });
    expect(topButtons(compact)[2].attributes('aria-pressed')).toBe('true');
  });
});

describe('рука без слайдера', () => {
  it('держит карты якорями перелётов и поднимает выдвинутую на полную высоту', async () => {
    session.myHand.value = [
      { id: 'a', instanceId: 'h1', title: 'Суд молчит', type: 'attack', value: 4, bonus: 2 },
      { id: 'b', instanceId: 'h2', title: 'Взгляд', type: 'scheme', value: 2, bonus: 1 },
    ];

    const wrapper = mount(HandFan, { global: { components: { Icon: IconStub } } });
    wrappers.push(wrapper);

    const cards = wrapper.findAll('[data-hand-card]');
    expect(cards).toHaveLength(2);
    expect(cards.map(card => card.attributes('data-card-key'))).toEqual(['h1', 'h2']);

    const slots = wrapper.findAll('div.cursor-pointer');
    expect(slots[0].classes()).not.toContain('-translate-y-140');

    await cards[0].trigger('click');
    await nextTick();

    expect(wrapper.findAll('div.cursor-pointer')[0].classes()).toContain('-translate-y-140');
  });
});
