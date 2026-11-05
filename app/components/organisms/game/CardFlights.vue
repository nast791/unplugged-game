<template>
  <Teleport to="body">
    <span
      v-for="flight in flights"
      :key="flight.id"
      :ref="node => register(node, flight)"
      class="pointer-events-none fixed top-0 left-0 z-40 block will-change-transform"
      aria-hidden="true"
    />
  </Teleport>
</template>

<script setup>
import { runCardFlight, useCardFlights } from '~/composables/animations/useCardFlights.js';
import { useGameSession } from '~/composables/game/useGameSession.js';
import { useHeroPacks } from '~/composables/api/heroes.js';

const { flights, finish, flightTimings } = useCardFlights();
const { me } = useGameSession();
const { heroPack } = useHeroPacks();

const cardBack = computed(() => heroPack(me.value?.heroId)?.cardBack ?? null);

const register = (node, flight) => {
  if (!node) return;
  const pilot = buildPilot(node, flight);
  if (!pilot) {
    finish(flight.id);
    return;
  }

  runCardFlight({
    pilot,
    flight,
    timings: flightTimings(),
    onDone: () => finish(flight.id),
  });
};

const cardLayer = flight => {
  const face = document.createElement('div');
  face.dataset.flightCard = '';
  face.style.cssText = 'position:absolute;left:0;top:0;transform-origin:50% 50%;';
  face.innerHTML = flight.markup;
  for (const marked of face.querySelectorAll('[data-hand-card], [data-card-key]')) {
    marked.removeAttribute('data-hand-card');
    marked.removeAttribute('data-card-key');
  }
  return face;
};

const backLayer = (width, height) => {
  const back = document.createElement('div');
  back.dataset.flightBack = '';
  const art = cardBack.value;
  back.className = art
    ? 'rounded-6 border-line bg-surface-2 overflow-hidden border-2 bg-cover bg-center shadow-[0_calc(var(--spacing)*2)_calc(var(--spacing)*10)_0_rgb(0_0_0/45%)]'
    : 'rounded-6 border-line bg-surface-2 border-2 shadow-[0_calc(var(--spacing)*2)_calc(var(--spacing)*10)_0_rgb(0_0_0/45%)]';
  back.style.cssText = `position:absolute;left:0;top:0;width:${width}px;height:${height}px;transform-origin:50% 50%;${art ? `background-image:url("${art}");` : ''}`;
  if (art) back.innerHTML = '';
  else back.innerHTML = '<span class="rounded-4 border-line/70 absolute inset-6 border-2"></span>';
  return back;
};

const buildPilot = (node, flight) => {
  if (!flight.markup) return null;
  const pilot = document.createElement('div');
  pilot.style.position = 'absolute';
  pilot.style.left = '0';
  pilot.style.top = '0';
  pilot.style.width = `${flight.from.width}px`;
  pilot.style.height = `${flight.from.height}px`;
  pilot.style.margin = '0';

  const face = cardLayer(flight);
  pilot.append(face);
  node.append(pilot);

  const width = face.firstElementChild?.offsetWidth || flight.from.width;
  const height = face.firstElementChild?.offsetHeight || flight.from.height;
  face.style.width = `${width}px`;
  face.style.height = `${height}px`;

  if (flight.flip) {
    pilot.append(backLayer(width, height));
    face.style.display = 'none';
  }

  node.style.transform = `translate3d(${flight.from.x}px, ${flight.from.y}px, 0)`;
  return pilot;
};
</script>
