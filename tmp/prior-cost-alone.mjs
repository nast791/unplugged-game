// Сколько стоит само мнение модели: один детерминированный мир, по одному применению варианта на него.
import { actionsFor, playDuel } from '../bot/play/duel.js';
import { rootAdvantages, searchBudget, myTurnOf } from '../bot/play/search.js';

const positions = [];
for (const seed of [11, 12, 13, 21, 22, 31]) {
  playDuel({
    seed,
    heroA: 'ifrit',
    heroB: 'dorothy',
    policy: 'search',
    maxSteps: 24,
    onStep: ({ state, playerId }) => {
      if (positions.length < 12 && myTurnOf(state, playerId)) {
        positions.push({ state: structuredClone(state), playerId: String(playerId) });
      }
    },
  });
}

const budget = { ...searchBudget(), priorMix: 0.8 };
const times = [];
const sizes = [];
for (const { state, playerId } of positions) {
  const entries = actionsFor(state, playerId, { policy: 'greedy' }).map(entry => ({
    action: entry.action,
    weight: entry.weight,
  }));
  if (entries.length < 2) continue;
  const started = Date.now();
  rootAdvantages(state, playerId, entries, budget);
  times.push(Date.now() - started);
  sizes.push(entries.length);
}

const avg = list => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0);
console.log(`решений: ${times.length}, вариантов в среднем ${avg(sizes).toFixed(1)}`);
console.log(`мнение модели: среднее ${avg(times).toFixed(1)} мс, максимум ${Math.max(...times)} мс`);
