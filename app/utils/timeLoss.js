/**
 * Кто выбывает, когда время вышло: лимит времени — **правило партии**, а не подсказка.
 *
 * - **Расстановка**: выбывают все, кто ещё не подтвердил её (`placementReady`). Бюджет там один на всю
 *   фазу, поэтому «кто не успел — тот и вышел», а не «ждём самого медленного».
 * - **Игра**: выбывает действующий игрок — тот, чьего решения ждут сейчас (`actorId`).
 *
 * Слот **компьютера не выбывает никогда**: за него ходы считает клиент (`useGameAi`), и наказывать за это
 * человека нельзя. Поэтому в списке только места `control: 'human'` и только те, кто ещё в партии.
 *
 * Функция чистая: решение «кто проиграл» проверяется тестом, а отправку `RESIGN` делает клиент
 * (`useGameSession.resignByTimeout`).
 */
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

export default timeoutLosers;
