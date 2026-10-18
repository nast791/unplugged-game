<template>
  <section
    v-if="visible"
    ref="root"
    :class="rootClass"
    :style="rootStyle"
    data-battle-window
    aria-label="Битва"
  >
    <div v-if="collapsed" class="flex flex-col items-center gap-8">
      <div
        v-if="askingCard"
        data-battle-asking
        class="rounded-6 border-info/60 bg-surface/95 backdrop-blur-16 flex flex-col items-center gap-8 border-2 p-12 shadow-2xl"
      >
        <Card :card="askingCard" :highlight="activeMoments" />

        <AButton
          v-if="okVisible"
          data-battle-asking-ok
          :disabled="!okControl.enabled || pending"
          @click="onFinishAction"
        >
          {{ okControl.label || 'Завершить' }}
        </AButton>
      </div>

      <ATooltip :text="TOOLTIPS.battle.expand()">
        <button
          type="button"
          data-battle-mini
          class="rounded-6 border-accent/60 bg-surface/95 backdrop-blur-16 flex items-center gap-10 border-2 px-16 py-10 shadow-2xl"
          :aria-label="TOOLTIPS.battle.expand()"
          @click="expand"
        >
          <Icon name="lucide:swords" class="text-accent size-20 shrink-0" aria-hidden="true" />
          <span class="text-16 font-semibold tracking-[0.02em] uppercase">Битва</span>
          <span class="text-15 text-dim">{{ stageLabel }}</span>
          <span v-if="numbers" class="text-16 lining-nums">
            {{ numbers.attack }} : {{ numbers.defense }}
          </span>
          <Icon name="lucide:chevron-up" class="text-dim size-18 shrink-0" aria-hidden="true" />
        </button>
      </ATooltip>
    </div>

    <div v-else data-battle-body :class="windowClass" @click="onBodyClick">
      <header
        class="border-line flex items-center gap-12 border-b-2 px-16 py-10"
        @pointerdown="beginDrag"
      >
        <Icon name="lucide:swords" class="text-accent size-20 shrink-0" aria-hidden="true" />
        <span class="text-16 font-semibold tracking-[0.02em] uppercase">Битва</span>
        <span class="text-15 text-dim min-w-0 truncate">{{ stageLabel }}</span>

        <div class="ml-auto flex shrink-0 items-center gap-8">
          <button
            v-if="replayActive"
            type="button"
            data-battle-skip
            class="text-13 text-dim hover:text-ink"
            @click.stop="skip"
          >
            Пропустить
          </button>

          <ATooltip :text="TOOLTIPS.battle.minimize()">
            <button
              type="button"
              class="text-dim hover:text-ink -m-4 p-4"
              :aria-label="TOOLTIPS.battle.minimize()"
              @click="collapse"
            >
              <Icon name="lucide:minus" class="size-18" aria-hidden="true" />
            </button>
          </ATooltip>
        </div>
      </header>

      <div class="flex shrink-0 items-start justify-center gap-12 p-12">
        <BattleSide
          v-if="defender"
          :side="defender"
          :highlight="activeMoments"
          :boost="boostSide === 'defender' ? boostCard : null"
          :damage="damageOf(defender)"
        />

        <div v-if="showSwords" class="self-center px-4" data-battle-swords>
          <Icon name="lucide:swords" class="battle-clash text-danger size-64" aria-hidden="true" />
        </div>

        <BattleSide
          v-if="attacker"
          :side="attacker"
          :highlight="activeMoments"
          :boost="boostSide === 'attacker' ? boostCard : null"
          :damage="damageOf(attacker)"
        />
      </div>

      <div
        v-if="numbers"
        class="border-line/60 mx-12 flex shrink-0 items-center justify-center gap-10 border-y-2 py-6"
      >
        <span class="text-13 text-dim tracking-[0.08em] uppercase">Числа</span>
        <span class="text-18 lining-nums">{{ numbers.attack }} − {{ numbers.defense }}</span>
        <span v-if="damageAmount != null" class="text-18 text-danger font-semibold lining-nums">
          урон {{ damageAmount }}
        </span>
        <span v-else class="text-15 text-dim">урон ещё не считали</span>
      </div>

      <AScroll class="min-h-0 flex-1 px-12 py-8">
        <ol v-if="steps.length" class="flex flex-col gap-4">
          <li
            v-for="(step, index) in steps"
            :key="step.key"
            data-battle-step
            class="rounded-4 flex items-center gap-8 px-6 py-2"
            :class="index === activeStepIndex && 'bg-info/10'"
          >
            <Icon
              :name="shown(index) ? step.statusIcon : 'lucide:hourglass'"
              :class="[shown(index) ? step.statusTone : 'text-dim', 'size-16 shrink-0']"
              aria-hidden="true"
            />

            <span class="text-13 text-dim min-w-0 flex-1 truncate">{{ step.line }}</span>

            <span
              v-if="shown(index)"
              data-battle-step-status
              class="text-13 shrink-0"
              :class="step.statusTone"
            >
              {{ step.statusLabel }}
            </span>
          </li>
        </ol>

        <p v-else class="text-14 text-dim">
          У карт этой битвы свойств нет — считаются только числа
        </p>
      </AScroll>

      <div
        v-if="finished"
        data-battle-done
        class="border-line/60 flex shrink-0 items-center justify-between gap-12 border-t-2 px-12 py-8 pr-40"
      >
        <span class="text-13 text-dim min-w-0 truncate">Битва закончена</span>

        <AButton data-battle-close :disabled="pending" @click="dismiss">Закрыть</AButton>
      </div>

      <div
        v-else-if="okVisible"
        class="border-line/60 flex shrink-0 justify-end border-t-2 px-12 py-8 pr-40"
      >
        <AButton :disabled="!okControl.enabled || pending" @click="onFinishAction">
          {{ okControl.label || 'Завершить' }}
        </AButton>
      </div>

      <ATooltip :text="TOOLTIPS.battle.resize()" side="left">
        <div
          data-battle-resize
          class="absolute right-2 bottom-2 size-28 cursor-nwse-resize touch-none"
          role="separator"
          tabindex="0"
          :aria-label="TOOLTIPS.battle.resize()"
          @pointerdown="beginResize"
          @keydown="onResizeKey"
        />
      </ATooltip>
    </div>
  </section>
