const heroes = ['anubis', 'dorothy', 'ifrit', 'medusa', 'snow-queen', 'tesla'];
const rows = [];
for (const hero of heroes) {
  const pack = (await import(`../server/content/heroes/${hero}/cards.js`)).default;
  const by = { attack: 0, hybrid: 0, defense: 0, effect: 0 };
  let best = 0, sum = 0, combat = 0, copies = 0;
  for (const card of pack) {
    by[card.type] = (by[card.type] ?? 0) + card.quantity;
    copies += card.quantity;
    if (card.type !== 'effect' && card.value != null) { combat += card.quantity; sum += card.value * card.quantity; best = Math.max(best, card.value + (card.bonus ?? 0)); }
  }
  rows.push({ hero, copies, atk: by.attack, hyb: by.hybrid, def: by.defense, eff: by.effect, combat, avgValue: (sum / combat).toFixed(2), best });
}
console.table(rows);
