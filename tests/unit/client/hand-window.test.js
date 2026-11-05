// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h, ref } from 'vue';

/**
 * Окно руки показывает карты **в том же порядке, что и рука на столе** (`HandFan`): окно — это крупный вид
 * руки, и пересортировка в нём заставляла бы игрока искать карту на новом месте. Порядок один на оба вида:
 * по типу (`CARD_TYPE_ORDER`), затем по значению (сильные первыми), затем по названию — его держит
 * `sortHandCards` из `useGameHelpers`.
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

vi.mock('~/composables/game/useGameSession.js', () => ({
  useGameSession: () => ({ players }),
}));

vi.mock('~/composables/ui/useModal.js', () => ({
  useModalPayload: () => ref({ playerId: 'dorothy' }),
}));

// Окно-рамка: проверяем только порядок карт, вид рамки рисует `PileWindow`.
vi.mock('~/components/molecules/game/PileWindow.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'PileWindow',
      props: { title: { type: String, default: '' } },
      setup(props, { slots }) {
        return () => h('div', { 'data-pile-window': props.title }, slots.default?.());
      },
    }),
  };
});

vi.mock('~/components/molecules/game/Card.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'Card',
      props: { card: { type: Object, required: true } },
      setup(props) {
        return () =>
          h('div', {
            'data-card': String(props.card?.instanceId ?? ''),
            'data-card-title': String(props.card?.title ?? ''),
          });
      },
    }),
  };
});

const { sortHandCards } = await import('~/composables/game/useGameHelpers.js');
const HandWindow = (await import('~/components/molecules/game/HandWindow.vue')).default;

const keysOf = wrapper => wrapper.findAll('[data-card]').map(node => node.attributes('data-card'));

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
