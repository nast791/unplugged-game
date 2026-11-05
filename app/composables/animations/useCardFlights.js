import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { cardKey } from '#shared/helpers/cards.js';
import { CARD_FLIGHT } from '~/constants/animation.js';
import { useGameSession } from '~/composables/game/useGameSession.js';
import { useSettings } from '~/composables/ui/useSettings.js';

export const flightFrame = (from, to, t, options = {}) => {
  const ease = options.ease ?? (value => 1 - (1 - value) ** 3);
  const progress = ease(Math.min(1, Math.max(0, t)));
  const arc = Number(options.arc) || 0;
  const lift = Number(options.lift) || 0;

  const x = from.x + (to.x - from.x) * progress;
  const y = from.y + (to.y - from.y) * progress - Math.sin(Math.PI * progress) * lift;
  const side = arc ? Math.sin(Math.PI * progress) * arc : 0;

  return {
    x: x + side,
    y,
    opacity: 1 - Math.max(0, (progress - 0.72) / 0.28) * 0.15,
  };
};

export const flightTarget = (from, to) => ({
  x: to.left + (to.width - from.width) / 2,
  y: to.top + (to.height - from.height) / 2,
});

const arcOf = (from, to) =>
  to.x >= from.x ? 0 : -Math.min(CARD_FLIGHT.arcMax, Math.abs(to.x - from.x) * CARD_FLIGHT.arc);

// Переворот карты на колоде: до половины видна рубашка, после — лицо; карта при этом приподнимается.
export const flipFrame = (t = 0) => {
  const progress = Math.min(1, Math.max(0, Number(t) || 0));
  return {
    scaleX: Math.abs(Math.cos(Math.PI * progress)),
    back: progress < 0.5,
    face: progress >= 0.5,
    lift: Math.sin(Math.PI * progress) * CARD_FLIGHT.flipLift,
  };
};

// Путь добора: карта летит не в ладонь, а к точке над ней, и последний отрезок падает сверху вниз.
export const drawPath = (from, to) => {
  const target = flightTarget(from, to);
  const drop = Math.min(CARD_FLIGHT.drop, Math.max(0, target.y));
  return { target, approach: { x: target.x, y: target.y - drop } };
};

const easeOut = value => 1 - (1 - value) ** 3;

// Карта на колоде лежит её размером, а летит уже своим: переворот начинается с этого масштаба.
export const deckStartScale = ({ from, to }) => {
  const ratio = (deck, card) => (Number(card) > 0 ? Number(deck) / Number(card) : 1);
  const scale = Math.min(ratio(from?.width, to?.width), ratio(from?.height, to?.height));
  return Math.min(1, Math.max(0.3, scale));
};

