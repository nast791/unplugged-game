// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h, mergeProps } from 'vue';

/**
 * Пометка весов — тег карты (`tags: ['scales']`), а не отдельное поле: тег приходит с сервера в
 * `card.tags`. Карточка кладёт значок весов **на плашку значения** (там же, где тип и число), ниже
 * числа: плашка растягивается по высоте, а иконка типа и число остаются на своих местах — в арте
 * значка больше нет.
 *
 * `Card.vue` — SFC приложения: `computed` приходит автоимпортом Nuxt, атомы, `CardOptions`, `Icon`
 * и SVG-значок подменяются (так же, как в `card-boost-icon.test.js`).
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
  id: 'anubis_03',
  title: 'Печать Маат',
  type: 'attack',
  value: 4,
  bonus: 2,
  text: 'МГНОВЕННО: оппонент сбрасывает 1 случайную карту.',
  tags: ['scales'],
};

const mountCard = (props = {}, cardOverride = {}) =>
  mount(Card, {
    props: { card: { ...card, ...cardOverride }, ...props },
    global: { stubs: { NuxtIcon: IconStub, Icon: IconStub } },
  });

const scales = wrapper => wrapper.find('[data-card-tag="scales"]').exists();
const plate = wrapper => wrapper.find('[data-card-plate]');

describe('Card: пометка весов', () => {
  it('карта с тегом весов показывает значок весов на плашке значения', () => {
    const wrapper = mountCard();

    expect(scales(wrapper)).toBe(true);
    expect(plate(wrapper).find('[data-card-tag="scales"]').exists()).toBe(true);
    expect(plate(wrapper).html()).toContain('Пометка весов');
  });

  it('значок рисуется обычной иконкой — без белого кружка и подложки', () => {
    const badge = mountCard().find('[data-card-tag="scales"]');

    expect(badge.classes()).not.toContain('rounded-full');
    expect(badge.classes()).not.toContain('bg-white');
  });

  it('значок стоит ниже числа, а число и иконка типа остаются на плашке', () => {
    const markup = plate(mountCard()).html();

    expect(markup).toContain('lining-nums');
    expect(markup.indexOf('lining-nums')).toBeLessThan(markup.indexOf('lucide:scale'));
    expect(plate(mountCard()).find('[data-icon]').exists()).toBe(true);
  });

  it('карта без тега — без значка, плашка та же', () => {
    const wrapper = mountCard({}, { tags: [] });

    expect(scales(wrapper)).toBe(false);
    expect(plate(wrapper).find('[data-icon]').exists()).toBe(true);
  });

  it('у карты-эффекта плашка той же высоты, а иконка типа — посередине', () => {
    const effect = mountCard({}, { type: 'effect', value: null });
    const number = mountCard();

    expect(scales(effect)).toBe(true);
    expect(plate(effect).html()).toContain('h-54');
    expect(plate(effect).html()).toContain('justify-center');
    expect(plate(number).html()).toContain('h-54');
  });
});

describe('Card: пометка осколка', () => {
  const shard = { tags: ['shard'] };

  it('карта с меткой осколка показывает значок там же, где весы', () => {
    const wrapper = mountCard({}, shard);

    expect(plate(wrapper).find('[data-card-tag="shard"]').exists()).toBe(true);
    expect(plate(wrapper).find('[data-card-tag="shard"] [data-icon]').attributes('data-icon')).toBe(
      'lucide:snowflake',
    );
    expect(plate(wrapper).html()).toContain('Пометка осколка');
    expect(scales(wrapper)).toBe(false);
  });

  it('значок осколка тоже белый, без кружка и подложки', () => {
    const badge = mountCard({}, shard).find('[data-card-tag="shard"]');

    expect(badge.classes()).not.toContain('rounded-full');
    expect(badge.classes()).not.toContain('bg-white');
  });

  it('две метки подряд рисуют два значка на плашке', () => {
    const wrapper = mountCard({}, { tags: ['scales', 'shard'] });

    expect(plate(wrapper).find('[data-card-tag="scales"]').exists()).toBe(true);
    expect(plate(wrapper).find('[data-card-tag="shard"]').exists()).toBe(true);
  });

  it('в подробном просмотре со скрытой картинкой осколок уезжает наверх, как весы', async () => {
    const wrapper = mountCard({ mode: 'detail' }, shard);

    expect(wrapper.find('[data-card-detail-value] [data-card-tag="shard"]').exists()).toBe(false);

    await wrapper.find('[data-card-eye]').trigger('click');

    const shown = wrapper.find('[data-card-detail-value] [data-card-tag="shard"]');
    expect(shown.exists()).toBe(true);
    expect(shown.find('[data-icon]').classes()).toContain('size-14!');
  });
});
