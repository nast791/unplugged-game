import { computed, ref, watch } from 'vue';

export const FIT_MAX = 4;
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 5;
export const WHEEL_STEP = 1.08;
export const PAN_MARGIN = 96;
/** Отступ карты от края поля в единицах сетки: столько же у панелей (`p-12`) и у самого поля */
export const FIT_PAD_UNITS = 12;
export const FIT_PAD = 24;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const boxOf = bounds => {
  const minX = Number(bounds?.minX) || 0;
  const minY = Number(bounds?.minY) || 0;
  const maxX = Number(bounds?.maxX) || 0;
  const maxY = Number(bounds?.maxY) || 0;
  return {
    minX,
    minY,
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1),
  };
};

export const useBoardView = ({
  size,
  bounds,
  fitPad = null,
  fitMax = FIT_MAX,
  minZoom = ZOOM_MIN,
  maxZoom = ZOOM_MAX,
  wheelStep = WHEEL_STEP,
  margin = PAN_MARGIN,
} = {}) => {
  const view = ref(null);
  const touched = ref(false);

  const viewport = computed(() => ({
    width: Math.max(Number(size?.value?.width) || 0, 1),
    height: Math.max(Number(size?.value?.height) || 0, 1),
  }));

  const box = computed(() => boxOf(bounds?.value));

  const pad = computed(() => {
    const raw = Number(fitPad?.value ?? fitPad);
    return Number.isFinite(raw) && raw >= 0 ? raw : FIT_PAD;
  });

  const fitBox = computed(() => {
    const { width, height } = viewport.value;
    const edge = pad.value;
    return {
      width: Math.max(width - edge * 2, 1),
      height: Math.max(height - edge * 2, 1),
      x: edge,
      y: edge,
    };
  });

  const fitScale = computed(() => {
    const area = fitBox.value;
    return Math.min(area.width / box.value.width, area.height / box.value.height, fitMax);
  });

  const fitView = computed(() => {
    const scale = fitScale.value;
    const area = fitBox.value;
    return {
      scale,
      x: area.x + (area.width - box.value.width * scale) / 2 - box.value.minX * scale,
      y: area.y + (area.height - box.value.height * scale) / 2 - box.value.minY * scale,
    };
  });

  const limit = next => {
    const scale = clamp(
      Number(next?.scale) || fitScale.value,
      fitScale.value * minZoom,
      fitScale.value * maxZoom,
    );
    const { minX, minY, width, height } = box.value;
    const { width: screenW, height: screenH } = viewport.value;

    const lowerX = margin - (minX + width) * scale;
    const upperX = screenW - margin - minX * scale;
    const lowerY = margin - (minY + height) * scale;
    const upperY = screenH - margin - minY * scale;
    const centerX = (screenW - width * scale) / 2 - minX * scale;
    const centerY = (screenH - height * scale) / 2 - minY * scale;

    return {
      scale,
      x: lowerX <= upperX ? clamp(Number(next?.x) || 0, lowerX, upperX) : centerX,
      y: lowerY <= upperY ? clamp(Number(next?.y) || 0, lowerY, upperY) : centerY,
    };
  };

  const current = computed(() => view.value ?? fitView.value);
  const isFitted = computed(() => !touched.value);

  const stageConfig = computed(() => ({
    width: viewport.value.width,
    height: viewport.value.height,
    x: current.value.x,
    y: current.value.y,
    scaleX: current.value.scale,
    scaleY: current.value.scale,
    draggable: true,
    dragDistance: 6,
  }));

  const zoomAt = (factor, point) => {
    const from = current.value;
    const scale = clamp(from.scale * factor, fitScale.value * minZoom, fitScale.value * maxZoom);
    const spot = point && Number.isFinite(point.x) && Number.isFinite(point.y) ? point : null;

    if (!spot || scale === from.scale) {
      view.value = limit({ ...from, scale });
      touched.value = true;
      return view.value;
    }

    const ratio = scale / from.scale;
    view.value = limit({
      scale,
      x: spot.x - (spot.x - from.x) * ratio,
      y: spot.y - (spot.y - from.y) * ratio,
    });
    touched.value = true;
    return view.value;
  };

  const zoomIn = point => zoomAt(wheelStep, point);
  const zoomOut = point => zoomAt(1 / wheelStep, point);

  const onDragMove = event => {
    const node = event?.target ?? null;
    if (!node?.x || !node?.y) return;
    const next = limit({
      scale: Number(node.scaleX?.() ?? current.value.scale) || current.value.scale,
      x: Number(node.x()) || 0,
      y: Number(node.y()) || 0,
    });
    view.value = next;
    touched.value = true;
    node.position?.({ x: next.x, y: next.y });
  };

  const reset = () => {
    view.value = null;
    touched.value = false;
  };

  watch([fitBox, box], () => {
    if (!view.value) return;
    view.value = limit(view.value);
  });

  return {
    view,
    current,
    isFitted,
    stageConfig,
    fitScale,
    fitBox,
    zoomAt,
    zoomIn,
    zoomOut,
    onDragMove,
    reset,
  };
};

export default useBoardView;
