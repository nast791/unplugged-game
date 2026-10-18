import { computed } from 'vue';
import { cardBonus } from '#shared/helpers/cards.js';
import { CARD_MOMENT_PREFIXES } from '~/constants/cards.js';
import { HEALTH_THRESHOLDS, HEALTH_TONES } from '~/constants/health.js';
import { useGameView } from './useGameView.js';

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

export const hpToneKey = percent =>
  percent <= HEALTH_THRESHOLDS.low ? 'low' : percent <= HEALTH_THRESHOLDS.mid ? 'mid' : 'ok';

export const healthTone = fighter => {
  const current = Number(fighter?.currentHp ?? 0);
  const start = Number(fighter?.startHp ?? 0) || 1;
  if (current <= 0) return HEALTH_TONES.down;
  return HEALTH_TONES[hpToneKey(Math.max(0, Math.min(100, (current / start) * 100)))];
};

const PREFIX_PATTERN = `(${CARD_MOMENT_PREFIXES.flatMap(entry => entry.keys).join('|')})\\s*:`;

export const momentOfPrefix = prefix => {
  const key = String(prefix ?? '');
  return CARD_MOMENT_PREFIXES.find(entry => entry.keys.includes(key))?.moment ?? null;
};

// Текст свойства режется по префиксам момента («МГНОВЕННО:», «ПОСЛЕ БИТВЫ:»): своего текста у правил нет,
// а окно битвы подсвечивает ту часть, которая играет сейчас.
export const cardTextParts = text => {
  const source = String(text ?? '');
  if (!source.trim()) return [];

  const matches = [...source.matchAll(new RegExp(PREFIX_PATTERN, 'g'))];
  if (matches.length === 0) return [{ moment: null, text: source.trim() }];

  const parts = [];
  const head = source.slice(0, matches[0].index).trim();
  if (head) parts.push({ moment: null, text: head });

  matches.forEach((match, index) => {
    const to = index + 1 < matches.length ? matches[index + 1].index : source.length;
    parts.push({ moment: momentOfPrefix(match[1]), text: source.slice(match.index, to).trim() });
  });

  return parts;
};

export const momentsOfStage = stage => {
  if (stage === 'reveal') return ['immediately', 'duringCombat'];
  if (stage === 'close') return ['afterCombat'];
  return [];
};

export const cardMoveBonus = card => cardBonus(card);

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
  const actionsTotal = computed(() => view.value?.actionsTotal ?? 0);
  const actionsBonus = computed(() => view.value?.actionsBonus ?? 0);
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
    actionsTotal,
    actionsBonus,
    winner,
    isGameOver,
    me,
  };
};