</template>

<script setup>
import AButton from '~/components/atoms/AButton.vue';
import AScroll from '~/components/atoms/AScroll.vue';
import ATooltip from '~/components/atoms/ATooltip.vue';
import BattleSide from '~/components/molecules/game/BattleSide.vue';
import Card from '~/components/molecules/game/Card.vue';
import { TOOLTIPS } from '~/constants/tooltips.js';
import { BATTLE_MIN_SIZE, useBattleView } from '~/composables/game/useBattleView.js';
import { useGameSession } from '~/composables/game/useGameSession.js';
import { useDraggable } from '~/composables/ui/useDraggable.js';
import { cn } from '~/ui/cn.js';

const props = defineProps({
  focus: { type: Boolean, default: false },
});

const {
  visible,
  sides,
  steps,
  shownSteps,
  activeStepIndex,
  activeMoments,
  stage,
  stageLabel,
  numbers,
  damage,
  showSwords,
  boost,
  asking,
  finished,
  replayActive,
  skip,
  dismiss,
} = useBattleView();
const { okControl, onFinishAction, pending } = useGameSession();

const SCREEN_MARGIN = 24;
const KEY_STEP = 24;

const root = ref(null);

const minimized = ref(false);
const askedCollapsed = ref(false);
const place = ref(null);
const size = ref(null);
const grabbed = ref({ width: 0, height: 0 });

const attacker = computed(() => sides.value.find(side => side.side === 'attacker') ?? null);
const defender = computed(() => sides.value.find(side => side.side === 'defender') ?? null);

const okVisible = computed(() => okControl.value.visible === true);
const askingCard = computed(() => asking.value?.card ?? null);

const boostCard = computed(() => boost.value?.card ?? null);
const boostSide = computed(() => boost.value?.side ?? null);

const collapsed = computed(() => minimized.value || askedCollapsed.value);

const expand = () => {
  minimized.value = false;
  askedCollapsed.value = false;
};

const collapse = () => {
  minimized.value = true;
};

const shown = index => index < shownSteps.value;

const damageAmount = computed(() => {
  if (replayActive.value) return damage.value?.amount ?? null;
  return stage.value === 'close' ? (numbers.value?.damage ?? null) : null;
});

const damageOf = side =>
  damage.value && String(damage.value.fighterId) === String(side?.fighterId)
    ? damage.value.amount
    : 0;

const onBodyClick = event => {
  if (!replayActive.value) return;
  if (event?.target?.closest?.('button')) return;
  skip();
};

const onKeydown = event => {
  if (!replayActive.value) return;
  if (![' ', 'Enter', 'Spacebar'].includes(event.key)) return;
  event.preventDefault();
  skip();
};

const onPointerDown = event => {
  if (!finished.value || !visible.value) return;
  if (root.value?.contains?.(event.target)) return;
  dismiss();
};

