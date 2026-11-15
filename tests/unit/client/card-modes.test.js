// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h, mergeProps, ref } from 'vue';

/**
 * У карты три режима: `hand` (веер на столе), `window` (окна стопок) и `detail` (крупный вид по правому
 * клику). В окне и в подробном виде в правом верхнем углу картинки стоит глазик: клик по нему прячет
 * картинку, текст разворачивается на всю карту, а значение, тип, тег весов и знаки «задизейблена» /
 * «усиление» уезжают наверх, в левый верхний угол — напротив глазика. Повторный клик возвращает обычный вид.
 *
 * `Card.vue` — SFC приложения: атомы, `CardOptions`, `Icon` и SVG-значок подменяются (как в
 * `card-scales-icon.test.js`).
 */
globalThis.computed = computed;
globalThis.ref = ref;

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
  quantity: 3,
  text: 'МГНОВЕННО: оппонент сбрасывает 1 случайную карту.',
  image: '/images/cards/anubis_03.webp',
  art: '/images/cards/anubis_03.webp',
  tags: ['scales'],
};

const mountCard = (props = {}, cardOverride = {}) =>
  mount(Card, {
    props: { card: { ...card, ...cardOverride }, ...props },
    global: { stubs: { NuxtIcon: IconStub, Icon: IconStub } },
  });

const eye = wrapper => wrapper.find('[data-card-eye]');
const picture = wrapper => wrapper.find('[data-picture]');
const art = wrapper => wrapper.find('[data-card-art]');
const plate = wrapper => wrapper.find('[data-card-plate]');
const detailValue = wrapper => wrapper.find('[data-card-detail-value]');
const meta = wrapper => wrapper.findAll('div').filter(node => node.text().includes('×3'))[0];

describe('Card: режимы карты и глазик', () => {
  it('в веере на столе глазика нет — карта просто выдвигается', () => {
    expect(eye(mountCard()).exists()).toBe(false);
  });

  it('в окне стопки глазик открыт и картинка на месте', () => {
    const wrapper = mountCard({ mode: 'window' });

    expect(eye(wrapper).exists()).toBe(true);
    expect(eye(wrapper).find('[data-icon]').attributes('data-icon')).toBe('lucide:eye');
    expect(picture(wrapper).exists()).toBe(true);
  });

  it('клик по глазику сворачивает картинку, повторный — возвращает', async () => {
    const wrapper = mountCard({ mode: 'detail' });

    expect(art(wrapper).classes()).toContain('h-[48%]');

    await eye(wrapper).trigger('click');
    expect(art(wrapper).classes()).toContain('h-0');
    expect(eye(wrapper).find('[data-icon]').attributes('data-icon')).toBe('lucide:eye-off');

    await eye(wrapper).trigger('click');
    expect(art(wrapper).classes()).toContain('h-[48%]');
    expect(eye(wrapper).find('[data-icon]').attributes('data-icon')).toBe('lucide:eye');
  });

  it('со скрытой картинкой значение, тип и тег весов уезжают наверх, к глазику', async () => {
    const wrapper = mountCard({ mode: 'detail' });

    expect(detailValue(wrapper).exists()).toBe(false);
    await eye(wrapper).trigger('click');

    const row = detailValue(wrapper);
    expect(row.find('[data-card-type-dot]').exists()).toBe(true);
    expect(row.text()).toContain('4');
    expect(row.find('[data-card-tag="scales"]').exists()).toBe(true);
    expect(plate(wrapper).exists()).toBe(false);
    expect(row.classes()).toEqual(expect.arrayContaining(['absolute', 'top-8', 'left-12']));
    expect(row.find('[data-card-tag="scales"] [data-icon]').classes()).toContain('size-14!');

    const markup = wrapper.html();
    expect(markup.indexOf('data-card-detail-value')).toBeGreaterThan(markup.indexOf('×3'));
  });

  it('у карты-эффекта в верхнем ряду только кружок типа, без числа', async () => {
    const wrapper = mountCard({ mode: 'detail' }, { type: 'effect', value: null });
    await eye(wrapper).trigger('click');

    expect(detailValue(wrapper).find('[data-card-type-dot]').exists()).toBe(true);
    expect(detailValue(wrapper).text()).toBe('');
  });

  it('замок задизейбленной и ноги усиления тоже уезжают в верхний ряд', async () => {
    const disabled = mountCard({ mode: 'window', disabled: true });
    await eye(disabled).trigger('click');
    expect(detailValue(disabled).find('[data-icon="lucide:lock"]').exists()).toBe(true);

    const boosted = mountCard({ mode: 'window', boost: true });
    await eye(boosted).trigger('click');
    expect(detailValue(boosted).find('[data-icon="move"]').exists()).toBe(true);
  });

  it('в подробном виде задизейбленная карта не темнеет вуалью, но замок виден', async () => {
    const wrapper = mountCard({ mode: 'detail', disabled: true });
    await eye(wrapper).trigger('click');

    expect(detailValue(wrapper).find('[data-icon="lucide:lock"]').exists()).toBe(true);
    expect(wrapper.html()).not.toContain('bg-app/45');
  });

  it('в подробном виде текст на карте мельче, чем в веере', () => {
    expect(meta(mountCard()).exists()).toBe(true);
    expect(mountCard().html()).toContain('text-13 font-light');
    expect(mountCard({ mode: 'detail' }).html()).toContain('text-11 font-light');
  });

  it('в подробном виде и название карты мельче', () => {
    expect(mountCard().find('p').classes()).toContain('text-15');
    expect(mountCard({ mode: 'detail' }).find('p').classes()).toContain('text-13');
  });

  it('выбранный режим глаза переживает смену карты на том же экземпляре', async () => {
    const wrapper = mountCard({ mode: 'detail' });
    await eye(wrapper).trigger('click');
    await wrapper.setProps({ card: { ...card, id: 'anubis_04', title: 'Суд молчит' } });

    expect(art(wrapper).classes()).toContain('h-0');
    expect(eye(wrapper).find('[data-icon="lucide:eye-off"]').exists()).toBe(true);
  });
});
