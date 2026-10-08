import { playDuel } from '../play/duel.js';
import { actionLine, cardIdOf, coverageOf, percent, summarizeMetrics } from '../play/metrics.js';
import { deckCardIds, deckSize, heroIds as poolHeroIds, heroName } from '../play/pool.js';

/**
 * Серия партий бота: общий код для vitest-тестов (`tests/scenarios/*-fuzz.test.js`), ручного прогона
 * (`pnpm test:bot`) и матрицы матчапов (`pnpm test:matrix`). Пара героев — любая из контента, поэтому
 * метрики считаются и по нашему пулу, и по эталонным Медузе с Теслой.
 * Прогон воспроизводим: у каждого сида своя партия, а лог действий попадает в отчёт.
 */

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
    `${report.matchup ? `${report.matchup}, ` : ''}сид ${report.seed}, шаг ${report.steps}: ` +
      `${report.status} — ${report.detail ?? ''}`,
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

/** Герои серии в порядке реестра контента: id игрока в партии — это id героя. */
export const heroesIn = reports => {
  const seen = new Set();
  for (const report of reports) {
    for (const player of report.state?.players ?? []) seen.add(String(player.id));
  }
  const known = poolHeroIds.filter(heroId => seen.has(heroId));
  const rest = [...seen].filter(heroId => !known.includes(heroId)).sort();
  return [...known, ...rest];
};

/** Карты, которые серия вообще не трогала: мёртвый груз колоды или непроверенная ветка кода. */
const untouchedCards = (reports, heroes) => {
  const played = new Set();
  for (const report of reports) {
    for (const action of report.log ?? []) {
      if (action.kind === 'card') played.add(cardIdOf(action.id));
    }
  }
  return [...new Set(heroes.flatMap(heroId => deckCardIds(heroId)))].filter(
    cardId => !played.has(cardId),
  );
};

/** Текстовый отчёт о серии: один и тот же у теста и у ручного прогона. */
export const describeSweep = reports => {
  const summary = reports.reduce((acc, report) => {
    acc[report.status] = (acc[report.status] ?? 0) + 1;
    return acc;
  }, {});
  const lines = [
    `прогон ${plural(reports.length, ['партия', 'партии', 'партий'])}: ` +
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

  const heroes = heroesIn(reports);
  const metrics = summarizeMetrics(reports);
  const finished = reports.filter(report => report.status === 'finished');

  // покрытие: какие карты колоды бот не сыграл — там и баги не искались
  const coverage = coverageOf(reports.flatMap(report => report.log ?? []));
  const deck = new Set(heroes.flatMap(heroId => deckCardIds(heroId)));
  const untouched = untouchedCards(reports, heroes);
  lines.push(
    `\nпокрытие: сыграно карт ${coverage.cards.length} из ${deck.size}, ` +
      `вариантов свойств ${coverage.options.length}`,
  );
  if (untouched.length > 0) {
    lines.push(`ни разу не сыграны: ${untouched.join(', ')}`);
  }

  // покой: кто выигрывает. Бот играет почти случайно, поэтому это ещё не баланс, а проверка,
  // что победа достижима за обе стороны; настоящие метрики — ниже, когда бот научится играть
  if (finished.length > 0) {
    const wins = Object.fromEntries(heroes.map(heroId => [heroId, 0]));
    let firstPlayerWins = 0;
    let steps = 0;

    for (const report of finished) {
      const winner = String(report.state.winner);
      wins[winner] = (wins[winner] ?? 0) + 1;
      const first = (report.state.settings?.heroes ?? [])
        .slice()
        .sort((left, right) => Number(left.order) - Number(right.order))[0]?.heroId;
      if (String(first) === winner) firstPlayerWins += 1;
      steps += report.steps;
    }

    lines.push(
      `победы: ${heroes
        .map(
          heroId =>
            `${heroName(heroId)} ${wins[heroId]} (${percent(wins[heroId], finished.length)}%)`,
        )
        .join(', ')}; первый игрок победил ${firstPlayerWins} раз; ` +
        `средняя длина ${Math.round(steps / finished.length)} действий`,
    );

    lines.push(
      `\nметрики (по ${plural(finished.length, ['партии', 'партиям', 'партиям'])} до конца):`,
    );
    for (const heroId of heroes) {
      const row = metrics.heroes[heroId];
      if (!row) continue;
      lines.push(
        `  ${heroName(heroId)}: колода ${deckSize(heroId)} / уникальных ${row.deck.length}, ` +
          `побед ${percent(row.wins, row.games)}%, длина ${Math.round(row.steps / row.games)}, ` +
          `урон ${(row.dealt / row.games).toFixed(1)} нанесённый / ` +
          `${(row.taken / row.games).toFixed(1)} полученный, ` +
          `покрытие ${row.played.size}/${row.deck.length} (${percent(row.played.size, row.deck.length)}%)`,
      );
      lines.push(`    действия: ${actionLine(row.actions)}`);
    }
    lines.push(
      `  исход решило первое убийство: ${metrics.totals.decidedByFirstBlood} из ` +
        `${metrics.totals.deaths} партий с убийствами (${percent(
          metrics.totals.decidedByFirstBlood,
          metrics.totals.deaths,
        )}%)`,
    );
  }

  return { lines, failures: failuresOf(reports), coverage, metrics, heroes };
};

export default describeSweep;
