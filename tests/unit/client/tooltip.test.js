// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computed, h, nextTick } from 'vue';

/**
 * Тултип — единственная подсказка в проекте: и у крупных кнопок, и у мелких подписей на карточках.
 *
 * Окно и острие — **одна фигура**: основание острия уходит под рамку окна, поэтому серой линии на
 * стыке нет (живая жалоба владельца: рамка окна проходила поперёк треугольника), а щели, через
 * которую видно фон, не остаётся — форма заполняет свою коробку целиком (вторая жалоба владельца:
 * `viewBox` 32×24 в коробке 32×26 центрировался и оставлял полосу над основанием).
 * Проверяем именно геометрию: размеры острия берутся из высоты острия и толщины рамки, само оно
 * поднято на толщину рамки (`position: relative` — иначе `top` у статичного `<svg>` не работает),
 * обводка идёт по двум косым сторонам, а заливка совпадает с фоном окна.
 *
 * `ATooltip.vue` — SFC приложения: `computed` приходит автоимпортом Nuxt, в тесте кладём его в
 * `globalThis` до импорта компонента (так же, как `piles.test.js`). Тултип открывается по
 * **движению указателя**, а не по `mouseover`: happy-dom такого события не даёт, поэтому дёргаем
 * `pointermove` на триггере.
 */
globalThis.computed = computed;

const appConfig = (await import('../../../app/app.config.js')).default;
const tooltipPreset = appConfig.ui.tooltip;

// Настоящий `useUI` читает конфиг приложения (`useAppConfig`), которого в тесте нет: подставляем тот же
// пресет, что собирает `app.config.js`, — иначе проверять было бы нечего.
vi.mock('~/composables/ui/useUI', async importOriginal => {
  const { computed: computedFn, toValue } = await import('vue');
  const actual = await importOriginal();
  return {
    ...actual,
    useUI: (key, localUi) => ({
      styles: computedFn(() => actual.resolveUiStyles(tooltipPreset, toValue(localUi))),
    }),
  };
});

const { default: ATooltip } = await import('../../../app/components/atoms/ATooltip.vue');
const { ARROW_EDGE, ARROW_HEIGHT, ARROW_PATH, ARROW_STYLE, ARROW_VIEW_BOX, ARROW_WIDTH } =
  await import('../../../app/ui/tooltip-arrow.js');

const wrappers = [];

const mountTooltip = props => {
  const wrapper = mount(ATooltip, {
    props: { text: 'Клик — добрать карту', ...props },
    slots: {
      default: () => h('button', { 'type': 'button', 'data-trigger': '' }, 'Начать'),
    },
  });
  wrappers.push(wrapper);
  return wrapper;
};

const trigger = wrapper => wrapper.find('[data-trigger]');
const content = () => document.querySelector('div[data-dismissable-layer]');
const arrow = () => content()?.querySelector('svg') ?? null;

/** Наведение: тултип слушает `pointermove` — happy-dom не шлёт `mouseover` с нужным таргетом. */
const hover = async wrapper => {
  const event = new MouseEvent('pointermove', { bubbles: true });
  Object.defineProperty(event, 'pointerType', { value: 'mouse' });
  trigger(wrapper).element.dispatchEvent(event);
  await vi.advanceTimersByTimeAsync(400);
  await nextTick();
};

const numbersOf = path => path.match(/-?\d+(?:\.\d+)?/g).map(Number);
const pointAt = (numbers, index) => [numbers[index * 2], numbers[index * 2 + 1]];

/** Вершина квадратичной кривой: `Q` проходит через четверть концов и половину управляющей точки. */
const apexOf = (left, control, right) => (left + 2 * control + right) / 4;

/**
 * Форма острия по числам: `[основание слева, конец прямого скоса, управляющая точка вершины,
 * начало прямого скоса, основание справа]`.
 */
const arrowShape = () => {
  const [, , x1, y1, cx, cy, x2, y2] = numbersOf(ARROW_PATH);
  return { sideLeft: [x1, y1], control: [cx, cy], sideRight: [x2, y2] };
};

/** Толщина рамки окна в единицах `viewBox` — та же двойка, что в пресете (`--tooltip-border`). */
const BORDER_UNITS = 2;

afterEach(() => {
  while (wrappers.length) wrappers.pop().unmount();
  document.body.innerHTML = '';
});

