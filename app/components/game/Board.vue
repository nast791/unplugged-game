<template>
  <div
    ref="wrapRef"
    class="relative min-h-80 w-full overflow-hidden border border-primary/15 bg-[#f4f4f5]"
  >
    <ClientOnly>
      <v-stage v-if="stageReady" :config="stageConfig">
        <v-layer>
          <v-line v-for="(line, idx) in edgeLines" :key="`e-${idx}`" :config="line" />

          <v-group
            v-for="node in nodes"
            :key="`n-${node.id}`"
            :config="{ x: node.x, y: node.y, listening: interactive }"
            @click="onNodeClick(node.id, $event)"
            @tap="onNodeClick(node.id, $event)"
          >
            <v-circle :config="nodeCircleConfig(node)" />
            <v-text :config="nodeLabelConfig(node)" />
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
        <p class="p-4 text-14 opacity-60">Загрузка доски…</p>
      </template>
    </ClientOnly>
  </div>
</template>

<script setup>
const props = defineProps({
  map: { type: Object, default: null },
  players: { type: Array, default: () => [] },
  selectedFighterId: { type: [String, Number], default: null },
  highlightedCellIds: { type: Array, default: () => [] },
  interactive: { type: Boolean, default: true },
});

const emit = defineEmits(['select-node', 'select-fighter']);

const wrapRef = ref(null);
const stageReady = ref(false);
const size = ref({ width: 720, height: 480 });

const nodes = computed(() => (Array.isArray(props.map?.nodes) ? props.map.nodes : []));

const nodeSize = computed(() => Number(props.map?.settings?.nodeSize) || 64);

const highlightedSet = computed(
  () => new Set((props.highlightedCellIds || []).map(id => String(id))),
);

const isHighlighted = node => highlightedSet.value.has(String(node.id));

const nodeById = computed(() => {
  const map = new Map();
  for (const n of nodes.value) map.set(String(n.id), n);
  return map;
});

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
        points: [node.x, node.y, other.x, other.y],
        stroke: '#94a3b8',
        strokeWidth: 2,
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
      const offset = group.length > 1 ? (i - (group.length - 1) / 2) * 14 : 0;
      placed.push({ ...token, x: token.x + offset, y: token.y - offset });
    });
  }
  return placed;
});

const bounds = computed(() => {
  if (!nodes.value.length) {
    return { minX: 0, minY: 0, maxX: 400, maxY: 300 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes.value) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x);
    maxY = Math.max(maxY, n.y);
  }
  const pad = nodeSize.value;
  return {
    minX: minX - pad,
    minY: minY - pad,
    maxX: maxX + pad,
    maxY: maxY + pad,
  };
});

const stageConfig = computed(() => {
  const { minX, minY, maxX, maxY } = bounds.value;
  const contentW = Math.max(maxX - minX, 1);
  const contentH = Math.max(maxY - minY, 1);
  const scale = Math.min(size.value.width / contentW, size.value.height / contentH, 2);
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

const isStartNode = node => node?.position != null;

const nodeCircleConfig = node => {
  const lit = isHighlighted(node);
  return {
    radius: nodeSize.value / 2,
    fill: Array.isArray(node.areas) && node.areas[0] ? node.areas[0] : '#cbd5e1',
    opacity: lit ? 1 : isStartNode(node) ? 0.9 : 0.55,
    stroke: lit ? '#0284c7' : '#141414',
    strokeWidth: lit ? 4 : isStartNode(node) ? 2 : 1,
  };
};

const nodeLabelConfig = node => ({
  text: String(node.id),
  fontSize: 12,
  fill: '#141414',
  offsetX: 4,
  offsetY: 6,
  listening: false,
});

const fighterHaloConfig = token => ({
  radius: nodeSize.value / 3 + 6,
  fill:
    String(props.selectedFighterId) === String(token.fighter.id) ? token.color : 'transparent',
  opacity: 0.35,
  listening: false,
});

const fighterBodyConfig = token => ({
  radius: nodeSize.value / 3,
  fill: token.color,
  stroke: '#fff',
  strokeWidth: 2,
});

const fighterLabelConfig = token => ({
  text: String(token.fighter.name || token.fighter.id).slice(0, 1),
  fontSize: 14,
  fontStyle: 'bold',
  fill: '#fff',
  align: 'center',
  offsetX: 5,
  offsetY: 7,
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
