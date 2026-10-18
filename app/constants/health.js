export const HEALTH_TONES = {
  ok: { key: 'ok', color: 'var(--color-success)', ring: 'border-success' },
  mid: { key: 'mid', color: 'var(--color-gold)', ring: 'border-gold' },
  low: { key: 'low', color: 'var(--color-danger)', ring: 'border-danger' },
  down: { key: 'down', color: 'var(--color-line)', ring: 'border-line' },
};

export const HEALTH_THRESHOLDS = { low: 25, mid: 60 };

export default HEALTH_TONES;
