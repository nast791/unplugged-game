import { computed, reactive, ref } from 'vue';

const drag = reactive({ active: false, key: '', card: null, x: 0, y: 0, width: 0, height: 0 });
const over = ref('');

export const getCardDrag = () => drag;

export const startCardDrag = payload => {
  drag.active = true;
  drag.key = String(payload?.key ?? '');
  drag.card = payload?.card ?? null;
  drag.x = Number(payload?.x) || 0;
  drag.y = Number(payload?.y) || 0;
  drag.width = Number(payload?.width) || 0;
  drag.height = Number(payload?.height) || 0;
  over.value = '';
};

export const moveCardDrag = (x, y) => {
  if (!drag.active) return;
  drag.x = Number(x) || 0;
  drag.y = Number(y) || 0;
};

export const setCardDragOver = target => {
  over.value = target ? String(target) : '';
};

export const endCardDrag = () => {
  const finished = { ...drag };
  drag.active = false;
  drag.card = null;
  drag.key = '';
  over.value = '';
  return finished;
};

export const useCardDrag = () => ({
  drag,
  isDragging: computed(() => drag.active),
  over,
  isOver: target => computed(() => drag.active && over.value === String(target)),
  startCardDrag,
  moveCardDrag,
  setCardDragOver,
  endCardDrag,
});

export default useCardDrag;
