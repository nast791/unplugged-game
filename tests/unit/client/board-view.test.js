// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
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
 * Вид поля: `useBoardView` держит масштаб и сдвиг, а организм доски только рисует и передаёт жесты.
 * Проверяем две вещи: арифметику вида (вписанное поле, зум вокруг курсора, пределы, сдвиг не теряет
 * поле) и то, что доска эти жесты действительно отдаёт — колесо мыши и перетаскивание сцены.
 *
 * Вписывание оставляет запас по краям: `fitPad` — тот же отступ, что у панелей (`p-12`), поэтому карта
 * занимает поле целиком, а панели лежат поверх неё.
 *
 * `Board.vue`/`useBoardView.js` — код приложения: `computed`, `ref`, `watch`, `onMounted`,
 * `onBeforeUnmount` приходят автоимпортами Nuxt, в тесте кладём их в `globalThis` до импорта.
 * Состояние партии доска читает сама (`useGameSession`), поэтому сессию подменяем — карта нужна
 * только чтобы поле было непустым, а проп у доски остался один: `interactive`.
 */
globalThis.computed = computed;
globalThis.ref = ref;
globalThis.watch = watch;
globalThis.onMounted = onMounted;
globalThis.onBeforeUnmount = onBeforeUnmount;

vi.mock('~/composables/game/useGameSession.js', async () => {
  const { ref } = await import('vue');
  const session = {
    view: ref({ map: null }),
    players: ref([]),
    selectedFighterId: ref(null),
    highlightedCellIds: ref([]),
    highlightedFighterIds: ref([]),
    framedFighterIds: ref([]),
    placementCells: ref([]),
  };
  return { useGameSession: () => session, session };
});

const { session } = await import('~/composables/game/useGameSession.js');
const { useBoardView, FIT_PAD } = await import('~/composables/ui/useBoardView.js');
const { default: Board } = await import('../../../app/components/organisms/game/Board.vue');

const SIZE = { width: 800, height: 600 };
const BOUNDS = { minX: 100, minY: 50, maxX: 1100, maxY: 550 };

const makeView = (size = SIZE, bounds = BOUNDS, fitPad = null) => {
  const sizeRef = ref({ ...size });
  const boundsRef = ref({ ...bounds });
  return {
    size: sizeRef,
    bounds: boundsRef,
    view: useBoardView({ size: sizeRef, bounds: boundsRef, fitPad }),
  };
};

/** Вписанный вид по той же формуле, что у `useBoardView`: запас по краям и центрирование карты. */
const fitOf = (size, bounds, pad = 0) => {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const area = {
    width: Math.max(size.width - pad * 2, 1),
    height: Math.max(size.height - pad * 2, 1),
  };
  const scale = Math.min(area.width / width, area.height / height, 4);
  return {
    scale,
    x: pad + (area.width - width * scale) / 2 - bounds.minX * scale,
    y: pad + (area.height - height * scale) / 2 - bounds.minY * scale,
  };
};

const FIELD = fitOf(SIZE, BOUNDS);

const configOf = view => view.stageConfig.value;

describe('useBoardView: вписанное поле', () => {
  it('поле вписано в контейнер и отцентровано', () => {
    const { view } = makeView();
    const config = configOf(view);

    expect(config.scaleX).toBeCloseTo(FIELD.scale);
    expect(config.x).toBeCloseTo(FIELD.x);
    expect(config.y).toBeCloseTo(FIELD.y);
    expect(config.width).toBe(800);
    expect(config.height).toBe(600);
    expect(config.draggable).toBe(true);
    expect(view.isFitted.value).toBe(true);
  });

  it('отступ вписывания задаётся снаружи: поле отдаёт его в единицах сетки', () => {
    const { view } = makeView(SIZE, BOUNDS, 12);
    const expected = fitOf(SIZE, BOUNDS, 12);

    expect(configOf(view).scaleX).toBeCloseTo(expected.scale);
    expect(configOf(view).x).toBeCloseTo(expected.x);
    expect(configOf(view).y).toBeCloseTo(expected.y);
  });

  it('пересчитывается при смене размера, пока вид не трогали', () => {
    const { size, view } = makeView();
    size.value = { width: 400, height: 300 };

    expect(configOf(view).scaleX).toBeCloseTo(Math.min(400 / 1000, 300 / 500));
    expect(view.isFitted.value).toBe(true);
  });
});

