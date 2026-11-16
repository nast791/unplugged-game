import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { cardBonus, cardKey, cardValue } from '#shared/helpers/cards.js';
import { combatOutcome } from '#shared/helpers/combat.js';
import { cardType } from '~/constants/cards.js';
import {
  cardPropertyText,
  healthTone,
  hpLabel,
  hpPercent,
  momentsOfStage,
  playerLabel,
} from './useGameHelpers.js';
import {
  battleResultShown,
  registerBattleDismiss,
  setBattleResultShown,
  setBattleResultSummary,
} from './useBattleGate.js';
import { useGameSession } from './useGameSession.js';
import { useSettings } from '../ui/useSettings.js';

export { battleResultShown };

export const BATTLE_MIN_SIZE = { width: 380, height: 260 };

export const BATTLE_STAGES = {
  attacker: 'выбор бойца',
  target: 'выбор цели',
  defense: 'защита',
  reveal: 'свойства карт',
  resolve: 'числа и урон',
  close: 'завершена',
};

export const BATTLE_MOMENTS = {
  immediately: 'Мгновенно',
  duringCombat: 'Во время битвы',
  afterCombat: 'После битвы',
};

export const BATTLE_STEP_STATUSES = {
  pending: { label: 'ждёт очереди', icon: 'lucide:hourglass', tone: 'text-dim' },
  waiting: { label: 'пауза: решает игрок', icon: 'lucide:pause', tone: 'text-info' },
  applied: { label: 'сработало', icon: 'lucide:check', tone: 'text-success' },
  skipped: { label: 'не сработало', icon: 'lucide:x', tone: 'text-dim' },
  declined: { label: 'отказ', icon: 'lucide:undo-2', tone: 'text-dim' },
  cancelled: { label: 'отменено', icon: 'lucide:ban', tone: 'text-danger' },
};

const FALLBACK_STEP = { label: 'шаг', icon: 'lucide:circle-help', tone: 'text-dim' };

/** Род карты в строке результата — строчными, как в тексте свойства: «· атака · значение 5». */
const cardTypeLabel = type => cardType(type).label.toLowerCase();

export const battleStageLabel = stage => BATTLE_STAGES[String(stage ?? '')] ?? '';
export const battleMomentLabel = moment =>
  BATTLE_MOMENTS[String(moment ?? '')] ?? String(moment ?? '');
export const battleStepStatus = status =>
  BATTLE_STEP_STATUSES[String(status ?? '')] ?? FALLBACK_STEP;

export const battleFighter = (players = [], fighterId) => {
  if (fighterId == null) return null;
  for (const player of players ?? []) {
    // Павшие лежат в `lost`: убитый защитник остаётся в окне битвы тем, кем был, а не пустым местом.
    const fighter = [...(player?.fighters ?? []), ...(player?.lost ?? [])].find(
      entry => String(entry.id) === String(fighterId),
    );
    if (fighter) return { player, fighter };
  }
  return null;
};

