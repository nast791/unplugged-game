// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h, mergeProps } from 'vue';

/**
 * Ромб усиления стоит поверх стыка арта и текстовой части (`absolute right-8 -bottom-14`), поэтому
 * первая строка заголовка уходит под него — «Погребальная пелена» теряла последние буквы. Заголовок
 * карты с усилением получает отступ справа (`titleInset`), и тест стережёт именно его: без усиления
 * разметка не меняется, с усилением — заголовок не доходит до ромба.
 *
 * `Card.vue` — SFC приложения: `computed` приходит автоимпортом Nuxt, атомы (`APicture` тянет
 * `useImage`/`useHead`, `AScroll` — пресет приложения) и `Icon` в тесте подменяются (так же, как
 * `player-card.test.js`).
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

vi.mock('~/composables/game/useGameSession.js', () => ({
  useGameSession: () => ({ cardFighterLabel: () => 'Анубис' }),
}));

const { default: Card } = await import('../../../app/components/molecules/game/Card.vue');

const IconStub = defineComponent({
  name: 'Icon',
  props: { name: { type: String, default: '' } },
  setup: props => () => h('i', { 'data-icon': props.name }),
});

const card = extra => ({
  id: 'anubis_02',
  title: 'Погребальная пелена',
  type: 'attack',
  value: 4,
  bonus: 2,
  text: 'МГНОВЕННО: нанесите 1 урон.',
  ...extra,
});

const mountCard = extra =>
  mount(Card, {
    props: { card: card(extra) },
    global: { stubs: { NuxtIcon: IconStub, Icon: IconStub } },
  });

/** Заголовок карты — первый `<p>` карточки: ниже лежит текст свойства. */
const titleClasses = wrapper => wrapper.findAll('p')[0].classes();

describe('Card: заголовок не заезжает под ромб усиления', () => {
  it('с усилением заголовок получает отступ справа', () => {
    expect(titleClasses(mountCard())).toContain('pr-32');
  });

  it('без усиления отступа нет — заголовку нечего обходить', () => {
    expect(titleClasses(mountCard({ bonus: 0 }))).not.toContain('pr-32');
    expect(titleClasses(mountCard({ bonus: null }))).not.toContain('pr-32');
  });

  it('ромб рисуется ровно у карт с усилением', () => {
    const diamond = wrapper => wrapper.find('.rotate-45').exists();

    expect(diamond(mountCard())).toBe(true);
    expect(diamond(mountCard({ bonus: 0 }))).toBe(false);
  });
});
