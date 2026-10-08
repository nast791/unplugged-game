// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { computed, defineComponent, h, onBeforeUnmount, onMounted, ref, watch } from 'vue';

/**
 * Клики по доске вешает сцена: `v-stage` появляется только после `stageReady = true`, поэтому
 * проверяем не разметку, а то, что слушатель вообще повис на сцене и что клик доходит до движка.
 *
 * Board.vue — SFC приложения: `ref`, `computed`, `watch` приходят из автоимпортов Nuxt. В тесте без
 * Nuxt-окружения те же имена кладём в `globalThis` до динамического импорта компонента.
 */
globalThis.ref = ref;
globalThis.computed = computed;
globalThis.watch = watch;
globalThis.onMounted = onMounted;
globalThis.onBeforeUnmount = onBeforeUnmount;

const { default: Board } = await import('../../../app/components/game/Board.vue');

/** Пропускает слот дальше: в тесте ClientOnly и слои конвы ничего не рисуют, но и не мешают. */
const passthrough = name =>
  defineComponent({
    name,
    setup(_props, { slots }) {
      return () => h('div', slots.default?.());
    },
  });

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

const mountBoard = async (props = {}) => {
  const wrapper = mount(Board, {
    props: { map, players, ...props },
    global: {
      components: {
        'ClientOnly': passthrough('ClientOnly'),
        'v-stage': StageStub,
        'v-layer': passthrough('VLayer'),
        'v-group': passthrough('VGroup'),
        'v-circle': passthrough('VCircle'),
        'v-wedge': passthrough('VWedge'),
        'v-rect': passthrough('VRect'),
        'v-path': passthrough('VPath'),
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

  it('клик мимо (не по фигуре клетки) движку не уходит', async () => {
    const wrapper = await mountBoard();
    stageOf(wrapper).fire('click', {});
    expect(wrapper.emitted('select-node')).toBeUndefined();
    expect(wrapper.emitted('select-fighter')).toBeUndefined();
  });

  it('выключенная доска кликов не слушает', async () => {
    const wrapper = await mountBoard({ interactive: false });
    stageOf(wrapper).fire('click', konvaNode({ cellName: 'cell', cellId: 2 }));
    expect(wrapper.emitted('select-node')).toBeUndefined();
  });
});
