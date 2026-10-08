import { useState } from 'nuxt/app';
import { runAction, runLifecycle } from '#shared/publicApi.js';
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

/**
 * State партии живёт в памяти вкладки (hotseat), поэтому перезагрузка страницы убивала партию:
 * `hostState` пустой, `bootstrap` падал, и доска просто исчезала. Держим ту же копию ещё и в
 * sessionStorage: перезагрузка партию не теряет, а закрытие вкладки — теряет (как и раньше).
 * Ключ один на вкладку: секретность в hotseat и так на клиенте, новых данных это не раскрывает.
 */
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
  } catch {
    // переполнение или запрет хранилища — партия всё равно продолжается в памяти
  }
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
    persistHost(hostState.value);
  };

  const bootstrap = async (id, asPlayerId) => {
    const gid = String(id);
    const pid = String(asPlayerId);
    gameId.value = gid;
    playerId.value = pid;

    // сначала пробуем память вкладки, потом копию из sessionStorage: перезагрузка не должна убивать партию
    if (!hostState.value || String(hostState.value.id) !== gid) {
      const saved = storedHost();
      if (saved && String(saved.id) === gid) hostState.value = saved;
    }
    if (!hostState.value || String(hostState.value.id) !== gid) {
      throw new Error('Партия не найдена в этой вкладке — начните новую из лобби');
    }

    hostState.value = runLifecycle(hostState.value);
    persistHost(hostState.value);

    const raw = await $fetch('/api/party/view', {
      query: { gameId: gid, playerId: pid },
    });
    view.value = adaptPartyView(raw);
    return view.value;
  };

  /**
   * Отправка состояния сериализуется: в режиме против компьютера ход человека и первый ход бота могут
   * наложиться друг на друга (состояние в сторе меняется до ответа сервера), а сервер хранит последнее
   * присланное. Без очереди поздний ответ на старый ход перетирал бы свежий — и экран показывал бы
   * партию без только что сделанных действий.
   */
  let requestChain = Promise.resolve();

  const postState = body => {
    const request = requestChain.then(() =>
      $fetch('/api/party/state', {
        method: 'POST',
        body,
      }),
    );
    // цепочка не должна рваться из-за одного неудачного хода
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

  /**
   * Забываем партию в памяти вкладки, но **не** трогаем копию в sessionStorage: уход со страницы
   * (или перезапуск компонента при HMR) не должен стоить игроку партии. Новый `seed` перезапишет копию.
   */
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
