// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computed,
  defineComponent,
  h,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';

/**
 * Меню партии: открывается шестерёнкой в шапке и Esc, закрывается Esc, кликом мимо панели или выбором
 * пункта. Пункты — сдаться, настройки, справка, выйти в лобби. Сдача и выход **спрашивают модалкой**
 * (`ConfirmModal`), а не `window.confirm`, и **партию меню не останавливает** (решение владельца):
 * состояние меню живёт вне реестра модалок, поэтому нижняя полоса и счётчики не трогаются.
 *
 * `Menu.vue`/`Header.vue` — SFC приложения: `computed`, `watch`, `onMounted`, `onBeforeUnmount` приходят
 * автоимпортами Nuxt, в тесте кладём их в `globalThis` до импорта компонентов (как `board-clicks.test.js`).
 */
globalThis.computed = computed;
globalThis.ref = ref;
globalThis.watch = watch;
globalThis.onMounted = onMounted;
globalThis.onBeforeUnmount = onBeforeUnmount;

const resign = vi.fn();

vi.mock('~/composables/game/useGameSession.js', async () => {
  const { ref } = await import('vue');
  const session = { isGameOver: ref(false), onResign: resign };
  return { useGameSession: () => session, session };
});

const notify = vi.fn();

vi.mock('~/composables/ui/useToast', () => ({ notify }));

// Настоящий `useUI` читает конфиг приложения (`app.config.js`), которого в тесте нет, — отдаём пресеты.
vi.mock('~/composables/ui/useUI', async importOriginal => {
  const { computed, toValue } = await import('vue');
  const actual = await importOriginal();
  const presets = {
    button: (await import('../../../app/ui/button.js')).default,
    modal: (await import('../../../app/ui/modal.js')).default,
  };

  return {
    ...actual,
    useUI: (key, localUi) => ({
      styles: computed(() =>
        actual.resolveUiStyles(presets[toValue(key)] ?? {}, toValue(localUi) ?? {}),
      ),
    }),
  };
});

// Скролл-атом — своя обвязка reka-ui: в тесте от него нужен только пропущенный дальше слот.
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

// Знак — SVG-файл проекта: `vite-svg-loader` в тесте не работает, подменяем заглушкой.
vi.mock('~/svg/brand/logo.svg', async () => {
  const { defineComponent, h } = await import('vue');
  return { default: defineComponent({ name: 'BrandLogo', setup: () => () => h('span') }) };
});

// Маршрут — автоимпорт Nuxt (`#app/composables/router`): в тесте подменяем переход заглушкой.
const { navigateTo } = vi.hoisted(() => ({ navigateTo: vi.fn() }));

vi.mock('#app/composables/router', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, navigateTo };
});

const { session } = await import('~/composables/game/useGameSession.js');
const { closeAllModals, addActiveModal, closeModal, isModalOpen } =
  await import('~/composables/ui/useModal.js');
const { closeGameMenu, useGameMenu } = await import('~/composables/ui/useGameMenu.js');
const { default: GameMenu } = await import('../../../app/components/organisms/game/Menu.vue');
const { default: ConfirmModal } =
  await import('../../../app/components/organisms/modals/ConfirmModal.vue');
const { default: Header } = await import('../../../app/components/organisms/layout/Header.vue');

const ButtonStub = defineComponent({
  name: 'AButton',
  inheritAttrs: false,
  props: {
    variant: { type: String, default: '' },
    disabled: { type: Boolean, default: false },
  },
  emits: ['click'],
  setup(props, { slots, attrs, emit }) {
    return () =>
      h(
        'button',
        {
          ...attrs,
          'type': 'button',
          'data-variant': props.variant,
          'disabled': props.disabled,
          'onClick': () => emit('click'),
        },
        slots.default?.(),
      );
  },
});

const IconStub = defineComponent({
  name: 'Icon',
  props: { name: { type: String, default: '' } },
  setup(props) {
    return () => h('i', { 'data-icon': props.name });
  },
});

const stubs = { AButton: ButtonStub, Icon: IconStub, NuxtIcon: IconStub };

/** Экран партии в миниатюре: меню и окно подтверждения живут рядом и говорят через реестр. */
const Host = defineComponent({
  name: 'MenuHost',
  setup() {
    return () => h('div', [h(GameMenu), h(ConfirmModal)]);
  },
});

