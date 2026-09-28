<template>
  <div
    ref="wrapRef"
    class="border-primary/15 relative h-full min-h-96 w-full overflow-hidden border bg-[#eef1f4]"
  >
    <ClientOnly>
      <v-stage v-if="stageReady" :config="stageConfig">
        <v-layer>
          <!-- соединители идут под кружками: сквозь заливку их не видно -->
          <v-line v-for="(line, idx) in edgeLines" :key="`e-${idx}`" :config="line" />

          <v-group
            v-for="node in nodes"
            :key="`n-${node.id}`"
            :config="{ x: node.x, y: node.y, listening: interactive }"
            @click="onNodeClick(node.id, $event)"
            @tap="onNodeClick(node.id, $event)"
          >
            <!-- база даёт заливку и тень; сектора цветной клетки рисуются поверх -->
            <v-circle :config="nodeCircleConfig(node)" />
            <template v-if="sectorsOf(node).length">
              <v-wedge
                v-for="(sector, index) in sectorsOf(node)"
                :key="`w-${index}`"
                :config="sectorConfig(sector)"
              />
              <!-- тонкие чёрные полоски между секторами: светлые заливки иначе сливаются -->
              <v-line
                v-for="(divider, index) in dividersOf(node)"
                :key="`d-${index}`"
                :config="divider"
              />
              <v-circle :config="nodeOutlineConfig(node)" />
            </template>
            <v-text :config="cellLabelConfig(node)" />
          </v-group>

          <!-- маркеры стартовых клеток: маленькие кружки с номерами, только на расстановке -->
          <v-group :config="{ listening: false }">
            <template v-for="marker in startMarkersOf" :key="`m-${marker.id}`">
              <v-circle :config="marker.disc" />
              <v-text :config="marker.label" />
            </template>
          </v-group>

          <v-group
            v-for="token in placedFighters"
            :key="`f-${token.playerId}-${token.fighter.id}`"
            :config="{ x: token.x, y: token.y, listening: interactive }"
            @click="onFighterClick(token, $event)"
            @tap="onFighterClick(token, $event)"
          >
            <v-circle :config="fighterHaloConfig(token)" />
            <v-circle :config="fighterBodyConfig(token)" />
            <v-text :config="fighterLabelConfig(token)" />
          </v-group>
        </v-layer>
      </v-stage>
      <template #fallback>
        <p class="text-14 p-4 opacity-60">Загрузка доски…</p>
      </template>
    </ClientOnly>
  </div>
</template>

<script setup>
import { terrainColor } from '#shared/constants/terrain.js';
import {
  SHADOW,
  STROKE,
  bendFor,
  curvePoints,
  fieldBounds,
  nodeLabelConfig,
  nodeRadius,
  placementMarkers,
  placementOngoing,
  sectorDividers,
  sectorWedges,
} from '../../utils/boardGeometry.js';

const props = defineProps({
  map: { type: Object, default: null },
  players: { type: Array, default: () => [] },
  selectedFighterId: { type: [String, Number], default: null },
  highlightedCellIds: { type: Array, default: () => [] },
  highlightedFighterIds: { type: Array, default: () => [] },
  framedFighterIds: { type: Array, default: () => [] },
  interactive: { type: Boolean, default: true },
});

const emit = defineEmits(['select-node', 'select-fighter']);

const wrapRef = ref(null);
const stageReady = ref(false);
const size = ref({ width: 720, height: 480 });

const nodes = computed(() => (Array.isArray(props.map?.nodes) ? props.map.nodes : []));
const nodeSize = computed(() => Number(props.map?.settings?.nodeSize) || 72);
const radius = computed(() => nodeRadius(nodeSize.value));

const highlightedSet = computed(
  () => new Set((props.highlightedCellIds || []).map(id => String(id))),
);

const isHighlighted = node => highlightedSet.value.has(String(node.id));

/**
 * Стихии клетки: основная задаёт заливку, у двух- и трёхцветных клеток их несколько —
 * такая клетка принадлежит сразу всем своим областям (docs/terrain.md).
 */
const nodeTerrains = node => {
  const raw = node?.terrain;
  const list = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  return list.filter(Boolean).map(String);
};

const sectorsOf = node => sectorWedges(nodeTerrains(node));
const dividersOf = node => sectorDividers(nodeTerrains(node), radius.value);

const nodeById = computed(() => {
  const map = new Map();
  for (const n of nodes.value) map.set(String(n.id), n);
  return map;
});

