import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { cardBonus, cardKey, cardValue } from '#shared/helpers/cards.js';
import { combatOutcome } from '#shared/helpers/combat.js';
import { cardType } from '~/constants/cards.js';
import { healthTone, hpLabel, hpPercent, momentsOfStage } from './useGameHelpers.js';
import { useGameSession } from './useGameSession.js';
import { useSettings } from '../ui/useSettings.js';

export const BATTLE_MIN_SIZE = { width: 380, height: 260 };

export const BATTLE_STAGES = {
  attacker: 'выбор бойца',
  target: 'выбор цели',
  defense: 'защита',
  reveal: 'свойства карт',
  resolve: 'числа и урон',
  close: 'закрытие битвы',
};

export const BATTLE_MOMENTS = {
  immediately: 'мгновенно',
  duringCombat: 'во время битвы',
  afterCombat: 'после битвы',
};

export const BATTLE_STEP_STATUSES = {
  pending: { label: 'ждёт очереди', icon: 'lucide:hourglass', tone: 'text-dim' },
  waiting: { label: 'пауза: решает игрок', icon: 'lucide:pause', tone: 'text-info' },
  applied: { label: 'сработало', icon: 'lucide:check', tone: 'text-success' },
  skipped: { label: 'нельзя применить', icon: 'lucide:slash', tone: 'text-dim' },
  declined: { label: 'отказ', icon: 'lucide:undo-2', tone: 'text-dim' },
  cancelled: { label: 'отменено', icon: 'lucide:ban', tone: 'text-danger' },
};

const FALLBACK_STEP = { label: 'шаг', icon: 'lucide:circle-help', tone: 'text-dim' };

export const battleStageLabel = stage => BATTLE_STAGES[String(stage ?? '')] ?? '';
export const battleMomentLabel = moment =>
  BATTLE_MOMENTS[String(moment ?? '')] ?? String(moment ?? '');
export const battleStepStatus = status =>
  BATTLE_STEP_STATUSES[String(status ?? '')] ?? FALLBACK_STEP;

export const battleFighter = (players = [], fighterId) => {
  if (fighterId == null) return null;
  for (const player of players ?? []) {
    const fighter = (player?.fighters ?? []).find(entry => String(entry.id) === String(fighterId));
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

  return {
    side,
    title: isAttacker ? 'Атака' : 'Защита',

    playerName: isAi
      ? 'Компьютер'
      : (holder?.player?.name ?? (playerId == null ? 'противник не выбран' : String(playerId))),
    isAi,
    color: holder?.player?.color ?? null,
    fighterId: holder?.fighter?.id == null ? null : String(holder.fighter.id),
    fighterName: holder?.fighter?.name ?? (isAttacker ? 'боец не выбран' : 'цель не выбрана'),
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

export const battleSteps = combat =>
  (combat?.effects ?? []).map((step, index) => {
    const side = step.side === 'defender' ? 'defender' : 'attacker';
    const status = battleStepStatus(step.status);
    const card = side === 'attacker' ? combat?.attackCard : combat?.defenseCard;
    const cardTitle = card?.title ?? 'карта закрыта';
    const sideLabel = side === 'attacker' ? 'атака' : 'защита';

    return {
      key: `${step.order ?? index + 1}-${side}-${step.moment}-${step.cardId}`,
      side,
      moment: step.moment ?? null,
      status: String(step.status ?? ''),
      line: `${battleMomentLabel(step.moment)} · ${sideLabel} · «${cardTitle}»`,
      statusLabel: status.label,
      statusIcon: status.icon,
      statusTone: status.tone,
    };
  });

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

export const useBattleView = () => {
  const { combat, players, you, lastCombat, targeting, movement, askingCard, isBattleParticipant } =
    useGameSession();
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

  onBeforeUnmount(clearTimer);

  const live = computed(() => (isBattleParticipant(you.value) ? combat.value : null));

  watch(
    [live, players],
    () => {
      if (!live.value) return;

      clearTimer();
      replay.value = null;
      settled.value = null;
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

  // Итог битвы остаётся на экране: окно убирает игрок (кнопкой «Закрыть» или действием вне окна)
  const persist = record => {
    clearTimer();
    replay.value = null;
    settled.value = { battle: record.battle, players: record.players, damage: record.damage };
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

  const steps = computed(() => battleSteps(model.value?.combat ?? null));

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

  const numbers = computed(() => {
    const current = model.value?.combat ?? null;
    if (current?.attackValue == null || current?.defenseValue == null) return null;
    return {
      attack: Number(current.attackValue),
      defense: Number(current.defenseValue),
      damage: outcome.value?.combatDamage ?? 0,
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
    wasMine = false;
  };

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
