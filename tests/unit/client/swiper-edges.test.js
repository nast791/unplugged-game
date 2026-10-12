// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

/**
 * Края слайдера (`useSwiper`) — то, по чему панель руки решает, показывать ли стрелки.
 *
 * Правило: **стрелка не появляется, пока слайдер не сказал, что листать есть куда**. Первый рендер полосы
 * (свежий монтаж после шторки героя) не должен показывать стрелку, которую через кадр снимет `init`, —
 * именно это читалось как мигание. Значения краёв берутся у самого Swiper (`isBeginning`/`isEnd`), а не из
 * прогресса: у слайдера, который целиком помещается в контейнер (`watchOverflow` его запирает), прогресс
 * всегда 0, и «есть куда листать вправо» было бы враньём на каждом обновлении руки.
 *
 * Пакет `swiper` подменён: настоящему нужны живые размеры и переходы, а проверяется здесь только разбор
 * событий `init`/`progress` и запись краёв.
 */
class FakeSwiper {
  constructor(element, params) {
    this.el = element;
    this.params = params;
    this.handlers = params.on ?? {};
    this.isBeginning = true;
    this.isEnd = true;
    this.activeIndex = 0;
    this.destroyed = 0;
    swipers.push(this);
    this.handlers.init?.(this);
  }

  destroy() {
    this.destroyed += 1;
  }

  slideNext() {}
  slidePrev() {}
  update() {}

  /** Как `updateProgress` в Swiper: края пересчитаны, событие `progress` уходит следом. */
  report({ isBeginning, isEnd, progress = 0, activeIndex = this.activeIndex }) {
    this.isBeginning = isBeginning;
    this.isEnd = isEnd;
    this.activeIndex = activeIndex;
    this.handlers.progress?.(this, progress);
  }
}

const swipers = [];

vi.mock('swiper', () => ({ default: FakeSwiper }));
vi.mock('swiper/modules', () => ({ Navigation: {}, Scrollbar: {}, Mousewheel: {} }));

const { useSwiper } = await import('~/composables/useSwiper.js');

/** Проба: композабл без разметки, контейнер — один `div` (фейковому Swiper его хватает). */
const Probe = defineComponent({
  setup() {
    const swiper = useSwiper({ swiper: { slidesPerView: 'auto' } });
    return { ...swiper };
  },
  render() {
    return h('div', { ref: 'containerRef' });
  },
});

const mountProbe = () => {
  const wrapper = mount(Probe);
  probes.push(wrapper);
  return wrapper;
};

const probes = [];

beforeEach(() => {
  swipers.length = 0;
});

/** Пробы снимаем: незакрытый монтаж доживает до следующего теста и подсовывает ему свой `init`. */
afterEach(() => {
  for (const wrapper of probes) wrapper.unmount();
  probes.length = 0;
});

describe('useSwiper: края слайдера', () => {
  it('до инициализации стрелок нет: листать «некуда», пока слайдер не сказал обратного', () => {
    const wrapper = mountProbe();

    expect(wrapper.vm.isFirstVisible).toBe(true);
    expect(wrapper.vm.isLastVisible).toBe(true);
  });

  it('после init края — от Swiper: начало видно, конец нет — стрелка «вправо» есть', async () => {
    const wrapper = mountProbe();
    await flushPromises();

    expect(swipers).toHaveLength(1);
    swipers[0].report({ isBeginning: true, isEnd: false });
    await flushPromises();

    expect(wrapper.vm.isFirstVisible).toBe(true);
    expect(wrapper.vm.isLastVisible).toBe(false);
  });

  it('рука целиком влезла (слайдер заперт): прогресс 0, а стрелки «вправо» всё равно нет', async () => {
    const wrapper = mountProbe();
    await flushPromises();

    // запертый слайдер: `isBeginning` и `isEnd` вместе, прогресс при этом нулевой
    swipers[0].report({ isBeginning: true, isEnd: true, progress: 0 });
    await flushPromises();

    expect(wrapper.vm.isLastVisible).toBe(true);
    expect(wrapper.vm.isFirstVisible).toBe(true);
  });

  it('дошли до конца: обе стрелки меняются местами', async () => {
    const wrapper = mountProbe();
    await flushPromises();

    swipers[0].report({ isBeginning: false, isEnd: true, progress: 1, activeIndex: 4 });
    await flushPromises();

    expect(wrapper.vm.isFirstVisible).toBe(false);
    expect(wrapper.vm.isLastVisible).toBe(true);
    expect(wrapper.vm.activeIndex).toBe(4);
  });

  it('слайдер снят (монтаж разобран) — стрелок нет', async () => {
    const wrapper = mountProbe();
    await flushPromises();

    swipers[0].report({ isBeginning: false, isEnd: false });
    await flushPromises();
    expect(wrapper.vm.isFirstVisible).toBe(false);
    expect(wrapper.vm.isLastVisible).toBe(false);

    wrapper.unmount();

    expect(wrapper.vm.isFirstVisible).toBe(true);
    expect(wrapper.vm.isLastVisible).toBe(true);
  });
});