/**
 * Соединители: почти никогда не прямые, толстые, идут под кружками и упираются в их границы.
 * Одна пара клеток — одна линия, поэтому пары собираем через ключ.
 */
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
  const list = [];
  for (const player of props.players || []) {
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
    group.forEach((token, i) => {
      const offset = group.length > 1 ? (i - (group.length - 1) / 2) * 16 : 0;
      placed.push({ ...token, x: token.x + offset, y: token.y - offset });
    });
  }
  return placed;
});

/** Маркеры стартовых клеток: пока расстановка не подтверждена всеми, потом исчезают навсегда. */
const startMarkersOf = computed(() => placementMarkers(nodes.value, radius.value, props.players));

const bounds = computed(() =>
  fieldBounds(nodes.value, radius.value, { showMarkers: placementOngoing(props.players) }),
);

/** Поле занимает почти всю область: масштаб подгоняем по контейнеру, а не по «капитанскому» пределу. */
const stageConfig = computed(() => {
  const { minX, minY, maxX, maxY } = bounds.value;
  const contentW = Math.max(maxX - minX, 1);
  const contentH = Math.max(maxY - minY, 1);
  const scale = Math.min(size.value.width / contentW, size.value.height / contentH, 4);
  return {
    width: size.value.width,
    height: size.value.height,
    scaleX: scale,
    scaleY: scale,
    x: (size.value.width - contentW * scale) / 2 - minX * scale,
    y: (size.value.height - contentH * scale) / 2 - minY * scale,
    draggable: true,
    dragDistance: 6,
  };
});

/** Границы клеток одинаковые: номерную клетку видно по ромбику героя, а не по толщине. */
const nodeStroke = node => {
  if (isHighlighted(node)) return { color: '#0284c7', width: STROKE.highlight };
  return { color: STROKE.edgeColor, width: STROKE.cell };
};

/** Заливка клетки = её стихия; клетка непрозрачная, с тенью, чтобы соединители не просвечивали. */
const nodeCircleConfig = node => {
  const stroke = nodeStroke(node);
  return {
    radius: radius.value,
    fill: terrainColor(nodeTerrains(node)[0]),
    opacity: 1,
    stroke: stroke.color,
    strokeWidth: stroke.width,
    ...SHADOW.cell,
  };
};

/** Цветная клетка: сектора «пирогом» и толстая граница поверх них. */
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

const sectorConfig = sector => ({
  radius: radius.value,
  angle: sector.angle,
  rotation: sector.rotation,
  fill: sector.color,
  listening: false,
});

/** Подпись внутри клетки — id клетки; номер героя на расстановке рисуется кружком на границе. */
const cellLabelConfig = node => nodeLabelConfig(node, radius.value);

const highlightedFighterSet = computed(
  () => new Set((props.highlightedFighterIds || []).map(id => String(id))),
);

const framedFighterSet = computed(
  () => new Set((props.framedFighterIds || []).map(id => String(id))),
);

/** Рамка выбранного бойца — красная, подсветка кандидата — синяя, заметная (толще и ярче). */
const fighterHaloConfig = token => {
  const id = String(token.fighter.id);
  const framed = framedFighterSet.value.has(id);
  const highlighted = highlightedFighterSet.value.has(id);
  const selected = String(props.selectedFighterId) === id;

  return {
    radius: radius.value * (framed || highlighted ? 0.92 : 0.82),
    fill: selected && !framed && !highlighted ? token.color : 'transparent',
    opacity: framed || highlighted ? 1 : 0.35,
    stroke: framed ? '#dc2626' : highlighted ? '#0ea5e9' : 'transparent',
    strokeWidth: framed ? 5 : highlighted ? 5 : 0,
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

const onNodeClick = (nodeId, e) => {
  if (e) e.cancelBubble = true;
  if (!props.interactive) return;
  emit('select-node', nodeId);
};

const onFighterClick = (token, e) => {
  if (e) e.cancelBubble = true;
  if (!props.interactive) return;
  emit('select-fighter', {
    fighterId: token.fighter.id,
    playerId: token.playerId,
  });
};

const updateSize = () => {
  const el = wrapRef.value;
  if (!el) return;
  size.value = {
    width: Math.max(el.clientWidth, 360),
    height: Math.max(el.clientHeight, 360),
  };
};

let resizeObserver;
onMounted(() => {
  stageReady.value = true;
  updateSize();
  const el = wrapRef.value;
  if (!el || typeof ResizeObserver === 'undefined') return;
  resizeObserver = new ResizeObserver(() => updateSize());
  resizeObserver.observe(el);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
});
</script>