export const battleSide = ({ combat, players = [], side } = {}) => {
  const isAttacker = side === 'attacker';
  const cardField = isAttacker ? 'attackCard' : 'defenseCard';
  const holder = battleFighter(
    players,
    isAttacker ? combat?.attackerFighterId : combat?.targetFighterId,
  );
  const playerId = isAttacker ? combat?.attackerPlayerId : combat?.defenderPlayerId;
  const card = combat?.[cardField] ?? null;
  const value = isAttacker ? combat?.attackValue : combat?.defenseValue;
  const printed = card ? cardValue(card) : null;
  const isAi = String(holder?.player?.control ?? '').toLowerCase() === 'ai';
  const decided = ['reveal', 'resolve', 'close'].includes(String(combat?.stage ?? ''));
  const dead = holder ? Number(holder.fighter.currentHp ?? 0) <= 0 : false;
  const fighterName = holder?.fighter?.name ?? (isAttacker ? 'Боец не выбран' : 'Цель не выбрана');
  // Строка игрока под бойцом: у места компьютера её нет вовсе, а у места без своего имени она
  // не повторяет имя бойца («Дороти / Дороти» — уже не подпись).
  const holderLabel = playerLabel(holder?.player);
  const playerName =
    isAi || holderLabel === String(fighterName)
      ? ''
      : holderLabel || (playerId == null ? 'Противник не выбран' : String(playerId));

  return {
    side,
    title: isAttacker ? 'Атака' : 'Защита',

    playerName,
    isAi,
    dead,
    deadLabel: dead ? (isAttacker ? 'Боец убит' : 'Цель убита') : '',
    color: holder?.player?.color ?? null,
    heroId: holder?.player?.heroId == null ? null : String(holder.player.heroId),
    fighterId: holder?.fighter?.id == null ? null : String(holder.fighter.id),
    fighterName,
    image: holder?.fighter?.image == null ? null : String(holder.fighter.image),
    hpLabel: holder ? hpLabel(holder.fighter) : '',
    hpPercent: holder ? hpPercent(holder.fighter) : null,
    hpColor: holder ? healthTone(holder.fighter).color : null,
    cardState: card ? 'open' : decided ? 'empty' : isAttacker ? 'hidden' : 'waiting',
    card: card ? { ...card, bonus: cardBonus(card) } : null,
    cardType: card ? cardType(card.type) : null,
    value: value == null ? printed : Number(value),
    printed,
    valueChanged: card != null && value != null && Number(value) !== printed,
    valueDelta: card != null && value != null ? Number(value) - printed : 0,
  };
};

export const battleSides = (combat, players = []) =>
  combat
    ? [
        battleSide({ combat, players, side: 'defender' }),
        battleSide({ combat, players, side: 'attacker' }),
      ]
    : [];

/** Имя бойца по id — для строки «Результат: урон получил …». */
const fighterNameOf = (players = [], fighterId) => {
  for (const player of players ?? []) {
    for (const fighter of [...(player?.fighters ?? []), ...(player?.lost ?? [])]) {
      if (String(fighter?.id) === String(fighterId)) return String(fighter.name ?? '');
    }
  }
  return '';
};

/** Карта в строке результата: имя с подсказкой и рядом тип, значение и бонус — как у раскрытой. */
const cardLine = (lead, card) => ({
  before: `${lead}«`,
  card: {
    name: String(card?.title ?? card?.name ?? ''),
    text: String(card?.text ?? ''),
  },
  after: `» · ${cardTypeLabel(card?.type)} · значение ${Number(card?.value) || 0} · бонус ${Number(card?.bonus) || 0}`,
});

/** Раскрытая карта строкой: «Раскрыта карта «Песчаная буря» · атака · значение 5 · бонус 3». */
export const revealLine = card => cardLine('Раскрыта карта ', card);

/** То же одной строкой — для ленты подсказок, где нет подсказки по имени карты. */
export const revealText = card => {
  const line = revealLine(card);
  return `${line.before}${line.card.name}${line.after}`;
};

/** Имя игрока по id — раскрытую карту в ленте подписывает её владелец. */
const playerNameOf = (players = [], playerId) => {
  const player = (players ?? []).find(entry => String(entry?.id) === String(playerId));
  return String(player?.name ?? '');
};

/**
 * Что шаг сделал по факту: выбор игрока, сброшенная карта, раскрытие колоды, снятое здоровье.
 * Части собираются в куски: текст и имя карты (у имени — подсказка с текстом карты).
 */
const stepResultParts = step => {
  const parts = [];
  // выбранная и сброшенная карта — те же строки, что и раскрытая: у имени подсказка с текстом,
  // рядом тип, значение и бонус (снимок карты движок кладёт в шаг)
  const chosen = (step.cards ?? []).filter(Boolean);
  for (const card of chosen) parts.push(cardLine('выбрана карта ', card));
  if (step.picked?.length) parts.push({ text: `выбрано «${step.picked.join('», «')}»` });
  for (const card of step.discarded ?? []) {
    if (card.title) parts.push(cardLine('в сброс ушла карта ', card));
  }
  // раскрытую карту показывает результат её свойства, а не отдельная плашка сбоку
  for (const reveal of step.reveal ?? []) {
    for (const card of reveal.cards ?? []) parts.push(revealLine(card));
  }
  // род бойца не угадать («Дороти», «Тото»), поэтому урон пишется без глагола
  for (const hit of step.hurt ?? []) {
    parts.push({ text: `${hit.name || 'боец'}: урон ${hit.amount}` });
  }

  return parts.flatMap((part, index) => (index === 0 ? [part] : [{ text: '; ' }, part]));
};

