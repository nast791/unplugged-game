import { useState } from 'nuxt/app';
import { runAction, runLifecycle } from '#shared/publicApi.js';
import { clearClock, markClock } from '~/composables/ui/useClock.js';

const zoneCards = zone => (Array.isArray(zone?.cards) ? zone.cards.map(card => ({ ...card })) : []);

const zoneCount = zone => zone?.count ?? (Array.isArray(zone?.cards) ? zone.cards.length : 0);

export const adaptPartyView = raw => {
  if (!raw) return null;

  const turnObj = raw.turn && typeof raw.turn === 'object' ? raw.turn : null;

  return {
    ...raw,
    phase: raw.hook ?? raw.phase ?? null,
    currentPlayer: turnObj?.playerId ?? raw.currentPlayer ?? null,
    turn: turnObj?.index ?? (typeof raw.turn === 'number' ? raw.turn : 0),
    actionsLeft: turnObj?.actionsLeft ?? raw.actionsLeft ?? 0,
    // счётчик карточки — числа движка: «осталось/всего» хода плюс выданный в этом ходу запас
    actionsTotal: Number(turnObj?.actionsTotal ?? raw.actionsTotal) || 0,
    actionsBonus: Number(turnObj?.bonus?.actions) || 0,
    winner: raw.winner ?? null,

    players: (raw.players ?? []).map(({ deck, discard, hand, ...p }) => ({
      ...p,
      hand: zoneCards(hand),
      handCount: zoneCount(hand),
      discard: zoneCards(discard),
      deckCount: zoneCount(deck),
      discardCount: zoneCount(discard),
    })),
  };
};

const actionErrorMessage = err => {
  const data = err && typeof err === 'object' ? err.data : null;
  const candidates = [
    data?.data?.message,
    data?.message,
    data?.statusMessage,
    err instanceof Error ? err.message : null,
  ];
  for (const raw of candidates) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    if (raw === 'Bad Request' || raw === 'Action failed') continue;
    if (raw.startsWith('[POST]') || raw.startsWith('[GET]')) continue;
    return raw;
  }
  return 'Ошибка хода';
};

const STORAGE_KEY = 'unplugged:party:host';

const storage = () => (typeof sessionStorage === 'undefined' ? null : sessionStorage);

const storedHost = () => {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const persistHost = state => {
  const store = storage();
  if (!store) return;
  try {
    if (state) store.setItem(STORAGE_KEY, JSON.stringify(state));
    else store.removeItem(STORAGE_KEY);
  } catch {}
};

export const useGameView = () => {
  const hostState = useState('party:host', () => null);
  const view = useState('party:view', () => null);
  const gameId = useState('party:gameId', () => null);
  const playerId = useState('party:playerId', () => null);
  const steps = useState('party:steps', () => 0);
  const selectedFighterId = useState('party:selectedFighter', () => null);

  const seed = (state, asPlayerId) => {
    hostState.value = runLifecycle(structuredClone(state));
    gameId.value = String(state.id);
    playerId.value = String(asPlayerId);
    steps.value = 0;
    markClock('party:placement');
    clearClock('party:play');
    persistHost(hostState.value);
  };

  const seedView = raw => {
    view.value = adaptPartyView(raw);
    return view.value;
  };

  const bootstrap = async (id, asPlayerId) => {
    const gid = String(id);
    const pid = String(asPlayerId);
    gameId.value = gid;
    playerId.value = pid;

    if (!hostState.value || String(hostState.value.id) !== gid) {
      const saved = storedHost();
      if (saved && String(saved.id) === gid) hostState.value = saved;
    }
    if (!hostState.value || String(hostState.value.id) !== gid) {
      throw new Error('Партия не найдена в этой вкладке — начните новую из лобби');
    }

    hostState.value = runLifecycle(hostState.value);
    persistHost(hostState.value);

    if (view.value?.id === gid) return view.value;

    const raw = await $fetch('/api/party/view', {
      query: { gameId: gid, playerId: pid },
    });
    view.value = adaptPartyView(raw);
    return view.value;
  };

  const discard = () => {
    persistHost(null);
    clearClock('party:placement');
    clearClock('party:play');
    clear();
  };

  let requestChain = Promise.resolve();

  const postState = body => {
    const request = requestChain.then(() =>
      $fetch('/api/party/state', {
        method: 'POST',
        body,
      }),
    );
    requestChain = request.then(
      () => undefined,
      () => undefined,
    );
    return request;
  };

  const sendAction = async action => {
    if (!hostState.value?.id) {
      throw new Error('Нет state партии');
    }
    const payload = {
      ...action,
      playerId: String(action.playerId ?? playerId.value),
    };
    try {
      hostState.value = runAction(hostState.value, payload);
      steps.value += 1;
      persistHost(hostState.value);
      const raw = await postState({
        gameId: hostState.value.id,
        state: hostState.value,
        playerId: playerId.value,
      });
      view.value = adaptPartyView(raw);
      return view.value;
    } catch (err) {
      throw new Error(actionErrorMessage(err));
    }
  };

  const refresh = async () => {
    if (!gameId.value) {
      throw new Error('Нет gameId');
    }
    const raw = await $fetch('/api/party/view', {
      query: { gameId: gameId.value, playerId: playerId.value },
    });
    view.value = adaptPartyView(raw);
    return view.value;
  };

  const clear = () => {
    hostState.value = null;
    view.value = null;
    gameId.value = null;
    playerId.value = null;
    selectedFighterId.value = null;
  };

  return {
    hostState,
    view,
    gameId,
    playerId,
    steps,
    selectedFighterId,
    seed,
    seedView,
    bootstrap,
    sendAction,
    refresh,
    discard,
    clear,
  };
};
