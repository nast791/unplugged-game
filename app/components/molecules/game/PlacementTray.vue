<template>
  <div v-if="fighters.length" class="pointer-events-auto flex flex-col items-center gap-8">
    <ATooltip v-for="fighter in fighters" :key="fighter.id" :text="titleOf(fighter)">
      <AAvatar
        draggable="true"
        :data-placement-fighter="fighter.id"
        :alt="fighter.name || ''"
        :ui="{
          avatar_root: cn(
            'size-68 cursor-grab border-3 transition-[border-color,box-shadow] active:cursor-grabbing',
            isActive(fighter)
              ? 'border-accent shadow-[0_0_16px_0_var(--color-accent)]'
              : 'border-info shadow-[0_0_12px_0_color-mix(in_srgb,var(--color-info)_70%,transparent)] placement-blink',
          ),
          avatar_fallback: 'bg-surface-2',
        }"
        @click.stop="selectFighter(fighter.id)"
        @dragstart="onDragStart(fighter, $event)"
      />
    </ATooltip>
  </div>
</template>

<script setup>
import AAvatar from '~/components/atoms/AAvatar.vue';
import ATooltip from '~/components/atoms/ATooltip.vue';
import { TOOLTIPS } from '~/constants/tooltips.js';
import { useGameSession } from '~/composables/game/useGameSession.js';
import { cn } from '~/ui/cn.js';

const { placementFighters, selectedFighterId, selectFighter } = useGameSession();

const fighters = placementFighters;

const isActive = fighter => String(selectedFighterId.value ?? '') === String(fighter.id);
const titleOf = fighter => TOOLTIPS.placementTray.moveFighter({ name: fighter.name || fighter.id });

const dragGhost = (fighter, element) => {
  if (typeof document === 'undefined' || !element) return null;
  const rect = element.getBoundingClientRect();
  const size = Math.max(48, Math.round(rect.width));
  const ghost = element.cloneNode(true);
  ghost.removeAttribute('draggable');
  ghost.style.cssText = [
    'position:fixed',
    'top:-1000px',
    'left:-1000px',
    `width:${size}px`,
    `height:${size}px`,
    'margin:0',
    'border-radius:9999px',
    'overflow:hidden',
    'border:3px solid #2f3843',
    'background:#232b34',
    'box-shadow:none',
    'animation:none',
    'opacity:1',
    'transform:none',
  ].join(';');
  const picture = ghost.querySelector('img');
  if (picture) {
    picture.style.cssText += ';width:100%;height:100%;object-fit:cover;border-radius:9999px';
  }
  document.body.append(ghost);
  return ghost;
};

const onDragStart = (fighter, event) => {
  selectFighter(fighter.id);
  event?.dataTransfer?.setData?.('text/plain', String(fighter.id));
  if (event?.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  const element = event?.currentTarget;
  const ghost = dragGhost(fighter, element);
  if (!ghost) return;

  const rect = element?.getBoundingClientRect?.();
  const point = rect
    ? { x: Number(event.clientX) - rect.left, y: Number(event.clientY) - rect.top }
    : { x: ghost.offsetWidth / 2, y: ghost.offsetHeight / 2 };
  event?.dataTransfer?.setDragImage?.(ghost, Math.round(point.x), Math.round(point.y));

  element?.addEventListener?.('dragend', () => ghost.remove(), { once: true });
};
</script>
