import { ACTION_TYPES, PHASES } from '@nast791/engine/constants';
import { HOST_ACTION_TYPES } from '#shared/actions/index.js';
import { occupiedCellIds, movementBudget } from '#shared/helpers.js';
import { assistantStartCellIds } from '#shared/actions/place.js';
import { movementZoneIds } from '#shared/actions/move.js';
import { isAttackCard, isDefenseCard, isEffectCard } from '#shared/constants/cards.js';

const cardRef = card => String(card?.instanceId || card?.id);

const cardFighterName = (card, fighters) => {
  if (card?.fighter == null) return 'любой';
  const f = (fighters || []).find(x => String(x.id) === String(card.fighter));
  return f?.name || String(card.fighter);
};

const findFighterLabel = (players, fighterId) => {
  for (const player of players || []) {
    const f = (player.fighters || []).find(x => String(x.id) === String(fighterId));
    if (f) return f.name || f.id;
  }
  return String(fighterId);
};

const findEnemyAtCell = (players, youId, cellId) => {
  for (const player of players || []) {
    if (String(player.id) === String(youId)) continue;
    for (const fighter of player.fighters || []) {
      if (fighter.position != null && String(fighter.position) === String(cellId)) {
        return { fighter, playerId: player.id };
      }
    }
  }
  return null;
};

/**
 * UI-сессия партии: selection / hotseat / highlights.
 * Хостовые правила — shared/actions|events; здесь только UI + sendAction.
 */
