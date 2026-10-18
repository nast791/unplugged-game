// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h, nextTick, ref } from 'vue';

/**
 * Перелёты карт: траектория считается здесь, а не в разметке, поэтому и проверяется числами — старт,
 * финиш, дуга и точка посадки. Сам слой (`CardFlights.vue`) только рисует то, что дал композабл.
 *
 * Композабл ловит перелёт по разнице руки: карта появилась — летела из колоды, пропала — улетела в сброс.
 * Позиции берутся у зон на экране (`[data-card-anchor]`), поэтому в тесте подставляем им `getBoundingClientRect`.
 */
globalThis.computed = computed;

const hand = ref([]);

vi.mock('~/composables/game/useGameSession.js', () => ({
  useGameSession: () => ({ myHand: hand }),
}));

const { flightFrame, flightTarget, useCardFlights } =
  await import('../../../app/composables/animations/useCardFlights.js');

const rect = (left, top, width = 115, height = 160) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

/** Подменяем экран: у зон — свои прямоугольники, у карты в руке — свой и её разметка для клона. */
const stubScreen = ({ deck, discard, cards = {} }) => {
  vi.spyOn(document, 'querySelector').mockImplementation(selector => {
    if (selector === '[data-card-anchor="deck"]' && deck) {
      return { getBoundingClientRect: () => deck };
    }
    if (selector === '[data-card-anchor="discard"]' && discard) {
      return { getBoundingClientRect: () => discard };
    }
    const match = /data-card-key="([^"]+)"/.exec(selector);
    if (match && cards[match[1]]) {
      return { getBoundingClientRect: () => cards[match[1]], outerHTML: `<div>${match[1]}</div>` };
    }
    return null;
  });
};

/** Композабл ставит снимок экрана в `onMounted`, поэтому живёт он внутри настоящего компонента. */
const mountFlights = () => {
  let api = null;
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useCardFlights();
        return () => h('div');
      },
    }),
  );
  return { wrapper, api: () => api };
};

beforeEach(() => {
  hand.value = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Полёт карты: траектория', () => {
  const from = { x: 100, y: 400 };
  const to = { x: 700, y: 500 };

  it('начинается в точке взлёта и заканчивается в точке посадки', () => {
    const start = flightFrame(from, to, 0);
    const finish = flightFrame(from, to, 1);

    expect(start.x).toBeCloseTo(100, 1);
    expect(start.y).toBeCloseTo(400, 1);
    expect(finish.x).toBeCloseTo(700, 1);
    expect(finish.y).toBeCloseTo(500, 1);
    expect(finish.opacity).toBeLessThan(1);
  });

  it('идёт дугой: середина пути выше прямой', () => {
    const lifted = flightFrame(from, to, 0.5, { lift: 40 });
    const straight = flightFrame(from, to, 0.5);

    expect(lifted.y).toBeLessThan(straight.y);
  });

  it('боковой снос уводит карту в сторону, но финиш остаётся на месте', () => {
    const bent = flightFrame(from, to, 0.25, { arc: 60 });
    const straight = flightFrame(from, to, 0.25);

    expect(bent.x).toBeGreaterThan(straight.x);
    expect(flightFrame(from, to, 1, { arc: 60 }).x).toBeCloseTo(700, 1);
  });
});

describe('Полёт карты: точка посадки', () => {
  it('центрует клон по цели, если он другого размера', () => {
    const target = flightTarget({ width: 200, height: 295 }, rect(700, 500));

    expect(target.x).toBeCloseTo(700 + (115 - 200) / 2, 1);
    expect(target.y).toBeCloseTo(500 + (160 - 295) / 2, 1);
  });
});

describe('Перелёты: разница руки', () => {
  it('новая карта в руке летит от колоды, пропавшая — в сброс', async () => {
    stubScreen({
      deck: rect(0, 700),
      discard: rect(900, 700),
      cards: { c2: rect(400, 600) },
    });

    // рука уже непустая к моменту монтажа: снимок экрана снимается один раз, на монте
    hand.value = [{ instanceId: 'c1', id: 'a' }];
    const { wrapper, api } = mountFlights();
    await nextTick();
    await flushPromises();
    expect(api().flights.value).toEqual([]);

    // добор: в руке появилась вторая карта — она летит от колоды к своему месту
    hand.value = [
      { instanceId: 'c1', id: 'a' },
      { instanceId: 'c2', id: 'b' },
    ];
    await nextTick();
    await flushPromises();

    const toHand = api().flights.value.find(flight => flight.card.instanceId === 'c2');
    expect(toHand).toBeTruthy();
    expect(toHand.from.x).toBe(0);
    expect(toHand.to.x).toBe(400);
    expect(toHand.markup).toContain('c2');

    // сброс: карта ушла из руки — летит к сбросу
    api().flights.value = [];
    hand.value = [{ instanceId: 'c1', id: 'a' }];
    await nextTick();
    await flushPromises();

    const toDiscard = api().flights.value.find(flight => flight.card.instanceId === 'c2');
    expect(toDiscard).toBeTruthy();
    expect(toDiscard.to.x).toBe(900);
    expect(toDiscard.from.x).toBe(900);

    wrapper.unmount();
  });
});