describe('useBoardView: масштаб', () => {
  it('колесо приближает вокруг курсора: точка под ним не уезжает', () => {
    const { view } = makeView();
    const point = { x: 400, y: 300 };
    const before = { scale: configOf(view).scaleX, x: configOf(view).x };
    const contentBefore = (point.x - before.x) / before.scale;

    view.zoomIn(point);
    const after = configOf(view);

    expect(after.scaleX).toBeGreaterThan(before.scale);
    expect((point.x - after.x) / after.scaleX).toBeCloseTo(contentBefore);
    expect(view.isFitted.value).toBe(false);
  });

  it('масштаб ограничен сверху 5×, а снизу — половиной вписанного', () => {
    const { view } = makeView();
    const fit = configOf(view).scaleX;

    for (let i = 0; i < 60; i += 1) view.zoomIn({ x: 400, y: 300 });
    expect(configOf(view).scaleX).toBeCloseTo(fit * 5);

    for (let i = 0; i < 60; i += 1) view.zoomOut({ x: 400, y: 300 });
    expect(configOf(view).scaleX).toBeCloseTo(fit * 0.5);
  });

  it('от вписанного вида колесо вниз уменьшает поле, а не игнорируется', () => {
    const { view } = makeView();
    const fit = configOf(view).scaleX;

    view.zoomOut({ x: 400, y: 300 });

    expect(configOf(view).scaleX).toBeLessThan(fit);
    expect(view.isFitted.value).toBe(false);
  });

  it('зум без точки — это просто масштаб, вид всё равно считается тронутым', () => {
    const { view } = makeView();
    view.zoomIn(null);

    expect(configOf(view).scaleX).toBeGreaterThan(FIELD.scale);
    expect(view.isFitted.value).toBe(false);
  });
});

describe('useBoardView: сдвиг поля', () => {
  it('перетаскивание сцены задаёт сдвиг, но не уводит поле за край', () => {
    const { view } = makeView();
    view.zoomIn({ x: 400, y: 300 });

    const node = { x: () => 99999, y: () => 99999, scaleX: () => configOf(view).scaleX };
    view.onDragMove({ target: node });

    const config = configOf(view);
    expect(config.x).toBeLessThan(99999);
    expect(BOUNDS.maxX * config.scaleX + config.x).toBeGreaterThanOrEqual(95);
    expect(node.position).toBeUndefined();
  });

  it('сцена получает выправленную позицию обратно', () => {
    const { view } = makeView();
    let position = null;
    const node = {
      x: () => -99999,
      y: () => -99999,
      scaleX: () => configOf(view).scaleX,
      position: next => {
        position = next;
      },
    };

    view.onDragMove({ target: node });

    expect(position).toEqual({ x: configOf(view).x, y: configOf(view).y });
    expect(BOUNDS.minX * configOf(view).scaleX + position.x).toBeLessThanOrEqual(800 - 95);
  });

  it('сброс возвращает вписанный вид', () => {
    const { view } = makeView();
    view.zoomIn({ x: 10, y: 10 });
    view.onDragMove({ target: { x: () => 400, y: () => 400, scaleX: () => 1.2 } });

    view.reset();

    expect(view.isFitted.value).toBe(true);
    expect(configOf(view).scaleX).toBeCloseTo(FIELD.scale);
    expect(configOf(view).x).toBeCloseTo(FIELD.x);
  });

  it('смена размера после ручного вида только ограничивает сдвиг', () => {
    const { size, view } = makeView();
    view.zoomIn({ x: 400, y: 300 });
    const moved = configOf(view).scaleX;
    size.value = { width: 2000, height: 1200 };

    expect(configOf(view).scaleX).toBeCloseTo(moved);
    expect(view.isFitted.value).toBe(false);
  });
});

