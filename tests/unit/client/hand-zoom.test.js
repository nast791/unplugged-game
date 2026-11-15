// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

/**
 * Карты руки живут в трёх режимах: веер на столе, окно стопки и подробный вид по правому клику.
 * Подробный вид — та же карта крупно, без панели полного текста: текст живёт на самой карте, а под ней
 * стоят листание по кругу, число карт в руке и кнопка розыгрыша. Наведение на карту веера поднимает её,
 * а первый левый клик сразу разыгрывает карту.
 */
globalThis.ref = ref;
globalThis.computed = computed;
globalThis.watch = watch;
globalThis.nextTick = nextTick;
globalThis.onMounted = onMounted;
globalThis.onBeforeUnmount = onBeforeUnmount;

const cards = vi.hoisted(() => [
  { instanceId: 'card-1', id: 'anubis_01', title: 'Погребальный звон', text: 'Нанесите 2 урона.' },
  { instanceId: 'card-2', id: 'anubis_02', title: 'Суд молчит', text: 'Возьмите карту.' },
]);

const session = vi.hoisted(() => ({}));

vi.mock('~/composables/game/useGameSession.js', async () => {
  const { ref } = await import('vue');
  Object.assign(session, {
    myHand: ref(cards),
    isCardPlayable: vi.fn(() => true),
    onCardClick: vi.fn(),
    canDiscardBonus: ref(false),
    armBonusCard: vi.fn(),
    onBonusDiscard: vi.fn(),
  });
  return { useGameSession: () => session };
});

vi.mock('~/composables/ui/useCardDrag.js', async () => {
  const { ref } = await import('vue');
  return {
    useCardDrag: () => ({
      drag: ref({ active: false, key: '' }),
      over: ref(''),
      startCardDrag: vi.fn(),
      moveCardDrag: vi.fn(),
      setCardDragOver: vi.fn(),
      endCardDrag: vi.fn(),
    }),
  };
});

// Кнопка подробного вида тянет конфиг приложения (`useUI` → `useAppConfig`), которого в тесте нет.
vi.mock('~/composables/ui/useUI', async importOriginal => {
  const actual = await importOriginal();
  const { computed } = await import('vue');
  return { ...actual, useUI: () => ({ styles: computed(() => ({})) }) };
});

vi.mock('~/components/atoms/ATooltip.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'ATooltip',
      props: { text: { type: String, default: '' } },
      setup(props, { slots }) {
        return () => h('div', { 'data-tooltip-trigger': '' }, slots.default?.());
      },
    }),
  };
});

vi.mock('~/components/molecules/game/Card.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'Card',
      inheritAttrs: false,
      props: {
        card: { type: Object, default: null },
        mode: { type: String, default: 'hand' },
      },
      setup(props, { attrs }) {
        return () =>
          h(
            'div',
            { ...attrs, 'data-card-mode': props.mode },
            h('p', { 'data-card-body': '' }, props.card?.text ?? ''),
          );
      },
    }),
  };
});

const HandFan = (await import('~/components/organisms/game/HandFan.vue')).default;

const click = element => element.dispatchEvent(new MouseEvent('click', { bubbles: true }));

const openDetail = async wrapper => {
  await wrapper.find('[data-hand-card]').trigger('contextmenu');
  await nextTick();
};

const detailCard = () => document.querySelector('[data-zoom-card]');
const layer = () => document.querySelector('[data-esc-layer]');

