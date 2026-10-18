import { runUi } from '#shared/core.js';
import { cardKey } from '#shared/helpers/cards.js';
import { fighterClickIntent, fighterPickExpected } from '#shared/helpers/ui.js';
import { markCardFlightsViewerChanged } from '~/composables/animations/useCardFlights.js';
import { useGameView } from '~/composables/game/useGameView.js';
import { useProfile } from '~/composables/ui/useProfile.js';
import { useGameHelpers } from './useGameHelpers.js';

export const timeoutLosers = ({ placement = false, players = [], actorId = null } = {}) => {
  const humans = (players ?? []).filter(
    player => String(player?.control ?? 'human') === 'human' && player?.resigned !== true,
  );

  if (placement) {
    return humans.filter(player => player.placementReady !== true).map(player => String(player.id));
  }

  if (actorId == null) return [];
  return humans
    .filter(player => String(player.id) === String(actorId))
    .map(player => String(player.id));
};

export const placementActor = (players = []) => {
  const waiting = (players ?? [])
    .filter(
      player =>
        String(player?.control ?? 'human') === 'human' &&
        player?.resigned !== true &&
        player?.placementReady !== true,
    )
    .sort((left, right) => (Number(left?.order) || 0) - (Number(right?.order) || 0));
  return waiting.length ? String(waiting[0].id) : null;
};

export const handoverTarget = ({
  placement = false,
  seating = '',
  players = [],
  actingId = null,
  viewerId = null,
} = {}) => {
  if (String(seating ?? '') !== 'local') return null;

  const humans = (players ?? []).filter(player => String(player?.control ?? 'human') === 'human');
  if (humans.length < 2) return null;

  const target = placement ? placementActor(humans) : actingId;
  if (target == null) return null;
  if (!humans.some(player => String(player.id) === String(target))) return null;
  return String(target) === String(viewerId ?? '') ? null : String(target);
};