onMounted(() => {
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('pointerdown', onPointerDown, true);
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  document.removeEventListener('pointerdown', onPointerDown, true);
});

const measure = () => {
  const rect = root.value?.getBoundingClientRect?.();
  return {
    left: rect?.left ?? 0,
    top: rect?.top ?? 0,
    width: rect?.width ?? BATTLE_MIN_SIZE.width,
    height: rect?.height ?? BATTLE_MIN_SIZE.height,
  };
};

const pin = () => {
  const box = measure();
  grabbed.value = { width: box.width, height: box.height };
  place.value = { x: box.left, y: box.top };
  return box;
};

const clampToScreen = next => ({
  x: Math.min(Math.max(next.x, 0), Math.max(0, window.innerWidth - grabbed.value.width)),
  y: Math.min(Math.max(next.y, 0), Math.max(0, window.innerHeight - grabbed.value.height)),
});

const { isDragging, handlers } = useDraggable(place, { clamp: clampToScreen, threshold: 4 });

const beginDrag = event => {
  if (event.target?.closest?.('button')) return;
  pin();
  handlers.onPointerdown(event);
};

const sizeLimit = () => ({
  width: Math.max(BATTLE_MIN_SIZE.width, window.innerWidth - SCREEN_MARGIN * 2),
  height: Math.max(BATTLE_MIN_SIZE.height, window.innerHeight - SCREEN_MARGIN * 2),
});

const clampSize = next => {
  const limit = sizeLimit();
  return {
    width: Math.min(Math.max(next.width, BATTLE_MIN_SIZE.width), limit.width),
    height: Math.min(Math.max(next.height, BATTLE_MIN_SIZE.height), limit.height),
  };
};

let resizing = null;

const onResizeMove = event => {
  if (!resizing || event.pointerId !== resizing.pointerId) return;
  size.value = clampSize({
    width: resizing.width + (event.clientX - resizing.x),
    height: resizing.height + (event.clientY - resizing.y),
  });
};

const stopResize = event => {
  if (resizing && event && event.pointerId !== resizing.pointerId) return;
  resizing = null;
  document.removeEventListener('pointermove', onResizeMove);
  document.removeEventListener('pointerup', stopResize);
  document.removeEventListener('pointercancel', stopResize);
};

const beginResize = event => {
  if (event.button !== 0) return;
  event.preventDefault();

  const box = pin();
  size.value = clampSize({ width: box.width, height: box.height });
  resizing = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    width: box.width,
    height: box.height,
  };

  document.addEventListener('pointermove', onResizeMove);
  document.addEventListener('pointerup', stopResize);
  document.addEventListener('pointercancel', stopResize);
};

const onResizeKey = event => {
  const step = event.shiftKey ? KEY_STEP * 2 : KEY_STEP;
  const delta = {
    ArrowRight: { width: step },
    ArrowLeft: { width: -step },
    ArrowDown: { height: step },
    ArrowUp: { height: -step },
  }[event.key];
  if (!delta) return;

  event.preventDefault();
  const box = pin();
  const current = size.value ?? { width: box.width, height: box.height };
  size.value = clampSize({
    width: current.width + (delta.width ?? 0),
    height: current.height + (delta.height ?? 0),
  });
};

onBeforeUnmount(stopResize);

watch(
  () => props.focus,
  on => {
    if (on) collapse();
  },
  { immediate: true },
);

watch(visible, open => {
  if (!open) return;
  if (props.focus) collapse();
  else expand();
});

watch(
  () => Boolean(asking.value),
  (now, before) => {
    if (now) {
      askedCollapsed.value = true;
      return;
    }
    if (before && !props.focus) expand();
  },
);

watch(finished, done => {
  if (done && !props.focus) expand();
});

const sized = computed(() => Boolean(size.value) && !collapsed.value);

const rootClass = computed(() =>
  cn(
    'pointer-events-auto text-ink min-h-0 select-none',
    place.value && 'fixed z-30',

    !collapsed.value && !size.value && 'w-640 max-w-full',
    place.value && !collapsed.value && isDragging.value && 'cursor-grabbing',
  ),
);

const windowClass = computed(() =>
  cn(
    'rounded-6 border-line bg-surface/95 backdrop-blur-16 relative flex max-h-[80dvh] min-h-0 w-full flex-col border-2 shadow-2xl',
    sized.value && 'h-full max-h-none',
  ),
);

const rootStyle = computed(() => {
  if (!place.value) return null;
  const style = { left: `${place.value.x}px`, top: `${place.value.y}px` };
  if (sized.value) {
    style.width = `${size.value.width}px`;
    style.height = `${size.value.height}px`;
  }
  return style;
});
</script>
