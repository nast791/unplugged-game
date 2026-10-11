// порог «капец» — 25 %, «средне» — 60 %; убитый боец не тон, а отдельное состояние (`down`)
const TONES = {
  ok: { key: 'ok', color: 'var(--color-success)' },
  mid: { key: 'mid', color: 'var(--color-gold)' },
  low: { key: 'low', color: 'var(--color-danger)' },
  down: { key: 'down', color: 'var(--color-line)' },
};

export const hpToneKey = percent => (percent <= 25 ? 'low' : percent <= 60 ? 'mid' : 'ok');

export const healthTone = fighter => {
  const current = Number(fighter?.currentHp ?? 0);
  const start = Number(fighter?.startHp ?? 0) || 1;
  if (current <= 0) return TONES.down;
  return TONES[hpToneKey(Math.max(0, Math.min(100, (current / start) * 100)))];
};

export default healthTone;