describe('ATooltip: острие и окно — одна фигура', () => {
  it('пока наведения не было, подсказки нет', () => {
    const wrapper = mountTooltip();

    expect(content()).toBeNull();
    expect(trigger(wrapper).attributes('data-state')).toBe('closed');
  });

  it('наведение показывает окно, острие и текст', async () => {
    vi.useFakeTimers();
    const wrapper = mountTooltip();

    await hover(wrapper);

    expect(content()).not.toBeNull();
    expect(content().textContent).toContain('Клик — добрать карту');
    expect(arrow()).not.toBeNull();
    vi.useRealTimers();
  });

  it('острие поднято на толщину рамки и заходит под неё', async () => {
    vi.useFakeTimers();
    const wrapper = mountTooltip();

    await hover(wrapper);

    const svg = arrow();
    const style = svg.getAttribute('style') ?? '';
    expect(svg.getAttribute('viewBox')).toBe(ARROW_VIEW_BOX);
    // форма заполняет коробку целиком: пропорция вида не должна оставлять полосы по краям
    expect(svg.getAttribute('preserveAspectRatio')).toBe('none');
    // размеры и подъём — из пресета окна: высота острия и толщина рамки живут в одном месте
    expect(ARROW_WIDTH).toContain('--tooltip-tip-width');
    expect(ARROW_HEIGHT).toContain('--tooltip-tip');
    expect(ARROW_HEIGHT).toContain('--tooltip-border');
    expect(ARROW_STYLE.top).toContain('--tooltip-border');
    // сдвиг работает только у позиционированного `<svg>`: у статичного `top` ничего не двигает
    expect(ARROW_STYLE.position).toBe('relative');
    expect(style).toContain('--tooltip-tip');
    expect(style).toContain('position: relative');
    vi.useRealTimers();
  });

  it('форма заполняет свою коробку: щели над основанием нет', () => {
    // коробка острия описана теми же числами, что `viewBox`: ширина, видимая высота и рамка
    expect(ARROW_VIEW_BOX).toBe('0 0 16 12');
    expect(tooltipPreset.tooltip_content).toContain(
      '[--tooltip-tip-width:calc(var(--spacing)*16)]',
    );
    expect(tooltipPreset.tooltip_content).toContain('[--tooltip-tip:calc(var(--spacing)*10)]');
    expect(tooltipPreset.tooltip_content).toContain('[--tooltip-border:calc(var(--spacing)*2)]');

    const numbers = numbersOf(ARROW_PATH);
    // основание — плоская кромка на верхе коробки: под ней форма и уходит под рамку окна
    expect(pointAt(numbers, 0)).toEqual([0, 0]);
    expect(pointAt(numbers, 4)).toEqual([16, 0]);
    // вершина доходит до низа коробки: иначе у острия недобор высоты и полоса на стыке
    const { sideLeft, control, sideRight } = arrowShape();
    expect(apexOf(sideLeft[1], control[1], sideRight[1])).toBe(12);
    // по x форма не вылезает за коробку — её не срежет
    expect(sideLeft[0]).toBeGreaterThan(0);
    expect(sideRight[0]).toBeLessThan(16);
  });

  it('обводка идёт по двум косым сторонам, по стыку с окном линии нет', async () => {
    vi.useFakeTimers();
    const wrapper = mountTooltip();

    await hover(wrapper);

    const paths = [...arrow().querySelectorAll('path')];
    const [fill, edge] = paths;
    expect(paths).toHaveLength(2);
    expect(fill.getAttribute('d')).toBe(ARROW_PATH);
    expect(edge.getAttribute('d')).toBe(ARROW_EDGE);
    // обводка — та же краска, что рамка окна (`border-line`), только заливкой полосы
    expect(edge.getAttribute('class')).toContain('fill-line');
    expect(tooltipPreset.tooltip_content).toContain('border-line');
    vi.useRealTimers();
  });

  it('полоса обводки сдвинута внутрь контура на толщину рамки', () => {
    // обводка повторяет контур острия: те же скосы и та же скруглённая вершина, но без основания —
    // по стыку с окном линия не продолжается
    expect(ARROW_EDGE.startsWith(ARROW_PATH.slice(0, -2))).toBe(true);

    const numbers = numbersOf(ARROW_EDGE);
    const cutRight = pointAt(numbers, 5);
    const innerRight = pointAt(numbers, 6);
    const innerControl = pointAt(numbers, 7);
    const innerLeft = pointAt(numbers, 8);
    const cutLeft = pointAt(numbers, 9);
    // края полосы лежат на верхней кромке острия: своей толщины у стыка нет
    expect([cutRight[1], cutLeft[1]]).toEqual([0, 0]);
    expect(cutLeft[0]).toBeGreaterThan(0);
    expect(cutRight[0]).toBeLessThan(16);
    // внутренний край — тот же контур, отодвинутый внутрь ровно на толщину рамки
    const { sideLeft, control, sideRight } = arrowShape();
    expect(apexOf(innerLeft[1], innerControl[1], innerRight[1])).toBe(
      apexOf(sideLeft[1], control[1], sideRight[1]) - BORDER_UNITS,
    );
  });

  it('окно и острие заливки одного цвета — фон окна', () => {
    expect(tooltipPreset.tooltip_arrow).toContain('fill-surface');
    expect(tooltipPreset.tooltip_content).toContain('bg-surface');
    // толщина рамки и высота острия объявлены в окне: правя рамку, не забудешь про острие
    expect(tooltipPreset.tooltip_content).toContain('--tooltip-border');
    expect(tooltipPreset.tooltip_content).toContain('--tooltip-tip');
  });

  it('выключенный тултип не показывается: так стопки молчат в расстановке', async () => {
    vi.useFakeTimers();
    const wrapper = mountTooltip({ disabled: true });

    await hover(wrapper);

    expect(content()).toBeNull();
    vi.useRealTimers();
  });
});
