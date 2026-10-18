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
 * Клики по доске вешает сцена: `v-stage` появляется только после `stageReady = true`, поэтому
 * проверяем не разметку, а то, что слушатель вообще повис на сцене и что клик доходит до движка.
 *
 * Доска читает состояние партии композаблом сама (как панели героев), поэтому сессию подменяем:
 * карту, бойцов и подсветки тест кладёт в её ref-ы, а проп у доски остался один — `interactive`.
 *
 * Board.vue — SFC приложения: `ref`, `computed`, `watch` приходят из автоимпортов Nuxt. В тесте без
 * Nuxt-окружения те же имена кладём в `globalThis` до динамического импорта компонента.
 */
globalThis.ref = ref;
globalThis.computed = computed;
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
const { default: Board } = await import('../../../app/components/organisms/game/Board.vue');

/** Пропускает слот дальше: в тесте ClientOnly и слои конвы ничего не рисуют, но и не мешают. */
const passthrough = name =>
  defineComponent({
    name,
    // `config` объявлен, чтобы тест мог читать настройки фигуры конвы (`props('config')`)
    props: { config: { type: Object, default: null } },
    setup(_props, { slots }) {
      return () => h('div', slots.default?.());
    },
  });

/**
 * Событие перетаскивания с координатами курсора: готовому событию happy-dom `clientX` не присвоить
 * (свойство объявлено только для чтения), поэтому координаты кладём своим свойством поверх.
 */
const dragEvent = (type, clientX, clientY) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clientX', { value: clientX });
  Object.defineProperty(event, 'clientY', { value: clientY });
  return event;
};

/**
 * Сцена-заглушка вместо `v-stage`: помнит слушателей конвы и умеет позвать их с поддельной целью
 * клика (у настоящих фигур клик разбирает `clickTarget` по `getAttr`/`getParent`).
 */
const StageStub = defineComponent({
  name: 'VStage',
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
    };
    expose({ getNode: () => node, stage: node });
    return () => h('div', { class: 'stage' }, slots.default?.());
  },
});