/** Тот же результат одной строкой: его читают тесты и лента подсказок. */
const stepResultText = parts =>
  parts
    .map(part =>
      part.card ? `${part.before ?? ''}${part.card.name}${part.after ?? ''}` : part.text,
    )
    .join('');

export const battleSteps = (combat, players = []) => {
  const groups = new Map();

  return (combat?.effects ?? []).map((step, index) => {
    const side = step.side === 'defender' ? 'defender' : 'attacker';
    const status = battleStepStatus(step.status);
    const card = side === 'attacker' ? combat?.attackCard : combat?.defenseCard;
    const cardTitle = card?.title ?? 'карта закрыта';
    const sideLabel = side === 'attacker' ? 'атака' : 'защита';
    const group = `${side}|${step.moment}`;
    const propertyIndex = groups.get(group) ?? 0;
    groups.set(group, propertyIndex + 1);
    const hurt = (Array.isArray(step.hurt) ? step.hurt : []).map(hit => ({
      ...hit,
      name: fighterNameOf(players, hit.fighterId),
    }));
    // лечение считает итог: вылеченный в битве боец урона не получает
    const heal = (Array.isArray(step.heal) ? step.heal : []).map(entry => ({ ...entry }));
    // текст правила приходит из движка: у веток одного свойства он свой, угадывать по номеру нельзя
    const resultParts = stepResultParts({ ...step, hurt });

    return {
      key: `${step.order ?? index + 1}-${side}-${step.moment}-${step.cardId}`,
      side,
      moment: step.moment ?? null,
      status: String(step.status ?? ''),
      cardTitle,
      property:
        step.text ?? (card ? cardPropertyText(card.text, step.moment, propertyIndex) : null),
      line: `${battleMomentLabel(step.moment)} · ${sideLabel} · «${cardTitle}»`,
      damage: Number(step.damage) || 0,
      hurt,
      heal,
      reveal: (step.reveal ?? []).map(entry => ({
        ownerName: playerNameOf(players, entry.playerId),
        cards: entry.cards ?? [],
      })),
      resultParts,
      result: stepResultText(resultParts),
      statusLabel: status.label,
      statusIcon: status.icon,
      statusTone: status.tone,
    };
  });
};

export const battleOutcome = combat => {
  if (combat?.attackValue == null || combat?.defenseValue == null) return null;
  return combatOutcome({
    attackValue: combat.attackValue,
    defenseValue: combat.defenseValue,
  });
};

const cardByKey = (key, pools = []) => {
  if (key == null) return null;
  const wanted = String(key);
  return pools.filter(Boolean).find(card => cardKey(card) === wanted) ?? null;
};

export const isBattleSide = (combat, playerId) => {
  if (!combat || playerId == null) return false;
  return [combat.attackerPlayerId, combat.defenderPlayerId].some(
    id => id != null && String(id) === String(playerId),
  );
};

/** Итог для чужой ленты подсказок: раскрытые карты по владельцу, затем кто сколько получил. */
export const battleSummaryOf = value => {
  const parts = [];

  for (const reveal of value?.reveals ?? []) {
    for (const card of reveal.cards ?? []) {
      parts.push(`${reveal.ownerName}: ${revealText(card)}`);
    }
  }

  const sides = (value?.sides ?? []).filter(side => side.damage > 0);
  for (const side of sides) {
    const other = (value?.sides ?? []).find(item => item.key !== side.key)?.name ?? '';
    parts.push(other ? `${other}: ${side.name} −${side.damage}` : `${side.name} −${side.damage}`);
  }

  return parts.join('; ');
};

