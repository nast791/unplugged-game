import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SELECTION_TEMPERATURE, scoreAction } from '../../../bot/play/qvalue.js';
import weights from '../../../bot/play/qvalue-weights.js';

/**
 * Контракт данных тренера (`bot/learn/export.js` → `trainer/`): заголовок с именами признаков и строки
 * «одна точка решения». Проверяем не «файл создался», а смысл: у строки есть состояние, варианты хода с
 * признаками, индекс выбранного и исход партии, а у поисковой политики — ещё и доли доигрываний, по
 * которым учится политика (`visits`).
 */
const runExport = args => {
  const dir = mkdtempSync(join(tmpdir(), 'export-'));
  const out = join(dir, 'samples.jsonl');
  execFileSync(process.execPath, ['bot/learn/export.js', `--out=${out}`, ...args], {
    cwd: process.cwd(),
    stdio: 'pipe',
  });
  return readFileSync(out, 'utf8')
    .trim()
    .split('\n')
    .map(line => JSON.parse(line));
};

describe('контракт тренера: экспорт точек решения', () => {
  it('заголовок несёт имена признаков, строки — состояние, варианты и исход', () => {
    const rows = runExport(['--games=2', '--policy=greedy']);
    const [header, ...samples] = rows;

    expect(header.header).toBe(true);
    expect(header.baseFeatures).toContain('heroHp');
    expect(header.summaryFeatures).toContain('resourceOn');
    expect(header.actionFeatureDim).toBeGreaterThan(0);

    expect(samples.length).toBeGreaterThan(50);
    for (const sample of samples) {
      expect(sample.v).toBe(1);
      // состояние — весь вектор признаков: базовые плюс индикаторы и взаимодействия с героем
      expect(sample.state.length).toBeGreaterThanOrEqual(header.baseFeatures.length);
      expect(sample.state.every(value => Number.isFinite(value))).toBe(true);
      expect(['anubis', 'dorothy', 'ifrit', 'medusa', 'snow-queen', 'tesla']).toContain(
        sample.player,
      );
      expect(sample.rival).not.toBe(sample.player);
      expect(sample.chosen).toBeGreaterThanOrEqual(0);
      expect(sample.chosen).toBeLessThan(sample.actions.length);
      expect(sample.actions.length).toBeGreaterThan(0);
      // исход партии: экспорт играет партии до конца, поэтому подпись есть
      expect([sample.player, sample.rival]).toContain(sample.winner);

      for (const action of sample.actions) {
        expect(action.features).toHaveLength(header.actionFeatureDim);
        expect(Number.isFinite(action.prior)).toBe(true);
        expect(action.visits).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('у поисковой политики есть доли доигрываний — по ним учится политика', () => {
    const rows = runExport(['--games=1', '--policy=search']);
    const samples = rows.slice(1);
    const withVisits = samples.filter(
      sample => sample.actions.reduce((sum, action) => sum + action.visits, 0) > 0,
    );

    expect(withVisits.length).toBeGreaterThan(0);
    const sample = withVisits[0];
    // поиск выбирает по средней оценке с приором, а не по числу доигрываний: у выбранного варианта
    // доигрывания есть, но «больше всех» он быть не обязан (это ловил старый тест — и падал зря)
    const visits = sample.actions.map(action => action.visits);
    expect(visits[sample.chosen]).toBeGreaterThan(0);
    expect(Math.max(...visits)).toBeGreaterThanOrEqual(visits[sample.chosen]);
  }, 30000); // файлы идут параллельно и пяти секунд по умолчанию не хватает // тест запускает отдельный процесс, который играет партию поиском: это секунды, а в общем прогоне

  it('дневник поиска с приором от ученика: доли доигрываний есть, версия модели отпечатана', () => {
    const rows = runExport(['--games=1', '--policy=qprior']);
    const [header, ...samples] = rows;

    // партии играет поиск, но подсказку о вариантах даёт модель: по заголовку видно, какая версия
    // (вид артефакта бывает разный — линейный `linear-q` или сеть `mlp-q`, §28 — отпечаток обязан быть)
    expect(header.policy).toBe('qprior');
    expect(header.model?.kind).toBeTruthy();

    const withVisits = samples.filter(
      sample => sample.actions.reduce((sum, action) => sum + action.visits, 0) > 0,
    );
    expect(withVisits.length).toBeGreaterThan(0);
    // доли доигрываний — из самой партии: у выбранного варианта визиты есть
    expect(withVisits[0].actions[withVisits[0].chosen].visits).toBeGreaterThan(0);
  }, 30000);

  it('жадная политика доигрываний не даёт: цель политики тогда — веса политики', () => {
    const rows = runExport(['--games=1', '--policy=greedy']);
    const samples = rows.slice(1);
    expect(samples.every(sample => sample.actions.every(action => action.visits === 0))).toBe(true);
    expect(samples.some(sample => sample.actions.some(action => action.prior > 0))).toBe(true);
    // дневник писала политика, а не модель: отпечатка модели в заголовке быть не должно
    expect(rows[0].model).toBe(null);
  });

  it('дневник ученика: партии играет qvalue, и признаки в нём — те, по которым шла игра', () => {
    const rows = runExport(['--games=3', '--policy=qvalue']);
    const [header, ...samples] = rows;

    // по заголовку видно, какая версия модели написала дневник: сравнивать потом нужно именно с ней
    expect(header.policy).toBe('qvalue');
    expect(header.model?.kind).toBeTruthy();
    expect(Number(header.model?.meta?.games)).toBeGreaterThan(0);

    expect(samples.length).toBeGreaterThan(50);
    // поиска в самоигре нет: цель политики — веса предлагателя, а не доли доигрываний
    expect(samples.every(sample => sample.actions.every(action => action.visits === 0))).toBe(true);

    // Признаки варианта должны быть теми же, что читает рантайм, а `chosen` — выбором ученика, а не
    // первым вариантом списка. Проверяем это не глазами: пересчитываем оценку модели (`scoreAction`)
    // по числам из дневника и её softmax с температурой выбора — доля решений, где выбран лучший
    // вариант, обязана совпасть с предсказанной. Уехали другие признаки или сломался `chosen` —
    // расхождение видно сразу.
    let decisions = 0;
    let best = 0;
    let expected = 0;

    for (const sample of samples) {
      const offered = sample.actions
        .map((action, index) => ({ action, index }))
        .filter(entry => entry.action.prior > 0);
      expect(offered.some(entry => entry.index === sample.chosen)).toBe(true);
      if (offered.length < 2) continue;

      const scored = offered
        .map(entry => ({
          index: entry.index,
          score: scoreAction(weights, {
            stateFeatures: sample.state,
            action: entry.action.features,
            hero: sample.player,
            rival: sample.rival,
            card: entry.action.card,
          }),
        }))
        .sort((left, right) => right.score - left.score);
      const exp = scored.map(entry =>
        Math.exp((entry.score - scored[0].score) / SELECTION_TEMPERATURE),
      );
      const total = exp.reduce((sum, value) => sum + value, 0);

      decisions += 1;
      expected += exp[0] / total;
      if (scored[0].index === sample.chosen) best += 1;
    }

    expect(decisions).toBeGreaterThan(50);
    expect(Math.abs(best / decisions - expected / decisions)).toBeLessThan(0.12);
  });
});
