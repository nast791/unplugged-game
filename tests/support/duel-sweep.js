import medusaCards from '../../server/content/heroes/medusa/cards.js';
import teslaCards from '../../server/content/heroes/tesla/cards.js';
import { coverageOf, playDuel } from './duel-bot.js';

/**
 * Серия партий фаззинг-бота: общий код для vitest-теста (`scenarios/duel-fuzz.test.js`)
 * и ручного прогона (`pnpm test:bot`, `tests/support/bot-sweep.js`).
 * Прогон воспроизводим: у каждого сида своя партия, а лог действий попадает в отчёт.
 */

/** Все карты дуэли: по ним считается покрытие — какие карты бот вообще не сыграл. */
export const duelCardIds = [...medusaCards, ...teslaCards].map(card => card.id);

/** Русское согласование числа: `plural(1, ['партия', 'партии', 'партий'])` → «1 партия». */
export const plural = (count, [one, few, many]) => {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${count} ${many}`;
  if (mod10 === 1) return `${count} ${one}`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} ${few}`;
  return `${count} ${many}`;
};

/** Компактный отчёт по партии: по нему находка повторяется один в один. */
export const showReport = report => {
  const lines = [
    `сид ${report.seed}, шаг ${report.steps}: ${report.status} — ${report.detail ?? ''}`,
  ];
  if (report.action) {
    lines.push(`  действие: ${JSON.stringify(report.action)}`);
  }
  lines.push(`  перед этим: ${JSON.stringify(report.log.slice(-6))}`);
  return lines.join('\n');
};

/**
 * Прогнать серию партий. Исключение вне партии (например, упал `runUi`) — тоже находка,
 * поэтому прогон его ловит и продолжает, а не падает целиком.
 */
export const runSweep = (seeds, options = {}) =>
  seeds.map(seed => {
    try {
      return playDuel({ seed, ...options });
    } catch (error) {
      return {
        status: 'invalid',
        seed,
        steps: 0,
        log: [],
        detail: `исключение вне партии: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });

/** Сводка по видам находок, чтобы правки шли по частоте, а не по порядку. */
export const groupByReason = reports => {
  const groups = new Map();
  for (const report of reports) {
    const reason = `${report.status}: ${report.detail ?? ''}`;
    if (!groups.has(reason)) groups.set(reason, []);
    groups.get(reason).push(report);
  }
  return [...groups.entries()].sort((left, right) => right[1].length - left[1].length);
};

/**
 * Что считаем поломкой прогона: падение, тупик и нарушенный инвариант.
 * `stuck` (партия не уложилась в лимит шагов) и `noop` в отчёт попадают, но прогон не роняют:
 * лимит шагов — свойство бота, а не движка.
 */
export const failuresOf = reports =>
  reports.filter(
    report =>
      report.status === 'crash' || report.status === 'deadlock' || report.status === 'invalid',
  );

/** Текстовый отчёт о серии: один и тот же у теста и у ручного прогона. */
export const describeSweep = reports => {
  const summary = reports.reduce((acc, report) => {
    acc[report.status] = (acc[report.status] ?? 0) + 1;
    return acc;
  }, {});
  const lines = [
    `прогон ${plural(reports.length, ['партии', 'партий', 'партий'])}: ` +
      `до конца ${summary.finished ?? 0}, ` +
      `не завершились ${summary.stuck ?? 0}, падений ${summary.crash ?? 0}, ` +
      `тупиков ${summary.deadlock ?? 0}, пустых действий ${summary.noop ?? 0}`,
  ];

  for (const [reason, found] of groupByReason(reports)) {
    // дошедшие до конца партии подробно не печатаем: их лог нужен только при разборе находки
    if (found[0].status === 'finished') continue;
    lines.push(`\n[${found.length}×] ${reason}`);
    for (const report of found.slice(0, 2)) {
      lines.push(showReport(report));
    }
  }

  // покрытие: какие карты колоды бот не сыграл — там и баги не искались
  const coverage = coverageOf(reports.flatMap(report => report.log));
  const untouched = duelCardIds.filter(id => !coverage.cards.includes(id));
  lines.push(
    `\nпокрытие: сыграно карт ${coverage.cards.length} из ${duelCardIds.length}, ` +
      `вариантов свойств ${coverage.options.length}`,
  );
  if (untouched.length > 0) {
    lines.push(`ни разу не сыграны: ${untouched.join(', ')}`);
  }

  // покой: кто выигрывает. Бот играет почти случайно, поэтому это не баланс, а проверка,
  // что победа вообще достижима за обе стороны (100% на одну сторону — сигнал, что что-то сломано)
  const finished = reports.filter(report => report.status === 'finished');
  const wins = { medusa: 0, tesla: 0 };
  const firstPlayerWins = { medusa: 0, tesla: 0 };
  let steps = 0;

  for (const report of finished) {
    const winner = String(report.state.winner);
    wins[winner] = (wins[winner] ?? 0) + 1;
    // нечётные сиды первыми играют за Медузу, чётные — за Теслу
    const first = report.seed % 2 === 0 ? 'tesla' : 'medusa';
    if (winner === first) firstPlayerWins[first] += 1;
    steps += report.steps;
  }

  if (finished.length > 0) {
    const percent = count => Math.round((count / finished.length) * 100);
    lines.push(
      `победы: Медуза ${wins.medusa} (${percent(wins.medusa)}%), Тесла ${wins.tesla} ` +
        `(${percent(wins.tesla)}%); первый игрок победил ${
          firstPlayerWins.medusa + firstPlayerWins.tesla
        } раз; средняя длина ${Math.round(steps / finished.length)} действий`,
    );
  }

  return { lines, failures: failuresOf(reports), coverage, wins };
};

export default describeSweep;
