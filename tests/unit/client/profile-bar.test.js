// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h } from 'vue';

/**
 * Полоса профиля — валюта и аватарка. Промежуточной выпадашки у аватарки нет (решение владельца):
 * клик сразу открывает модалку профиля, а сервисные пункты («Настройки», «Выход») живут в центральном
 * меню лобби. Правило принадлежит полосе, поэтому проверяется здесь, а не на экране.
 *
 * `ProfileBar.vue` — SFC приложения: `computed` приходит автоимпортом Nuxt, в тесте кладём его
 * в `globalThis` до импорта компонента (так же, как `placement-tray.test.js`).
 */
globalThis.computed = computed;

vi.mock('~/composables/ui/useProfile', async () => {
  const { ref } = await import('vue');
  return {
    useProfile: () => ({
      nick: ref('Элизиф'),
      avatar: ref('lucide:cat'),
      currency: ref(12500),
    }),
  };
});

const { closeAllModals, isModalOpen } = await import('~/composables/ui/useModal.js');
const { default: ProfileBar } =
  await import('../../../app/components/organisms/layout/ProfileBar.vue');

const IconStub = defineComponent({
  name: 'Icon',
  props: { name: { type: String, default: '' } },
  setup(props) {
    return () => h('i', { 'data-icon': props.name });
  },
});

/** Атомы — только оболочка: тесту важно, куда ведёт клик по аватарке, а не как она нарисована. */
const stub = name =>
  defineComponent({
    name,
    setup:
      (_props, { slots }) =>
      () =>
        h('span', slots.default?.()),
  });

/** Тултип — обвязка reka-ui: полосе от него нужен только элемент-триггер. */
const TooltipStub = defineComponent({
  name: 'ATooltip',
  props: { text: { type: String, default: '' } },
  setup(_props, { slots }) {
    return () => h('span', { 'data-tooltip': _props.text }, slots.default?.());
  },
});

const mountBar = () =>
  mount(ProfileBar, {
    global: {
      stubs: {
        Icon: IconStub,
        NuxtIcon: IconStub,
        AButton: stub('AButton'),
        AAvatar: stub('AAvatar'),
        ATooltip: TooltipStub,
      },
    },
  });

beforeEach(closeAllModals);

describe('Полоса профиля: аватарка', () => {
  it('клик по аватарке открывает модалку профиля', async () => {
    const wrapper = mountBar();

    await wrapper.find('[aria-label="Профиль игрока Элизиф"]').trigger('click');

    expect(isModalOpen('profile')).toBe(true);
  });

  it('выпадашки у аватарки нет: сервисных пунктов в полосе не осталось', () => {
    const wrapper = mountBar();

    expect(wrapper.text()).not.toContain('Настройки');
    expect(wrapper.text()).not.toContain('Выход');
  });

  it('валюта читается числом с разрядами', () => {
    expect(mountBar().text()).toContain('12 500');
  });
});
