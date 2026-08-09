import { useState } from 'nuxt/app';
import { runAction, runLifecycle } from '#shared/gameEngine.js';
import { adaptPartyView } from '~/utils/adaptPartyView.js';

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

/** Клиент: host state из create, view — GET /api/party/view, ход — POST /api/party/state. */
export const useGameView = () => {
  const hostState = useState('party:host', () => null);
  const view = useState('party:view', () => null);
  const gameId = useState('party:gameId', () => null);
  const playerId = useState('party:playerId', () => null);

  const seed = (state, asPlayerId) => {
    hostState.value = runLifecycle(structuredClone(state));
    gameId.value = String(state.id);
    playerId.value = String(asPlayerId);
  };

  const bootstrap = async (id, asPlayerId) => {
    const gid = String(id);
    const pid = String(asPlayerId);
    gameId.value = gid;
    playerId.value = pid;

    if (!hostState.value || String(hostState.value.id) !== gid) {
      throw new Error('Нет state партии — начните игру из лобби');
    }

    hostState.value = runLifecycle(hostState.value);

    const raw = await $fetch('/api/party/view', {
      query: { gameId: gid, playerId: pid },
    });
    view.value = adaptPartyView(raw);
    return view.value;
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
      const raw = await $fetch('/api/party/state', {
        method: 'POST',
        body: {
          gameId: hostState.value.id,
          state: hostState.value,
          playerId: playerId.value,
        },
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
  };

  return {
    hostState,
    view,
    gameId,
    playerId,
    seed,
    bootstrap,
    sendAction,
    refresh,
    clear,
  };
};