export const useGameSession = () => {
  const { view, gameId, playerId, sendAction, refresh } = useGameView();

  const {
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
  } = useGameHelpers();

  const pending = ref(false);
  const error = ref('');
  const hint = ref('');
  const selectedFighterId = ref(null);
  const selectedCardId = ref(null);

  const isPlacement = computed(() => phase.value === PHASES.gameStart);
  const combat = computed(() => view.value?.combat ?? null);
  const movement = computed(() => view.value?.movement ?? null);
  const handDiscard = computed(() => view.value?.handDiscard ?? null);
  const effectPrompt = computed(() => view.value?.effectPrompt ?? null);
  const lastCombat = computed(() => view.value?.lastCombat ?? null);

  const iAmReady = computed(() => me.value?.placementReady === true);
  const iAmDefender = computed(
    () =>
      combat.value &&
      String(combat.value.defenderPlayerId) === String(you.value),
  );
  const iMustDiscard = computed(
    () =>
      handDiscard.value &&
      String(handDiscard.value.playerId) === String(you.value),
  );
  const iMustEffect = computed(
    () =>
      effectPrompt.value &&
      String(effectPrompt.value.playerId) === String(you.value),
  );

  const myFighters = computed(() => {
    const fromMe = me.value?.fighters;
    if (Array.isArray(fromMe) && fromMe.length) return fromMe;
    const fromView = players.value?.find(p => String(p.id) === String(you.value));
    return Array.isArray(fromView?.fighters) ? fromView.fighters : [];
  });

  const myHand = computed(() => {
    const hand = me.value?.hand;
    return Array.isArray(hand) ? hand : [];
  });

  const myFightersPlaced = computed(() => {
    if (!myFighters.value.length) return true;
    return myFighters.value.every(f => f.position != null);
  });

  const selectedCard = computed(() => {
    if (!selectedCardId.value) return null;
    const key = String(selectedCardId.value);
    return (
      myHand.value.find(
        c => String(c.instanceId) === key || String(c.id) === key,
      ) ?? null
    );
  });

  const selectedDefenseCard = computed(
    () => selectedCard.value && isDefenseCard(selectedCard.value.type),
  );
  const selectedEffectCard = computed(
    () => selectedCard.value && isEffectCard(selectedCard.value.type),
  );
  const selectedAttackCard = computed(
    () => selectedCard.value && isAttackCard(selectedCard.value.type),
  );

  /** Можно усилить перемещение: своя очередь, есть карта, ещё не усиливали. */
  const canBonusMove = computed(
    () =>
      isMyTurn.value &&
      !isPlacement.value &&
      !combat.value &&
      !handDiscard.value &&
      !effectPrompt.value &&
      !isGameOver.value &&
      !!selectedCard.value &&
      !movement.value?.bonusApplied,
  );

  const selectedCardLabel = computed(() => {
    const c = selectedCard.value;
    if (!c) return '—';
    return `${c.title || c.id} (${c.type}) · ${cardFighterName(c, myFighters.value)}`;
  });

  const selectedLabel = computed(() => {
    if (!selectedFighterId.value) return '—';
    const f = myFighters.value.find(
      x => String(x.id) === String(selectedFighterId.value),
    );
    return f ? `${f.name || f.id}` : selectedFighterId.value;
  });

  const canAct = computed(() => {
    if (pending.value || isGameOver.value) return false;
    if (handDiscard.value) return iMustDiscard.value;
    if (combat.value) return iAmDefender.value;
    if (effectPrompt.value) return iMustEffect.value;
    if (isPlacement.value) return !iAmReady.value;
    return isMyTurn.value;
  });

  const boardInteractive = computed(
    () => canAct.value && !combat.value && !handDiscard.value,
  );

  const highlightedCellIds = computed(() => {
    if (!canAct.value || combat.value) return [];

    if (effectPrompt.value && iMustEffect.value) {
      if (effectPrompt.value.kind !== 'HIGHLIGHT_TARGETS') return [];
      return (effectPrompt.value.candidates ?? [])
        .map(c => c.position)
        .filter(id => id != null)
        .map(String);
    }

    const fighter = myFighters.value.find(
      f => String(f.id) === String(selectedFighterId.value),
    );
    if (!fighter) return [];

    if (isPlacement.value) {
      if (fighter.type === 'hero' || iAmReady.value) return [];
      const allowed = assistantStartCellIds(
        { map: view.value?.map },
        you.value,
      );
      const blocked = new Set(
        myFighters.value
          .filter(
            f =>
              f.position != null && String(f.id) !== String(fighter.id),
          )
          .map(f => String(f.position)),
      );
      return allowed.filter(
        id =>
          !blocked.has(String(id)) &&
          String(id) !== String(fighter.position),
      );
    }

    if (!isMyTurn.value || fighter.position == null) return [];
    const budget = movementBudget(fighter, movement.value);
    if (budget <= 0) return [];
    const blocked = occupiedCellIds(
      { players: players.value },
      { exceptFighterId: fighter.id },
    );
    const origin =
      movement.value?.origins?.[String(fighter.id)] ?? fighter.position;
    const reach = movementZoneIds(
      view.value?.map?.nodes ?? [],
      origin,
      budget,
      blocked,
    );
    return [...reach].filter(id => String(id) !== String(fighter.position));
  });

  const mapSummary = computed(() => {
    const map = view.value?.map;
    if (!map) return '—';
    const nodes = Array.isArray(map.nodes) ? map.nodes.length : 0;
    return `${map.name ?? map.id ?? 'map'} · ${nodes} узлов`;
  });

  const viewJson = computed(() => JSON.stringify(view.value, null, 2));

  const ensureSelection = () => {
    if (isPlacement.value) {
      const cur = myFighters.value.find(
        f => String(f.id) === String(selectedFighterId.value),
      );
      if (cur && cur.type !== 'hero') return;
      const unplacedAssistant = myFighters.value.find(
        f => f.type !== 'hero' && f.position == null,
      );
      const anyAssistant = myFighters.value.find(f => f.type !== 'hero');
      const pick = unplacedAssistant || anyAssistant;
      selectedFighterId.value = pick ? String(pick.id) : null;
      return;
    }
    if (selectedFighterId.value) {
      const stillMine = myFighters.value.some(
        f => String(f.id) === String(selectedFighterId.value),
      );
      if (stillMine) return;
    }
    const unplaced = myFighters.value.find(f => f.position == null);
    const pick = unplaced || myFighters.value[0];
    selectedFighterId.value = pick ? String(pick.id) : null;
  };

  watch(myFighters, () => ensureSelection(), { immediate: true });

  watch(myHand, hand => {
    if (!selectedCardId.value) return;
    const still = hand.some(
      c =>
        String(c.instanceId) === String(selectedCardId.value) ||
        String(c.id) === String(selectedCardId.value),
    );
    if (!still) selectedCardId.value = null;
  });

  const switchViewer = async id => {
    playerId.value = String(id);
    selectedFighterId.value = null;
    selectedCardId.value = null;
    await refresh();
    ensureSelection();
  };

  /** Кто должен смотреть/ходить: handDiscard → DEFEND → effectPrompt → currentPlayer. */
  const syncHotseat = async (preserveHint = false) => {
    const v = view.value;
    if (!v || v.phase === PHASES.gameEnd) return;

    let target = null;
    let nextHint = null;

    if (v.handDiscard?.playerId != null) {
      target = String(v.handDiscard.playerId);
      nextHint = `Сброс руки до ${v.handDiscard.max}`;
    } else if (v.combat?.defenderPlayerId != null) {
      target = String(v.combat.defenderPlayerId);
      nextHint = `DEFEND: ${target}`;
    } else if (v.effectPrompt?.playerId != null) {
      target = String(v.effectPrompt.playerId);
      if (v.effectPrompt.kind === 'PROMPT') {
        nextHint = `${v.effectPrompt.name || 'Способность'}: ${v.effectPrompt.message || 'ответ'}`;
      } else {
        nextHint = `${v.effectPrompt.name || 'Способность'}: выберите цель`;
      }
    } else if (v.phase === PHASES.gameStart) {
      const viewer = v.players?.find(p => String(p.id) === String(playerId.value));
      if (viewer?.placementReady === true) {
        const next = v.players?.find(p => p.placementReady !== true);
        if (next) {
          target = String(next.id);
          nextHint = `Расставляет: ${next.name || next.id}`;
        }
      }
    } else if (v.currentPlayer != null) {
      target = String(v.currentPlayer);
      const p = v.players?.find(x => String(x.id) === target);
      nextHint = `Ход: ${p?.name || target}`;
    }

    if (target != null && String(playerId.value) !== target) {
      await switchViewer(target);
      if (!preserveHint && nextHint) hint.value = nextHint;
      return;
    }
    ensureSelection();
  };

  const run = async fn => {
    error.value = '';
    pending.value = true;
    try {
      await fn();
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      pending.value = false;
    }
  };

  const selectFighter = id => {
    const f = myFighters.value.find(x => String(x.id) === String(id));
    if (isPlacement.value && f?.type === 'hero') {
      hint.value = `${f.name || id}: герой на фиксированной клетке (авто)`;
      return;
    }
    selectedFighterId.value = String(id);
    hint.value = `Ваш боец: ${f?.name || id}`;
  };

  const selectCard = card => {
    selectedCardId.value = cardRef(card);
    if (card.fighter != null) {
      const bound = myFighters.value.find(
        f => String(f.id) === String(card.fighter),
      );
      if (bound) selectedFighterId.value = String(bound.id);
    }
    const who = cardFighterName(card, myFighters.value);
    if (isAttackCard(card.type)) {
      hint.value = `${card.title || card.id} (${who}): кликните врага`;
    } else if (isEffectCard(card.type)) {
      hint.value = `${card.title || card.id} (${who}): PLAY_CARD`;
    } else if (isDefenseCard(card.type)) {
      hint.value = `${card.title || card.id} (${who}): для DEFEND`;
    } else {
      hint.value = `Карта: ${card.title || card.id} · ${who}`;
    }
  };

  const sendAttack = async targetId => {
    if (!isMyTurn.value) {
      throw new Error(
        'Сейчас ход другого игрока — переключите Hotseat или дождитесь sync',
      );
    }
    if (!selectedAttackCard.value) {
      throw new Error('Выберите attack|hybrid в hand');
    }
    const card = selectedCard.value;
    const fighterId =
      card?.fighter != null ? String(card.fighter) : selectedFighterId.value;
    if (!fighterId) {
      throw new Error('Выберите бойца (карта привязана к fighter)');
    }
    const attacker = myFighters.value.find(
      f => String(f.id) === String(fighterId),
    );
    if (!attacker) {
      throw new Error(`Боец карты (${fighterId}) не найден`);
    }
    selectedFighterId.value = String(fighterId);

    const target = findFighterLabel(players.value, targetId);
    hint.value = `ATTACK: ${attacker.name || attacker.id} → ${target}`;
    await sendAction({
      type: HOST_ACTION_TYPES.ATTACK,
      fighterId,
      targetId,
      cardId: cardRef(card),
    });
    selectedCardId.value = null;
    hint.value = `ATTACK → ${target}`;
    await syncHotseat();
  };

  const onSwitchPlayer = id => run(() => switchViewer(id));

  const onDiscard = () =>
    run(async () => {
      if (!selectedCard.value) throw new Error('Выберите карту для сброса');
      await sendAction({
        type: HOST_ACTION_TYPES.DISCARD_CARDS,
        cardId: cardRef(selectedCard.value),
      });
      selectedCardId.value = null;
      hint.value = handDiscard.value
        ? `Сброшено · ещё ${handDiscard.value.mustDiscard}`
        : 'Сброс завершён · ход передан';
      await syncHotseat();
    });

  const onEndTurn = () =>
    run(async () => {
      await sendAction({ type: HOST_ACTION_TYPES.END_TURN });
      await syncHotseat();
    });

  const onConfirmMove = () =>
    run(async () => {
      await sendAction({ type: HOST_ACTION_TYPES.MOVE, mode: 'confirm' });
      await syncHotseat(true);
      hint.value = handDiscard.value
        ? `Сбросьте ещё ${handDiscard.value.mustDiscard}`
        : `Перемещение: −1 AP · осталось ${actionsLeft.value}`;
    });

  const onBonusMove = () =>
    run(async () => {
      if (!selectedCard.value) throw new Error('Выберите карту для усиления');
      const card = selectedCard.value;
      await sendAction({
        type: HOST_ACTION_TYPES.MOVE,
        mode: 'bonus',
        cardId: cardRef(card),
      });
      selectedCardId.value = null;
      const bonus =
        Number(view.value?.movement?.bonus) || Number(card.bonus) || 0;
      hint.value = `Усиление перемещения (бон.${card.bonus ?? 0} → радиус +${bonus})`;
      await syncHotseat(true);
    });

  const onConfirmPlacement = () =>
    run(async () => {
      await sendAction({ type: HOST_ACTION_TYPES.PLACE, mode: 'confirm' });
      hint.value = 'Расстановка подтверждена';
      await syncHotseat();
    });

  const onResign = () =>
    run(() => sendAction({ type: ACTION_TYPES.RESIGN }));

  const onPlayCard = () =>
    run(async () => {
      if (!selectedCard.value) return;
      await sendAction({
        type: HOST_ACTION_TYPES.PLAY_CARD,
        cardId: cardRef(selectedCard.value),
      });
      selectedCardId.value = null;
      hint.value = 'PLAY_CARD';
      await syncHotseat();
    });

  const onDefend = withCard =>
    run(async () => {
      if (withCard && !selectedDefenseCard.value) {
        throw new Error('Выберите defense|hybrid');
      }
      const payload = { type: HOST_ACTION_TYPES.DEFEND };
      if (withCard) payload.cardId = cardRef(selectedCard.value);
      await sendAction(payload);
      selectedCardId.value = null;
      let msg = withCard ? 'DEFEND' : 'DEFEND пас';
      if (lastCombat.value) {
        const lc = lastCombat.value;
        msg = `${msg} · победил ${
          lc.winner === 'attacker' ? 'атакующий' : 'защитник'
        } · боевой урон ${lc.combatDamage}`;
        if ((Number(actionsLeft.value) || 0) > 0) {
          msg = `${msg} · ещё AP ${actionsLeft.value}`;
        }
      }
      hint.value = msg;
      // view.you после DEFEND = защитник; вернуть на currentPlayer.
      await syncHotseat(true);
    });

  const onSkillAnswer = answer =>
    run(async () => {
      await sendAction({
        type: HOST_ACTION_TYPES.RESOLVE_EFFECT,
        answer,
      });
      hint.value =
        String(answer) === 'no'
          ? 'Способность пропущена'
          : 'Выберите подсвеченную цель';
      await syncHotseat();
    });

  const onSkillSkip = () => onSkillAnswer('no');

  const onSkillApply = targetId =>
    run(async () => {
      const skillName = effectPrompt.value?.name || 'SKILL';
      await sendAction({
        type: HOST_ACTION_TYPES.RESOLVE_EFFECT,
        targetId,
      });
      const label = findFighterLabel(players.value, targetId);
      hint.value = `${skillName} → ${label}`;
      await syncHotseat();
    });

  const onSelectFighterFromBoard = ({ fighterId, playerId: ownerId }) => {
    if (combat.value) {
      hint.value = 'Сейчас DEFEND, не выбор бойца';
      return;
    }
    if (effectPrompt.value && iMustEffect.value) {
      if (effectPrompt.value.kind !== 'HIGHLIGHT_TARGETS') {
        hint.value = 'Сначала ответьте на вопрос способности';
        return;
      }
      const ok = (effectPrompt.value.candidates ?? []).some(
        c => String(c.fighterId) === String(fighterId),
      );
      if (!ok) {
        hint.value = 'Цель не среди подсвеченных';
        return;
      }
      onSkillApply(fighterId);
      return;
    }
    if (String(ownerId) === String(you.value)) {
      selectFighter(fighterId);
      return;
    }
    if (!isMyTurn.value || isPlacement.value) {
      hint.value = 'Сейчас не ваш ход';
      return;
    }
    run(() => sendAttack(fighterId));
  };

  const onSelectNode = cellId => {
    if (combat.value) {
      hint.value = 'Сначала DEFEND';
      return;
    }
    if (effectPrompt.value) {
      if (effectPrompt.value.kind === 'HIGHLIGHT_TARGETS' && iMustEffect.value) {
        const enemy = findEnemyAtCell(players.value, you.value, cellId);
        if (enemy) {
          onSelectFighterFromBoard({
            fighterId: enemy.fighter.id,
            playerId: enemy.playerId,
          });
          return;
        }
        hint.value = 'Кликните подсвеченного врага';
        return;
      }
      hint.value = effectPrompt.value.message || 'Ответьте на способность';
      return;
    }
    if (!canAct.value) {
      hint.value = isPlacement.value ? 'Подождите…' : 'Сейчас не ваш ход';
      return;
    }

    if (!isPlacement.value && selectedAttackCard.value) {
      const enemy = findEnemyAtCell(players.value, you.value, cellId);
      if (enemy) {
        run(() => sendAttack(enemy.fighter.id));
        return;
      }
    }

    if (!selectedFighterId.value) ensureSelection();
    if (!selectedFighterId.value) {
      hint.value = 'Нет бойцов';
      return;
    }

    const fighter = myFighters.value.find(
      f => String(f.id) === String(selectedFighterId.value),
    );
    if (!fighter) {
      hint.value = 'Боец не найден';
      return;
    }

    if (isPlacement.value) {
      if (iAmReady.value) {
        hint.value = 'Вы уже подтвердили расстановку';
        return;
      }
      if (fighter.type === 'hero') {
        hint.value = 'Героя нельзя ставить вручную';
        return;
      }
      run(async () => {
        await sendAction({
          type: HOST_ACTION_TYPES.PLACE,
          fighterId: fighter.id,
          cellId,
        });
        hint.value =
          fighter.position == null
            ? `PLACE → ${cellId}`
            : `PLACE перестановка → ${cellId}`;
        ensureSelection();
      });
      return;
    }

    if (fighter.position == null) {
      hint.value = 'Боец без клетки';
      return;
    }

    run(async () => {
      await sendAction({
        type: HOST_ACTION_TYPES.MOVE,
        fighterId: fighter.id,
        cellId,
      });
      hint.value = `MOVE → ${cellId} (перемещение, подтвердите позже)`;
      await syncHotseat();
    });
  };

  onMounted(() => {
    if (!view.value?.id) {
      navigateTo('/');
      return;
    }
    ensureSelection();
  });

  return {
    view,
    gameId,
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
    pending,
    error,
    hint,
    selectedFighterId,
    selectedCardId,
    isPlacement,
    combat,
    movement,
    handDiscard,
    effectPrompt,
    lastCombat,
    iAmReady,
    iAmDefender,
    iMustDiscard,
    iMustEffect,
    myFighters,
    myHand,
    myFightersPlaced,
    selectedCardLabel,
    selectedLabel,
    selectedDefenseCard,
    selectedEffectCard,
    canAct,
    canBonusMove,
    boardInteractive,
    highlightedCellIds,
    mapSummary,
    viewJson,
    cardFighterLabel: card => cardFighterName(card, myFighters.value),
    selectFighter,
    selectCard,
    onSwitchPlayer,
    onDiscard,
    onEndTurn,
    onConfirmMove,
    onBonusMove,
    onConfirmPlacement,
    onResign,
    onPlayCard,
    onDefend,
    onSkillSkip,
    onSkillAnswer,
    onSkillApply,
    onSelectFighterFromBoard,
    onSelectNode,
  };
};
