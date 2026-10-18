<template>
  <section
    ref="wrapRef"
    data-board
    :data-gap="fitPad"
    class="relative h-full min-h-96 w-full overflow-hidden bg-white"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
    @wheel.prevent="onWheel"
  >
    <ClientOnly>
      <v-stage v-if="stageReady" ref="stageRef" :config="stageConfig">
        <v-layer>
          <v-line v-for="(line, index) in edgeLines" :key="`e-${index}`" :config="line" />

          <v-group
            v-for="node in nodes"
            :key="`n-${node.id}`"
            :config="{
              x: node.x,
              y: node.y,
              listening: interactive,
              cellName: 'cell',
              cellId: node.id,
            }"
          >
            <v-circle :config="nodeCircleConfig(node)" />

            <v-wedge
              v-for="(sector, index) in sectorsOf(node)"
              :key="`w-${index}`"
              :config="sectorConfig(sector)"
            />

            <template v-for="(pattern, index) in patternsOf(node)" :key="`p-${index}`">
              <v-group :config="{ clipFunc: pattern.clipFunc, listening: false }">
                <v-rect v-if="pattern.tile" :config="pattern.tile" />
              </v-group>
            </template>

            <template v-if="sectorsOf(node).length">
              <v-line
                v-for="(divider, index) in dividersOf(node)"
                :key="`d-${index}`"
                :config="divider"
              />
              <v-circle :config="nodeOutlineConfig(node)" />
            </template>

            <v-circle v-if="isPlacementCell(node)" :config="placementGlowConfig(node)" />
            <v-circle
              v-if="isPlacementCell(node) && isDropCell(node)"
              :config="placementPulseConfig(node)"
            />
            <v-circle v-if="isPlacementCell(node)" :config="placementRingConfig(node)" />

            <v-text v-if="showCellIds" :config="cellLabelConfig(node)" />
          </v-group>

          <v-group :config="{ listening: false }">
            <template v-for="marker in startMarkersOf" :key="`m-${marker.id}`">
              <v-circle :config="marker.disc" />
              <v-text :config="marker.label" />
            </template>
          </v-group>

          <v-group
            v-for="token in placedFighters"
            :key="`f-${token.playerId}-${token.fighter.id}`"
            :config="{
              x: token.x,
              y: token.y,
              listening: interactive,
              cellName: 'fighter',
              fighterId: token.fighter.id,
              ownerId: token.playerId,
            }"
          >
            <v-circle :config="fighterHaloConfig(token)" />
            <v-circle :config="fighterBodyConfig(token)" />
            <v-text :config="fighterLabelConfig(token)" />
          </v-group>
        </v-layer>
      </v-stage>

      <template #fallback>
        <p class="text-16 p-4 opacity-60">Загрузка доски…</p>
      </template>
    </ClientOnly>
  </section>
</template>

<script setup>
import { useBoardMap } from '~/composables/ui/useBoardMap.js';
import { useBoardView } from '~/composables/ui/useBoardView.js';
import { useFitPad } from '~/composables/ui/useFitPad.js';
import { useGameSession } from '~/composables/game/useGameSession.js';

const props = defineProps({
  interactive: { type: Boolean, default: true },
});

const emit = defineEmits(['select-node', 'select-fighter']);

const {
  view,
  you,
  phase,
  players,
  selectedFighterId,
  highlightedCellIds,
  highlightedFighterIds,
  pickedFighterIds,
  framedFighterIds,
  battleRoles,
  placementCells,
} = useGameSession();

const map = computed(() => view.value?.map ?? null);

const wrapRef = ref(null);
const stageRef = ref(null);
const stageReady = ref(false);
const size = ref({ width: 720, height: 480 });

const {
  nodes,
  bounds,
  showCellIds,
  sectorsOf,
  sectorConfig,
  dividersOf,
  patternsOf,
  nodeCircleConfig,
  nodeOutlineConfig,
  isPlacementCell,
  isDropCell,
  placementGlowConfig,
  placementPulseConfig,
  placementPulse,
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
  dropCellId,
  setDropCell,
} = useBoardMap({
  map,
  players,
  viewerId: you,
  phase,
  selectedFighterId,
  highlightedCellIds,
  highlightedFighterIds,
  pickedFighterIds,
  framedFighterIds,
  battleRoles,
  placementCells,
});

const { pad: fitPad, measure: measureFitPad } = useFitPad(wrapRef);

const { stageConfig, zoomIn, zoomOut, onDragMove } = useBoardView({
  size,
  bounds,
  fitPad,
});

