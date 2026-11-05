// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h, mergeProps } from 'vue';

/**
 * В углу арта карты стоит один значок состояния: замок — карту сейчас нельзя разыграть, нога
 * (`svg/game/move.svg`, тот же знак, что в круге над колодой) — карту можно скинуть на сброс ради
 * усиления перемещения. Замок сильнее: неразыгрываемая карта не бывает усилением.
 *
 * `Card.vue` — SFC приложения: `computed` приходит автоимпортом Nuxt, атомы, `CardOptions`, `Icon`
 * и SVG-значок подменяются (так же, как в `card-bonus-title.test.js`).
 */
globalThis.computed = computed;

vi.mock('~/components/atoms/APicture.vue', () => ({
  default: defineComponent({
    name: 'APicture',
    props: { src: { type: String, default: '' }, alt: { type: String, default: '' } },
    setup: () => () => h('i', { 'data-picture': '' }),
  }),
}));

vi.mock('~/components/atoms/AScroll.vue', () => ({
  default: defineComponent({
    name: 'AScroll',
    setup:
      (_, { slots }) =>
      () =>
        h('div', slots.default?.()),
  }),
}));

vi.mock('~/components/atoms/ATooltip.vue', () => ({
  default: defineComponent({
    name: 'ATooltip',
    props: { text: { type: String, default: '' } },
    setup:
      (props, { slots, attrs }) =>
      () =>
        h('div', mergeProps(attrs, { 'data-tooltip': props.text }), slots.default?.()),
  }),
}));

vi.mock('~/components/molecules/game/CardOptions.vue', () => ({
  default: defineComponent({
    name: 'CardOptions',
    setup: () => () => h('i', { 'data-options': '' }),
  }),
}));

vi.mock('~/svg/game/move.svg', async () => {
  const { defineComponent: makeComponent, h: makeNode } = await import('vue');
  return {
    default: makeComponent({
      name: 'MoveIcon',
      setup: () => () => makeNode('i', { 'data-icon': 'move' }),
    }),
  };
});

vi.mock('~/composables/game/useGameSession.js', () => ({
  useGameSession: () => ({ cardFighterLabel: () => 'Анубис' }),
}));

const { default: Card } = await import('../../../app/components/molecules/game/Card.vue');

const IconStub = defineComponent({
  name: 'Icon',
  props: { name: { type: String, default: '' } },
  setup: props => () => h('i', { 'data-icon': props.name }),
});

const card = {
  id: 'anubis_02',
  title: 'Погребальная пелена',
  type: 'attack',
  value: 4,
  bonus: 2,
  text: 'МГНОВЕННО: нанесите 1 урон.',
};

const mountCard = props =>
  mount(Card, {
    props: { card, ...props },
    global: { stubs: { NuxtIcon: IconStub, Icon: IconStub } },
  });

const lock = wrapper => wrapper.find('[data-icon="lucide:lock"]').exists();
const move = wrapper => wrapper.find('[data-icon="move"]').exists();

describe('Card: значок состояния в углу арта', () => {
  it('неразыгрываемая карта показывает замок', () => {
    const wrapper = mountCard({ disabled: true });

    expect(lock(wrapper)).toBe(true);
    expect(move(wrapper)).toBe(false);
  });

  it('карта усиления перемещения показывает ноги вместо замка', () => {
    const wrapper = mountCard({ boost: true });

    expect(move(wrapper)).toBe(true);
    expect(lock(wrapper)).toBe(false);
    expect(wrapper.html()).toContain('Усиление перемещения');
  });

  it('обычная карта в игре — без значка', () => {
    const wrapper = mountCard({});

    expect(lock(wrapper)).toBe(false);
    expect(move(wrapper)).toBe(false);
  });

  it('замок сильнее усиления: неразыгрываемая карта не бывает усилением', () => {
    const wrapper = mountCard({ disabled: true, boost: true });

    expect(lock(wrapper)).toBe(true);
    expect(move(wrapper)).toBe(false);
  });
});
