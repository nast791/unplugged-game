import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/**
 * Замер «политика против политики с разрезом по героям» (`bot/tools/stats.js`). Проверяем не красоту
 * таблицы, а арифметику: у каждого героя сравниваются два его винрейта на **одних и тех же** партиях —
 * под меряемой политикой и под эталоном, поэтому в строке героя обе дроби есть, а разница посчитана.
 */
const run = args =>
  execFileSync(process.execPath, ['bot/tools/stats.js', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

describe('замер политики по героям', () => {
  it('печатает разрез по героям с парными винрейтами и разницей', () => {
    const out = run([
      '--heroes=anubis,dorothy',
      '--games=2',
      '--workers=2',
      '--policy=qvalue',
      '--policy-b=greedy',
    ]);

    expect(out).toContain('держатель qvalue');
    expect(out).toContain('держатель greedy');
    expect(out).toContain('шум разницы');

    // строки героев: «| Анубис | NN% (w/g) | NN% (w/g) | **±X.X** |»
    const rows = out
      .split(/\r?\n/)
      .filter(line => /^\|\s*[^|]+\|\s*\d+% \(\d+\/\d+\)\s*\|/.test(line));
    expect(rows.length).toBeGreaterThanOrEqual(2);

    for (const row of rows) {
      const played = row.split('|').filter(cell => /^\s*\d+% \(\d+\/\d+\)\s*$/.test(cell));
      // обе половины замера — у одного и того же героя и на одном наборе партий
      expect(played.length).toBe(2);
      const [mine, theirs] = played.map(cell => Number(cell.match(/\((\d+)\//)[1]));
      const [mineTotal, theirsTotal] = played.map(cell => Number(cell.match(/\/(\d+)\)/)[1]));
      expect(mineTotal).toBe(theirsTotal);
      expect(mine).toBeLessThanOrEqual(mineTotal);
      expect(theirs).toBeLessThanOrEqual(theirsTotal);
      expect(row).toMatch(/\*\*[+-]\d+\.\d\*\*/);
    }
  }, 120_000);
});
