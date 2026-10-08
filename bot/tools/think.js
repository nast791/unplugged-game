#!/usr/bin/env node
/**
 * Ручная проба хода с бюджетом времени: `node bot/tools/think.js --time=1000 --samples=5`.
 *
 * Сам выбор хода — в `bot/play/ai.js` (этот же код зовёт клиент в режиме `vs_ai`); здесь только прогон
 * партии `bot/play/duel.js` и печать того, что успел поиск. Серверный реестр тянет только CLI, поэтому
 * файл в клиент не попадает.
 */
import { runAction } from '#shared/publicApi.js';
import { think } from '../play/ai.js';
import { actorOf, actionsFor, createDuel, pickWeighted } from '../play/duel.js';
import { heroIds } from '../play/pool.js';

const numberArg = (name, fallback) => {
  const found = process.argv.find(value => value.startsWith(`--${name}=`));
  const value = found == null ? Number.NaN : Number(found.slice(name.length + 3));
  return Number.isFinite(value) ? value : fallback;
};

const stringArg = (name, fallback) => {
  const found = process.argv.find(value => value.startsWith(`--${name}=`));
  return found == null ? fallback : found.slice(name.length + 3);
};

const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('bot/tools/think.js');

if (isMain) {
  const timeMs = numberArg('time', 1000);
  const seed = numberArg('seed', 4);
  const samples = Math.max(1, numberArg('samples', 5));
  const heroA = stringArg('heroA', heroIds[0]);
  const heroB = stringArg('heroB', heroIds[1]);
  // `--turn=1` (по умолчанию) — думать свой ход целиком (лист на границе хода и после ответа соперника);
  // `--turn=0` — лист по глубине. Замер §29: при равном бюджете времени ход целиком **слабее**
  // (47% против 53% на 1200 партиях), но решением владельца он остаётся поведением по умолчанию.
  const turn = numberArg('turn', 1) !== 0;

  let state = createDuel(seed, `think_${seed}`, { heroA, heroB });
  const rng = { value: seed };
  const rows = [];

  for (let step = 0; step < 300 && rows.length < samples; step += 1) {
    const actor = actorOf(state);
    if (actor == null) break;
    if (step % 7 === 0) rows.push({ step, actor, ...think(state, actor, { timeMs, turn }) });

    const options = actionsFor(state, actor, { policy: 'greedy' });
    if (options.length === 0) break;
    state = runAction(state, { ...pickWeighted(rng, options), playerId: actor });
  }

  console.log(
    `бюджет ${timeMs} мс на ход, ${heroA} против ${heroB}, сид ${seed}, ` +
      `${turn ? 'думаю свой ход целиком' : 'лист по глубине'}`,
  );
  for (const row of rows) {
    console.log(
      `  шаг ${row.step}, ${row.actor}, фаза ${row.phase ?? '—'}: ` +
        `${row.iterations} доигрываний за ${row.elapsedMs} мс ` +
        `(срезано временем ${row.timedOut}) → ${JSON.stringify(row.action)}`,
    );
  }
}
