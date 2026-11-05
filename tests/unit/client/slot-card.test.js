// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h } from 'vue';
import SlotCard from '~/components/molecules/game/SlotCard.vue';

/**
 * Карта-кнопка (`SlotCard`) — общий виджет стопок и панелей рельса. Проверяем скин: у пустой стопки
 * фон свой (тревожный), у недоступной — серый, у выдвинутой — акцентная рамка. Пустая стопка тоже
 * недоступна, поэтому свойство `empty` сильнее `disabled`.
 *
 * `SlotCard.vue` — SFC приложения: `computed` приходит автоимпортом Nuxt, поэтому кладём его в
 * `globalThis`; иконку `@nuxt/icon` подменяем заглушкой.
 */
globalThis.computed = computed;

vi.mock('~/components/atoms/ATooltip.vue', async () => ({
  default: defineComponent({
    name: 'ATooltip',
    setup(_, { slots }) {
      return () => h('div', { 'data-tooltip': 'true' }, [slots.default?.()]);
    },
  }),
}));

const IconStub = defineComponent({
  name: 'NuxtIcon',
  props: { name: { type: String, default: '' } },
  setup(props) {
    return () => h('span', { 'data-icon': props.name });
  },
});

const mountCard = (props = {}) =>
  mount(SlotCard, {
    props,
    global: { stubs: { NuxtIcon: IconStub, Icon: IconStub } },
  });

const skinOf = wrapper => wrapper.find('button').classes().join(' ');

describe('SlotCard: скин', () => {
  it('красит пустую стопку своим фоном, хотя она и недоступна', () => {
    const wrapper = mountCard({ empty: true, disabled: true, icon: 'lucide:trash-2' });

    expect(skinOf(wrapper)).toContain('bg-danger');
    expect(skinOf(wrapper)).toContain('border-danger');
    expect(skinOf(wrapper)).not.toContain('bg-surface-3');
  });

  it('гасит недоступную стопку серым фоном без тревожного цвета', () => {
    const wrapper = mountCard({ disabled: true, icon: 'lucide:layers' });

    expect(skinOf(wrapper)).toContain('bg-surface-3');
    expect(skinOf(wrapper)).not.toContain('bg-danger');
  });

  it('обводит выдвинутую стопку акцентом', () => {
    const wrapper = mountCard({ out: true, outClass: '-translate-y-10' });

    expect(skinOf(wrapper)).toContain('border-accent');
    expect(skinOf(wrapper)).toContain('-translate-y-10');
  });

  it('оставляет обычную стопку нейтральной', () => {
    const wrapper = mountCard({ count: 5 });

    expect(skinOf(wrapper)).toContain('bg-surface');
    expect(skinOf(wrapper)).not.toContain('bg-danger');
  });
});
