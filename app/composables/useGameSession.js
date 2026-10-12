import { runUi } from '#shared/core.js';
import { cardKey } from '#shared/helpers/cards.js';
import { fighterClickIntent, fighterPickExpected } from '#shared/helpers/ui.js';
import { useGameView } from '~/composables/useGameView.js';
import { itemStateLabel } from '~/utils/gameLabels.js';

export const useGameSession = () => {
  const { view, hostState, gameId, playerId, sendAction, refresh, steps, selectedFighterId } =
    useGameView();

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
  const message = ref('');
  const selectedNumHeroId = ref(null);

  const isPlacement = computed(() => phase.value === 'gameStart');

  const combat = computed(() => view.value?.combat ?? null);
  const movement = computed(() => view.value?.movement ?? null);
  const targeting = computed(() => view.value?.targeting ?? null);
  const lastCombat = computed(() => view.value?.lastCombat ?? null);

  const ui = computed(() => {
    const state = hostState.value;
    if (state && you.value) {
      return runUi(state, you.value, {
        selectedFighterId: selectedFighterId.value,
      });
    }
    return view.value?.ui ?? null;
  });

  const hint = computed(() => ui.value?.hint || message.value || '');
  const placementPhase = computed(() => ui.value?.phase ?? null);
  const highlightedCellIds = computed(() => (ui.value?.highlightedCellIds ?? []).map(String));
  const highlightedFighterIds = computed(() => (ui.value?.highlightedFighterIds ?? []).map(String));
  const framedFighterIds = computed(() => (ui.value?.framedFighterIds ?? []).map(String));
  const playableCardIds = computed(() => (ui.value?.playableCardIds ?? []).map(String));
  const disabledCardIds = computed(() => (ui.value?.disabledCardIds ?? []).map(String));
  const deckClickable = computed(() => ui.value?.deck?.clickable === true);
  const okControl = computed(
    () => ui.value?.controls?.ok ?? { visible: false, enabled: false, label: null },
  );
  const backControl = computed(
    () =>
      ui.value?.controls?.back ?? {
        visible: false,
        enabled: false,
        label: null,
      },
  );

  const myFighters = computed(() => me.value?.fighters ?? []);
  const myHand = computed(() => me.value?.hand ?? []);
  const myDiscard = computed(() => me.value?.discard ?? []);
  const myDiscardCount = computed(() => me.value?.discardCount ?? myDiscard.value.length);
  const myHeroes = computed(() => myFighters.value.filter(fighter => fighter.type === 'hero'));
  const deckCount = computed(() => me.value?.deckCount ?? 0);
  const results = computed(() => ui.value?.results ?? null);
  const showPickNumHero = computed(() => Boolean(ui.value?.modals?.pickNumHero));

  /** Клетки области расстановки: светятся всю расстановку, `occupied` — на ней уже стоит свой боец. */
  const placementCells = computed(() =>
    (ui.value?.placementCells ?? []).map(cell => ({
      id: String(cell.id),
      occupied: cell.occupied === true,
    })),
  );

  /** Кого ещё надо поставить на поле: полка аватарок над кнопкой завершения. */
  const placementFighters = computed(() =>
    isPlacement.value ? myFighters.value.filter(fighter => fighter.currentPosition == null) : [],
  );

  const choices = computed(() =>
    (ui.value?.choices ?? []).map(entry => ({
      optionId: String(entry.optionId),
      title: entry.title ?? String(entry.optionId),
      disabled: entry.disabled === true,
    })),
  );

  const showTargetingOptions = computed(
    () =>
      targeting.value?.kind === 'options' && String(targeting.value.playerId) === String(you.value),
  );

  const targetingChoices = computed(() =>
    showTargetingOptions.value
      ? (targeting.value.candidates ?? []).map(entry => ({
          optionId: String(entry.optionId),
          title: entry.title ?? String(entry.optionId),
          disabled: entry.disabled === true,
        }))
      : [],
  );

  const isCardPlayable = card => playableCardIds.value.includes(cardKey(card));
  const isCardDisabled = card => disabledCardIds.value.includes(cardKey(card));

  const choiceCount = computed(() => Number(targeting.value?.count) || 1);
  const choicePicked = computed(() => {
    const ids = [targeting.value?.picked]
      .flatMap(value => (Array.isArray(value) ? value : [value]))
      .filter(value => value != null && value !== '')
      .map(String);
    return [...new Set(ids)];
  });
  const choiceComplete = computed(() => choicePicked.value.length >= choiceCount.value);

  const myItems = computed(() => me.value?.items ?? []);

  const expectsFighterPick = computed(() => fighterPickExpected(ui.value));

  const pickCandidates = computed(() => {
    if (!expectsFighterPick.value) return [];
    const ids = new Set(highlightedFighterIds.value);

    return (players.value ?? [])
      .flatMap(entry =>
        (entry.fighters ?? []).map(fighter => ({
          ...fighter,
          playerName: entry.name ?? entry.id,
        })),
      )
      .filter(fighter => ids.has(String(fighter.id)));
  });

  const revealedCards = computed(() =>
    (view.value?.reveal ?? []).flatMap(entry =>
      (entry.cards ?? []).map(card => ({
        ...card,
        ownerId: entry.playerId,
        ownerName:
          (players.value ?? []).find(player => String(player.id) === String(entry.playerId))
            ?.name ?? String(entry.playerId),
      })),
    ),
  );

  const fighterLabel = id => {
    if (id == null) return '—';
    for (const entry of players.value ?? []) {
      const fighter = (entry.fighters ?? []).find(item => String(item.id) === String(id));
      if (fighter) return `${fighter.name || fighter.id} (${entry.name ?? entry.id})`;
    }
    return String(id);
  };

  const combatInfo = computed(() => {
    const current = combat.value;
    if (!current) return '';

    const parts = [];
    const attackCard = current.attackCard;
    if (attackCard) {
      parts.push(`карта боя «${attackCard.title ?? attackCard.id}»`);
    }
    if (current.attackerFighterId) {
      parts.push(`атакует ${fighterLabel(current.attackerFighterId)}`);
    }
    if (current.targetFighterId) {
      parts.push(`цель ${fighterLabel(current.targetFighterId)}`);
    }
    const defenseCard = current.defenseCard;
    if (defenseCard) {
      parts.push(`защита «${defenseCard.title ?? defenseCard.id}»`);
    }
    if (!parts.length) return '';

    return `Бой (${current.stage}): ${parts.join(' · ')}`;
  });

  const boardInteractive = computed(
    () =>
      !pending.value &&
      !isGameOver.value &&
      (isPlacement.value ||
        highlightedCellIds.value.length > 0 ||
        highlightedFighterIds.value.length > 0),
  );

  const mapSummary = computed(() => {
    const map = view.value?.map;
    if (!map) return '—';
    const nodes = Array.isArray(map.nodes) ? map.nodes.length : 0;
    return `${map.name ?? map.id ?? 'map'} · ${nodes} узлов`;
  });

  const viewJson = computed(() => JSON.stringify(view.value, null, 2));

  const run = async fn => {
    message.value = '';
    pending.value = true;
    try {
      await fn();
    } catch (err) {
      message.value = err instanceof Error ? err.message : String(err);
    } finally {
      pending.value = false;
    }
  };

  const ensureSelection = () => {
    const list = myFighters.value;
    if (!list.length) {
      selectedFighterId.value = null;
      return;
    }
    // в расстановке бойца выбирает игрок (полка аватарок), автовыбор вернул бы снятую активность
    if (isPlacement.value) return;
    if (list.some(fighter => String(fighter.id) === String(selectedFighterId.value))) {
      return;
    }
    const pick = list.find(fighter => fighter.currentPosition != null) ?? list[0];
    selectedFighterId.value = pick ? String(pick.id) : null;
  };

  watch(myFighters, () => ensureSelection(), { immediate: true });

  const switchViewer = async id => {
    playerId.value = String(id);
    selectedFighterId.value = null;
    selectedNumHeroId.value = null;
    await refresh();
    ensureSelection();
  };

  const hasAiSeats = computed(() =>
    (view.value?.settings?.heroes ?? []).some(slot => String(slot.control) === 'ai'),
  );

  const actingPlayerId = computed(() => {
    const current = view.value;
    if (!current) return null;
    if (current.phase === 'gameEnd' || current.phase === 'turnEnd') return null;
    if (current.combat?.choice?.playerId != null) {
      return current.combat.choice.playerId;
    }
    if (current.combat?.stage === 'defense') {
      return current.combat.defenderPlayerId ?? null;
    }
    if (current.targeting?.playerId != null) return current.targeting.playerId;
    return current.currentPlayer ?? null;
  });

  const isHumanSeat = id => {
    if (id == null) return false;
    const player = (players.value ?? []).find(entry => String(entry.id) === String(id));
    return String(player?.control ?? 'human') === 'human';
  };

  const resignByTimeout = ids =>
    run(async () => {
      for (const id of ids) {
        if (isGameOver.value) break;
        await sendAction({ type: 'RESIGN', playerId: String(id) });
      }
      await syncHotseat();
    });

  const syncHotseat = async () => {
    if (hasAiSeats.value) {
      ensureSelection();
      return;
    }

    const target = actingPlayerId.value;
    if (target != null && String(playerId.value) !== String(target)) {
      await switchViewer(target);
      return;
    }
    ensureSelection();
  };

  const send = action =>
    run(async () => {
      await sendAction(action);
      await syncHotseat();
    });

  const pick = payload => send({ type: 'PICK', ...payload });

  const onDeckClick = () => {
    if (!deckClickable.value) {
      message.value = 'Колода сейчас недоступна';
      return;
    }
    return pick({ kind: 'deck' });
  };

  const onCardClick = card => {
    if (!isCardPlayable(card)) {
      message.value = 'Эту карту сейчас разыграть нельзя';
      return;
    }
    return pick({ kind: 'card', id: cardKey(card) });
  };

  const onFinishAction = () => send({ type: 'UI_OK' });

  const onChoiceClick = optionId => {
    const list = [...choices.value, ...targetingChoices.value];
    const choice = list.find(entry => String(entry.optionId) === String(optionId));
    if (!choice) {
      message.value = 'Такого варианта нет';
      return undefined;
    }
    if (choice.disabled) {
      message.value = 'Этот вариант сейчас недоступен';
      return undefined;
    }
    return pick({ kind: 'option', id: choice.optionId });
  };

  const onUiBack = () => send({ type: 'UI_BACK' });

  const onResign = () =>
    run(async () => {
      const confirmed =
        typeof window === 'undefined' || window.confirm('Сдаться? Партия для вас завершится.');
      if (!confirmed) return;
      await sendAction({ type: 'RESIGN' });
      await syncHotseat();
    });

  const onSwitchPlayer = id => run(() => switchViewer(id));

  const onBackToMenu = () => navigateTo('/');

  const onPickNumHero = fighterId => {
    selectedNumHeroId.value = String(fighterId);
    return pick({ kind: 'fighter', id: fighterId });
  };

  const selectFighter = fighterId => {
    selectedFighterId.value = String(fighterId);
    message.value = '';
  };

  const clearFighterSelection = () => {
    selectedFighterId.value = null;
    message.value = '';
  };

  const onFighterClick = ({ fighterId }) => {
    const id = String(fighterId);
    const intent = fighterClickIntent(
      ui.value,
      id,
      myFighters.value.map(fighter => fighter.id),
    );

    if (intent === 'pick') return pick({ kind: 'fighter', id });
    if (intent === 'select') {
      selectFighter(id);
      return undefined;
    }

    const candidateNames = pickCandidates.value
      .map(fighter => fighter.name || fighter.id)
      .join(', ');
    message.value = candidateNames
      ? `Сейчас можно выбрать: ${candidateNames}`
      : 'Этого бойца сейчас выбрать нельзя';
    return undefined;
  };

  const onCellClick = cellId => {
    // клик мимо клетки (пустое место доски) — в расстановке это снятие активности
    if (cellId == null) {
      if (isPlacement.value) clearFighterSelection();
      return undefined;
    }

    if (selectedFighterId.value == null) {
      message.value = 'Сначала выберите бойца';
      return undefined;
    }

    if (highlightedCellIds.value.includes(String(cellId))) {
      const fighterId = selectedFighterId.value;
      const picked = pick({ kind: 'cell', id: cellId, fighterId });
      // поставили бойца — активность снимается: следующего игрок берёт с полки сам
      if (isPlacement.value) clearFighterSelection();
      return picked;
    }

    // в расстановке подсвечены только допустимые клетки: клик мимо снимает активность, а не ругается
    if (isPlacement.value) {
      clearFighterSelection();
      return undefined;
    }

    message.value = 'Клетка сейчас недоступна';
    return undefined;
  };

  onMounted(() => {
    if (!view.value?.id) return;
    ensureSelection();
  });

  return {
    view,
    gameId,
    steps,
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
    actingPlayerId,
    isHumanSeat,
    resignByTimeout,
    pending,
    error: message,
    hint,
    ui,
    placementPhase,
    isPlacement,
    hasAiSeats,
    combat,
    movement,
    targeting,
    lastCombat,
    myFighters,
    myHand,
    myDiscard,
    myDiscardCount,
    myHeroes,
    deckCount,
    results,
    choices,
    targetingChoices,
    myItems,
    itemStateLabel,
    pickCandidates,
    combatInfo,
    revealedCards,
    deckClickable,
    playableCardIds,
    disabledCardIds,
    highlightedCellIds,
    highlightedFighterIds,
    framedFighterIds,
    placementCells,
    placementFighters,
    okControl,
    backControl,
    boardInteractive,
    showPickNumHero,
    selectedFighterId,
    selectedNumHeroId,
    mapSummary,
    viewJson,
    isCardPlayable,
    isCardDisabled,
    choiceCount,
    choicePicked,
    choiceComplete,
    cardFighterLabel: card => {
      if (card?.fighter == null) return 'любой';
      const binding = String(card.fighter);
      const mine = myFighters.value;
      const fighter =
        mine.find(entry => String(entry.id) === binding) ??
        mine.find(entry => String(entry.group) === binding);
      if (fighter) {
        return fighter.name || fighter.id;
      }
      return binding === 'any' ? 'любой' : binding;
    },
    selectFighter,
    clearFighterSelection,
    onSwitchPlayer,
    onDeckClick,
    onCardClick,
    onChoiceClick,
    onFinishAction,
    onUiBack,
    onResign,
    onBackToMenu,
    onPickNumHero,
    onFighterClick,
    onCellClick,
  };
};
