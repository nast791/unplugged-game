import { computed } from 'vue';
import { cardBonus } from '#shared/helpers/cards.js';
import {
  CARD_MOMENT_PREFIXES,
  CARD_TEXT_OPTION_LABELS,
  CARD_TYPE_ORDER,
} from '~/constants/cards.js';
import { HEALTH_THRESHOLDS, HEALTH_TONES } from '~/constants/health.js';
import { ITEM_STATE_LABELS } from '~/constants/items.js';
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
  // Панель растёт сверху вниз, а места считаются снизу вверх: своя карточка внизу, выше — следующее место по кругу.
  return [...list.slice(at), ...list.slice(0, at)].reverse();
};

/** Как называть игрока в подписях: имя места из настройки стола, а без него — имя героя. */
export const playerLabel = player => {
  const seat = String(player?.name ?? '').trim();
  if (seat) return seat;
  const hero = (player?.fighters ?? []).find(fighter => fighter.type === 'hero');
  return String(hero?.name ?? player?.id ?? '');
};

const cardTypeRank = card => {
  const index = CARD_TYPE_ORDER.indexOf(String(card?.type));
  return index < 0 ? CARD_TYPE_ORDER.length : index;
};

// Порядок карт в руке один на стол и на окно руки: по типу, затем по значению (сильные первыми), затем по названию.
export const sortHandCards = cards =>
  [...(cards ?? [])].sort((left, right) => {
    const byType = cardTypeRank(left) - cardTypeRank(right);
    if (byType) return byType;
    const byValue = (Number(right?.value) || 0) - (Number(left?.value) || 0);
    if (byValue) return byValue;
    return String(left?.title ?? '').localeCompare(String(right?.title ?? ''), 'ru');
  });

// Своё имя бывает только у счётчика (осколки «во льду»/«собраны»), у активного и неактивного оно общее.
export const itemStateLabel = (item, state) => {
  if (state == null) return '—';
  if (ITEM_STATE_LABELS[state]) return ITEM_STATE_LABELS[state];
  if (item?.states?.[state]) return item.states[state];
  return String(state);
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

// Ярлык опции открывает новую строку только в начале фразы: «получит Помилование» посреди строки не режем.
const optionPattern = () =>
  new RegExp(`(?:^|(?<=[.!?…]\\s))(${CARD_TEXT_OPTION_LABELS.join('|')})\\s*[.:]\\s*`, 'g');

const prefixMomentOf = text => {
  const match = String(text ?? '').match(new RegExp(`^${PREFIX_PATTERN}`));
  return match ? momentOfPrefix(match[1]) : null;
};

// Строки одного момента: ярлык опции («Помилование», «Наказание») — часть свойства, а не выбор игрока.
export const cardTextLines = text => {
  const source = String(text ?? '').trim();
  if (!source) return [];

  const matches = [...source.matchAll(optionPattern())];
  if (matches.length === 0) return [{ label: null, moment: prefixMomentOf(source), text: source }];

  const lines = [];
  const head = source.slice(0, matches[0].index).trim();
  if (head) lines.push({ label: null, moment: prefixMomentOf(head), text: head });

  matches.forEach((match, index) => {
    const from = match.index + match[0].length;
    const to = index + 1 < matches.length ? matches[index + 1].index : source.length;
    const body = source.slice(from, to).trim();
    lines.push({ label: match[1], moment: prefixMomentOf(body), text: body });
  });

  return lines;
};

// Текст карты как его рисует клиент: блоки по моментам, внутри — строки с ярлыками опций.
// Ярлык без своего текста («…карту. Помилование.») закрывает предыдущий момент, а свойство опции
// начинается следующим блоком — значит ярлык переезжает в его первую строку.
export const cardTextBlocks = text => {
  const blocks = [];
  let pending = null;

  cardTextParts(text).forEach((part, index) => {
    let lines = cardTextLines(part.text);

    const tail = lines[lines.length - 1];
    const carry = tail?.label && !tail.text ? tail.label : null;
    if (carry) lines = lines.slice(0, -1);

    if (pending && lines.length > 0) {
      lines = [{ ...lines[0], label: pending }, ...lines.slice(1)];
      pending = null;
    }
    if (carry) pending = pending ?? carry;

    if (lines.length === 0) return;

    blocks.push({
      key: `${index}-${part.moment ?? 'text'}`,
      moment: part.moment,
      lines: lines.map((line, lineIndex) => ({ ...line, key: `${index}-${lineIndex}` })),
    });
  });

  return blocks;
};

// Свойство — фраза своего момента: правила стоят в моменте по порядку, поэтому номер шага даёт фразу.
// Фраз меньше, чем правил (уточнения без правил), — повторяем последнюю, что есть.
export const cardPropertyText = (text, moment, index = 0) => {
  const block = cardTextParts(text).find(part => part.moment === moment);
  if (!block) return null;

  const body = block.text.replace(new RegExp(`^${PREFIX_PATTERN}\\s*`), '');
  const phrases = body
    .split(/(?<=[.!?…])\s+/)
    .map(phrase => phrase.trim())
    .filter(Boolean);
  if (phrases.length === 0) return null;

  return phrases[Math.min(Math.max(Number(index) || 0, 0), phrases.length - 1)] ?? null;
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
