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
const discardBonus = vi.fn();

vi.mock('~/composables/game/useGameSession.js', async () => {
  const { ref } = await import('vue');
  const session = {
    myHand: ref([
      { id: 'ferry', instanceId: 'c1', title: 'Переправа', type: 'attack', value: 3 },
      { id: 'sand', instanceId: 'c2', title: 'Песок', type: 'defense', value: 2 },
    ]),
    you: ref('medusa'),
    holderName: () => 'Игрок',
    isCardPlayable: () => true,
    onCardClick: play,
    // усиление перемещения: карту можно поднять и скинуть на сброс
    canDiscardBonus: ref(false),
    armedBonusCard: ref(null),
    armBonusCard: vi.fn(),
    onBonusDiscard: discardBonus,
  };
  return { useGameSession: () => session, session };
});

// Слайдеру нужны живые размеры и переходы: в тесте от него нужны только края, `update` и пауза.
vi.mock('~/composables/ui/useSwiper.js', async () => {
  const { ref } = await import('vue');
  return {
    useSwiper: () => ({
      containerRef: ref(null),
      slideNext: vi.fn(),
      slidePrev: vi.fn(),
      isFirstVisible: ref(true),
      isLastVisible: ref(true),
      update: vi.fn(),
      setEnabled: vi.fn(),
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
const { session } = await import('~/composables/game/useGameSession.js');
const { getCardDrag, endCardDrag } = await import('~/composables/ui/useCardDrag.js');

const wrappers = [];
const mountPanel = () => {
  const wrapper = mount(CardsPanel);
  wrappers.push(wrapper);
  return wrapper;
};

beforeEach(() => {
  play.mockClear();
  discardBonus.mockClear();
  session.canDiscardBonus.value = false;
  session.armedBonusCard.value = null;
  endCardDrag();
});

afterEach(() => {
  for (const wrapper of wrappers) wrapper.unmount();
  wrappers.length = 0;
});

const card = (wrapper, index) => wrapper.findAll('[data-testid="card"]')[index];
const slide = (wrapper, index) => wrapper.findAll('.swiper-slide')[index];
/**
 * Поднятая карта **просто встаёт выше** (`-translate-y-24`), без покачивания: оно читалось как дрожь
 * и подрезало карту о край слайдера. Сдвиг на наведении (`-translate-y-8`) остался у наведения.
 */
const raised = (wrapper, index) => slide(wrapper, index).classes().includes('-translate-y-24');

/** Клик мимо руки: цель — `body`, то есть «любое место экрана игры». */
const clickOutside = async () => {
  document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await nextTick();
};

const zoomOverlay = () => document.querySelector('div.cursor-zoom-out');

/**
 * Ширина панели — по фактическим картам, а не по свободному месту экрана. Потолка ширины у панели нет:
 * карты руки идут внахлёст (слайд уже карты, как `w-110` против `w-200` в `Card.vue`), и панель садится
 * по ним; обрезки справа быть не должно.
 */
describe('Панель руки: ширина по картам', () => {
  it('панель по содержимому, без растяжения и без потолка ширины', () => {
    const wrapper = mountPanel();
    const section = wrapper.find('section');
    const swiper = wrapper.find('.swiper');

    expect(section.classes()).toContain('w-fit');
    expect(section.classes()).not.toContain('flex-1');
    expect(swiper.attributes('style')).toBeUndefined();
  });

  it('слайд остаётся узким: карты руки идут внахлёст', () => {
    const wrapper = mountPanel();
    const slide = wrapper.find('.swiper-slide');

    expect(slide.classes()).toContain('w-110');
    expect(slide.classes()).toContain('shrink-0');
  });
});

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

/**
 * Усиление перемещения: карту с усилением поднимают (клик) и уводят в сброс — вторым кликом по сбросу
 * или перетаскиванием. Перетаскивание ловится указателем: тащим вниз-вверх, вбок руку листает Swiper.
 */
describe('Панель руки: сброс карты на усиление перемещения', () => {
  const pointer = (type, x, y) => {
    const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
    Object.defineProperty(event, 'button', { value: 0 });
    return event;
  };

  const dragCard = async (wrapper, index, { dx = 0, dy = 120 } = {}) => {
    const node = card(wrapper, index).element;
    node.dispatchEvent(pointer('pointerdown', 100, 500));
    window.dispatchEvent(pointer('pointermove', 100 + dx, 500 + dy));
    await nextTick();
    return { node };
  };

  it('клик по карте с усилением поднимает её и зажигает сброс', async () => {
    session.canDiscardBonus.value = true;
    const wrapper = mountPanel();

    await card(wrapper, 0).trigger('click');

    expect(session.armBonusCard).toHaveBeenCalledWith(
      expect.objectContaining({ instanceId: 'c1' }),
    );
    expect(play).not.toHaveBeenCalled();
  });

  it('перетаскивание вниз поднимает карту и едет за курсором', async () => {
    session.canDiscardBonus.value = true;
    const wrapper = mountPanel();

    await dragCard(wrapper, 0);

    expect(getCardDrag().active).toBe(true);
    expect(getCardDrag().key).toBe('c1');
    expect(getCardDrag().y).toBe(620);
    endCardDrag();
  });

  it('перетаскивание вбок не начинается: руку листает Swiper', async () => {
    session.canDiscardBonus.value = true;
    const wrapper = mountPanel();

    await dragCard(wrapper, 0, { dx: 90, dy: 8 });

    expect(getCardDrag().active).toBe(false);
    endCardDrag();
  });

  it('отпускание карты над сбросом скидывает её, а не разыгрывает', async () => {
    session.canDiscardBonus.value = true;
    session.armedBonusCard.value = { instanceId: 'c1', id: 'ferry' };
    const wrapper = mountPanel();

    await dragCard(wrapper, 0);
    document.body.dataset.drop = 'discard';
    const target = document.createElement('div');
    target.dataset.drop = 'discard';
    Object.defineProperty(target, 'closest', { value: () => target });
    const point = vi.spyOn(document, 'elementFromPoint').mockReturnValue(target);
    window.dispatchEvent(pointer('pointermove', 100, 620));
    await nextTick();
    window.dispatchEvent(pointer('pointerup', 100, 620));
    await nextTick();

    expect(discardBonus).toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();

    point.mockRestore();
    delete document.body.dataset.drop;
  });

  it('отпускание карты мимо сброса возвращает её на место', async () => {
    session.canDiscardBonus.value = true;
    const wrapper = mountPanel();

    await dragCard(wrapper, 0);
    window.dispatchEvent(pointer('pointerup', 100, 620));
    await nextTick();

    expect(discardBonus).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
    expect(raised(wrapper, 0)).toBe(false);
  });
});