const containerPoint = event => {
  const rect = wrapRef.value?.getBoundingClientRect?.();
  if (!rect) return null;
  return { x: Number(event?.clientX) - rect.left, y: Number(event?.clientY) - rect.top };
};

const stageTransform = () => {
  const stage = stageRef.value?.getNode?.() ?? null;
  return {
    x: Number(stage?.x?.() ?? 0) || 0,
    y: Number(stage?.y?.() ?? 0) || 0,
    scaleX: Number(stage?.scaleX?.() ?? 1) || 1,
    scaleY: Number(stage?.scaleY?.() ?? 1) || 1,
  };
};

const cellAtEvent = event => cellAt(containerPoint(event), stageTransform());

const onWheel = event => {
  const point = containerPoint(event);
  if (!point) return;
  if (Number(event.deltaY) < 0) zoomIn(point);
  else zoomOut(point);
};

const onStageClick = event => {
  if (!props.interactive) return;
  const pick = clickTargetOf(event?.target);
  if (!pick) {
    emit('select-node', null);
    return;
  }
  if (pick.kind === 'fighter') {
    emit('select-fighter', { fighterId: pick.fighterId, playerId: pick.playerId });
    return;
  }
  emit('select-node', pick.cellId);
};

const allowedDropCells = computed(() => {
  const cells = new Set((highlightedCellIds.value || []).map(String));
  for (const cell of placementCells.value || []) {
    if (cell?.occupied !== true) cells.add(String(cell.id));
  }
  return cells;
});

const dropTargetOf = event => {
  const id = cellAtEvent(event);
  if (id == null) return null;
  return allowedDropCells.value.has(String(id)) ? id : null;
};

const onDragOver = event => {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  if (!props.interactive) return;
  const next = dropTargetOf(event);
  if (String(dropCellId.value ?? '') !== String(next ?? '')) setDropCell(next);
};

const onDragLeave = () => {
  setDropCell(null);
};

const clearDropCell = () => {
  setDropCell(null);
};

const PULSE = { near: 8, far: 24, width: 10, peak: 0.3, periodMs: 1500 };

const hoveredPulseNode = () => {
  const stage = stageRef.value?.getNode?.();
  const id = dropCellId.value;
  if (typeof stage?.findOne !== 'function' || id == null) return null;
  const group = stage.findOne(node => String(node.getAttr?.('cellId')) === String(id));
  return group?.findOne?.(entry => entry.getAttr?.('pulseRing') === true) ?? null;
};

const applyGlowPulse = () => {
  const node = hoveredPulseNode();
  if (!node) return;
  const base = Number(node.getAttr('baseRadius')) || 0;
  const wave = (Date.now() % PULSE.periodMs) / PULSE.periodMs;
  node.radius(base + PULSE.near + (PULSE.far - PULSE.near) * wave);
  node.strokeWidth(PULSE.width);
  node.opacity(PULSE.peak * (1 - wave) ** 1.4);
  node.getLayer()?.batchDraw();
};

const onDrop = event => {
  event.preventDefault();
  const id = dropCellId.value ?? (props.interactive ? dropTargetOf(event) : null);
  setDropCell(null);
  if (id == null) return;
  const node = nodes.value.find(entry => String(entry.id) === String(id));
  emit('select-node', node ? node.id : id);
};

watch(
  stageRef,
  (stage, previous) => {
    previous?.getNode?.()?.off('click tap', onStageClick);
    previous?.getNode?.()?.off('dragmove', onDragMove);
    stage?.getNode?.()?.on('click tap', onStageClick);
    stage?.getNode?.()?.on('dragmove', onDragMove);
  },
  { flush: 'post' },
);

const updateSize = () => {
  const el = wrapRef.value;
  if (!el) return;
  size.value = {
    width: Math.max(el.clientWidth, 360),
    height: Math.max(el.clientHeight, 360),
  };
  measureFitPad();
};

let resizeObserver;

watch([dropCellId, placementPulse], () => applyGlowPulse(), { flush: 'post' });

onMounted(() => {
  stageReady.value = true;
  updateSize();
  document.addEventListener('dragend', clearDropCell);
  const el = wrapRef.value;
  if (!el || typeof ResizeObserver === 'undefined') return;
  resizeObserver = new ResizeObserver(() => updateSize());
  resizeObserver.observe(el);
});

onBeforeUnmount(() => {
  stageRef.value?.getNode?.()?.off('click tap', onStageClick);
  stageRef.value?.getNode?.()?.off('dragmove', onDragMove);
  document.removeEventListener('dragend', clearDropCell);
  resizeObserver?.disconnect();
});
</script>
