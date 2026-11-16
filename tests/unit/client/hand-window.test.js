// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h, nextTick, ref } from 'vue';

/**
 * Окно руки показывает карты **в том же порядке, что и рука на столе** (`HandFan`): окно — это крупный вид
 * руки, и пересортировка в нём заставляла бы игрока искать карту на новом месте. Порядок один на оба вида:
 * по типу (`CARD_TYPE_ORDER`), затем по значению (сильные первыми), затем по названию — его держит
 * `sortHandCards` из `useGameHelpers`.
 *
 * Второй режим окна — выбор карты из руки (`choiceHand`): карта вида «посмотрите руку противника и выберите
 * карту» открывает окно руки с настоящими картами, а клик по карте отмечает вариант (применяет общая кнопка).
 */
globalThis.computed = computed;
globalThis.ref = ref;

const hand = [
  { id: 'd', instanceId: 'c4', title: 'Щит', type: 'defense', value: 3, bonus: 1 },
  { id: 'b', instanceId: 'c2', title: 'Наотмашь', type: 'attack', value: 4, bonus: 1 },
  { id: 'e', instanceId: 'c5', title: 'Обманный манёвр', type: 'effect', value: 2, bonus: 1 },
  { id: 'a', instanceId: 'c1', title: 'Залп', type: 'attack', value: 6, bonus: 2 },
  { id: 'c', instanceId: 'c3', title: 'Взять след', type: 'hybrid', value: 2, bonus: 2 },
];

const players = ref([
  {
    id: 'dorothy',
    order: 1,
    name: 'Игрок',
    hand,
    fighters: [{ id: 'dorothy-hero', type: 'hero', name: 'Дороти' }],
    lost: [],
  },
]);

const payload = ref({ playerId: 'dorothy' });
const you = ref('dorothy');
const combat = ref(null);
const targeting = ref(null);
const choiceHand = ref(null);
const choicePicked = ref([]);
const choiceRequired = ref(false);
const choiceConfirmEnabled = ref(false);
const pickChoiceCard = vi.fn();
const onFinishAction = vi.fn();
const openModal = vi.fn();
const closeModal = vi.fn();

vi.mock('~/composables/game/useGameSession.js', () => ({
  useGameSession: () => ({
    players,
    you,
    combat,
    targeting,
    choiceHand,
    choicePicked,
    choiceRequired,
    choiceConfirmEnabled,
    pickChoiceCard,
    onFinishAction,
  }),
}));

vi.mock('~/composables/ui/useModal.js', () => ({
  useModalPayload: () => payload,
  openModal,
  closeModal,
}));

// Кнопка окна тянет конфиг приложения (`useUI` → `useAppConfig`), которого в тесте нет.
vi.mock('~/composables/ui/useUI', async importOriginal => {
  const actual = await importOriginal();
  const { computed } = await import('vue');
  return { ...actual, useUI: () => ({ styles: computed(() => ({})) }) };
});

// Окно-рамка: проверяем только карты, вид рамки рисует `PileWindow`.
vi.mock('~/components/molecules/game/PileWindow.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'PileWindow',
      props: { title: { type: String, default: '' } },
      setup(props, { slots }) {
        return () =>
          h('div', { 'data-pile-window': props.title }, [slots.default?.(), slots.footer?.()]);
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
      },
      setup(props) {
        return () =>
          h('div', {
            'data-card': String(props.card?.instanceId ?? props.card?.optionId ?? ''),
            'data-card-title': String(props.card?.title ?? ''),
            'data-card-text': String(props.card?.text ?? ''),
            'data-card-disabled': props.disabled ? 'yes' : 'no',
          });
      },
    }),
  };
});

const { sortHandCards } = await import('~/composables/game/useGameHelpers.js');
const HandWindow = (await import('~/components/molecules/game/HandWindow.vue')).default;

const keysOf = wrapper => wrapper.findAll('[data-card]').map(node => node.attributes('data-card'));
const titlesOf = wrapper =>
  wrapper.findAll('[data-card]').map(node => node.attributes('data-card-title'));

const enemyCards = () => [
  {
    optionId: 'mirror_1',
    cardId: 'mirror_1',
    id: 'mirror',
    title: 'Ледяное зеркало',
    type: 'attack',
    value: 3,
    bonus: 2,
    text: 'ВО ВРЕМЯ БИТВЫ: Сбросьте карту из руки противника.',
    zone: 'hand',
    ownerId: 'medusa',
  },
  {
    optionId: 'barrier_1',
    cardId: 'barrier_1',
    id: 'barrier',
    title: 'Хрустальный барьер',
    type: 'defense',
    value: 4,
    bonus: 1,
    text: 'ЗАЩИТА 4.',
    zone: 'hand',
    ownerId: 'medusa',
  },
];

beforeEach(() => {
  players.value = [
    {
      id: 'dorothy',
      order: 1,
      name: 'Игрок',
      hand,
      fighters: [{ id: 'dorothy-hero', type: 'hero', name: 'Дороти' }],
      lost: [],
    },
  ];
  payload.value = { playerId: 'dorothy' };
  you.value = 'dorothy';
  combat.value = null;
  targeting.value = null;
  choiceHand.value = null;
  choicePicked.value = [];
  choiceRequired.value = false;
  choiceConfirmEnabled.value = false;
  pickChoiceCard.mockClear();
  onFinishAction.mockClear();
  openModal.mockClear();
  closeModal.mockClear();
});