export const runCardFlight = ({ pilot, flight, timings, onDone }) => {
  if (!pilot) return () => {};

  const flipMs = flight.flip ? Math.max(0, Number(timings?.flip) || 0) : 0;
  const travelMs = Math.max(0, Number(timings?.travel) || 0);
  const dropMs = Math.max(0, Number(timings?.drop) || 0);
  const total = flipMs + travelMs + dropMs;

  const back = pilot.querySelector?.('[data-flight-back]') ?? null;
  const face = pilot.querySelector?.('[data-flight-card]') ?? null;

  const from = { x: flight.from.x, y: flight.from.y };
  const { target, approach } = drawPath(from, flight.to);
  const arc = arcOf(flight.from, flight.to);
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let frame = null;

  const showSides = (backVisible, scaleX) => {
    if (back) {
      back.style.display = backVisible ? '' : 'none';
      back.style.transform = `scaleX(${scaleX})`;
    }
    if (face) {
      face.style.display = backVisible ? 'none' : '';
      face.style.transform = `scaleX(${scaleX})`;
    }
  };

  const place = (point, scale, opacity = 1) => {
    pilot.style.transform = `translate3d(${point.x}px, ${point.y}px, 0) scale(${scale})`;
    pilot.style.opacity = String(opacity);
  };

  const progressScale = progress => 1 - CARD_FLIGHT.scale * Math.min(1, Math.max(0, progress));
  const flipStart = deckStartScale(flight);

  // На колоде карта ещё размером с колоду: за переворот она вырастает до своего настоящего размера.
  const paintFlip = progress => {
    const flip = flipFrame(progress);
    showSides(flip.back, flip.scaleX);
    const scale =
      flipStart + (progressScale(total ? flipMs / total : 0) - flipStart) * easeOut(progress);
    place({ x: from.x, y: from.y - flip.lift }, scale, 1);
  };

  const paintTravel = progress => {
    const point = flightFrame(from, approach, progress, { arc, lift: CARD_FLIGHT.lift });
    showSides(false, 1);
    place(point, progressScale(total ? (flipMs + travelMs * progress) / total : 0), point.opacity);
  };

  const paintDrop = progress => {
    const eased = easeOut(progress);
    showSides(false, 1);
    place(
      { x: target.x, y: approach.y + (target.y - approach.y) * eased },
      progressScale(total ? (flipMs + travelMs + dropMs * progress) / total : 0),
      1 - 0.15 * progress,
    );
  };

  const paint = elapsed => {
    if (elapsed < flipMs) paintFlip(flipMs ? elapsed / flipMs : 1);
    else if (elapsed < flipMs + travelMs) paintTravel(travelMs ? (elapsed - flipMs) / travelMs : 1);
    else paintDrop(dropMs ? (elapsed - flipMs - travelMs) / dropMs : 1);
  };

  pilot.style.opacity = '1';
  paint(0);

  const tick = now => {
    const elapsed = (typeof now === 'number' ? now : Date.now()) - started;
    const time = Math.min(total, Math.max(0, elapsed));
    paint(time);
    if (total > 0 && elapsed < total) {
      frame = requestAnimationFrame(tick);
      return;
    }
    frame = null;
    onDone?.();
  };

  if (typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(tick);
  else {
    paint(total);
    onDone?.();
  }

  return () => {
    if (frame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
    frame = null;
  };
};

// Смена смотрящего в hotseat меняет руку целиком: без отметки разница руки читается как перелёт всех карт.
let viewerChanged = false;
export const markCardFlightsViewerChanged = () => {
  viewerChanged = true;
};

const rectOf = selector => {
  const node = document.querySelector(selector);
  return node ? node.getBoundingClientRect() : null;
};

const handSelector = key => `[data-hand-card][data-card-key="${key}"]`;
const markupOf = key => document.querySelector(handSelector(key))?.outerHTML ?? '';

// outerHTML карты дорогой, а нужен только летящей карте: снимаем при появлении и обновляем после отрисовки.
const markupCache = new Map();

export const useCardFlights = () => {
  const { myHand, you } = useGameSession();
  const { duration } = useSettings();
  const flights = ref([]);
  const timers = new Set();
  let seq = 0;
  let snapshot = null;

  watch(you, () => markCardFlightsViewerChanged());

  const wait = ms =>
    new Promise(resolve => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        resolve();
      }, ms);
      timers.add(timer);
    });

  const takeSnapshot = () => {
    const hand = new Map();
    for (const card of myHand.value ?? []) {
      const key = cardKey(card);
      const markup = markupCache.get(key) ?? markupOf(key);
      markupCache.set(key, markup);
      hand.set(key, { card, markup });
    }
    for (const key of [...markupCache.keys()]) {
      if (!hand.has(key)) markupCache.delete(key);
    }
    return {
      hand,
      deck: rectOf('[data-card-anchor="deck"]'),
      discard: rectOf('[data-card-anchor="discard"]'),
    };
  };

  const refreshMarkupCache = () => {
    for (const key of markupCache.keys()) {
      const markup = markupOf(key);
      if (markup) markupCache.set(key, markup);
    }
  };

  const launch = (card, from, to, markup, options = {}) => {
    if (!from || !to) return;
    flights.value = [
      ...flights.value,
      {
        id: (seq += 1),
        card,
        markup,
        flip: options.flip === true,
        from: { x: from.left, y: from.top, width: from.width, height: from.height },
        to: { x: to.left, y: to.top, width: to.width, height: to.height },
      },
    ];
  };

  const runFlights = async (before, after) => {
    const added = [];
    const removed = [];

    if (viewerChanged) {
      viewerChanged = false;
      return;
    }

    for (const [key, entry] of after.hand) {
      if (!before.hand.has(key)) added.push({ key, entry });
    }
    for (const [key, entry] of before.hand) {
      if (!after.hand.has(key)) removed.push({ key, entry });
    }
    if (!added.length && !removed.length) return;

    for (const [index, { key, entry }] of added.entries()) {
      if (index) await wait(index * CARD_FLIGHT.stagger);
      const to = rectOf(handSelector(key)) ?? after.deck;
      launch(entry.card, after.deck, to, entry.markup, { flip: true });
    }

    for (const [index, { entry }] of removed.entries()) {
      const delay = (added.length + index) * CARD_FLIGHT.stagger;
      if (delay) await wait(delay);
      launch(entry.card, before.discard, after.discard, entry.markup);
    }
  };

  const settle = async () => {
    await nextTick();
    const before = snapshot;
    const after = takeSnapshot();
    snapshot = after;
    refreshMarkupCache();
    if (before) await runFlights(before, after);
  };

  watch(myHand, () => void settle());

  if (import.meta.client) {
    onMounted(() => {
      snapshot = takeSnapshot();
    });
  }

  const finish = id => {
    flights.value = flights.value.filter(flight => flight.id !== id);
  };

  onBeforeUnmount(() => {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    flights.value = [];
  });

  return {
    flights,
    finish,
    flightTimings: () => ({
      flip: duration('cardFlip'),
      travel: duration('cardFlight'),
      drop: duration('cardDrop'),
    }),
  };
};

export default useCardFlights;
