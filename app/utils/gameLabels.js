export const itemStateLabel = (item, state) => {
  if (item?.states?.[state]) return item.states[state];
  if (state === 'active') return 'активна';
  if (state === 'inactive') return 'разряжена';
  return state == null ? '—' : String(state);
};

export const hpPercent = fighter =>
  Math.max(
    0,
    Math.min(100, (Number(fighter?.currentHp ?? 0) / Number(fighter?.startHp || 1)) * 100),
  );

export const hpLabel = fighter =>
  `${Number(fighter?.currentHp ?? 0)}/${Number(fighter?.startHp ?? 0)}`;

export default { itemStateLabel, hpPercent, hpLabel };
