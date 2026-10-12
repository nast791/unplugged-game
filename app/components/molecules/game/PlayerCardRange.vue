<template>
  <div class="flex items-center gap-6">
    <div class="flex items-center gap-6" v-for="item in items" :key="item.id">
      <component :is="item.icon" class="size-15" aria-hidden="true" />
      <span class="text-15">{{ item.stat }}</span>
    </div>
  </div>
</template>
<script setup>
import AttackIcon from '~/svg/game/attack.svg';
import MoveIcon from '~/svg/game/move.svg';

const props = defineProps({
  move: [Number, String],
  attackRange: [Number, String],
});

const items = [
  {
    id: 1,
    icon: markRaw(MoveIcon),
    stat: props.move,
  },
  {
    id: 2,
    icon: markRaw(AttackIcon),
    stat: props.attackRange,
  },
];
</script>
