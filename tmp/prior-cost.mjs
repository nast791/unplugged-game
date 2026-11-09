// Проба: сколько стоит мнение модели о вариантах корня и меняет ли оно решение поиска.
// Меряется на настоящих позициях середины партии: без приора (`priorMix: 0`) и с ним (`0.8`).
import { actionsFor, playDuel } from '../bot/play/duel.js';
import { searchAction, searchBudget, myTurnOf } from '../bot/play/search.js';

const positions = [];
const SEEDS = [11, 12, 13, 21, 22, 31];
for (const seed of SEEDS) {
  playDuel({
    seed,
    heroA: 'ifrit',
    heroB: 'dorothy',
    policy: 'search',
    maxSteps: 24,
    onStep: ({ state, playerId }) => {
      if (positions.length < SEEDS.length * 2 && myTurnOf(state, playerId)) {
        positions.push({ state: structuredClone(state), playerId: String(playerId) });
      }
    },
  });
}

const budgetOf = mix => ({
  ...searchBudget(),
  priorMix: mix,
  iterations: 400,
  depth: 8,
  treeDepth: 3,
  timeMs: 0,
});

let sameNo = 0;
let sameYes = 0;
let changed = 0;
const times = { 0: [], 0.8: [] };
for (const { state, playerId } of positions) {
  const entries = actionsFor(state, playerId, { policy: 'greedy' }).map(entry => ({
    action: entry.action,
    weight: entry.weight,
  }));
  if (entries.length < 2) continue;
  const startedNo = Date.now();
  const without = searchAction(state, playerId, entries, budgetOf(0));
  times[0].push(Date.now() - startedNo);
  const startedYes = Date.now();
  const withPrior = searchAction(state, playerId, entries, budgetOf(0.8));
  times['0.8'].push(Date.now() - startedYes);
  if (without == null || withPrior == null) continue;
  if (JSON.stringify(without.action) === JSON.stringify(withPrior.action)) sameYes += 1;
  else changed += 1;
}

const avg = list => (list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : 0);
console.log(`позиций: ${positions.length}, пар сравнений: ${changed + sameYes}`);
console.log(`решение совпало: ${sameYes}, изменилось при priorMix 0.8: ${changed}`);
console.log(`среднее время решения: без приора ${avg(times[0])} мс, с приором ${avg(times['0.8'])} мс`);