const panel = wrapper => wrapper.find('section[aria-label="Меню партии"]');

const itemButton = (wrapper, title) =>
  wrapper.findAll('button').find(node => node.text().trim().startsWith(title)) ?? null;

/** Кнопки окна подтверждения: оно уезжает `Teleport` в `body`, в обёртке его не видно. */
const dialogButton = title =>
  [...document.querySelectorAll('button')].find(node =>
    node.textContent?.trim().startsWith(title),
  ) ?? null;

const dialogText = () => document.body.textContent ?? '';

/** Клик по подложке окна: у подтверждения он значит «нет». */
const clickOverlay = async () => {
  const overlay = document.querySelector('[class*="backdrop-blur-8"]');
  overlay?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  await flushPromises();
};

const wrappers = [];

const mountHost = () => {
  const wrapper = mount(Host, { global: { stubs } });
  wrappers.push(wrapper);
  return wrapper;
};

const pressEscape = async () => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await nextTick();
};

/** Слой, который сам закрывается по Esc (увеличенная карта): он забирает Esc себе. */
const addEscapeLayer = () => {
  const layer = document.createElement('div');
  layer.dataset.escLayer = '';
  document.body.append(layer);
  return layer;
};

beforeEach(() => {
  closeAllModals();
  closeGameMenu();
  session.isGameOver.value = false;
  resign.mockClear();
  notify.mockClear();
  navigateTo.mockClear();
});

afterEach(() => {
  for (const wrapper of wrappers) wrapper.unmount();
  wrappers.length = 0;
  document.querySelectorAll('[data-esc-layer]').forEach(node => node.remove());
});

describe('Меню партии: как открывается', () => {
  it('Esc открывает меню, второй Esc закрывает', async () => {
    const wrapper = mountHost();

    expect(panel(wrapper).exists()).toBe(false);

    await pressEscape();
    expect(panel(wrapper).exists()).toBe(true);

    await pressEscape();
    expect(panel(wrapper).exists()).toBe(false);
  });

  it('в меню четыре пункта: сдаться, настройки, справка, выйти в лобби', async () => {
    const wrapper = mountHost();
    await pressEscape();

    expect(itemButton(wrapper, 'Сдаться')).not.toBeNull();
    expect(itemButton(wrapper, 'Настройки')).not.toBeNull();
    expect(itemButton(wrapper, 'Справка')).not.toBeNull();
    expect(itemButton(wrapper, 'Выйти в лобби')).not.toBeNull();
  });

  it('открытая модалка забирает Esc себе: меню не всплывает поверх неё', async () => {
    const wrapper = mountHost();
    addActiveModal('discard');

    await pressEscape();

    expect(panel(wrapper).exists()).toBe(false);
  });

  it('слой, закрывающийся по Esc (увеличенная карта), тоже забирает Esc себе', async () => {
    const wrapper = mountHost();
    const layer = addEscapeLayer();

    await pressEscape();

    expect(panel(wrapper).exists()).toBe(false);
    layer.remove();
  });

  it('клик мимо панели закрывает меню', async () => {
    const wrapper = mountHost();
    await pressEscape();
    expect(panel(wrapper).exists()).toBe(true);

    await wrapper.findComponent(GameMenu).trigger('click');

    expect(panel(wrapper).exists()).toBe(false);
  });
});

describe('Меню партии: настройки и заглушки', () => {
  it('«Настройки» открывают окно настроек и закрывают меню партии', async () => {
    const wrapper = mountHost();
    await pressEscape();

    await itemButton(wrapper, 'Настройки').trigger('click');

    expect(isModalOpen('settings')).toBe(true);
    expect(notify).not.toHaveBeenCalled();
    expect(panel(wrapper).exists()).toBe(false);

    closeModal('settings');
  });

  it('«Справка» ещё в разработке и закрывает меню', async () => {
    const wrapper = mountHost();
    await pressEscape();

    await itemButton(wrapper, 'Справка').trigger('click');

    expect(notify).toHaveBeenLastCalledWith(expect.stringContaining('Справка'));
    expect(panel(wrapper).exists()).toBe(false);
  });
});