describe('карты руки: веер и подробный вид', () => {
  let wrapper = null;

  beforeEach(() => {
    session.myHand.value = cards;
    session.isCardPlayable.mockReturnValue(true);
    session.onCardClick.mockClear();
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
  });

  const mountHandFan = () => {
    wrapper = mount(HandFan, {
      attachTo: document.body,
      global: { stubs: { NuxtIcon: true } },
    });
    return wrapper;
  };

  it('поднимает карту при наведении без нажатий', async () => {
    const fan = mountHandFan();
    const slot = () => fan.find('[data-hand-slot="card-1"] > div');

    expect(slot().classes()).not.toContain('-translate-y-140');

    await fan.find('[data-hand-slot="card-1"]').trigger('mouseenter');
    expect(slot().classes()).toContain('-translate-y-140');

    await fan.find('[data-hand-slot="card-1"]').trigger('mouseleave');
    expect(slot().classes()).not.toContain('-translate-y-140');
  });

  it('разыгрывает карту первым левым кликом, без лишнего выдвижения', async () => {
    const fan = mountHandFan();
    click(fan.find('[data-hand-card]').element);
    await nextTick();

    expect(session.onCardClick).toHaveBeenCalledWith(cards[0]);
  });

  it('не разыгрывает задизейбленную карту левым кликом', async () => {
    session.isCardPlayable.mockReturnValue(false);
    const fan = mountHandFan();
    click(fan.find('[data-hand-card]').element);
    await nextTick();

    expect(session.onCardClick).not.toHaveBeenCalled();
  });

  it('открывает карту правым кликом и закрывает кликом вне её', async () => {
    const fan = mountHandFan();
    await openDetail(fan);

    expect(detailCard()).toBeTruthy();
    expect(detailCard()?.textContent).toContain('Нанесите 2 урона.');

    click(layer());
    await nextTick();

    expect(detailCard()).toBeNull();
  });

  it('держит окно открытым, когда кликают по самой карте: текст листают точечно', async () => {
    const fan = mountHandFan();
    await openDetail(fan);

    click(document.querySelector('[data-card-body]'));
    await nextTick();

    expect(detailCard()).toBeTruthy();
  });

  it('показывает карту в режиме «подробно» без панели полного текста', async () => {
    const fan = mountHandFan();
    await openDetail(fan);

    expect(detailCard().querySelector('[data-card-mode]')?.getAttribute('data-card-mode')).toBe(
      'detail',
    );
    expect(document.querySelector('[data-zoom-text]')).toBeNull();
  });

  it('листает карты из руки по кругу, не переключая фон', async () => {
    const fan = mountHandFan();
    await openDetail(fan);
    const background = layer();

    expect(detailCard()?.textContent).toContain('Нанесите 2 урона.');
    expect(document.querySelector('[data-detail-count]')?.textContent).toContain('2');

    click(document.querySelector('[data-detail-next]'));
    await nextTick();
    expect(detailCard()?.textContent).toContain('Возьмите карту.');

    click(document.querySelector('[data-detail-next]'));
    await nextTick();
    expect(detailCard()?.textContent).toContain('Нанесите 2 урона.');

    click(document.querySelector('[data-detail-prev]'));
    await nextTick();
    expect(detailCard()?.textContent).toContain('Возьмите карту.');

    expect(layer()).toBe(background);
    expect(detailCard()).toBeTruthy();
  });

  it('не пересоздаёт карту при перелистывании — режим глаза переезжает на следующую', async () => {
    const fan = mountHandFan();
    await openDetail(fan);

    const box = document.querySelector('[data-zoom-card]');
    const before = box.firstElementChild;

    click(document.querySelector('[data-detail-next]'));
    await nextTick();

    expect(box.firstElementChild).toBe(before);
  });

  it('гасит стрелки, когда в руке одна карта', async () => {
    session.myHand.value = [cards[0]];
    const fan = mountHandFan();
    await openDetail(fan);

    expect(document.querySelector('[data-detail-prev]').disabled).toBe(true);
    expect(document.querySelector('[data-detail-next]').disabled).toBe(true);
  });

  it('разыгрывает карту кнопкой', async () => {
    const fan = mountHandFan();
    await openDetail(fan);

    click(document.querySelector('[data-detail-play]'));
    await nextTick();

    expect(session.onCardClick).toHaveBeenCalledWith(cards[0]);
  });

  it('гасит кнопку розыгрыша у задизейбленной карты', async () => {
    session.isCardPlayable.mockReturnValue(false);
    const fan = mountHandFan();
    await openDetail(fan);

    expect(document.querySelector('[data-detail-play]').disabled).toBe(true);
  });

  it('закрывает окно правым кликом вне карты и не закрывает им внутри карты', async () => {
    const fan = mountHandFan();
    await openDetail(fan);

    document
      .querySelector('[data-card-body]')
      .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await nextTick();
    expect(detailCard()).toBeTruthy();

    layer().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await nextTick();
    expect(detailCard()).toBeNull();
  });
});
