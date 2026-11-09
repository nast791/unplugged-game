/** Разведка ресурса Снежной королевы: сколько осколков в сбросе к началу её хода и куда доходит. */
import { playDuel } from '../bot/play/duel.js';
import { cardHasTag } from '#shared/helpers/cards.js';

const shardCount = player =>
  (player?.discard?.cards ?? []).filter(card => cardHasTag(card, 'shard')).length;

const opponents = process.argv[2] ? process.argv[2].split(',') : ['tesla', 'dorothy', 'medusa'];
const seeds = process.argv[3] ? process.argv[3].split(',').map(Number) : [1, 2, 3];
const rows = [];

for (const opponent of opponents) {
  for (const seed of seeds) {
    let lastIndex = null;
    const turnStarts = [];
    let peak = 0;
    const report = playDuel({
      seed,
      heroA: 'snow-queen',
      heroB: opponent,
      policy: 'search',
      onStep: ({ state }) => {
        const queen = state.players.find(player => String(player.id) === 'snow-queen');
        const shards = shardCount(queen);
        peak = Math.max(peak, shards);
        if (lastIndex !== state.turn?.index) {
          lastIndex = state.turn?.index;
          if (String(state.turn?.playerId) === 'snow-queen') turnStarts.push(shards);
        }
      },
    });
    rows.push({
      opponent,
      seed,
      status: report.status,
      winner: report.state?.winner == null ? null : String(report.state.winner),
      heroHp: report.state?.players?.find(player => String(player.id) === 'snow-queen')?.hp,
      peak,
      turns: turnStarts.length,
      hers: turnStarts,
    });
  }
}

const threshold = n => rows.reduce((sum, row) => sum + row.hers.filter(value => value >= n).length, 0);
const turns = rows.reduce((sum, row) => sum + row.turns, 0);
console.log(`партий ${rows.length}, её ходов ${turns}`);
for (const n of [1, 4, 5, 6, 7]) console.log(`порог ${n}: ${threshold(n)} ходов (${Math.round((100 * threshold(n)) / turns)}%)`);
for (const row of rows) {
  console.log(
    `${row.opponent} сид ${row.seed}: ${row.status}, победил ${row.winner}, hp ${row.heroHp}, пик осколков ${row.peak}, ходов ${row.turns} [${row.hers.join(' ')}]`,
  );
}
