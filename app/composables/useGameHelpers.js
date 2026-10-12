import { computed } from 'vue';
import { useGameView } from './useGameView.js';

const HEALTH_TONES = {
  ok: { key: 'ok', color: 'var(--color-success)' },
  mid: { key: 'mid', color: 'var(--color-gold)' },
  low: { key: 'low', color: 'var(--color-danger)' },
  down: { key: 'down', color: 'var(--color-line)' },
};

const CARD_TYPES = {
  attack: { label: 'Атака', icon: 'lucide:swords', plate: 'bg-danger' },
  defense: { label: 'Защита', icon: 'lucide:shield', plate: 'bg-info' },
  hybrid: { label: 'Гибрид', icon: 'lucide:shuffle', plate: 'bg-violet' },
  effect: { label: 'Эффект', icon: 'game-icons:magic-palm', plate: 'bg-accent' },
};

const seatOf = player => Number(player?.order) || String(player?.id ?? '');

export const panelOrder = (players = [], viewerSeat) => {
  const list = [...(players ?? [])].sort((left, right) => {
    const a = seatOf(left);
    const b = seatOf(right);
    return typeof a === 'number' && typeof b === 'number'
      ? a - b
      : String(a).localeCompare(String(b));
  });
  const at = list.findIndex(player => String(player?.id) === String(viewerSeat));
  if (at < 0) return list;
  return [...list.slice(at + 1), ...list.slice(0, at + 1)];
};

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

export const hpToneKey = percent => (percent <= 25 ? 'low' : percent <= 60 ? 'mid' : 'ok');

export const healthTone = fighter => {
  const current = Number(fighter?.currentHp ?? 0);
  const start = Number(fighter?.startHp ?? 0) || 1;
  if (current <= 0) return HEALTH_TONES.down;
  return HEALTH_TONES[hpToneKey(Math.max(0, Math.min(100, (current / start) * 100)))];
};

export const CARD_TYPE_ORDER = ['attack', 'defense', 'hybrid', 'effect'];

export const cardType = type =>
  CARD_TYPES[String(type)] ?? {
    label: String(type ?? ''),
    icon: 'lucide:circle-help',
    plate: 'bg-surface-2',
  };

export const useGameHelpers = () => {
  const { view, playerId } = useGameView();

  const players = computed(() => view.value?.players ?? []);

  const findPlayer = id => {
    if (id == null) return null;
    return players.value.find(p => String(p.id) === String(id)) ?? null;
  };

  const you = computed(() => view.value?.you ?? playerId.value ?? null);
  const me = computed(() => findPlayer(you.value));

  const currentPlayerId = computed(() =>
    view.value?.currentPlayer != null ? String(view.value.currentPlayer) : null,
  );
  const currentPlayer = computed(() => findPlayer(currentPlayerId.value));

  const isMyTurn = computed(() => {
    if (you.value == null || currentPlayerId.value == null) return false;
    return String(you.value) === String(currentPlayerId.value);
  });

  const turn = computed(() => view.value?.turn ?? 0);
  const phase = computed(() => view.value?.phase ?? null);
  const actionsLeft = computed(() => view.value?.actionsLeft ?? 0);
  const winner = computed(() => view.value?.winner ?? null);
  const isGameOver = computed(() => phase.value === 'gameEnd' || winner.value != null);

  return {
    you,
    currentPlayerId,
    currentPlayer,
    players,
    isMyTurn,
    turn,
    phase,
    actionsLeft,
    winner,
    isGameOver,
    me,
  };
};
