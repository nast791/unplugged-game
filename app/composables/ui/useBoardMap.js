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
import { nodeAllTerrains, nodeTerrains } from '#shared/helpers/placement.js';
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
  shadeColor,
  tileClipFunc,
  tokenFaceRadius,
  tokenInk,
  tokenRadius,
} from '~/composables/ui/useBoardGeometry.js';
import { HEART } from '~/constants/heart.js';

// стихии клетки: постоянные, затем временные (дополнительный кусок до конца хода)
const terrainsOf = node => nodeAllTerrains(node);
const permanentCountOf = node => nodeTerrains(node).length;

const read = value => (isRef(value) ? value.value : value);

// Сколько клетки может занять тень фишки: дальше начинается соседняя клетка, и пятно читается как чужая метка.
const SHADOW_ROOM = 0.93;

export const useBoardMap = source => {
  const nodes = computed(() => {
    const map = read(source.map);
    return Array.isArray(map?.nodes) ? map.nodes : [];
  });
  const nodeSize = computed(() => Number(read(source.map)?.settings?.nodeSize) || 72);
  const radius = computed(() => nodeRadius(nodeSize.value));
  const showCellIds = SHOW_CELL_IDS;
  const tileImages = ref({});

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
  const pickedFighters = computed(
    () => new Set((read(source.pickedFighterIds) || []).map(id => String(id))),
  );

  const battleMarks = computed(() => {
    const roles = read(source.battleRoles) ?? {};
    return {
      attacker: roles.attackerFighterId == null ? null : String(roles.attackerFighterId),
      defender: roles.defenderFighterId == null ? null : String(roles.defenderFighterId),
    };
  });

  const placementCells = computed(() => {
    const cells = new Map();
    for (const cell of read(source.placementCells) || []) {
      if (cell?.id != null) cells.set(String(cell.id), cell.occupied === true);
    }
    return cells;
  });

  const inPlacement = computed(() => placementCells.value.size > 0);
  const isPlacementCell = node => placementCells.value.has(String(node.id));
  const isBusyCell = node => placementCells.value.get(String(node.id)) === true;

  // подсветка фазы — это всегда ожидание клика по клетке: кольцо живёт на тех же клетках, где и в расстановке
  const activeCells = computed(() => {
    const ids = new Set(highlightedCells.value);
    for (const id of placementCells.value.keys()) ids.add(id);
    return ids;
  });
  const isActiveCell = node => activeCells.value.has(String(node.id));

  // выбор бойца (бой, окно цели) — фаза просит клик по бойцу, а не по клетке
  const pickFighters = computed(() => read(source.pickFighters) === true);
  const pickFighterIds = computed(() =>
    pickFighters.value ? new Set(highlightedFighters.value) : new Set(),
  );
  const isPulsingFighter = token => pickFighterIds.value.has(String(token.fighter.id));

  const pulsingCells = computed(() => {
    const ids = new Set();
    for (const id of activeCells.value) {
      if (placementCells.value.get(id) !== true) ids.add(id);
    }
    return ids;
  });
  const isPulsingCell = node => pulsingCells.value.has(String(node.id));

  const dropCellId = ref(null);
  const setDropCell = id => {
    dropCellId.value = id == null ? null : id;
  };
  const isDropCell = node =>
    dropCellId.value != null && String(dropCellId.value) === String(node.id);

  /** Пульс нужен там, где игроку предстоит выбор: клетки-кандидаты и бойцы окна цели. */
  const pulseActive = computed(
    () => dropCellId.value != null || pulsingCells.value.size > 0 || pickFighterIds.value.size > 0,
  );

  const pulse = ref(0);
  let pulseFrame = null;

  const stopPulse = () => {
    if (pulseFrame == null) return;
    cancelAnimationFrame(pulseFrame);
    pulseFrame = null;
    pulse.value = 0;
  };

  const stepPulse = () => {
    pulse.value = (Math.sin(Date.now() / 240) + 1) / 2;
    pulseFrame = requestAnimationFrame(stepPulse);
  };

  const startPulse = () => {
    if (pulseFrame != null) return;
    pulseFrame = requestAnimationFrame(stepPulse);
  };

  vueWatch(pulseActive, wanted => (wanted ? startPulse() : stopPulse()));

  if (getCurrentInstance()) onBoardUnmount(stopPulse);

  const setPulse = value => {
    pulse.value = Math.max(0, Math.min(1, Number(value) || 0));
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

  // Ключ статики: по нему доска заново собирает кэш слоя. Подсветка, выбор и фишки сюда не входят —
  // они живут в своих слоях, иначе кэш сбрасывался бы на каждый клик.
  const boardKey = computed(() => {
    const cells = nodes.value.map(
      node => `${node.id}@${node.x},${node.y}:${terrainsOf(node).join('+')}`,
    );
    const markers = startMarkersOf.value.map(marker => marker.id).join(',');
    return `${radius.value}|${cells.join('|')}|${markers}|${Object.keys(tileImages.value).length}`;
  });

  const FRAME = { pad: 28, cut: 22, alpha: 0.55 };

  const frameBox = computed(() => {
    const box = bounds.value ?? {};
    return {
      x0: Number(box.minX ?? 0) - FRAME.pad,
      y0: Number(box.minY ?? 0) - FRAME.pad,
      x1: Number(box.maxX ?? 0) + FRAME.pad,
      y1: Number(box.maxY ?? 0) + FRAME.pad,
    };
  });

  const paperConfig = computed(() => {
    const { x0, y0, x1, y1 } = frameBox.value;

    return {
      x: x0,
      y: y0,
      width: x1 - x0,
      height: y1 - y0,
      fill: '#efece6',
      listening: false,
      shadowColor: 'rgba(0, 0, 0, 0.45)',
      shadowBlur: 26,
      shadowOffsetY: 6,
      shadowForStrokeEnabled: false,
    };
  });

  const frameConfig = computed(() => {
    const { x0, y0, x1, y1 } = frameBox.value;
    const cut = FRAME.cut;

    return {
      points: [
        x0 + cut,
        y0,
        x1 - cut,
        y0,
        x1,
        y0 + cut,
        x1,
        y1 - cut,
        x1 - cut,
        y1,
        x0 + cut,
        y1,
        x0,
        y1 - cut,
        x0,
        y0 + cut,
      ],
      closed: true,
      stroke: `rgba(24, 31, 41, ${FRAME.alpha})`,
      strokeWidth: 2,
      strokeScaleEnabled: false,
      listening: false,
    };
  });

  const vignetteConfig = computed(() => {
    const { x0, y0, x1, y1 } = frameBox.value;
    const width = x1 - x0;
    const height = y1 - y0;
    const centre = { x: width / 2, y: height / 2 };

    return {
      x: x0,
      y: y0,
      width,
      height,
      fillRadialGradientStartPoint: centre,
      fillRadialGradientStartRadius: 0,
      fillRadialGradientEndPoint: centre,
      fillRadialGradientEndRadius: Math.hypot(width, height) / 2,
      fillRadialGradientColorStops: [
        0,
        'rgba(6, 10, 16, 0)',
        0.55,
        'rgba(6, 10, 16, 0)',
        1,
        'rgba(6, 10, 16, 0.42)',
      ],
      listening: false,
    };
  });

  const nodeStroke = () => ({ color: STROKE.edgeColor, width: STROKE.cell });

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

  const cellGlowLevel = node => {
    if (isBusyCell(node)) return 0;
    return isDropCell(node) ? 3 : isHighlighted(node) ? 2 : 1;
  };

  const cellGlowConfig = node => {
    const level = cellGlowLevel(node);
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

  /** Кольцо-кандидат: тонкая расходящаяся волна. Под курсором она крупнее — там бросок уже решён. */
  const CELL_WAVE = { near: 2, far: 16, width: 6, peak: 0.22 };
  const DROP_WAVE = { near: 8, far: 24, width: 10, peak: 0.3 };

  const cellPulseConfig = node => {
    const wave = isDropCell(node) ? DROP_WAVE : CELL_WAVE;
    return {
      radius: radius.value + PLACEMENT.stroke + 2,
      stroke: PLACEMENT.free,
      strokeWidth: wave.width,
      opacity: 0,
      listening: false,
      pulseRing: true,
      baseRadius: radius.value,
      pulseNear: wave.near,
      pulseFar: wave.far,
      pulseWidth: wave.width,
      pulsePeak: wave.peak,
    };
  };

  const cellRingConfig = node => {
    const busy = isBusyCell(node);
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

  // временная стихия — отдельный сектор с золотой каймой: видно, что это добавка, а не стихия клетки
  const sectorsOf = node => {
    const permanent = permanentCountOf(node);
    return sectorWedges(terrainsOf(node)).map((sector, index) => ({
      ...sector,
      temporary: index >= permanent,
    }));
  };
  const dividersOf = node => sectorDividers(terrainsOf(node), radius.value);
  const sectorConfig = sector => ({
    radius: radius.value,
    angle: sector.angle,
    rotation: sector.rotation,
    fill: sector.color,
    ...(sector.temporary
      ? {
          stroke: '#F7C846',
          strokeWidth: 2,
          shadowColor: '#F7C846',
          shadowBlur: 6,
          shadowOpacity: 0.55,
        }
      : {}),
    listening: false,
  });

  // дуга-метка поверх временного сектора: пунктирный обод показывает, что стихия исчезнет в конце хода
  const temporaryMarksOf = node => {
    const cellRadius = radius.value;
    return sectorsOf(node)
      .filter(sector => sector.temporary)
      .map(sector => ({
        x: 0,
        y: 0,
        innerRadius: cellRadius * 0.7,
        outerRadius: cellRadius - STROKE.cell * 0.5,
        angle: sector.angle,
        rotation: sector.rotation,
        fill: 'rgba(247, 200, 70, 0.14)',
        stroke: '#F7C846',
        strokeWidth: 2,
        dash: [5, 4],
        listening: false,
      }));
  };

  onMounted(() => {
    if (pulseActive.value) startPulse();
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

  // Выбор игрока и роль в битве не спорят: выбранный боец, который бьёт или защищается, остаётся цветом боя.
  const isAccentSelected = token => {
    const id = String(token.fighter.id);
    const fighting = battleMarks.value.attacker === id || battleMarks.value.defender === id;
    return !fighting && String(read(source.selectedFighterId)) === id;
  };

  const fighterHaloConfig = token => {
    const id = String(token.fighter.id);
    const attacker = battleMarks.value.attacker === id;
    const defender = battleMarks.value.defender === id;

    // красный — только у того, кто бьёт: рамка фазы и роль защитника рисуются голубым
    const framed = framedFighters.value.has(id);
    const highlighted = !attacker && !defender && highlightedFighters.value.has(id);
    const marked = Boolean(attacker || defender);
    const picked = pickedFighters.value.has(id);
    const accent = isAccentSelected(token);
    const alive = attacker || framed || highlighted || marked || picked || accent;

    // выбор показывает тень-подсветка под фишкой, поэтому кольца у него нет: остаются только линии фаз и битвы
    const ring = radius.value * (alive ? 0.92 : 0.82);
    return {
      radius: ring,
      fill: 'transparent',
      opacity: alive ? 1 : 0.35,
      stroke: attacker
        ? '#dc2626'
        : framed || defender || highlighted || picked
          ? '#0ea5e9'
          : 'transparent',
      strokeWidth: picked ? 7 : attacker || framed || highlighted || marked ? 5 : 0,
      listening: false,
    };
  };

  const FIGHTER_WAVE = { near: 2, far: 14, width: 5, peak: 0.3 };

  const fighterPulseConfig = token => {
    const id = String(token.fighter.id);
    const base = radius.value * 0.92;
    const red = battleMarks.value.attacker === id;
    return {
      radius: base,
      stroke: red ? '#dc2626' : '#0ea5e9',
      strokeWidth: FIGHTER_WAVE.width,
      opacity: 0,
      listening: false,
      pulseRing: true,
      baseRadius: base,
      pulseNear: FIGHTER_WAVE.near,
      pulseFar: FIGHTER_WAVE.far,
      pulseWidth: FIGHTER_WAVE.width,
      pulsePeak: FIGHTER_WAVE.peak,
    };
  };

  // Фишка объёмная: кромка цвета героя со светом сверху, вдавленное поле под портрет и блик по кромке.
  // Внешней обводки нет — тонкая тёмная линия по контуру «сплющивала» фишку; край держит тень.
  const fighterShades = color => ({
    high: shadeColor(color, 0.5),
    light: shadeColor(color, 0.16),
    base: color,
    deep: shadeColor(color, -0.55),
  });

  // Тень под фишкой: мягкое пятно снизу, чтобы фишка стояла на поле, а не лежала на нём.
  // У выбранной фишки это ровное свечение вокруг — со всех сторон одинаково, без перекоса вниз.
  const fighterShadowConfig = token => {
    const body = tokenRadius(radius.value);
    const accent = isAccentSelected(token);
    // за клетку тень не выходит: поле рисуется кружками, и пятно на соседе читается как чужая метка
    const room = radius.value * SHADOW_ROOM;
    const dropY = body * 0.42;
    const glow = accent ? Math.min(body * 1.18, room) : 0;
    const radiusX = accent ? glow : Math.min(body * 1.06, room);
    const radiusY = accent ? glow : Math.min(body * 0.92, Math.max(2, room - dropY));
    // плотное кольцо света начинается сразу за фишкой и тает к краю клетки — на светлой пустыне не хуже, чем на камне
    const edge = glow > 0 ? body / glow : 0;
    return {
      x: 0,
      y: accent ? 0 : dropY,
      radiusX,
      radiusY,
      fillRadialGradientStartPoint: { x: 0, y: 0 },
      fillRadialGradientEndPoint: { x: 0, y: 0 },
      fillRadialGradientStartRadius: 0,
      fillRadialGradientEndRadius: Math.max(radiusX, radiusY),
      fillRadialGradientColorStops: accent
        ? [
            0,
            'rgba(255, 127, 80, 0.9)',
            Math.max(0, edge - 0.02),
            'rgba(255, 127, 80, 0.9)',
            Math.min(0.95, edge + 0.16),
            'rgba(255, 127, 80, 0.75)',
            1,
            'rgba(255, 127, 80, 0)',
          ]
        : [0, 'rgba(15, 23, 42, 0.55)', 1, 'rgba(15, 23, 42, 0)'],
      fillPriority: 'radial-gradient',
      listening: false,
    };
  };

  // Кромка выпуклая: чем дальше от точки света в верхнем левом углу, тем темнее — круг читается куполом.
  const fighterBodyConfig = token => {
    const body = tokenRadius(radius.value);
    const shades = fighterShades(token.color);
    return {
      radius: body,
      fillRadialGradientStartPoint: { x: -body * 0.3, y: -body * 0.38 },
      fillRadialGradientEndPoint: { x: -body * 0.3, y: -body * 0.38 },
      fillRadialGradientStartRadius: 0,
      fillRadialGradientEndRadius: body * 1.62,
      fillRadialGradientColorStops: [
        0,
        shades.high,
        0.36,
        shades.light,
        0.7,
        shades.base,
        1,
        shades.deep,
      ],
      fillPriority: 'radial-gradient',
    };
  };

  // Скругление к самому краю: тёмная кромка по всему контуру, мягкая, без линии-обводки.
  const fighterRimShadeConfig = () => {
    const body = tokenRadius(radius.value);
    return {
      radius: body,
      fillRadialGradientStartPoint: { x: 0, y: 0 },
      fillRadialGradientEndPoint: { x: 0, y: 0 },
      fillRadialGradientStartRadius: 0,
      fillRadialGradientEndRadius: body,
      fillRadialGradientColorStops: [
        0,
        'rgba(15, 23, 42, 0)',
        0.72,
        'rgba(15, 23, 42, 0)',
        1,
        'rgba(15, 23, 42, 0.3)',
      ],
      fillPriority: 'radial-gradient',
      listening: false,
    };
  };

  const fighterFaceConfig = token => {
    const body = tokenRadius(radius.value);
    const face = tokenFaceRadius(radius.value);
    return {
      radius: face,
      fillRadialGradientStartPoint: { x: -face * 0.25, y: -face * 0.3 },
      fillRadialGradientEndPoint: { x: face * 0.5, y: face * 0.7 },
      fillRadialGradientStartRadius: 0,
      fillRadialGradientEndRadius: face * 1.5,
      fillRadialGradientColorStops: [
        0,
        shadeColor(token.color, -0.05),
        1,
        shadeColor(token.color, -0.62),
      ],
      fillPriority: 'radial-gradient',
      stroke: 'rgba(15, 23, 42, 0.3)',
      strokeWidth: Math.max(1.5, (body - face) * 0.34),
      listening: false,
    };
  };

  // Блик на кромке — серп света по верхнему краю: кольцо от сдвинутого центра, без среза на конце.
  const fighterShineConfig = token => {
    const body = tokenRadius(radius.value);
    return {
      radius: body,
      x: 0,
      y: 0,
      fillRadialGradientStartPoint: { x: -body * 0.34, y: -body * 0.4 },
      fillRadialGradientEndPoint: { x: -body * 0.34, y: -body * 0.4 },
      fillRadialGradientStartRadius: body * 0.6,
      fillRadialGradientEndRadius: body * 1.06,
      fillRadialGradientColorStops: [
        0,
        'rgba(255, 255, 255, 0)',
        0.5,
        'rgba(255, 255, 255, 0.62)',
        1,
        'rgba(255, 255, 255, 0)',
      ],
      fillPriority: 'radial-gradient',
      listening: false,
    };
  };

  // Поле портрета вдавлено: затемнение по краю круга, поверх аватара, — иначе портрет лежит заподлицо.
  const fighterFaceEdgeConfig = token => {
    const face = tokenFaceRadius(radius.value);
    return {
      radius: face,
      fillRadialGradientStartPoint: { x: 0, y: 0 },
      fillRadialGradientEndPoint: { x: 0, y: 0 },
      fillRadialGradientStartRadius: face * 0.64,
      fillRadialGradientEndRadius: face,
      fillRadialGradientColorStops: [0, 'rgba(15, 23, 42, 0)', 1, 'rgba(15, 23, 42, 0.42)'],
      fillPriority: 'radial-gradient',
      listening: false,
    };
  };

  const fighterLabelConfig = token => {
    const face = tokenFaceRadius(radius.value);
    const fontSize = Math.max(8, Math.round(face * 1.1));
    return {
      text: String(token.fighter.name || token.fighter.id).slice(0, 1),
      fontSize,
      fontStyle: 'bold',
      fill: tokenInk(token.color),
      width: face * 2,
      align: 'center',
      x: -face,
      y: -Math.round(fontSize * 0.52),
      listening: false,
    };
  };

  // Здоровье — объёмное сердце, как у гекса героя, торчащее из-под фишки вправо-вниз.
  const hpHeartOf = () => {
    const body = tokenRadius(radius.value);
    const reach = body * 0.84;
    const size = Math.max(13, body * 0.72);
    return { x: reach, y: reach, size, scale: size / HEART.width };
  };

  const fighterHpHeartConfig = () => {
    const { x, y, scale } = hpHeartOf();
    return {
      data: HEART.path,
      x,
      y,
      scaleX: scale,
      scaleY: scale,
      offsetX: HEART.centerX,
      offsetY: HEART.centerY,
      fillPriority: 'linear-gradient',
      fillLinearGradientStartPoint: { x: HEART.left, y: HEART.top },
      fillLinearGradientEndPoint: {
        x: HEART.left + HEART.width * 0.55,
        y: HEART.top + HEART.height,
      },
      fillLinearGradientColorStops: [0, '#ff8d7c', 0.42, '#e2322b', 1, '#8d0f14'],
      shadowColor: 'rgba(0, 0, 0, 0.45)',
      shadowBlur: Math.max(2, scale * HEART.width * 0.22),
      shadowOffsetY: 1,
      listening: false,
    };
  };

  const fighterHpGlossConfig = () => {
    const { x, y, scale } = hpHeartOf();
    return {
      data: HEART.path,
      x,
      y,
      scaleX: scale,
      scaleY: scale,
      offsetX: HEART.centerX,
      offsetY: HEART.centerY,
      fillPriority: 'radial-gradient',
      fillRadialGradientStartPoint: { x: HEART.glossX, y: HEART.glossY },
      fillRadialGradientEndPoint: { x: HEART.glossX, y: HEART.glossY },
      fillRadialGradientStartRadius: 0,
      fillRadialGradientEndRadius: HEART.glossRadius,
      fillRadialGradientColorStops: [
        0,
        'rgba(255, 255, 255, 0.7)',
        0.55,
        'rgba(255, 255, 255, 0.12)',
        1,
        'rgba(255, 255, 255, 0)',
      ],
      listening: false,
    };
  };

  const fighterHpLabelConfig = token => {
    const { x, y, size, scale } = hpHeartOf();
    const fontSize = Math.max(7, Math.round(size * 0.5));
    const height = Math.round(fontSize * 1.6);
    const dy = (HEART.top + HEART.height * 0.47 - HEART.centerY) * scale;
    return {
      text: String(Number(token.fighter.currentHp ?? 0)),
      x: x - size / 2,
      y: y + dy - height / 2,
      width: size,
      height,
      align: 'center',
      verticalAlign: 'middle',
      fontSize,
      fontStyle: 'bold',
      fill: '#ffffff',
      shadowColor: 'rgba(0, 0, 0, 0.55)',
      shadowBlur: 2,
      listening: false,
    };
  };

  const fighterTipAnchorConfig = token => ({
    x: token.x,
    y: token.y - tokenRadius(radius.value) - 12,
    listening: false,
  });

  const fighterTipTagConfig = () => ({
    fill: '#15151a',
    stroke: 'rgba(255, 255, 255, 0.16)',
    strokeWidth: 1,
    cornerRadius: 6,
    pointerDirection: 'down',
    pointerWidth: 14,
    pointerHeight: 8,
    shadowColor: 'rgba(0, 0, 0, 0.5)',
    shadowBlur: 10,
    shadowOpacity: 0.5,
    listening: false,
  });

  const fighterTipTextConfig = token => {
    const hp = Math.max(0, Number(token.fighter.currentHp ?? 0));
    const maxHp = Math.max(hp, Number(token.fighter.startHp ?? hp));
    const stats = `Здоровье ${hp}/${maxHp} · Удар ${Number(token.fighter.attackRange ?? 1)}`;
    return {
      text: `${token.fighter.name || token.fighter.id}\n${stats} · Шаг ${Number(token.fighter.move ?? 0)}`,
      fontSize: 12,
      lineHeight: 1.35,
      padding: 9,
      fill: '#f5f5f7',
      listening: false,
    };
  };

  const clickTargetOf = target => clickTarget(target);

  const cellAt = (point, transform) =>
    point ? cellAtPoint(nodes.value, radius.value, transform, point) : null;

  return {
    nodes,
    radius,
    bounds,
    showCellIds,
    boardKey,
    inPlacement,
    dropCellId,
    isDropCell,
    isActiveCell,
    isPulsingCell,
    isPulsingFighter,
    pulseActive,
    pulse,
    setDropCell,
    setPulse,
    isPlacementCell,
    sectorsOf,
    sectorConfig,
    temporaryMarksOf,
    dividersOf,
    patternsOf,
    nodeCircleConfig,
    nodeOutlineConfig,
    cellGlowConfig,
    cellPulseConfig,
    cellRingConfig,
    cellLabelConfig,
    edgeLines,
    startMarkersOf,
    frameConfig,
    paperConfig,
    vignetteConfig,
    placedFighters,
    fighterHaloConfig,
    fighterPulseConfig,
    fighterShadowConfig,
    fighterBodyConfig,
    fighterRimShadeConfig,
    fighterFaceConfig,
    fighterFaceEdgeConfig,
    fighterShineConfig,
    fighterLabelConfig,
    fighterHpHeartConfig,
    fighterHpGlossConfig,
    fighterHpLabelConfig,
    fighterTipAnchorConfig,
    fighterTipTagConfig,
    fighterTipTextConfig,
    clickTargetOf,
    cellAt,
  };
};

export default useBoardMap;
