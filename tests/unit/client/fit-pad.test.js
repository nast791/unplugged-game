// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { computed, defineComponent, h, onMounted, ref } from 'vue';
import { FIT_PAD_UNITS } from '../../../app/composables/ui/useBoardView.js';
import { useFitPad } from '../../../app/composables/ui/useFitPad.js';

/**
 * Отступ карты от края поля — то же `p-12`, что у панелей, только в пикселях: единица сетки
 * (`--spacing`) считается от ширины окна, поэтому её читает доска у своего узла. Если единицу не отдать
 * вовсе, вписывание берёт свой запас по умолчанию — карта не должна пропадать.
 */
globalThis.computed = computed;
globalThis.ref = ref;
globalThis.onMounted = onMounted;

const originalStyles = window.getComputedStyle;

const Host = defineComponent({
  name: 'FitPadHost',
  setup(_props, { expose }) {
    const board = ref(null);
    const { pad, measure } = useFitPad(board);
    expose({ pad, measure });
    return () => h('div', { ref: board, class: 'board' });
  },
});

const mountHost = async spacing => {
  window.getComputedStyle = element => ({
    getPropertyValue: name => (name === '--spacing' ? spacing : ''),
  });
  const wrapper = mount(Host);
  await new Promise(resolve => setTimeout(resolve, 0));
  return wrapper;
};

describe('useFitPad: отступ карты от края поля', () => {
  beforeEach(() => {
    window.getComputedStyle = originalStyles;
  });

  afterEach(() => {
    window.getComputedStyle = originalStyles;
  });

  it('считает запас из единицы сетки: на 1920 это 12 px', async () => {
    const wrapper = await mountHost('1px');
    expect(wrapper.vm.pad).toBe(FIT_PAD_UNITS);

    wrapper.vm.measure();
    expect(wrapper.vm.pad).toBe(FIT_PAD_UNITS);
    wrapper.unmount();
  });

  it('на узком окне единица меньше — и запас вместе с ней', async () => {
    const wrapper = await mountHost('0.833px');

    expect(wrapper.vm.pad).toBe(Math.round(0.833 * FIT_PAD_UNITS));
    wrapper.unmount();
  });

  it('единицы нет — запас не задан, вписывание возьмёт своё значение по умолчанию', async () => {
    const wrapper = await mountHost('');

    expect(wrapper.vm.pad).toBeUndefined();
    wrapper.unmount();
  });
});
