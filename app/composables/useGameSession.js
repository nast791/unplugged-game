import { runUi } from '#shared/core.js';
import { cardKey } from '#shared/helpers/cards.js';

/**
 * UI-сессия партии: что видно и что кликается, считает runUi(state, viewerId).
 * Клиент не считает правила — он шлёт PICK (колода, карта, боец, клетка) и UI_OK/UI_BACK/RESIGN,
 * одинаково и для расстановки, и для хода.
 */
export const useGameSession = () => {
  const { view, hostState, gameId, playerId, sendAction, refresh } = useGameView();

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
  const selectedFighterId = ref(null);
  const selectedNumHeroId = ref(null);

  const isPlacement = computed(() => phase.value === 'gameStart');

  const combat = computed(() => view.value?.combat ?? null);
  const movement = computed(() => view.value?.movement ?? null);
  const targeting = computed(() => view.value?.targeting ?? null);
  const lastCombat = computed(() => view.value?.lastCombat ?? null);

  /** Всё для клика и подсказок приходит из core: фаза, hint, подсветки, карты, кнопка. */
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
  const highlightedCellIds = computed(() =>
    (ui.value?.highlightedCellIds ?? []).map(String),
  );
  const highlightedFighterIds = computed(() =>
    (ui.value?.highlightedFighterIds ?? []).map(String),
  );
  const framedFighterIds = computed(() =>
    (ui.value?.framedFighterIds ?? []).map(String),
  );
  const playableCardIds = computed(() =>
    (ui.value?.playableCardIds ?? []).map(String),
  );
  const disabledCardIds = computed(() =>
    (ui.value?.disabledCardIds ?? []).map(String),
  );
  const deckClickable = computed(() => ui.value?.deck?.clickable === true);
  const okControl = computed(
    () =>
      ui.value?.controls?.ok ?? { visible: false, enabled: false, label: null },
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
  const myHeroes = computed(() =>
    myFighters.value.filter(fighter => fighter.type === 'hero'),
  );
  const deckCount = computed(() => me.value?.deckCount ?? 0);
  const results = computed(() => ui.value?.results ?? null);
  const showPickNumHero = computed(() => Boolean(ui.value?.modals?.pickNumHero));

  const isCardPlayable = card => playableCardIds.value.includes(cardKey(card));
  const isCardDisabled = card => disabledCardIds.value.includes(cardKey(card));

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
    if (
      list.some(fighter => String(fighter.id) === String(selectedFighterId.value))
    ) {
      return;
    }
    const pick =
      list.find(fighter => fighter.currentPosition != null) ?? list[0];
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

  /** Кто должен смотреть на экран: защитник в бою, владелец выбора цели или активный игрок. */
  const hotseatTarget = () => {
    const current = view.value;
    if (!current) return null;
    if (current.phase === 'gameEnd' || current.phase === 'turnEnd') return null;
    if (current.combat?.stage === 'defense') {
      return current.combat.defenderPlayerId ?? null;
    }
    if (current.targeting?.playerId != null) return current.targeting.playerId;
    return current.currentPlayer ?? null;
  };

  const syncHotseat = async () => {
    const target = hotseatTarget();
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

  const onFinishAction = () =>
    send({ type: 'UI_OK' });

  const onUiBack = () => send({ type: 'UI_BACK' });

  /** Сдаться можно в любой момент: RESIGN — общий move, доступный в каждой фазе. */
  const onResign = () =>
    run(async () => {
      const confirmed =
        typeof window === 'undefined' ||
        window.confirm('Сдаться? Партия для вас завершится.');
      if (!confirmed) return;
      await sendAction({ type: 'RESIGN' });
      await syncHotseat();
    });

  const onSwitchPlayer = id => run(() => switchViewer(id));

  /** Экран итогов: вернуться в лобби (состояние партии очистит onUnmounted). */
  const onBackToMenu = () => navigateTo('/');

  /** Выбор героя для номерной клетки — тот же клик: PICK по своему герою. */
  const onPickNumHero = fighterId => {
    selectedNumHeroId.value = String(fighterId);
    return pick({ kind: 'fighter', id: fighterId });
  };

  const selectFighter = fighterId => {
    selectedFighterId.value = String(fighterId);
    message.value = '';
  };

  /** Клик по фишке: подсвеченного бойца отдаём движку, своего — просто выбираем. */
  const onFighterClick = ({ fighterId }) => {
    const id = String(fighterId);
    if (highlightedFighterIds.value.includes(id)) {
      return pick({ kind: 'fighter', id });
    }
    if (myFighters.value.some(fighter => String(fighter.id) === id)) {
      selectFighter(id);
      return undefined;
    }
    message.value = 'Этот боец сейчас недоступен';
    return undefined;
  };

  /** Клик по клетке: в расстановке — поставить бойца, в ходу — шаг по подсвеченной клетке. */
  const onCellClick = cellId => {
    if (selectedFighterId.value == null) {
      message.value = 'Сначала выберите своего бойца';
      return undefined;
    }

    if (
      isPlacement.value ||
      highlightedCellIds.value.includes(String(cellId))
    ) {
      return pick({
        kind: 'cell',
        id: cellId,
        fighterId: selectedFighterId.value,
      });
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
    error: message,
    hint,
    ui,
    placementPhase,
    isPlacement,
    combat,
    movement,
    targeting,
    lastCombat,
    myFighters,
    myHand,
    myHeroes,
    deckCount,
    results,
    deckClickable,
    playableCardIds,
    disabledCardIds,
    highlightedCellIds,
    highlightedFighterIds,
    framedFighterIds,
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
    cardFighterLabel: card => {
      if (card?.fighter == null) return 'любой';
      const fighter = myFighters.value.find(
        entry => String(entry.id) === String(card.fighter),
      );
      return fighter?.name || String(card.fighter);
    },
    selectFighter,
    onSwitchPlayer,
    onDeckClick,
    onCardClick,
    onFinishAction,
    onUiBack,
    onResign,
    onBackToMenu,
    onPickNumHero,
    onFighterClick,
    onCellClick,
  };
};
