import { computed } from 'vue';
import { useGameView } from './useGameView.js';

/**
 * Computed поверх адаптированного view: чей сейчас ход, кто ты, сколько действий и чем кончилась партия.
 * Наружу отдаём только то, что читает `useGameSession`. Правил игры здесь нет: всё, что решает движок,
 * клиент берёт из `runUi` (`useGameSession.ui`), а не считает сам.
 */
export const useGameHelpers = () => {
  const { view, playerId } = useGameView();

  const players = computed(() => view.value?.players ?? []);

  const findPlayer = id => {
    if (id == null) return null;
    return players.value.find(p => String(p.id) === String(id)) ?? null;
  };

  const you = computed(() => view.value?.you ?? playerId.value ?? null);
  const me = computed(() => findPlayer(you.value));

  const currentPlayerId = computed(() =>
    view.value?.currentPlayer != null ? String(view.value.currentPlayer) : null,
  );
  const currentPlayer = computed(() => findPlayer(currentPlayerId.value));

  const isMyTurn = computed(() => {
    if (you.value == null || currentPlayerId.value == null) return false;
    return String(you.value) === String(currentPlayerId.value);
  });

  const turn = computed(() => view.value?.turn ?? 0);
  const phase = computed(() => view.value?.phase ?? null);
  const actionsLeft = computed(() => view.value?.actionsLeft ?? 0);
  const winner = computed(() => view.value?.winner ?? null);
  const isGameOver = computed(() => phase.value === 'gameEnd' || winner.value != null);

  return {
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
  };
};