/** Узел конвы: атрибуты фигуры и клетки, родителя нет — как у самой внешней цели клика. */
const konvaNode = attrs => ({
  getAttr: key => attrs[key],
  getParent: () => null,
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

const players = [
  {
    id: 'anubis',
    color: '#3B82F6',
    placementReady: false,
    fighters: [
      { id: 'anubis', name: 'Анубис', type: 'hero', currentPosition: 1 },
      { id: 'amat', name: 'Амат', type: 'assistant', currentPosition: null },
    ],
  },
];

/** Ставит доске состояние партии и монтирует её: проп у доски остался один — `interactive`. */
const mountBoard = async ({ interactive = true, ...state } = {}) => {
  session.view.value = { map: state.map ?? map };
  session.players.value = state.players ?? players;
  session.selectedFighterId.value = state.selectedFighterId ?? null;
  session.highlightedCellIds.value = state.highlightedCellIds ?? [];
  session.highlightedFighterIds.value = state.highlightedFighterIds ?? [];
  session.framedFighterIds.value = state.framedFighterIds ?? [];
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
  // сцена появляется вторым рендером: `stageReady` встаёт в onMounted
  await new Promise(resolve => setTimeout(resolve, 0));
  return wrapper;
};

/** Сцена-заглушка: `expose` доступен только через `$.exposed`. */
const stageOf = wrapper => wrapper.findComponent(StageStub).vm.$.exposed.stage;

describe('доска: клики доходят до движка', () => {
  it('слушатель повисает на сцене вместе с её появлением', async () => {
    const wrapper = await mountBoard();
    expect(stageOf(wrapper).has('click')).toBe(true);
    expect(stageOf(wrapper).has('tap')).toBe(true);
  });

  it('клик по клетке уходит как select-node с её id', async () => {
    const wrapper = await mountBoard();
    stageOf(wrapper).fire('click', konvaNode({ cellName: 'cell', cellId: 2 }));
    expect(wrapper.emitted('select-node')).toEqual([[2]]);
  });

  it('клик по фишке уходит как select-fighter с бойцом и владельцем', async () => {
    const wrapper = await mountBoard();
    stageOf(wrapper).fire(
      'click',
      konvaNode({ cellName: 'fighter', fighterId: 'amat', ownerId: 'anubis' }),
    );
    expect(wrapper.emitted('select-fighter')).toEqual([
      [{ fighterId: 'amat', playerId: 'anubis' }],
    ]);
  });

  it('клик мимо клетки и фишки уходит как select-node: null — это «кликнули в пустоту»', async () => {
    const wrapper = await mountBoard();
    stageOf(wrapper).fire('click', {});
    expect(wrapper.emitted('select-node')).toEqual([[null]]);
    expect(wrapper.emitted('select-fighter')).toBeUndefined();
  });

  it('выключенная доска кликов не слушает', async () => {
    const wrapper = await mountBoard({ interactive: false });
    stageOf(wrapper).fire('click', konvaNode({ cellName: 'cell', cellId: 2 }));
    expect(wrapper.emitted('select-node')).toBeUndefined();
  });
});

/**
 * Перетаскивание аватарки с полки расстановки: браузер отдаёт координаты курсора, клетку по ним считает
 * доска (`cellAtPoint`) — попадание совпадает с кликом по той же клетке. В заглушке сцены нет
 * преобразования (сдвига и зума), поэтому точка экрана равна точке поля.
 */
describe('доска: перетаскивание бойца на клетку', () => {
  const dropOn = async (clientX, clientY, state = {}) => {
    const wrapper = await mountBoard({ highlightedCellIds: [1], ...state });
    wrapper.element.dispatchEvent(dragEvent('dragover', clientX, clientY));
    await nextTick();
    wrapper.element.dispatchEvent(dragEvent('drop', clientX, clientY));
    await nextTick();
    return wrapper;
  };

  it('бросок в кружок подсвеченной клетки уходит как select-node с её id', async () => {
    const wrapper = await dropOn(100, 100);

    expect(wrapper.emitted('select-node')).toEqual([[1]]);
  });

  it('бросок мимо кружков движку не уходит', async () => {
    const wrapper = await dropOn(20, 400);

    expect(wrapper.emitted('select-node')).toBeUndefined();
  });

  it('бросок на клетку вне подсветки движку не уходит — выбранный боец не сбрасывается', async () => {
    const wrapper = await dropOn(200, 100);

    expect(wrapper.emitted('select-node')).toBeUndefined();
  });

  it('клетка светится всё сильнее: область, активный боец, курсор — а граница одна и та же', async () => {
    const wrapper = await mountBoard({
      highlightedCellIds: [1],
      placementCells: [
        { id: 1, occupied: false },
        { id: 2, occupied: false },
      ],
    });
    const rings = () =>
      wrapper.findAllComponents({ name: 'VCircle' }).map(node => node.props('config'));
    // свечение наружу рисует свой кружок (он шире клетки), а кольцо-обводка у всех уровней одинаковое
    const glowing = () => rings().filter(config => config?.shadowForStrokeEnabled === true);
    const outlines = () => rings().filter(config => config?.shadowBlur === 0 && config?.stroke);

    const legal = glowing()[0];
    const area = glowing()[1];
    expect(legal?.shadowBlur).toBeGreaterThan(area?.shadowBlur);
    expect(area?.shadowBlur).toBeGreaterThan(0);
    expect(legal?.radius).toBe(area?.radius);

    const legalRing = outlines()[0];
    const areaRing = outlines()[1];
    expect(legalRing?.strokeWidth).toBe(areaRing?.strokeWidth);
    expect(legalRing?.stroke).toBe(areaRing?.stroke);
    expect(legalRing?.shadowOpacity).toBe(0);

    wrapper.element.dispatchEvent(dragEvent('dragover', 100, 100));
    await nextTick();

    const hovered = glowing().find(config => config?.shadowBlur > legal.shadowBlur);
    expect(hovered).toBeTruthy();
  });

  it('в расстановке обводку клетки свечение не перекрашивает', async () => {
    const strokes = wrapper =>
      wrapper
        .findAllComponents({ name: 'VCircle' })
        .map(node => node.props('config')?.stroke)
        .filter(Boolean);

    const placement = await mountBoard({
      highlightedCellIds: [1],
      placementCells: [{ id: 1, occupied: false }],
    });
    expect(strokes(placement)).not.toContain('#0284c7');

    const movement = await mountBoard({ highlightedCellIds: [1] });
    expect(strokes(movement)).toContain('#0284c7');
  });

  it('перетаскивание не показывает «запрещено», даже когда доска сейчас не слушает', async () => {
    const wrapper = await mountBoard({ interactive: false });
    const event = dragEvent('dragover', 100, 100);
    wrapper.element.dispatchEvent(event);
    await nextTick();

    expect(event.defaultPrevented).toBe(true);
    expect(wrapper.emitted('select-node')).toBeUndefined();
  });

  it('занятая своим бойцом клетка области не светится: кольцо серое', async () => {
    const wrapper = await mountBoard({
      placementCells: [{ id: 1, occupied: true }],
    });
    const busy = wrapper
      .findAllComponents({ name: 'VCircle' })
      .map(node => node.props('config'))
      .find(config => config?.stroke === '#94a3b8');

    expect(busy?.shadowBlur).toBe(0);
    expect(busy?.opacity).toBeLessThan(1);
  });
});
