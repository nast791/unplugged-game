import { describe, expect, it } from 'vitest';
import { resolveGameHint } from '../../app/composables/game/useGameHint.js';
import { adaptPartyView } from '../../app/composables/game/useGameView.js';
import { playHotseat } from '../../bot/play/hotseat.js';
import { view } from '../../server/party.js';

/**
 * Стол на четверых людей (hotseat): прогон играет партии за все четыре места и на каждом ходу смотрит
 * то, что видит игрок, — проекцию сервера глазами клиента (`adaptPartyView`, `resolveGameHint`).
 *
 * Сиды фиксированы, прогон детерминирован: находка повторяется один в один (`node bot/tools/hotseat.js
 * --seed=N`). Здесь короткая серия — она стережёт регрессии в обычном `pnpm test`; длинная серия живёт
 * в ручном прогоне (`node bot/tools/hotseat.js --games=1500`).
 */
const FAILING = ['crash', 'deadlock', 'invalid', 'view', 'reject', 'foreign'];

/** Сид 18 — та самая находка: помощники соседа занимали область Медузы, и расстановка вставала. */
const REGRESSION_SEED = 18;

const clientProblems =
  problems =>
  ({ step, state, playerId }) => {
    if (step % 7 !== 0) return null;

    for (const player of state.players ?? []) {
      try {
        const raw = view(state, player.id);
        const adapted = adaptPartyView(raw);
        if (String(adapted.you) !== String(player.id)) {
          problems.push(`adaptPartyView(${player.id}).you = ${adapted.you}`);
        }
        const mine = (adapted.players ?? []).find(entry => String(entry.id) === String(player.id));
        if (!Array.isArray(mine?.hand)) {
          problems.push(`adaptPartyView(${player.id}): своя рука не список`);
        }
        const hint = resolveGameHint({ hint: raw?.ui?.hint ?? null });
        if (hint != null && typeof hint.text !== 'string') {
          problems.push(`resolveGameHint(${player.id}): подсказка без текста`);
        }
        resolveGameHint({ error: `клик ${String(playerId)}`, pending: true, aiThinking: true });
      } catch (error) {
        problems.push(`клиент ${player.id}: ${error instanceof Error ? error.message : error}`);
      }
    }

    return null;
  };

const play = (seed, extra = {}) => {
  const problems = [];
  const report = playHotseat({
    seed,
    players: 4,
    maxSteps: 1200,
    onStep: clientProblems(problems),
    ...extra,
  });
  return { report, problems };
};

const failureOf = ({ report, problems }, seed) => {
  if (FAILING.includes(report.status)) {
    return `сид ${seed}: ${report.status} — ${report.detail}\nлог: ${JSON.stringify(report.log.slice(-6))}`;
  }
  return problems.length > 0 ? `сид ${seed}: ${problems[0]}` : null;
};

describe('стол на четверых людей', () => {
  it('расстановка не встаёт: стартовой области хватает своих клеток (сид 18)', () => {
    const report = playHotseat({ seed: REGRESSION_SEED, players: 4, maxSteps: 60 });

    expect(report.status, report.detail ?? '').not.toBe('deadlock');
    expect(report.state?.hook).not.toBe('gameStart');
  });

  it('партии доходят до конца, а проекция и подсказка не падают на каждом ходу', () => {
    for (const seed of [1, 4, 7]) {
      const failure = failureOf(play(seed), seed);
      expect(failure, failure ?? '').toBeNull();
    }
  }, 30000);

  it('за столом никто не видит чужой руки, колоды и чужой расстановки', () => {
    const report = playHotseat({ seed: 11, players: 4, maxSteps: 400, viewEvery: 1 });

    expect(report.status, report.detail ?? '').not.toBe('view');
  });
});
