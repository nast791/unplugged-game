// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
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
 * Выдвинутая карта — одна на руку, и она возвращается на место, как только игрок занялся чем-то другим:
 * клик в любое место экрана, кроме самой карты, снимает выдвижение, а закрытая деталка (ПКМ) возвращает
 * карту в исходное состояние. Правило принадлежит панели руки, поэтому проверяется здесь, а не на экране.
 *
 * `CardsPanel.vue` — SFC приложения: `ref`/`computed`/`watch`/`onMounted` приходят автоимпортами Nuxt,
 * в тесте кладём их в `globalThis` до импорта компонента (так же, как `board-clicks.test.js`).
 */
globalThis.ref = ref;
globalThis.computed = computed;
globalThis.watch = watch;
globalThis.nextTick = nextTick;
globalThis.onMounted = onMounted;
globalThis.onBeforeUnmount = onBeforeUnmount;

const play = vi.fn();

vi.mock('~/composables/useGameSession.js', async () => {
  const { ref } = await import('vue');
  return {
    useGameSession: () => ({
      myHand: ref([
        { id: 'ferry', instanceId: 'c1', title: 'Переправа', type: 'attack', value: 3 },
        { id: 'sand', instanceId: 'c2', title: 'Песок', type: 'defense', value: 2 },
      ]),
      isCardPlayable: () => true,
      onCardClick: play,
    }),
  };
});

// Слайдеру нужны живые размеры и переходы: в тесте от него нужны только края и `update`.
vi.mock('~/composables/useSwiper.js', async () => {
  const { ref } = await import('vue');
  return {
    useSwiper: () => ({
      containerRef: ref(null),
      slideNext: vi.fn(),
      slidePrev: vi.fn(),
      isFirstVisible: ref(true),
      isLastVisible: ref(true),
      update: vi.fn(),
    }),
  };
});

vi.mock('~/components/atoms/ATooltip.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'ATooltip',
      props: { text: { type: String, default: '' } },
      setup(_props, { slots }) {
        return () => h('div', slots.default?.());
      },
    }),
  };
});

vi.mock('~/components/atoms/AArrowButton.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'AArrowButton',
      setup: () => () => h('button', { type: 'button' }),
    }),
  };
});

// Карта — только площадка для кликов: разметку `Card.vue` рисует свой тест, здесь важно, куда попал клик.
vi.mock('~/components/molecules/game/Card.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'Card',
      props: {
        card: { type: Object, required: true },
        disabled: { type: Boolean, default: false },
      },
      setup(props) {
        return () => h('div', { 'data-testid': 'card', 'data-card': props.card.instanceId });
      },
    }),
  };
});

const { default: CardsPanel } =
  await import('../../../app/components/organisms/game/CardsPanel.vue');

const wrappers = [];
const mountPanel = () => {
  const wrapper = mount(CardsPanel);
  wrappers.push(wrapper);
  return wrapper;
};

beforeEach(() => play.mockClear());

afterEach(() => {
  for (const wrapper of wrappers) wrapper.unmount();
  wrappers.length = 0;
});

const card = (wrapper, index) => wrapper.findAll('[data-testid="card"]')[index];
const slide = (wrapper, index) => wrapper.findAll('.swiper-slide')[index];
const raised = (wrapper, index) => slide(wrapper, index).classes().includes('-translate-y-24');

/** Клик мимо руки: цель — `body`, то есть «любое место экрана игры». */
const clickOutside = async () => {
  document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await nextTick();
};

const zoomOverlay = () => document.querySelector('div.cursor-zoom-out');

describe('Панель руки: выдвинутая карта', () => {
  it('ЛКМ выдвигает карту, а не разыгрывает её', async () => {
    const wrapper = mountPanel();

    await card(wrapper, 0).trigger('click');

    expect(raised(wrapper, 0)).toBe(true);
    expect(raised(wrapper, 1)).toBe(false);
    expect(play).not.toHaveBeenCalled();
  });

  it('вторая ЛКМ по выдвинутой карте разыгрывает её', async () => {
    const wrapper = mountPanel();

    await card(wrapper, 0).trigger('click');
    await card(wrapper, 0).trigger('click');

    expect(play).toHaveBeenCalledTimes(1);
    expect(play.mock.calls[0][0].instanceId).toBe('c1');
  });

  it('клик в любое место экрана возвращает карту на место', async () => {
    const wrapper = mountPanel();
    await card(wrapper, 0).trigger('click');

    await clickOutside();

    expect(raised(wrapper, 0)).toBe(false);
  });

  it('клик по другой карте выдвигает её, а прежняя возвращается', async () => {
    const wrapper = mountPanel();
    await card(wrapper, 0).trigger('click');

    await card(wrapper, 1).trigger('click');

    expect(raised(wrapper, 1)).toBe(true);
    expect(raised(wrapper, 0)).toBe(false);
  });
});

describe('Панель руки: деталка карты', () => {
  it('ПКМ открывает увеличенную карту, а закрытие возвращает её в исходное состояние', async () => {
    const wrapper = mountPanel();
    await card(wrapper, 0).trigger('click');
    expect(raised(wrapper, 0)).toBe(true);

    await card(wrapper, 0).trigger('contextmenu');
    const overlay = zoomOverlay();
    expect(overlay).not.toBeNull();

    overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();

    expect(zoomOverlay()).toBeNull();
    expect(raised(wrapper, 0)).toBe(false);
  });

  it('пока деталка открыта, карта остаётся выдвинутой', async () => {
    const wrapper = mountPanel();
    await card(wrapper, 1).trigger('click');

    await card(wrapper, 1).trigger('contextmenu');
    await nextTick();

    expect(zoomOverlay()).not.toBeNull();
    expect(raised(wrapper, 1)).toBe(true);
  });
});
