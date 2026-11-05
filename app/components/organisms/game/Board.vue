<template>
  <section
    ref="wrapRef"
    data-board
    :data-gap="fitPad"
    class="relative h-full min-h-96 w-full overflow-hidden"
    :class="props.tableBg ? 'bg-table bg-[url(/images/table.webp)] bg-cover bg-center' : 'bg-white'"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
    @wheel.prevent="onWheel"
  >
    <ClientOnly>
      <v-stage v-if="stageReady" ref="stageRef" :config="stageConfig">
        <v-layer>
          <v-rect v-if="mapFrame" :config="paperConfig" />

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

            <v-arc
              v-for="(mark, index) in temporaryMarksOf(node)"
              :key="`t-${index}`"
              :config="mark"
            />

            <v-circle v-if="isActiveCell(node)" :config="cellGlowConfig(node)" />
            <v-circle
              v-if="isDropCell(node) || isPulsingCell(node)"
              :config="cellPulseConfig(node)"
            />
            <v-circle v-if="isActiveCell(node)" :config="cellRingConfig(node)" />

            <v-text v-if="showCellIds" :config="cellLabelConfig(node)" />
          </v-group>

          <v-group :config="{ listening: false }">
            <template v-for="marker in startMarkersOf" :key="`m-${marker.id}`">
              <v-circle :config="marker.disc" />
              <v-text :config="marker.label" />
            </template>
          </v-group>

          <template v-if="mapFrame">
            <v-rect :config="vignetteConfig" />
            <v-line :config="frameConfig" />
          </template>

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
            <v-circle v-if="isPulsingFighter(token)" :config="fighterPulseConfig(token)" />
            <v-ellipse :config="fighterShadowConfig(token)" />
            <v-circle :config="fighterHaloConfig(token)" />
            <v-circle :config="fighterBodyConfig(token)" />
            <v-circle :config="fighterRimShadeConfig(token)" />
            <v-circle :config="fighterShineConfig(token)" />
            <v-circle :config="fighterFaceConfig(token)" />
            <v-circle :config="fighterFaceEdgeConfig(token)" />
            <v-group
              v-if="avatarOf(token)"
              :config="{ clipFunc: fighterAvatarClip(token), listening: false }"
            >
              <v-image :config="fighterAvatarConfig(token)" />
            </v-group>
            <v-text v-else :config="fighterLabelConfig(token)" />

            <template v-if="hpBadges">
              <v-path :config="fighterHpHeartConfig(token)" />
              <v-path :config="fighterHpGlossConfig(token)" />
              <v-text :config="fighterHpLabelConfig(token)" />
            </template>
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
import { TOKEN, tokenFaceRadius, tokenRadius } from '~/composables/ui/useBoardGeometry.js';
import { useBoardMap } from '~/composables/ui/useBoardMap.js';
import { useBoardView } from '~/composables/ui/useBoardView.js';
import { useFitPad } from '~/composables/ui/useFitPad.js';
import { useGameSession } from '~/composables/game/useGameSession.js';

const props = defineProps({
  interactive: { type: Boolean, default: true },
  hpBadges: { type: Boolean, default: false },
  mapFrame: { type: Boolean, default: false },
  fitUnits: { type: Number, default: 0 },
  tableBg: { type: Boolean, default: false },
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
  expectsFighterPick,
} = useGameSession();

const map = computed(() => view.value?.map ?? null);

const wrapRef = ref(null);
const stageRef = ref(null);
const stageReady = ref(false);
const size = ref({ width: 720, height: 480 });

const {
  nodes,
  bounds,
  radius,
  showCellIds,
  sectorsOf,
  sectorConfig,
  temporaryMarksOf,
  dividersOf,
  patternsOf,
  nodeCircleConfig,
  nodeOutlineConfig,
  isActiveCell,
  isPulsingCell,
  isPulsingFighter,
  isDropCell,
  cellGlowConfig,
  cellPulseConfig,
  cellRingConfig,
  pulse,
  pulseActive,
  cellLabelConfig,
  edgeLines,
  startMarkersOf,
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
  frameConfig,
  paperConfig,
  vignetteConfig,
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
  pickFighters: expectsFighterPick,
});

const { pad: fitPad, measure: measureFitPad } = useFitPad(wrapRef, () => props.fitUnits);

const avatars = reactive(new Map());

const avatarOf = token => avatars.get(String(token.fighter.image || '')) || null;

const loadAvatars = () => {
  const urls = new Set(placedFighters.value.map(token => token.fighter.image).filter(Boolean));
  for (const url of urls) {
    if (avatars.has(url)) continue;
    const picture = new Image();
    picture.onload = () => avatars.set(url, picture);
    picture.src = url;
  }
};

watch(() => placedFighters.value.map(token => token.fighter.image || '').join('|'), loadAvatars, {
  immediate: true,
});

const fighterAvatarClip = () => {
  const edgeR = tokenRadius(radius.value);
  return ctx => {
    ctx.beginPath();
    ctx.arc(0, 0, edgeR, 0, Math.PI * 2, false);
    ctx.closePath();
  };
};

const fighterAvatarConfig = token => {
  const faceR = tokenFaceRadius(radius.value) * TOKEN.avatar;
  return {
    image: avatarOf(token),
    x: -faceR,
    y: -faceR,
    width: faceR * 2,
    height: faceR * 2,
    listening: false,
  };
};

const fitPadUnits = computed(() => {
  const units = Number(props.fitUnits) || 0;
  const width = Number(size.value.width) || 0;
  if (!units || !width) return 0;
  return Math.round((width / (width < 767 ? 360 : 1920)) * units);
});

const { stageConfig, zoomIn, zoomOut, onDragMove } = useBoardView({
  size,
  bounds,
  fitPad: computed(() => (Number(props.fitUnits) > 0 ? fitPadUnits.value : fitPad.value)),
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

const PULSE_PERIOD = 1500;

const pulseRings = () => {
  const stage = stageRef.value?.getNode?.();
  if (typeof stage?.find !== 'function') return [];
  return stage.find(entry => entry.getAttr?.('pulseRing') === true) ?? [];
};

const applyPulse = () => {
  const rings = pulseRings();
  if (!rings.length) return;
  const wave = (Date.now() % PULSE_PERIOD) / PULSE_PERIOD;
  for (const ring of rings) {
    const base = Number(ring.getAttr('baseRadius')) || 0;
    const near = Number(ring.getAttr('pulseNear')) || 0;
    const far = Number(ring.getAttr('pulseFar')) || 0;
    ring.radius(base + near + (far - near) * wave);
    ring.strokeWidth(Number(ring.getAttr('pulseWidth')) || 0);
    ring.opacity((Number(ring.getAttr('pulsePeak')) || 0) * (1 - wave) ** 1.4);
  }
  rings[0].getLayer()?.batchDraw();
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

watch([dropCellId, pulse, pulseActive], () => applyPulse(), { flush: 'post' });

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