export const useBattleView = () => {
  const {
    combat,
    players,
    you,
    lastCombat,
    targeting,
    movement,
    askingCard,
    awaitingBattleClose,
    onCloseBattle,
    isBattleParticipant,
  } = useGameSession();
  const { duration } = useSettings();

  const replay = ref(null);
  const settled = ref(null);

  const snapshot = ref(null);
  let wasMine = false;
  let seenFinish = null;
  let timer = null;

  const clearTimer = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  };

  const later = (ms, fn) => {
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, ms);
  };

  onBeforeUnmount(() => {
    clearTimer();
    registerBattleDismiss(null);
    setBattleResultShown(false);
    setBattleResultSummary('');
  });

  const live = computed(() => (isBattleParticipant(you.value) ? combat.value : null));

  watch(
    [live, players],
    () => {
      if (!live.value) return;

      clearTimer();
      replay.value = null;
      settled.value = null;
      setBattleResultShown(false);
      setBattleResultSummary('');
      wasMine = true;
      snapshot.value = { combat: live.value, players: players.value };
    },
    { immediate: true },
  );

  const cardsIn = list =>
    (list ?? []).flatMap(player => [...(player?.hand ?? []), ...(player?.discard ?? [])]);

  // Карты вскрытия несёт сама запись боя, но снимок «до действия» их не знает — смотрим и текущее состояние
  const cardsOfFinish = (finish, saved, current = []) => {
    const pool = [
      ...cardsIn(current),
      ...(saved?.players ?? []).flatMap(player => player.discard ?? []),
    ];

    return {
      attackCard:
        cardByKey(finish?.attackCardId, [finish?.attackCard, saved?.combat?.attackCard, ...pool]) ??
        null,
      defenseCard:
        cardByKey(finish?.defenseCardId, [
          finish?.defenseCard,
          saved?.combat?.defenseCard,
          ...pool,
        ]) ?? null,
    };
  };

  const battleOf = (saved, finish, current = []) => {
    const { attackCard, defenseCard } = cardsOfFinish(finish, saved, current);
    const effects = finish?.effects ?? [];
    const damage =
      Number(finish?.combatDamage) > 0
        ? { fighterId: String(finish.targetFighterId), amount: Number(finish.combatDamage) }
        : null;

    return {
      battle: {
        ...(saved?.combat ?? {}),
        attackCard,
        defenseCard,
        attackValue: finish.attackValue,
        defenseValue: finish.defenseValue,

        effects,
        stage: 'close',
      },
      players: saved?.players ?? [],
      cards: cardsIn(current),
      effects,
      damage,
    };
  };

  /** Оба бойца битвы — компьютеры: итог можно не держать, окно закроется само. */
  const botsOnly = record => {
    const ids = [record?.battle?.attackerPlayerId, record?.battle?.defenderPlayerId];
    if (ids.length !== 2 || ids.some(id => id == null)) return false;
    return ids.every(
      id =>
        String(
          (record?.players ?? []).find(player => String(player?.id) === String(id))?.control ?? '',
        ) === 'ai',
    );
  };

  // Итог битвы остаётся на экране: его убирают кнопка «Закрыть» и круглая кнопка действия
  const persist = record => {
    clearTimer();
    replay.value = null;
    setBattleResultShown(true);
    settled.value = { battle: record.battle, players: record.players, damage: record.damage };
    setBattleResultSummary(battleSummaryOf(result.value));
    if (botsOnly(record)) later(duration('battleReveal'), dismiss);
  };

  const advance = () => {
    const current = replay.value;
    if (!current) return;

    if (current.phase === 'reveal') {
      current.phase = 'steps';
      advance();
      return;
    }

    if (current.index + 1 < current.effects.length) {
      current.index += 1;
      later(duration('battleStep'), advance);
      return;
    }
    if (current.damage) {
      current.phase = 'damage';
      later(duration('battleDamage'), () => persist(current));
      return;
    }
    persist(current);
  };

  const play = (saved, finish) => {
    setBattleResultShown(true);
    const record = battleOf(saved, finish, players.value);

    if (record.effects.length === 0 && !record.damage) {
      persist(record);
      return;
    }

    replay.value = { ...record, index: -1, phase: 'reveal' };
    later(duration('battleReveal'), advance);
  };

  watch([combat, lastCombat], () => {
    if (combat.value || !lastCombat.value) return;
    if (seenFinish === lastCombat.value) return;
    const saved = snapshot.value;
    seenFinish = lastCombat.value;
    if (!wasMine || !saved) return;
    play(saved, lastCombat.value);
  });

  const model = computed(() => {
    if (live.value) {
      return { combat: live.value, players: players.value, replay: false };
    }
    if (replay.value) {
      return { combat: replay.value.battle, players: replay.value.players, replay: true };
    }
    if (settled.value) {
      return { combat: settled.value.battle, players: settled.value.players, replay: false };
    }
    return null;
  });

  const damageShown = computed(() =>
    replay.value ? replay.value.phase === 'damage' : Boolean(settled.value),
  );

  const sides = computed(() =>
    battleSides(
      model.value?.combat ?? null,
      damageShown.value ? players.value : (model.value?.players ?? []),
    ),
  );

  const steps = computed(() =>
    battleSteps(model.value?.combat ?? null, model.value?.players ?? []),
  );

  // Карты вскрыты: только с этого момента окно знает, есть ли у них свойства
  const revealed = computed(() => {
    if (replay.value) return replay.value.phase !== 'reveal';
    if (live.value) return ['reveal', 'resolve', 'close'].includes(String(live.value.stage ?? ''));
    return Boolean(settled.value);
  });

  const shownSteps = computed(() => {
    if (!model.value) return 0;
    if (!replay.value) return steps.value.length;
    if (replay.value.phase === 'reveal') return 0;
    return replay.value.phase === 'damage' ? steps.value.length : replay.value.index;
  });

  const activeStepIndex = computed(() => {
    if (!model.value) return -1;
    if (replay.value) return replay.value.phase === 'reveal' ? -1 : replay.value.index;
    const waiting = steps.value.findIndex(step => step.status === 'waiting');
    return waiting >= 0 ? waiting : steps.value.length - 1;
  });

  const activeMoments = computed(() => {
    const current = model.value?.combat ?? null;
    if (replay.value) {
      return [replay.value.effects[replay.value.index]?.moment ?? null].filter(Boolean);
    }
    const step = steps.value[activeStepIndex.value];
    if (step?.moment && step.status === 'waiting') return [step.moment];
    return momentsOfStage(current?.stage);
  });

  const outcome = computed(() => battleOutcome(model.value?.combat ?? null));

  // урон свойств — отдельное слагаемое рядом с уроном карт: «урон 0 + 2» значит «карты 0, свойства 2»
  const effectDamage = computed(() => steps.value.reduce((total, step) => total + step.damage, 0));

  const numbers = computed(() => {
    const current = model.value?.combat ?? null;
    if (current?.attackValue == null || current?.defenseValue == null) return null;
    return {
      attack: Number(current.attackValue),
      defense: Number(current.defenseValue),
      damage: outcome.value?.combatDamage ?? 0,
      effectDamage: effectDamage.value,
    };
  });

  // Урон стороны — по записи боя: снятое свойствами и картами минус лечение внутри битвы.
  // Вылеченный после битвы боец урона не получает, поэтому строки «урон N» у него нет вовсе.
  const taken = computed(() => {
    const out = {};
    if (!damageShown.value) return out;

    const byFighter = new Map();
    for (const step of steps.value) {
      for (const hit of step.hurt) {
        const key = String(hit.fighterId);
        byFighter.set(key, (byFighter.get(key) ?? 0) + (Number(hit.amount) || 0));
      }
      for (const heal of step.heal ?? []) {
        const key = String(heal.fighterId);
        byFighter.set(key, (byFighter.get(key) ?? 0) - (Number(heal.amount) || 0));
      }
    }

    const outcomeValue = outcome.value;
    const loser = outcomeValue?.winner
      ? outcomeValue.winner === 'attacker'
        ? 'defender'
        : 'attacker'
      : null;

    for (const side of sides.value) {
      let value = byFighter.get(String(side.fighterId)) ?? 0;
      if (side.side === loser) value += Number(outcomeValue.combatDamage) || 0;
      out[side.side] = Math.max(0, value);
    }
    return out;
  });

  // Итог: только урон по сторонам — числа боя и слагаемые уже не пишем, их видно по свойствам
  const result = computed(() => {
    const nums = numbers.value;
    const outcomeValue = outcome.value;
    if (!nums || !outcomeValue) return null;

    const list = sides.value.map(side => ({
      key: side.side,
      name: side.fighterName,
      damage: Number(taken.value[side.side]) || 0,
    }));

    // раскрытие колоды — тоже итог битвы: о нём узнают и те, кто в ней не участвовал
    const reveals = steps.value.flatMap(step => step.reveal ?? []);

    return {
      damage: list.reduce((total, side) => total + side.damage, 0),
      sides: list,
      reveals,
    };
  });

  const damage = computed(() => {
    if (replay.value) return damageShown.value ? replay.value.damage : null;
    return settled.value?.damage ?? null;
  });

  const showSwords = computed(() => {
    const current = model.value?.combat ?? null;
    if (!current) return false;
    if (model.value?.replay) return true;
    if (['reveal', 'resolve', 'close'].includes(String(current.stage ?? ''))) return true;
    return current.defenseCard != null || current.defendedWithCard === true;
  });

  const boost = computed(() => {
    const current = model.value?.combat ?? null;
    if (!current) return null;
    const pools = [
      current.attackCard,
      current.defenseCard,
      ...(model.value?.cards ?? []),
      ...(model.value?.players ?? []).flatMap(player => player.discard ?? []),
    ];

    const fromSteps = [...(current.effects ?? [])]
      .reverse()
      .find(step => (step.cards ?? []).length > 0);
    if (fromSteps) {
      const card = cardByKey(fromSteps.cards[fromSteps.cards.length - 1], pools);
      if (card) return { card, side: fromSteps.side === 'defender' ? 'defender' : 'attacker' };
    }

    const choice = current.choice;

    if (choice?.effect === 'bonus' && choice.picked?.length) {
      const card = cardByKey(choice.picked[choice.picked.length - 1], pools);
      if (card) {
        return { card, side: choice.side === 'defense' ? 'defender' : 'attacker' };
      }
    }
    return null;
  });

  const asking = computed(() => {
    const current = combat.value;
    const choice = current?.choice;
    if (choice && String(choice.playerId) === String(you.value)) {
      return { kind: choice.effect === 'movement' ? 'movement' : 'choice', card: askingCard.value };
    }

    const window = targeting.value;
    if (window && String(window.playerId) === String(you.value)) {
      return { kind: window.kind ?? 'fighters', card: askingCard.value };
    }
    if (movement.value) return { kind: 'movement', card: askingCard.value };
    return null;
  });

  const defenderChosen = computed(() => combat.value?.defenderPlayerId != null);

  const visible = computed(
    () =>
      (Boolean(combat.value) && defenderChosen.value && isBattleParticipant(you.value)) ||
      isBattleSide(replay.value?.battle ?? null, you.value) ||
      isBattleSide(settled.value?.battle ?? null, you.value),
  );

  const finished = computed(() => Boolean(settled.value));

  const dismiss = () => {
    clearTimer();
    replay.value = null;
    settled.value = null;
    setBattleResultShown(false);
    setBattleResultSummary('');
    wasMine = false;
    // закрытие окна — это конец действия: движок держит ход за атакующим, пока не придёт этот клик
    if (awaitingBattleClose.value) void onCloseBattle();
  };

  registerBattleDismiss(dismiss);

  return {
    visible,
    sides,
    steps,
    shownSteps,
    activeStepIndex,
    activeMoments,
    stage: computed(() => model.value?.combat?.stage ?? null),
    stageLabel: computed(() => battleStageLabel(model.value?.combat?.stage)),
    outcome,
    numbers,
    result,
    taken,
    revealed,
    damage,
    showSwords,
    boost,
    asking,
    finished,
    replayActive: computed(() => Boolean(replay.value)),
    live: computed(() => Boolean(live.value)),
    dismiss,
    skip: () => {
      if (!replay.value) return;
      persist(replay.value);
    },
  };
};

export default useBattleView;
