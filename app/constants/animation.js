export const ANIMATION_DURATIONS = {
  battleReveal: 1200,
  battleStep: 1600,
  battleDamage: 2600,
  cardFlight: 520,
  damageFloat: 1200,
  aiPause: 1000,
};

export const CARD_FLIGHT = {
  stagger: 90,
  arc: 0.2,
  arcMax: 90,
  lift: 40,
  scale: 0.06,
};

export const ANIMATION_SPEEDS = [
  { id: 'slow', title: 'Медленно', scale: 1.6 },
  { id: 'medium', title: 'Средне', scale: 1 },
  { id: 'fast', title: 'Быстро', scale: 0.6 },
];

export const DEFAULT_ANIMATION_SPEED = 'medium';

export const ANIMATION_SPEED_OPTIONS = ANIMATION_SPEEDS.map(entry => ({
  value: entry.id,
  label: entry.title,
}));

export const animationSpeed = id =>
  ANIMATION_SPEEDS.find(entry => entry.id === String(id)) ??
  ANIMATION_SPEEDS.find(entry => entry.id === DEFAULT_ANIMATION_SPEED);

export const animationScale = id => animationSpeed(id).scale;

export const scaledDuration = (name, speed = DEFAULT_ANIMATION_SPEED) =>
  Math.round((Number(ANIMATION_DURATIONS[name]) || 0) * animationScale(speed));

export default ANIMATION_DURATIONS;
