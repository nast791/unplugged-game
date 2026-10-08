// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { useSortable } from '../../../app/composables/useSortable.js';

/**
 * Перестановка указателем на живом DOM: `pointerdown` на ручке → `pointermove` по чужой строке →
 * `pointerup`. Композабл ловит события с элемента, поэтому проверять это можно только на DOM.
 *
 * Цель под курсором подменяем (`hitTest`): в happy-dom нет раскладки, `elementFromPoint` вернул бы
 * пустоту — а нам нужна именно проверка «указатель над третьей строкой — переставляем на третью».
 */
const ROW_HEIGHT = 40;

const Host = defineComponent({
  props: {
    mode: { type: String, default: 'swap' },
    count: { type: Number, default: 3 },
    disabled: { type: Boolean, default: false },
  },
  setup(props) {
    const items = ref(
      Array.from({ length: props.count }, (_, index) => ({ id: String.fromCharCode(97 + index) })),
    );
    const sortable = useSortable(items, {
      mode: props.mode,
      // Как в лобби: порядок задаёт сид — перестановка выключена целиком.
      disabled: () => props.disabled,
      hitTest: point => Math.floor(point.y / ROW_HEIGHT),
    });
    return { items, sortable };
  },
  render() {
    return h(
      'div',
      this.items.map((item, index) =>
        h('div', { key: item.id, ...this.sortable.targetProps(index) }, [
          h('span', item.id),
          h('button', { ...this.sortable.handleProps(index), 'data-handle': item.id }),
        ]),
      ),
    );
  },
});

const pointer = (type, options = {}) =>
  new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    pointerType: 'mouse',
    button: 0,
    clientX: 0,
    clientY: 0,
    ...options,
  });

/** Тянет строку `from` на строку `to`: нажатие, движение за порог, движение к цели, отпускание. */
const drag = async (wrapper, from, to) => {
  const handle = wrapper.findAll('button')[from].element;
  const startY = from * ROW_HEIGHT + ROW_HEIGHT / 2;
  const endY = to * ROW_HEIGHT + ROW_HEIGHT / 2;

  handle.dispatchEvent(pointer('pointerdown', { clientY: startY }));
  handle.dispatchEvent(pointer('pointermove', { clientY: startY + 8 }));
  handle.dispatchEvent(pointer('pointermove', { clientY: endY }));
  handle.dispatchEvent(pointer('pointerup', { clientY: endY }));
  await nextTick();
};

const order = wrapper => wrapper.findAll('span').map(span => span.text());

/**
 * Монтируем **в документ**: движение и отпускание указателя композабл слушает на `document` (чтобы
 * указатель не терялся вне блока), а события в откреплённом дереве до документа не доходят.
 */
const mounted = [];
const mountHost = props => {
  const wrapper = mount(Host, { props, attachTo: document.body });
  mounted.push(wrapper);
  return wrapper;
};

afterEach(() => {
  while (mounted.length) mounted.pop().unmount();
});

describe('useSortable в DOM', () => {
  it('перетаскивание меняет порядок строк (swap)', async () => {
    const wrapper = mountHost();
    expect(order(wrapper)).toEqual(['a', 'b', 'c']);

    await drag(wrapper, 0, 2);
    expect(order(wrapper)).toEqual(['c', 'b', 'a']);
  });

  it('перетаскивание меняет порядок строк (insert)', async () => {
    const wrapper = mountHost({ mode: 'insert' });

    await drag(wrapper, 0, 2);
    expect(order(wrapper)).toEqual(['b', 'c', 'a']);
  });

  it('бросок на себя порядок не меняет', async () => {
    const wrapper = mountHost();

    await drag(wrapper, 1, 1);
    expect(order(wrapper)).toEqual(['a', 'b', 'c']);
  });

  it('нажатие без движения — не перетаскивание: клик по ручке ничего не двигает', async () => {
    const wrapper = mountHost();
    const handle = wrapper.findAll('button')[0].element;

    handle.dispatchEvent(pointer('pointerdown', { clientY: 20 }));
    handle.dispatchEvent(pointer('pointerup', { clientY: 20 }));
    await nextTick();

    expect(order(wrapper)).toEqual(['a', 'b', 'c']);
  });

  it('перестановка выключена (`disabled`) — указатель порядок не меняет', async () => {
    const wrapper = mountHost({ disabled: true });

    await drag(wrapper, 0, 2);
    expect(order(wrapper)).toEqual(['a', 'b', 'c']);
  });

  it('стрелки двигают строку на соседнюю позицию', async () => {
    const wrapper = mountHost();
    const sortable = wrapper.vm.sortable;

    expect(sortable.moveBy(0, 1)).toBe(1);
    await nextTick();
    expect(order(wrapper)).toEqual(['b', 'a', 'c']);

    // за краем списка — порядок тот же
    expect(sortable.moveBy(2, 1)).toBe(null);
    expect(order(wrapper)).toEqual(['b', 'a', 'c']);
  });
});
