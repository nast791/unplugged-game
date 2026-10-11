import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tableOf } from '../../../bot/play/artifact.js';
import { actionsFor } from '../../../bot/play/decide.js';
import { createDuel, playDuel } from '../../../bot/play/duel.js';
import { rankOptions } from '../../../bot/play/qvalue.js';
import live from '../../../bot/play/qvalue-weights.js';

/**
 * Два артефакта в одной партии: «новая версия против старой» и «ученик за одного героя против ученика за
 * другого». До этого модель была одна на оба места (`bot/play/qvalue.js` читал вшитый в бандл файл),
 * поэтому такой матч был невыразим.
 *
 * Тест проверяет три вещи, каждая из которых ломается молча:
 * - разные артефакты дают **разные** оценки на одном состоянии (иначе сторона B не влияет ни на что);
 * - `playDuel` доигрывает партию, где артефакты сторон разные, и обе стороны действительно что-то играют;
 * - отсутствующий файл артефакта — падение с внятным текстом, а не тихая подмена живым.
 */
const candidate = 'trainer/artifacts/mlp-d.json';
const hasCandidate = existsSync(candidate);
const candidateTable = hasCandidate ? tableOf(candidate) : null;

describe('артефакт как параметр: версия против версии', () => {
  it('два артефакта считают одно состояние по-разному', () => {
    expect(hasCandidate).toBe(true);
    // артефакты обязаны быть разными моделями: если это один и тот же файл, тест ничего не значит
    expect(candidateTable.meta.games).not.toBe(live.meta?.games);
    expect(Number(candidateTable.bscore[0])).not.toBe(Number(live.bscore[0]));

    // позицию берём из настоящей партии (на расстановке выбора нет): первая точка, где у ученика больше
    // одного предложенного варианта
    let state = null;
    playDuel({
      seed: 7,
      testId: 'artifact_diff',
      heroA: 'anubis',
      heroB: 'tesla',
      policy: 'qvalue',
      artifact: candidate,
      onStep: ({ state: current, playerId, options }) => {
        if (state == null && options.filter(entry => Number(entry.weight) > 0).length > 1)
          state = { state: current, playerId };
      },
    });
    expect(state, 'в партии не нашлось решения с выбором').not.toBeNull();

    const options = actionsFor(state.state, state.playerId, { policy: 'greedy' });
    expect(options.length).toBeGreaterThan(1);

    const mine = rankOptions(state.state, state.playerId, options, { artifact: candidate });
    const their = rankOptions(state.state, state.playerId, options, { artifact: null });
    const weightsOf = entries => entries.map(entry => Number(entry.weight).toFixed(6)).join(',');

    expect(weightsOf(mine)).not.toBe(weightsOf(their));
  });

  it('партия играется двумя разными моделями и доходит до конца', () => {
    expect(hasCandidate).toBe(true);
    const report = playDuel({
      seed: 7,
      testId: 'artifact_duel',
      heroA: 'anubis',
      heroB: 'tesla',
      policy: 'qvalue',
      policyB: 'qvalue',
      artifact: candidate,
      artifactB: null,
    });

    expect(['finished', 'stuck', 'deadlock']).toContain(report.status);
    expect(report.steps).toBeGreaterThan(5);
    // обе стороны что-то сделали: иначе «матч версий» был бы ходом одной модели
    const actors = new Set(report.log.map(action => String(action.playerId)));
    expect(actors.size).toBe(2);
  });

  it('несуществующий артефакт — ошибка чтения, а не молчаливая подмена живым', () => {
    expect(() => tableOf('trainer/artifacts/нет-такого.json')).toThrow();
  });
});
