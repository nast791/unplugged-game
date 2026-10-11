import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { actionFeatures } from '../../../bot/play/actionFeatures.js';
import { RUNTIME_PROPOSER } from '../../../bot/play/ai.js';
import { PROPOSER_POLICY, actionsFor, proposalPolicy } from '../../../bot/play/decide.js';

/**
 * Дневник и рантайм обязаны **перечислять варианты одной политикой**: признак 19 вектора варианта
 * («мнение политики») — это вес варианта у предлагателя, и если дневник считает его по `greedy`, а
 * живой ход в браузере перечисляет `trade` (§36), ученик учится на числах, которых в игре не видит.
 * Ровно так уже случалось (§23), поэтому проверка механическая, а не на глаз.
 *
 * Тест берёт состояние **из самого дневника** (`--probe-dir`) и пересчитывает признаки варианта тем же
 * путём, что живой ход: `actionsFor` политикой предлагателя + `actionFeatures`. Расхождение
 * предлагателя видно сразу — у весов `trade` признак 19 другой, и сравнение падает с разницей.
 * Проба, а не сам тест, перечисляет варианты: так проверяется то перечисление, которым собран дневник.
 */
const runExport = (args, withProbe = false) => {
  const dir = mkdtempSync(join(tmpdir(), 'proposer-'));
  const out = join(dir, 'samples.jsonl');
  const probe = withProbe ? join(dir, 'probe') : null;
  execFileSync(
    process.execPath,
    ['bot/learn/export.js', `--out=${out}`, ...(probe ? [`--probe-dir=${probe}`] : []), ...args],
    { cwd: process.cwd(), stdio: 'pipe' },
  );
  return {
    rows: readFileSync(out, 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line)),
    probe,
  };
};

const readProbes = probe => {
  const entries = readdirSync(probe).map(name =>
    JSON.parse(readFileSync(join(probe, name), 'utf8')),
  );
  return new Map(entries.map(entry => [`${entry.seed}-${entry.step}`, entry]));
};

describe('предлагатель дневника — тот же, что у живого хода', () => {
  it('варианты перечисляет предлагатель рантайма: у ученика и у поиска — `trade`, не жадный', () => {
    // `greedy` веса расставляет сама, `trade` — тоже (она жадный плюс оценка размена), а вот партии
    // ученика и поиска перечисляются предлагателем рантайма: иначе признаки в дневнике чужие
    expect(proposalPolicy('greedy')).toBe('greedy');
    expect(proposalPolicy('trade')).toBe('trade');
    expect(proposalPolicy('qvalue')).toBe(PROPOSER_POLICY);
    expect(proposalPolicy('search')).toBe(PROPOSER_POLICY);
    expect(proposalPolicy('chain')).toBe(PROPOSER_POLICY);
    // сам предлагатель и рантайм — одно значение: это и есть предмет теста
    expect(PROPOSER_POLICY).toBe(RUNTIME_PROPOSER);
  });

  it('по заголовку видно, каким предлагателем собран дневник', () => {
    const { rows } = runExport(['--games=1', '--policy=qvalue']);
    const [header] = rows;

    expect(header.policy).toBe('qvalue');
    expect(header.proposer).toBe(PROPOSER_POLICY);
  }, 30000);

  it('числа признаков в дневнике совпадают с теми, что видит рантайм на том же состоянии', () => {
    const { rows, probe } = runExport(['--games=1', '--policy=qvalue'], true);
    const samples = rows.slice(1);
    const probes = readProbes(probe);

    expect(probes.size).toBe(samples.length);

    let comparable = 0;
    let worst = 0;
    let mismatched = null;

    for (const sample of samples) {
      const entry = probes.get(`${sample.game}-${sample.step}`);
      expect(entry).toBeTruthy();
      expect(entry.proposer).toBe(PROPOSER_POLICY);

      // живой ход: перечислили предлагателем — и посчитали признаки по его весам
      const offered = actionsFor(entry.state, entry.playerId, { policy: PROPOSER_POLICY });
      const priorScale = Math.max(...offered.map(item => Number(item.weight) || 0), 1);

      for (const option of offered) {
        const key = JSON.stringify(option.action);
        const inDiary = sample.actions.find(action => action.key === key);
        expect(inDiary).toBeTruthy();

        const runtime = actionFeatures(entry.state, entry.playerId, option, { priorScale });
        comparable += 1;
        for (let index = 0; index < runtime.length; index += 1) {
          const gap = Math.abs(inDiary.features[index] - runtime[index]);
          if (gap > worst) {
            worst = gap;
            mismatched = {
              sample,
              key,
              index,
              runtime: runtime[index],
              diary: inDiary.features[index],
            };
          }
        }
      }
    }

    expect(comparable).toBeGreaterThan(20);
    // расхождение предлагателя даёт разницу десятых в признаке 19 — здесь её быть не должно
    expect(worst, JSON.stringify(mismatched)).toBeLessThan(1e-6);
  }, 30000);

  it('состояние в пробе не тронуто ходом: признаки считаются ровно до действия', () => {
    const { rows, probe } = runExport(['--games=1', '--policy=qvalue'], true);
    const samples = rows.slice(1);
    const probes = readProbes(probe);

    // если бы проба попала в состояние **после** действия, признаки не сошлись бы с дневником —
    // отдельная проверка нужна потому, что молчаливое «сошлось на первом же варианте» ничего не значит
    for (const sample of samples.slice(0, 10)) {
      const entry = probes.get(`${sample.game}-${sample.step}`);
      const chosen = sample.actions[sample.chosen];
      const offered = actionsFor(entry.state, entry.playerId, { policy: PROPOSER_POLICY });
      expect(offered.some(item => JSON.stringify(item.action) === chosen.key)).toBe(true);
    }
  }, 30000);
});
