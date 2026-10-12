import {
  computed,
  getCurrentInstance,
  isRef,
  onBeforeUnmount as onBoardUnmount,
  onMounted,
  ref,
  watch as vueWatch,
} from 'vue';
import { terrainColor } from '#shared/constants/terrain.js';
import {
  PATTERN_TILES,
  PLACEMENT,
  SHADOW,
  SHOW_CELL_IDS,
  STROKE,
  bendFor,
  cellAtPoint,
  cellPatterns,
  clickTarget,
  curvePoints,
  fieldBounds,
  nodeLabelConfig,
  nodeRadius,
  patternTileConfig,
  placementMarkers,
  placementOngoing,
  sectorDividers,
  sectorWedges,
  tileClipFunc,
} from '~/composables/useBoardGeometry.js';

const terrainsOf = node => {
  const raw = node?.terrain;
  const list = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  return list.filter(Boolean).map(String);
};

const read = value => (isRef(value) ? value.value : value);

export const useBoardMap = source => {
  const nodes = computed(() => {
    const map = read(source.map);
    return Array.isArray(map?.nodes) ? map.nodes : [];
  });
  const nodeSize = computed(() => Number(read(source.map)?.settings?.nodeSize) || 72);
  const radius = computed(() => nodeRadius(nodeSize.value));
  const showCellIds = SHOW_CELL_IDS;

  const highlightedCells = computed(
    () => new Set((read(source.highlightedCellIds) || []).map(id => String(id))),
  );
  const isHighlighted = node => highlightedCells.value.has(String(node.id));

  const highlightedFighters = computed(
    () => new Set((read(source.highlightedFighterIds) || []).map(id => String(id))),
  );
  const framedFighters = computed(
    () => new Set((read(source.framedFighterIds) || []).map(id => String(id))),
  );

  const placementCells = computed(() => {
    const cells = new Map();
    for (const cell of read(source.placementCells) || []) {
      if (cell?.id != null) cells.set(String(cell.id), cell.occupied === true);
    }
    return cells;
  });

  const inPlacement = computed(() => placementCells.value.size > 0);
  const isPlacementCell = node => placementCells.value.has(String(node.id));

  const dropCellId = ref(null);
  const setDropCell = id => {
    dropCellId.value = id == null ? null : id;
  };
  const isDropCell = node =>
    dropCellId.value != null && String(dropCellId.value) === String(node.id);

  /**
   * Пульсация свечения клетки под курсором (0…1). Считается **кадром браузера**
   * (`requestAnimationFrame`): во время перетаскивания браузер душит `setInterval`, и пульс замирал.
   * Кадры живут только пока тащат аватара — без `dropCellId` пересчёта нет вовсе.
   *
   * Наружу отдаётся ещё и `pulseTarget`: пересборка `:config` у кружка до Konva не доходит (узел
   * остаётся с прежним `shadowBlur`), поэтому доска крутит атрибуты узла напрямую
   * (`Board.vue: applyGlowPulse`).
   */
  const placementPulse = ref(0);
  let pulseFrame = null;

  const stopPulse = () => {
    if (pulseFrame == null) return;
    cancelAnimationFrame(pulseFrame);
    pulseFrame = null;
    placementPulse.value = 0;
  };

  const stepPulse = () => {
    placementPulse.value = (Math.sin(Date.now() / 240) + 1) / 2;
    pulseFrame = requestAnimationFrame(stepPulse);
  };

  vueWatch(dropCellId, value => {
    if (value == null) {
      stopPulse();
      return;
    }
    if (pulseFrame != null) return;
    pulseFrame = requestAnimationFrame(stepPulse);
  });

  if (getCurrentInstance()) onBoardUnmount(stopPulse);

  /** Пульс задаётся снаружи — тестом: в бою его двигает интервал выше. */
  const setPulse = value => {
    placementPulse.value = Math.max(0, Math.min(1, Number(value) || 0));
  };

  const nodeById = computed(() => {
    const map = new Map();
    for (const node of nodes.value) map.set(String(node.id), node);
    return map;
  });

  const bounds = computed(() =>
    fieldBounds(nodes.value, radius.value, {
      showMarkers: placementOngoing(read(source.players)),
    }),
  );

  const startMarkersOf = computed(() =>
    placementMarkers(nodes.value, radius.value, read(source.players)),
  );

  const nodeStroke = node => {
    if (inPlacement.value) {
      // в расстановке граница клеток одна — родная: состояние ведёт свечение, а не вторая рамка
      return { color: STROKE.edgeColor, width: STROKE.cell };
    }
    if (isHighlighted(node)) {
      return { color: '#0284c7', width: STROKE.highlight };
    }
    return { color: STROKE.edgeColor, width: STROKE.cell };
  };

  const nodeCircleConfig = node => {
    const stroke = nodeStroke(node);
    return {
      radius: radius.value,
      fill: terrainColor(terrainsOf(node)[0]),
      opacity: 1,
      stroke: stroke.color,
      strokeWidth: stroke.width,
      ...SHADOW.cell,
    };
  };

  const nodeOutlineConfig = node => {
    const stroke = nodeStroke(node);
    return {
      radius: radius.value,
      fill: undefined,
      opacity: 1,
      stroke: stroke.color,
      strokeWidth: stroke.width,
      listening: false,
    };
  };

  /**
   * Уровень свечения клетки расстановки: 1 — вся область, 2 — активный боец, 3 — клетка под курсором,
   * 0 — занята своим бойцом (не светится вовсе).
   */
  const placementGlowLevel = node => {
    if (placementCells.value.get(String(node.id)) === true) return 0;
    return isDropCell(node) ? 3 : isHighlighted(node) ? 2 : 1;
  };

  /** Пульс есть только у клетки под курсором: остальные светятся ровно. */
  const glowPulseOf = level => (level === 3 ? placementPulse.value : 0);

  /**
   * Свечение **наружу** клетки — тонкий голубой ободок сразу за границей (обводка 2, отступ 1) с мягкой
   * полупрозрачной тенью. Прозрачность держим низкой (решение владельца): подсветка должна читаться
   * как свет, а не как рамка. Пульс сюда не входит — под курсором клетка получает расходящееся кольцо
   * (`placementPulseConfig`).
   */
  const placementGlowConfig = node => {
    const level = placementGlowLevel(node);
    const spread = radius.value + PLACEMENT.stroke + 1;
    return {
      radius: spread,
      stroke: PLACEMENT.free,
      strokeWidth: 10,
      opacity: level ? 0.14 + 0.07 * level : 0,
      shadowColor: PLACEMENT.free,
      shadowBlur: 14 + 5 * level,
      shadowOpacity: level ? Math.min(1, 0.18 + 0.08 * level) : 0,
      shadowForStrokeEnabled: true,
      listening: false,
    };
  };

  /** Кольцо пульса у клетки под курсором: до анимации стоит у самой границы и не видно. */
  const placementPulseConfig = node => ({
    radius: radius.value + PLACEMENT.stroke + 2,
    stroke: PLACEMENT.free,
    strokeWidth: 8,
    opacity: 0,
    listening: false,
    pulseRing: true,
    baseRadius: radius.value,
  });

  const placementRingConfig = node => {
    const busy = placementCells.value.get(String(node.id)) === true;
    const level = placementGlowLevel(node);
    return {
      radius: radius.value + PLACEMENT.stroke,
      fill: undefined,
      opacity: busy ? 0.5 : 1,
      stroke: busy ? PLACEMENT.busy : PLACEMENT.free,
      strokeWidth: PLACEMENT.stroke,
      shadowColor: PLACEMENT.free,
      shadowBlur: 0,
      shadowOpacity: 0,
      listening: false,
    };
  };

  const sectorsOf = node => sectorWedges(terrainsOf(node));
  const dividersOf = node => sectorDividers(terrainsOf(node), radius.value);
  const sectorConfig = sector => ({
    radius: radius.value,
    angle: sector.angle,
    rotation: sector.rotation,
    fill: sector.color,
    listening: false,
  });

  const tileImages = ref({});

  onMounted(() => {
    for (const [terrain, tile] of Object.entries(PATTERN_TILES)) {
      const image = new Image();
      image.onload = () => {
        tileImages.value = { ...tileImages.value, [terrain]: image };
      };
      image.src = tile.src;
    }
  });

  const patternsOf = node =>
    cellPatterns(terrainsOf(node), radius.value).map(pattern => {
      const spec = PATTERN_TILES[pattern.terrain];
      const image = spec ? tileImages.value[pattern.terrain] : null;
      if (!spec || !image) return { ...pattern, tile: null };
      return {
        ...pattern,
        tile: patternTileConfig(radius.value, image, spec),
        clipFunc: tileClipFunc(pattern.start, pattern.end, radius.value),
      };
    });

  const cellLabelConfig = node => nodeLabelConfig(node, radius.value);

  const edgeLines = computed(() => {
    const seen = new Set();
    const lines = [];
    for (const node of nodes.value) {
      for (const raw of node.neighbors || []) {
        const a = String(node.id);
        const b = String(raw);
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const other = nodeById.value.get(b);
        if (!other) continue;
        lines.push({
          points: curvePoints(node, other, radius.value, bendFor(node, other)),
          bezier: true,
          stroke: STROKE.edgeColor,
          strokeWidth: STROKE.edge,
          lineCap: 'round',
          ...SHADOW.edge,
          listening: false,
        });
      }
    }
    return lines;
  });

  const placedFighters = computed(() => {
    const viewer = String(read(source.viewerId) ?? '');
    const list = [];
    for (const player of read(source.players) || []) {
      /**
       * Пока идёт расстановка, на поле видны только свои бойцы: стороны расставляются одновременно, и
       * чужую расстановку до её конца не показываем никому (решение владельца) — включая слот, который
       * уже подтвердился. Карточка героя при этом обновляется сразу (`placementReady` открыт проекцией).
       * Позиции чужих бойцов проекция на это время и не отдаёт, так что подсмотреть нельзя в любом случае.
       */
      const inPlacement = String(read(source.phase) ?? '') === 'gameStart';
      const own = String(player.id) === viewer;
      if (inPlacement && !own) continue;

      for (const fighter of player.fighters || []) {
        if (fighter.currentPosition == null) continue;
        const node = nodeById.value.get(String(fighter.currentPosition));
        if (!node) continue;
        list.push({
          playerId: String(player.id),
          color: player.color || '#141414',
          fighter,
          x: node.x,
          y: node.y,
        });
      }
    }

    const groups = new Map();
    for (const token of list) {
      const key = String(token.fighter.currentPosition);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(token);
    }

    const placed = [];
    for (const group of groups.values()) {
      group.forEach((token, index) => {
        const shift = group.length > 1 ? (index - (group.length - 1) / 2) * 16 : 0;
        placed.push({ ...token, x: token.x + shift, y: token.y - shift });
      });
    }
    return placed;
  });

  const fighterHaloConfig = token => {
    const id = String(token.fighter.id);
    const framed = framedFighters.value.has(id);
    const highlighted = highlightedFighters.value.has(id);
    const selected = String(read(source.selectedFighterId)) === id;

    return {
      radius: radius.value * (framed || highlighted ? 0.92 : 0.82),
      fill: selected && !framed && !highlighted ? token.color : 'transparent',
      opacity: framed || highlighted ? 1 : 0.35,
      stroke: framed ? '#dc2626' : highlighted ? '#0ea5e9' : 'transparent',
      strokeWidth: framed || highlighted ? 5 : 0,
      listening: false,
    };
  };

  const fighterBodyConfig = token => ({
    radius: radius.value * 0.62,
    fill: token.color,
    stroke: '#fff',
    strokeWidth: 3,
  });

  const fighterLabelConfig = token => ({
    text: String(token.fighter.name || token.fighter.id).slice(0, 1),
    fontSize: Math.round(radius.value * 0.62),
    fontStyle: 'bold',
    fill: '#fff',
    width: radius.value * 1.24,
    align: 'center',
    x: -radius.value * 0.62,
    y: -radius.value * 0.32,
    listening: false,
  });

  const clickTargetOf = target => clickTarget(target);

  const cellAt = (point, transform) =>
    point ? cellAtPoint(nodes.value, radius.value, transform, point) : null;

  return {
    nodes,
    radius,
    bounds,
    showCellIds,
    inPlacement,
    dropCellId,
    isDropCell,
    placementPulse,
    setDropCell,
    setPulse,
    isPlacementCell,
    sectorsOf,
    sectorConfig,
    dividersOf,
    patternsOf,
    nodeCircleConfig,
    nodeOutlineConfig,
    placementGlowConfig,
    placementPulseConfig,
    placementRingConfig,
    cellLabelConfig,
    edgeLines,
    startMarkersOf,
    placedFighters,
    fighterHaloConfig,
    fighterBodyConfig,
    fighterLabelConfig,
    clickTargetOf,
    cellAt,
  };
};

export default useBoardMap;