describe('окно руки', () => {
  it('сортирует карты как рука на столе: по типу, затем по значению, затем по названию', () => {
    expect(sortHandCards(hand).map(card => card.instanceId)).toEqual([
      'c1',
      'c2',
      'c4',
      'c3',
      'c5',
    ]);
  });

  it('не мутирует исходный список карт', () => {
    const source = [...hand];
    sortHandCards(source);
    expect(source.map(card => card.instanceId)).toEqual(['c4', 'c2', 'c5', 'c1', 'c3']);
  });

  it('рисует карты руки в порядке руки на столе', () => {
    const wrapper = mount(HandWindow);
    expect(keysOf(wrapper)).toEqual(['c1', 'c2', 'c4', 'c3', 'c5']);
  });

  it('подписывает окно именем героя', () => {
    const wrapper = mount(HandWindow);
    expect(wrapper.find('[data-pile-window]').attributes('data-pile-window')).toBe('Рука: Дороти');
  });

  it('пишет подсказку, когда рука закрыта от игрока', () => {
    players.value = [{ id: 'dorothy', order: 1, name: 'Игрок', hand: [], fighters: [], lost: [] }];
    const wrapper = mount(HandWindow);
    expect(keysOf(wrapper)).toEqual([]);
    expect(wrapper.text()).toContain('скрыты от вас');
  });
});

describe('окно руки выбирает карту из руки', () => {
  it('показывает карты чужой руки целиком: название, текст и само окно открывается само', () => {
    choiceHand.value = { playerId: 'medusa', name: 'Медуза', cards: enemyCards() };
    const wrapper = mount(HandWindow);

    expect(titlesOf(wrapper)).toEqual(['Ледяное зеркало', 'Хрустальный барьер']);
    expect(wrapper.find('[data-pile-window]').attributes('data-pile-window')).toBe('Рука: Медуза');
    // карта, которую выбирают, не выглядит закрытой: замок рисуют только недоступным
    expect(
      wrapper.findAll('[data-card]').map(node => node.attributes('data-card-disabled')),
    ).toEqual(['no', 'no']);
    // окно руки открывается само — игроку не нужно искать его в панели
    expect(openModal).toHaveBeenCalledWith('hand', { playerId: 'medusa', picking: true });
  });

  it('клик по карте отмечает вариант, кнопка окна подтверждает выбор', async () => {
    choiceHand.value = { playerId: 'medusa', name: 'Медуза', cards: enemyCards() };
    const wrapper = mount(HandWindow);
    const confirm = () => wrapper.find('[data-hand-choice-ok]');

    expect(confirm().attributes('disabled')).toBeDefined();

    await wrapper.findAll('[data-hand-choice]')[1].trigger('click');
    expect(pickChoiceCard).not.toHaveBeenCalled();
    expect(wrapper.findAll('[data-hand-choice]')[1].classes().join(' ')).toContain('ring-accent');
    expect(confirm().attributes('disabled')).toBeUndefined();
    expect(confirm().text()).toBe('Подтвердить');

    await confirm().trigger('click');
    expect(pickChoiceCard).toHaveBeenCalledTimes(1);
    expect(pickChoiceCard.mock.calls[0][0].optionId).toBe('barrier_1');
  });

  it('окно закрывается само, когда выбор из руки закончен', async () => {
    choiceHand.value = { playerId: 'medusa', name: 'Медуза', cards: enemyCards() };
    mount(HandWindow);
    expect(openModal).toHaveBeenCalled();

    choiceHand.value = null;
    await nextTick();

    expect(closeModal).toHaveBeenCalledWith('hand');
  });

  it('в паузе боя клик только отмечает карту: сбрасывает её кнопка «Подтвердить»', async () => {
    choiceHand.value = { playerId: 'medusa', name: 'Медуза', cards: enemyCards() };
    combat.value = { choice: { playerId: 'medusa', source: 'mirror_1', effect: 'discard' } };
    const wrapper = mount(HandWindow);
    const first = wrapper.findAll('[data-hand-choice]')[0];
    const confirm = () => wrapper.find('[data-hand-choice-ok]');

    expect(confirm().attributes('disabled')).toBeDefined();

    await first.trigger('click');
    expect(pickChoiceCard).not.toHaveBeenCalled();
    expect(first.classes().join(' ')).toContain('ring-accent');
    expect(confirm().attributes('disabled')).toBeUndefined();

    await confirm().trigger('click');
    expect(pickChoiceCard).toHaveBeenCalledTimes(1);
    expect(pickChoiceCard.mock.calls[0][0].optionId).toBe('mirror_1');
  });

  it('говорит, кто выбирает карту из руки и что с ней станет', () => {
    players.value = [
      ...players.value,
      {
        id: 'medusa',
        order: 2,
        name: 'Игрок 2',
        hand: enemyCards(),
        fighters: [{ id: 'medusa-hero', type: 'hero', name: 'Медуза' }],
        lost: [],
      },
    ];
    choiceHand.value = { playerId: 'medusa', name: 'Медуза', cards: enemyCards() };
    combat.value = { choice: { playerId: 'medusa', source: 'mirror_1', effect: 'discard' } };
    const wrapper = mount(HandWindow);
    expect(wrapper.text()).toContain('Медуза выбирает карту из руки');
    expect(wrapper.text()).toContain('она уйдёт в сброс');
    expect(wrapper.text()).toContain('она уйдёт в сброс');
  });
});
