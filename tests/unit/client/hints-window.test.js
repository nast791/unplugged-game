// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h } from 'vue';

/**
 * Окно подсказок рисуется **только со словами**: пустого окна (рамка и свечение без строки) не бывает —
 * нет текста, нет и компонента. Проверяется здесь, а не на экране партии: правило принадлежит самому окну,
 * и вызывающий экран не обязан его помнить.
 *
 * `HintsWindow.vue` — SFC приложения: `computed` приходит автоимпортом Nuxt, в тесте кладём его
 * в `globalThis` до импорта компонента (так же, как `player-card.test.js`).
 */
globalThis.computed = computed;

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