describe('Меню партии: подтверждение модалкой', () => {
  it('«Сдаться» спрашивает окном и сдаётся только по подтверждению', async () => {
    const wrapper = mountHost();
    await pressEscape();

    await itemButton(wrapper, 'Сдаться').trigger('click');
    await flushPromises();

    expect(dialogText()).toContain('Партия для вас завершится');
    expect(resign).not.toHaveBeenCalled();
    // кнопка действия — та же акцентная (коралловая), что и у «Выйти»: «опасность» показывает вопрос, а не цвет
    expect(dialogButton('Сдаться')?.dataset.variant).toBe('primary');
    expect(dialogButton('Отмена')?.dataset.variant).toBe('secondary');

    dialogButton('Сдаться')?.click();
    await flushPromises();

    expect(resign).toHaveBeenCalledTimes(1);
    expect(dialogText()).not.toContain('Партия для вас завершится');
  });

  it('«Отмена» в окне сдачи никого не сдаёт', async () => {
    const wrapper = mountHost();
    await pressEscape();

    await itemButton(wrapper, 'Сдаться').trigger('click');
    await flushPromises();

    dialogButton('Отмена')?.click();
    await flushPromises();

    expect(resign).not.toHaveBeenCalled();
    expect(dialogText()).not.toContain('Партия для вас завершится');
  });

  it('«Выйти в лобби» спрашивает окном и уводит в лобби', async () => {
    const wrapper = mountHost();
    await pressEscape();

    await itemButton(wrapper, 'Выйти в лобби').trigger('click');
    await flushPromises();

    expect(dialogText()).toContain('останется только по своему адресу');
    expect(navigateTo).not.toHaveBeenCalled();
    expect(dialogButton('Выйти')?.dataset.variant).toBe('primary');

    dialogButton('Выйти')?.click();
    await flushPromises();

    expect(navigateTo).toHaveBeenCalledWith('/');
  });

  it('«Отмена» в окне выхода никуда не уводит', async () => {
    const wrapper = mountHost();
    await pressEscape();

    await itemButton(wrapper, 'Выйти в лобби').trigger('click');
    await flushPromises();

    dialogButton('Отмена')?.click();
    await flushPromises();

    expect(navigateTo).not.toHaveBeenCalled();
  });

  it('Esc в окне подтверждения — это отказ, и меню при этом не открывается', async () => {
    const wrapper = mountHost();
    await pressEscape();

    await itemButton(wrapper, 'Сдаться').trigger('click');
    await flushPromises();

    const dialog = document.querySelector('[role="dialog"]');
    dialog?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flushPromises();

    expect(resign).not.toHaveBeenCalled();
    expect(panel(wrapper).exists()).toBe(false);
  });

  it('клик по подложке — это отказ', async () => {
    const wrapper = mountHost();
    await pressEscape();

    await itemButton(wrapper, 'Сдаться').trigger('click');
    await flushPromises();
    expect(dialogText()).toContain('Партия для вас завершится');

    await clickOverlay();

    expect(resign).not.toHaveBeenCalled();
    expect(dialogText()).not.toContain('Партия для вас завершится');
  });

  it('в законченной партии «Сдаться» выключена', async () => {
    const wrapper = mountHost();
    session.isGameOver.value = true;
    await pressEscape();

    expect(itemButton(wrapper, 'Сдаться').attributes('disabled')).toBeDefined();
  });
});

describe('Меню партии: шестерёнка в шапке', () => {
  const mountHeader = (props = {}) => {
    const wrapper = mount(Header, {
      props,
      global: { stubs: { ...stubs, ProfileBar: true, NuxtLink: true } },
    });
    wrappers.push(wrapper);
    return wrapper;
  };

  it('на экране партии шестерёнка открывает меню', async () => {
    const wrapper = mountHeader({ menu: true });
    const gear = wrapper.find('[aria-label="Меню партии"]');

    expect(gear.exists()).toBe(true);

    await gear.trigger('click');

    expect(useGameMenu().open.value).toBe(true);
  });

  it('в лобби шестерёнки нет', () => {
    const wrapper = mountHeader();

    expect(wrapper.find('[aria-label="Меню партии"]').exists()).toBe(false);
  });
});