const bonusArmedKey = ref('');

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
    actionsTotal,
    actionsBonus,
    winner,
    isGameOver,
    me,
  } = useGameHelpers();

  const { nick } = useProfile();

  const pending = ref(false);
  const message = ref('');
  const selectedNumHeroId = ref(null);

  const isPlacement = computed(() => phase.value === 'gameStart');

  const combat = computed(() => view.value?.combat ?? null);
  const movement = computed(() => view.value?.movement ?? null);
  const targeting = computed(() => view.value?.targeting ?? null);
  const lastCombat = computed(() => view.value?.lastCombat ?? null);
  const lastSkill = computed(() => view.value?.lastSkill ?? null);

  const battleRoles = computed(() => {
    const current = combat.value;
    const key = value => (value == null ? null : String(value));
    return {
      attackerPlayerId: key(current?.attackerPlayerId),
      defenderPlayerId: key(current?.defenderPlayerId),
      attackerFighterId: key(current?.attackerFighterId),
      defenderFighterId: key(current?.targetFighterId),
    };
  });

  const isBattleParticipant = id => {
    const roles = battleRoles.value;
    if (id == null) return false;
    return String(id) === roles.attackerPlayerId || String(id) === roles.defenderPlayerId;
  };

  const inBattle = computed(() => isBattleParticipant(you.value));

  const askingCard = computed(() => {
    const source =
      targeting.value?.source ?? combat.value?.choice?.source ?? movement.value?.source ?? null;
    if (source == null) return null;

    const key = String(source);
    const own = [
      combat.value?.attackCard,
      combat.value?.defenseCard,
      ...(me.value?.hand ?? []),
    ].find(card => card && cardKey(card) === key);
    if (own) return own;

    for (const player of players.value ?? []) {
      const found = (player.discard ?? []).find(card => cardKey(card) === key);
      if (found) return found;
    }
    return null;
  });

  const bonusCard = computed(() => movement.value?.card ?? null);
  const bonusUsed = computed(() => movement.value?.bonusUsed === true);
  const movementBonus = computed(() => Number(movement.value?.bonus) || 0);
  const canDiscardBonus = computed(
    () => Boolean(movement.value) && movement.value.source == null && !bonusUsed.value,
  );

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
  const pickedFighterIds = computed(() => (ui.value?.pickedFighterIds ?? []).map(String));
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
  const myDiscardCount = computed(() =>
    Number(me.value?.discardCount ?? me.value?.discard?.length ?? 0),
  );
  const myHeroes = computed(() => myFighters.value.filter(fighter => fighter.type === 'hero'));
  const deckCount = computed(() => me.value?.deckCount ?? 0);
  const results = computed(() => ui.value?.results ?? null);
  const showPickNumHero = computed(() => Boolean(ui.value?.modals?.pickNumHero));

  const placementCells = computed(() =>
    (ui.value?.placementCells ?? []).map(cell => ({
      id: String(cell.id),
      occupied: cell.occupied === true,
    })),
  );

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

  const cardFighterLabel = card => {
    if (card?.fighter == null) return 'любой';
    const binding = String(card.fighter);
    if (binding === 'any') return 'любой';
    const mine = myFighters.value;
    const fighter =
      mine.find(entry => String(entry.id) === binding) ??
      mine.find(entry => String(entry.group) === binding);
    return fighter ? fighter.name || fighter.id : binding;
  };

  const holderName = ownerId => {
    if (ownerId == null) return '';
    const holder = (players.value ?? []).find(player => String(player.id) === String(ownerId));
    if (!holder) return '';
    if (String(holder.id) === String(you.value ?? '')) {
      return String(nick.value ?? '') || String(holder.name ?? '');
    }
    return String(holder.name ?? '');
  };

  const combatInfo = computed(() => {
    const current = combat.value;
    if (!current) return '';

    const parts = [];
    const attackCard = current.attackCard;
    if (attackCard) {
      parts.push(`карта битвы «${attackCard.title ?? attackCard.id}»`);
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

    return `Битва (${current.stage}): ${parts.join(' · ')}`;
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
    if (isPlacement.value) return;
    if (list.some(fighter => String(fighter.id) === String(selectedFighterId.value))) {
      return;
    }
    const pick = list.find(fighter => fighter.currentPosition != null) ?? list[0];
    selectedFighterId.value = pick ? String(pick.id) : null;
  };

  watch(myFighters, () => ensureSelection(), { immediate: true });

  const switchViewer = async id => {
    markCardFlightsViewerChanged();
    playerId.value = String(id);
    selectedFighterId.value = null;
    selectedNumHeroId.value = null;
    await refresh();
    ensureSelection();
  };

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

  const resignByTimeout = (placement = false) =>
    run(async () => {
      const losers = timeoutLosers({
        placement,
        players: players.value,
        actorId: actingPlayerId.value,
      });
      for (const id of losers) {
        if (isGameOver.value) break;
        await sendAction({ type: 'RESIGN', playerId: String(id) });
      }
      await syncHotseat();
    });

  const syncHotseat = async () => {
    const target = handoverTarget({
      placement: isPlacement.value,
      seating: view.value?.settings?.seating,
      players: players.value,
      actingId: actingPlayerId.value,
      viewerId: playerId.value,
    });
    if (target == null) {
      ensureSelection();
      return;
    }
    await switchViewer(target);
  };

  const send = action =>
    run(async () => {
      await sendAction(action);
      await syncHotseat();
    });

  const pick = payload => send({ type: 'PICK', ...payload });

  watch(canDiscardBonus, allowed => {
    if (!allowed) bonusArmedKey.value = '';
  });

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

  const armBonusCard = card => {
    const key = cardKey(card);
    if (!canDiscardBonus.value) {
      message.value = 'Усиление перемещения сейчас недоступно';
      return false;
    }
    if (!isCardPlayable(card)) {
      message.value = 'У этой карты нет усиления перемещения';
      return false;
    }
    if (bonusArmedKey.value === key) {
      bonusArmedKey.value = '';
      return true;
    }
    bonusArmedKey.value = key;
    return true;
  };

  const disarmBonusCard = () => {
    bonusArmedKey.value = '';
  };

  const armedBonusCard = computed(
    () => myHand.value.find(card => cardKey(card) === bonusArmedKey.value) ?? null,
  );

  const onBonusDiscard = () => {
    const card = armedBonusCard.value;
    if (!card) {
      message.value = 'Сначала выберите карту для усиления';
      return undefined;
    }
    if (!canDiscardBonus.value) {
      message.value = 'Усиление перемещения сейчас недоступно';
      return undefined;
    }
    const key = cardKey(card);
    bonusArmedKey.value = '';
    return pick({ kind: 'card', id: key });
  };

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

  const freePlacementCellIds = computed(() =>
    placementCells.value.filter(cell => cell.occupied !== true).map(cell => String(cell.id)),
  );

  const onCellClick = cellId => {
    if (cellId == null) {
      if (isPlacement.value) clearFighterSelection();
      return undefined;
    }

    if (selectedFighterId.value == null) {
      message.value = 'Сначала выберите бойца';
      return undefined;
    }

    const target = String(cellId);
    const placementTarget = isPlacement.value && freePlacementCellIds.value.includes(target);
    if (highlightedCellIds.value.includes(target) || placementTarget) {
      const fighterId = selectedFighterId.value;
      const picked = pick({ kind: 'cell', id: cellId, fighterId });
      if (isPlacement.value) clearFighterSelection();
      return picked;
    }

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
    void syncHotseat();
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
    actionsTotal,
    actionsBonus,
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
    combat,
    movement,
    targeting,
    lastCombat,
    lastSkill,
    battleRoles,
    isBattleParticipant,
    inBattle,
    askingCard,
    bonusCard,
    bonusUsed,
    movementBonus,
    canDiscardBonus,
    armedBonusCard,
    armBonusCard,
    disarmBonusCard,
    onBonusDiscard,
    myFighters,
    myHand,
    myDiscardCount,
    myHeroes,
    deckCount,
    results,
    choices,
    targetingChoices,
    myItems,
    pickCandidates,
    combatInfo,
    revealedCards,
    deckClickable,
    playableCardIds,
    disabledCardIds,
    highlightedCellIds,
    highlightedFighterIds,
    pickedFighterIds,
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

    holderName,
    cardFighterLabel,
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
