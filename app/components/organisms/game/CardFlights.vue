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

const { flights, finish, flightDuration } = useCardFlights();

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
    duration: flightDuration(),
    onDone: () => finish(flight.id),
  });
};

const buildPilot = (node, flight) => {
  if (!flight.markup) return null;
  const pilot = document.createElement('div');
  pilot.innerHTML = flight.markup;
  for (const marked of pilot.querySelectorAll('[data-hand-card], [data-card-key]')) {
    marked.removeAttribute('data-hand-card');
    marked.removeAttribute('data-card-key');
  }
  pilot.style.position = 'absolute';
  pilot.style.left = '0';
  pilot.style.top = '0';
  pilot.style.width = `${flight.from.width}px`;
  pilot.style.height = `${flight.from.height}px`;
  pilot.style.margin = '0';
  node.style.transform = `translate3d(${flight.from.x}px, ${flight.from.y}px, 0)`;
  node.append(pilot);
  return pilot;
};
</script>
