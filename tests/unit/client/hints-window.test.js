// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

/**
 * Окно подсказок рисуется **только со словами**: пустого окна (рамка и свечение без строки) не бывает —
 * нет текста, нет и компонента. Проверяется здесь, а не на экране партии: правило принадлежит самому окну,
 * и вызывающий экран не обязан его помнить.
 *
 * Второе правило — **окно висит абсолютом над полем и уезжает за курсором**: оно не занимает места в
 * разметке экрана (иначе подсказка двигала бы выбор действия под собой), стоит сверху по центру, а после
 * захвата живёт в координатах экрана, за край не уезжает и держит место до конца партии.
 *
 * `HintsWindow.vue` — SFC приложения: `computed`, `ref`, `watch`, `onMounted`, `onBeforeUnmount`, `nextTick`
 * приходят автоимпортами Nuxt, в тесте кладём их в `globalThis` до импорта компонента.
 */
globalThis.computed = computed;
globalThis.ref = ref;
globalThis.watch = watch;
globalThis.onMounted = onMounted;
globalThis.onBeforeUnmount = onBeforeUnmount;
globalThis.nextTick = nextTick;

// Настоящий `useUI` читает конфиг приложения (`app.config.js`), которого в тесте нет, — отдаём пресет окна.
vi.mock('~/composables/ui/useUI', async () => {
  const { computed } = await import('vue');
  const hintsWindow = (await import('../../../app/ui/hints-window.js')).default;
  return { useUI: () => ({ styles: computed(() => hintsWindow) }) };
});

/** Скролл-атом — своя обвязка reka-ui: в тесте от него нужен только пропущенный дальше слот. */
vi.mock('~/components/atoms/AScroll.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'AScroll',
      setup(_props, { slots }) {
        return () => h('div', slots.default?.());
      },
    }),
  };
});

const IconStub = defineComponent({
  name: 'NuxtIcon',
  props: { name: { type: String, default: '' } },
  setup(props) {
    return () => h('i', { 'data-icon': props.name });
  },
});

const { default: HintsWindow } =
  await import('../../../app/components/organisms/game/HintsWindow.vue');

const mountWindow = props =>
  mount(HintsWindow, {
    props,
    global: { stubs: { NuxtIcon: IconStub } },
  });

describe('HintsWindow: пустой подсказки нет', () => {
  it('без текста не рисует окно целиком', () => {
    const wrapper = mountWindow({ text: '' });

    expect(wrapper.find('section').exists()).toBe(false);
    expect(wrapper.text()).toBe('');
    expect(wrapper.html()).toBe('<!--v-if-->');
  });

  it('пробелы текстом не считаются: пустая строка и пропущенный проп ведут себя одинаково', () => {
    expect(mountWindow({ text: '   ' }).find('section').exists()).toBe(false);
    expect(mountWindow({}).find('section').exists()).toBe(false);
  });

  it('со словами окно на месте: текст, значок тона и роль для скринридера', () => {
    const wrapper = mountWindow({ text: 'Выберите цель среди подсвеченных бойцов' });

    const section = wrapper.find('section');
    expect(section.exists()).toBe(true);
    expect(section.attributes('role')).toBe('status');
    expect(wrapper.text()).toContain('Выберите цель среди подсвеченных бойцов');
    expect(wrapper.find('[data-icon="lucide:lightbulb"]').exists()).toBe(true);
  });

  it('тон меняет значок: ожидание — песочные часы, ошибка — предупреждение', () => {
    expect(
      mountWindow({ text: 'Компьютер думает…', tone: 'wait' })
        .find('[data-icon="lucide:hourglass"]')
        .exists(),
    ).toBe(true);
    expect(
      mountWindow({ text: 'Клетка сейчас недоступна', tone: 'danger' })
        .find('[data-icon="lucide:circle-alert"]')
        .exists(),
    ).toBe(true);
  });
});

describe('HintsWindow: окно можно перетащить', () => {
  /** Кадр `requestAnimationFrame`: `useDraggable` пишет координаты именно в нём. */
  const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve()));

  /** Событие указателя с координатами: готовому событию happy-dom `clientX` не присвоить. */
  const pointerEvent = (type, { clientX = 0, clientY = 0, pointerId = 1, button = 0 } = {}) => {
    const event = new Event(type, { bubbles: true });
    Object.defineProperty(event, 'clientX', { value: clientX });
    Object.defineProperty(event, 'clientY', { value: clientY });
    Object.defineProperty(event, 'pointerId', { value: pointerId });
    Object.defineProperty(event, 'button', { value: button });
    return event;
  };

  const drag = async (element, from, to) => {
    element.dispatchEvent(pointerEvent('pointerdown', from));
    await nextTick();
    document.dispatchEvent(pointerEvent('pointermove', to));
    await nextFrame();
    await nextTick();
    document.dispatchEvent(pointerEvent('pointerup', to));
    await nextTick();
  };

  const place = wrapper => {
    const style = wrapper.find('section').attributes('style') ?? '';
    const left = Number(/left:\s*(-?\d+(?:\.\d+)?)px/.exec(style)?.[1]);
    const top = Number(/top:\s*(-?\d+(?:\.\d+)?)px/.exec(style)?.[1]);
    return { left, top };
  };

  it('до перетаскивания окно висит абсолютом сверху по центру, без координат экрана', () => {
    const wrapper = mountWindow({ text: 'Ваш ход' });
    const section = wrapper.find('section');

    expect(section.classes()).toContain('absolute');
    expect(section.classes()).not.toContain('fixed');
    expect(section.attributes('style')).toBeUndefined();
  });

  it('захват и движение переносят окно в координаты экрана', async () => {
    const wrapper = mountWindow({ text: 'Ваш ход' });
    const section = wrapper.find('section');

    await drag(section.element, { clientX: 100, clientY: 80 }, { clientX: 300, clientY: 200 });

    expect(section.classes()).toContain('fixed');
    expect(place(wrapper)).toEqual({ left: 200, top: 120 });
  });

  it('окно не уезжает за край экрана', async () => {
    const wrapper = mountWindow({ text: 'Ваш ход' });
    const section = wrapper.find('section');

    await drag(section.element, { clientX: 0, clientY: 0 }, { clientX: 99999, clientY: 99999 });

    const { left, top } = place(wrapper);
    expect(left).toBeLessThanOrEqual(window.innerWidth);
    expect(top).toBeLessThanOrEqual(window.innerHeight);
    expect(left).toBeGreaterThanOrEqual(0);
    expect(top).toBeGreaterThanOrEqual(0);
  });

  it('место остаётся за окном до конца партии: новая подсказка встаёт туда же', async () => {
    const wrapper = mountWindow({ text: 'Ваш ход' });
    const section = wrapper.find('section');

    await drag(section.element, { clientX: 100, clientY: 80 }, { clientX: 300, clientY: 200 });
    const moved = place(wrapper);
    expect(moved).toEqual({ left: 200, top: 120 });

    await wrapper.setProps({ text: '' });
    expect(wrapper.find('section').exists()).toBe(false);

    await wrapper.setProps({ text: 'Новая подсказка' });
    expect(place(wrapper)).toEqual(moved);
  });
});
