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
const you = ref('0');

vi.mock('~/composables/game/useGameSession.js', () => ({
  useGameSession: () => ({ myHand: hand, you }),
}));

const {
  drawPath,
  deckStartScale,
  flipFrame,
  flightFrame,
  flightTarget,
  runCardFlight,
  useCardFlights,
} = await import('../../../app/composables/animations/useCardFlights.js');
const { CARD_FLIGHT, scaledDuration } = await import('../../../app/constants/animation.js');

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
  you.value = '0';
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
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

  it('целится не в саму ладонь, а в точку над ней: последний отрезок идёт сверху вниз', () => {
    const from = { x: 0, y: 700, width: 115, height: 160 };
    const to = rect(900, 700);
    const { target, approach } = drawPath(from, to);

    expect(target).toEqual(flightTarget(from, to));
    expect(approach.x).toBe(target.x);
    expect(approach.y).toBeCloseTo(target.y - CARD_FLIGHT.drop, 5);
    expect(approach.y).toBeLessThan(target.y);
  });

  it('у верхнего края экрана не уводит карту за кадр', () => {
    const { target, approach } = drawPath(
      { x: 0, y: 0, width: 115, height: 160 },
      {
        ...rect(900, 10),
        height: 295,
      },
    );

    expect(approach.y).toBeGreaterThanOrEqual(0);
    expect(approach.y).toBeLessThan(target.y);
  });
});

describe('Переворот карты на колоде', () => {
  it('первую половину видна рубашка, вторую — лицо', () => {
    expect(flipFrame(0)).toMatchObject({ scaleX: 1, back: true, face: false, lift: 0 });
    expect(flipFrame(0.25).back).toBe(true);
    expect(flipFrame(0.25).scaleX).toBeCloseTo(Math.SQRT1_2, 5);
    expect(flipFrame(0.5)).toMatchObject({ back: false, face: true });
    expect(flipFrame(0.5).scaleX).toBeCloseTo(0, 6);
    expect(flipFrame(0.5).lift).toBeCloseTo(CARD_FLIGHT.flipLift, 5);
    expect(flipFrame(1)).toMatchObject({ back: false, face: true });
    expect(flipFrame(1).scaleX).toBeCloseTo(1, 6);
    expect(flipFrame(1).lift).toBeCloseTo(0, 6);
  });

  it('значения вне 0…1 прижимаются к краям', () => {
    expect(flipFrame(-3)).toMatchObject({ back: true });
    expect(flipFrame(-3).scaleX).toBeCloseTo(1, 6);
    expect(flipFrame(4)).toMatchObject({ face: true });
    expect(flipFrame(4).scaleX).toBeCloseTo(1, 6);
    expect(flipFrame(4).lift).toBeCloseTo(0, 6);
  });

  it('добор идёт за переворот и полёт, а настройка скорости растягивает каждый отрезок', () => {
    expect(CARD_FLIGHT.drop).toBeGreaterThan(0);
    expect(scaledDuration('cardFlip', 'slow')).toBeGreaterThan(scaledDuration('cardFlip', 'fast'));
    expect(scaledDuration('cardDrop', 'fast')).toBeLessThan(scaledDuration('cardDrop', 'medium'));
  });

  it('переворот начинается размером с колоду и заканчивается размером карты', () => {
    const scale = deckStartScale({
      from: { width: 115, height: 160 },
      to: { width: 200, height: 295 },
    });

    expect(scale).toBeCloseTo(160 / 295, 5);
  });
});

describe('Пролёт карты: кадры', () => {
  const pilotOf = () => {
    const pilot = document.createElement('div');
    const face = document.createElement('div');
    face.dataset.flightCard = '';
    const back = document.createElement('div');
    back.dataset.flightBack = '';
    pilot.append(face, back);
    document.body.append(pilot);
    return pilot;
  };

  const flightOf = () => ({
    flip: true,
    from: { x: 100, y: 400, width: 115, height: 160 },
    to: { x: 700, y: 500, width: 200, height: 295 },
    markup: '<div>card</div>',
  });

  /** Кадры раздаём вручную: время — наша переменная, `requestAnimationFrame` — очередь. */
  const frames = () => {
    const queue = [];
    const now = ref(0);
    vi.stubGlobal('performance', { now: () => now.value });
    vi.stubGlobal('requestAnimationFrame', fn => {
      queue.push(fn);
      return queue.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    return {
      start: (onDone, timings = { flip: 100, travel: 200, drop: 100 }) => {
        const pilot = pilotOf();
        runCardFlight({ pilot, flight: flightOf(), timings, onDone });
        return pilot;
      },
      at: moments => {
        for (const moment of moments) {
          now.value = moment;
          queue.shift()?.(moment);
        }
      },
    };
  };

  it('на колоде показывает рубашку, после переворота — лицо, в конце отпускает карту', () => {
    const onDone = vi.fn();
    const clock = frames();
    const pilot = clock.start(onDone);
    const back = pilot.querySelector('[data-flight-back]');
    const face = pilot.querySelector('[data-flight-card]');

    clock.at([0]);
    expect(back.style.display).toBe('');
    expect(face.style.display).toBe('none');

    clock.at([40]);
    expect(back.style.display).toBe('');
    expect(back.style.transform).not.toBe('scaleX(1)');

    clock.at([120, 320, 400]);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(back.style.display).toBe('none');
    expect(face.style.display).toBe('');
    expect(pilot.style.opacity).toBe('0.85');
  });

  it('без переворота (карта уходит в сброс) сразу показывает лицо', () => {
    const clock = frames();
    const pilot = pilotOf();
    runCardFlight({
      pilot,
      flight: { ...flightOf(), flip: false },
      timings: { flip: 100, travel: 200, drop: 100 },
    });

    clock.at([10]);

    expect(pilot.querySelector('[data-flight-back]').style.display).toBe('none');
    expect(pilot.querySelector('[data-flight-card]').style.display).toBe('');
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
    expect(toHand.flip).toBe(true);
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
    expect(toDiscard.flip).toBe(false);
    expect(toDiscard.to.x).toBe(900);
    expect(toDiscard.from.x).toBe(900);

    wrapper.unmount();
  });

  it('настройки полёта растянуты: переворот, полёт и падение — отдельные отрезки', async () => {
    const { wrapper, api } = mountFlights();
    const timings = api().flightTimings();

    expect(Object.keys(timings).sort()).toEqual(['drop', 'flip', 'travel']);
    expect(timings.travel).toBeGreaterThan(timings.flip);

    wrapper.unmount();
  });
});