const StageStub = defineComponent({
  name: 'VStage',
  props: { config: { type: Object, default: null } },
  setup(_props, { slots, expose }) {
    const listeners = new Map();
    const node = {
      on: (events, handler) =>
        String(events)
          .split(' ')
          .forEach(event => listeners.set(event, handler)),
      off: (events, handler) =>
        String(events)
          .split(' ')
          .forEach(event => {
            if (listeners.get(event) === handler) listeners.delete(event);
          }),
      has: event => listeners.has(event),
      fire: (event, target) => listeners.get(event)?.({ target }),
      x: () => 0,
      y: () => 0,
      scaleX: () => 1,
      scaleY: () => 1,
    };
    expose({ getNode: () => node, stage: node });
    return () => h('div', { class: 'stage' }, slots.default?.());
  },
});

const passthrough = name =>
  defineComponent({
    name,
    props: { config: { type: Object, default: null } },
    setup(_props, { slots }) {
      return () => h('div', slots.default?.());
    },
  });

const map = {
  id: 'test',
  name: 'test',
  settings: { nodeSize: 72 },
  nodes: [
    { id: 1, x: 100, y: 100, terrain: 'ice', neighbors: [2], heroStart: true, position: 1 },
    { id: 2, x: 200, y: 100, terrain: 'desert', neighbors: [1] },
  ],
};

/** Ставит доске карту и монтирует её: остальное состояние партии в этих тестах не участвует. */
const mountBoard = async ({ interactive = true, ...state } = {}) => {
  session.view.value = { map: state.map ?? map };
  session.players.value = state.players ?? [];
  session.selectedFighterId.value = null;
  session.highlightedCellIds.value = state.highlightedCellIds ?? [];
  session.highlightedFighterIds.value = [];
  session.framedFighterIds.value = [];
  session.placementCells.value = state.placementCells ?? [];

  const wrapper = mount(Board, {
    props: { interactive },
    global: {
      components: {
        'ClientOnly': passthrough('ClientOnly'),
        'v-stage': StageStub,
        'v-layer': passthrough('VLayer'),
        'v-group': passthrough('VGroup'),
        'v-circle': passthrough('VCircle'),
        'v-wedge': passthrough('VWedge'),
        'v-rect': passthrough('VRect'),
        'v-line': passthrough('VLine'),
        'v-text': passthrough('VText'),
      },
    },
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  return wrapper;
};

const stageNode = wrapper => wrapper.findComponent(StageStub).vm.$.exposed.stage;
const stageConfig = wrapper => wrapper.findComponent(StageStub).props('config');

describe('доска: жесты вида', () => {
  it('колесо мыши над доской меняет масштаб сцены', async () => {
    const wrapper = await mountBoard();
    const before = stageConfig(wrapper).scaleX;

    wrapper.element.dispatchEvent(
      new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true }),
    );
    await nextTick();

    expect(stageConfig(wrapper).scaleX).toBeGreaterThan(before);
    wrapper.unmount();
  });

  it('колесо вниз уменьшает поле ниже вписанного, но не дальше половины вписанного', async () => {
    const wrapper = await mountBoard();
    const fitted = stageConfig(wrapper).scaleX;

    for (let i = 0; i < 40; i += 1) {
      wrapper.element.dispatchEvent(
        new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }),
      );
    }
    await nextTick();

    expect(stageConfig(wrapper).scaleX).toBeCloseTo(fitted * 0.5);
    wrapper.unmount();
  });

  it('перетаскивание сцены двигает сцену и остаётся в пределах экрана', async () => {
    const wrapper = await mountBoard();
    const scale = stageConfig(wrapper).scaleX;
    let position = null;
    const node = {
      x: () => 5000,
      y: () => 5000,
      scaleX: () => scale,
      position: next => {
        position = next;
      },
    };

    stageNode(wrapper).fire('dragmove', node);
    await nextTick();

    expect(position).not.toBeNull();
    expect(stageConfig(wrapper).x).toBe(position.x);
    expect(stageConfig(wrapper).x).toBeLessThan(5000);
    wrapper.unmount();
  });
});
