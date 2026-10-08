import { runUi } from '#shared/core.js';
import { cardKey } from '#shared/helpers/cards.js';
import { fighterClickIntent, fighterPickExpected } from '#shared/helpers/ui.js';

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
  const myHeroes = computed(() => myFighters.value.filter(fighter => fighter.type === 'hero'));
  const deckCount = computed(() => me.value?.deckCount ?? 0);
  const results = computed(() => ui.value?.results ?? null);
  const showPickNumHero = computed(() => Boolean(ui.value?.modals?.pickNumHero));

  /** Варианты свойства карты: движок отдаёт их с пометкой `disabled` — недоступный выбрать нельзя. */
  const choices = computed(() =>
    (ui.value?.choices ?? []).map(entry => ({
      optionId: String(entry.optionId),
      title: entry.title ?? String(entry.optionId),
      disabled: entry.disabled === true,
    })),
  );

  /**
   * Варианты открытого окна `kind: 'options'`, которое фаза не показывает в `ui.choices`
   * (фаза объявления так открывает окно по чужим картам руки): список берём прямо у окна.
   * Кандидатов видит только владелец окна — проекция сервера (`party.js`) отдаёт их лишь ему.
   */
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

  /**
   * Предметы игрока (пелена Анубиса, катушки Теслы): их состояния читают свойства карт, поэтому
   * показываем. Подписи состояний предмет задаёт сам (`states`), иначе работает общий словарь.
   */
  const myItems = computed(() => me.value?.items ?? []);
  const itemStateLabel = (item, state) => {
    if (item?.states?.[state]) return item.states[state];
    if (state === 'active') return 'активна';
    if (state === 'inactive') return 'разряжена';
    return state == null ? '—' : String(state);
  };

  /**
   * Ждёт ли движок клика по бойцу: объявление атаки (выбор атакующего или цели) и окно выбора цели.
   * Перемещение и расстановка тоже подсвечивают бойцов, но там клик только выбирает бойца для хода.
   * Правило живёт в shared/helpers/ui.js: `view.phase` — это хук (`turn`), а не имя фазы,
   * и путать их нельзя (на этом клик по атакующему перестал доходить до движка).
   */
  const expectsFighterPick = computed(() => fighterPickExpected(ui.value));

  /** Кого сейчас можно отметить: кандидаты боя или окна цели — их же показываем кнопками. */
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

  /**
   * Раскрытая карта («Раскройте» = показать всем): движок держит снимок в `state.reveal`,
   * показываем её всем, кто смотрит на экран.
   */
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

  /** Что сейчас на столе в бою: разыгранная карта, кто атакует, кого бьют, чем защищаются. */
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

  /** Есть ли в партии слоты компьютера: по ним `syncHotseat` понимает, что передавать экран некому. */
  const hasAiSeats = computed(() =>
    (view.value?.settings?.heroes ?? []).some(slot => String(slot.control) === 'ai'),
  );

  /**
   * Кто должен смотреть на экран: владелец паузы эффекта, защитник в бою, владелец выбора цели или активный игрок.
   */
  const hotseatTarget = () => {
    const current = view.value;
    if (!current) return null;
    if (current.phase === 'gameEnd' || current.phase === 'turnEnd') return null;
    // пауза эффекта (например, враг выбирает карту для сброса) — смотреть должен тот, кто выбирает
    if (current.combat?.choice?.playerId != null) {
      return current.combat.choice.playerId;
    }
    if (current.combat?.stage === 'defense') {
      return current.combat.defenderPlayerId ?? null;
    }
    if (current.targeting?.playerId != null) return current.targeting.playerId;
    return current.currentPlayer ?? null;
  };

  const syncHotseat = async () => {
    // режим против компьютера: за часть слотов играет клиент (`app/composables/useGameAi.js`),
    // «передать экран» там некому — смотрим всегда своими глазами
    if (hasAiSeats.value) {
      ensureSelection();
      return;
    }

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

  const onFinishAction = () => send({ type: 'UI_OK' });

  /**
   * Отметка варианта свойства: PICK kind 'option'. Вариант ищем и среди `ui.choices`, и среди
   * кандидатов открытого окна (окно по чужим картам руки фаза в `ui.choices` не отдаёт).
   * Недоступный вариант клик не отправляет.
   */
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

  /** Сдаться можно в любой момент: RESIGN — общий move, доступный в каждой фазе. */
  const onResign = () =>
    run(async () => {
      const confirmed =
        typeof window === 'undefined' || window.confirm('Сдаться? Партия для вас завершится.');
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

  /**
   * Клик по фишке: что он значит — решает общее правило (`fighterClickIntent`): кандидат уходит движку,
   * подсвеченный боец (в том числе чужой — принудительное перемещение) просто выбирается для шага.
   */
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

  /** Клик по клетке: в расстановке — поставить бойца, в ходу — шаг по подсвеченной клетке. */
  const onCellClick = cellId => {
    if (selectedFighterId.value == null) {
      message.value = 'Сначала выберите бойца';
      return undefined;
    }

    if (isPlacement.value || highlightedCellIds.value.includes(String(cellId))) {
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
    hasAiSeats,
    combat,
    movement,
    targeting,
    lastCombat,
    myFighters,
    myHand,
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
      const binding = String(card.fighter);
      const mine = myFighters.value;
      // привязка бывает и группой помощников: показываем имя бойца, иначе — название группы
      const fighter =
        mine.find(entry => String(entry.id) === binding) ??
        mine.find(entry => String(entry.group) === binding);
      if (fighter) {
        return fighter.name || fighter.id;
      }
      return binding === 'any' ? 'любой' : binding;
    },
    selectFighter,
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
