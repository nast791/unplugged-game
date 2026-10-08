/**
 * Сводка по нашим колодам: панели, помощники, состав, средние значения и владельцы.
 *
 * Считается прямо по контенту (`server/content/index.js` → `heroes/*`), поэтому сводку можно пересобрать
 * в любой момент. Скрипт ничего не пишет — печатает markdown, который переносится в `docs/hero-balance.md`
 * (раздел «Наши колоды: сводка»). Средние по оригиналу для сравнения — `docs/reference-stats.md`.
 *
 * Значения и усиление считаются **взвешенно по копиям**: карта в трёх копиях весит втрое. Атака — по
 * атакам и гибридам, защита — по защитам и гибридам.
 *
 * Запуск: node tests/support/deck-stats.mjs
 */
import { heroes } from '../../server/content/index.js';

const fix = (value, digits = 2) => (value == null ? '—' : value.toFixed(digits).replace('.', ','));
const share = (part, total) => (total === 0 ? '—' : `${Math.round((part / total) * 100)}%`);
const qty = card => Number(card.quantity ?? 1);
const valueOf = card => (card.value == null ? null : Number(card.value));

/** Средневзвешенное по копиям: карта в трёх копиях весит втрое. */
const weighted = (cards, pick) => {
  let sum = 0;
  let weight = 0;
  for (const card of cards) {
    const value = pick(card);
    if (value == null) continue;
    sum += value * qty(card);
    weight += qty(card);
  }
  return weight === 0 ? null : sum / weight;
};

const avg = list => (list.length === 0 ? null : list.reduce((sum, x) => sum + x, 0) / list.length);

const rows = Object.values(heroes)
  .map(hero => {
    const cards = hero.cards ?? [];
    const copies = cards.reduce((sum, card) => sum + qty(card), 0);
    const panel = hero.heroes?.[0] ?? {};
    const assistants = hero.assistants ?? [];
    const attackers = cards.filter(card => card.type === 'attack' || card.type === 'hybrid');
    const defenders = cards.filter(card => card.type === 'defense' || card.type === 'hybrid');
    const owners = { hero: 0, any: 0, assist: 0 };
    for (const card of cards) {
      const key = card.fighter === 'any' ? 'any' : card.fighter === hero.id ? 'hero' : 'assist';
      owners[key] += qty(card);
    }
    const values = cards.map(valueOf).filter(value => value != null);
    return {
      id: hero.id,
      name: hero.name,
      skill: hero.skill?.title ?? '—',
      panel: `${panel.hp} / ${panel.move} / ${panel.attackRange ?? 1}`,
      assistants: assistants.length
        ? assistants
            .map(
              assistant =>
                `${assistant.count ?? 1} × ${assistant.hp} hp, шаг ${assistant.move}, дальность ${assistant.attackRange ?? 1}`,
            )
            .join('; ')
        : 'нет',
      unique: cards.length,
      copies,
      attack: cards.filter(card => card.type === 'attack').length,
      defense: cards.filter(card => card.type === 'defense').length,
      hybrid: cards.filter(card => card.type === 'hybrid').length,
      effect: cards.filter(card => card.type === 'effect').length,
      avgAtk: weighted(attackers, valueOf),
      maxAtk: values.length === 0 ? null : Math.max(...values),
      avgDef: weighted(defenders, valueOf),
      maxDef: values.length === 0 ? null : Math.max(...values),
      avgBonus: weighted(cards, card => Number(card.bonus ?? 0)),
      maxBonus: Math.max(...cards.map(card => Number(card.bonus ?? 0))),
      marked: cards
        .filter(card => (card.tags ?? []).includes('shard'))
        .reduce((sum, card) => sum + qty(card), 0),
      owners,
    };
  })
  .sort((left, right) => left.id.localeCompare(right.id));

console.log('### Панели, помощники, умение\n');
console.log('| Герой | Здоровье / шаг / дальность | Помощники | Умение |');
console.log('| --- | --- | --- | --- |');
for (const row of rows) {
  console.log(`| ${row.name} (\`${row.id}\`) | ${row.panel} | ${row.assistants} | ${row.skill} |`);
}
console.log('');

console.log('### Состав и средние\n');
console.log(
  '| Герой | Копий / уник. | Атаки / защиты / гибриды / эффекты | Ср. атака (макс) | Ср. защита (макс) | Ср. усиление (макс) | Герой / любой / помощник | Метки осколка |',
);
console.log('| --- | --- | --- | --- | --- | --- | --- | --- |');
for (const row of rows) {
  const owners = `${share(row.owners.hero, row.copies)} / ${share(row.owners.any, row.copies)} / ${share(row.owners.assist, row.copies)}`;
  console.log(
    `| ${row.name} | ${row.copies} / ${row.unique} | ${row.attack} / ${row.defense} / ${row.hybrid} / ${row.effect} | ${fix(row.avgAtk)} (${row.maxAtk}) | ${fix(row.avgDef)} (${row.maxDef}) | ${fix(row.avgBonus)} (${row.maxBonus}) | ${owners} | ${row.marked || '—'} |`,
  );
}
console.log('');

/** Средние по оригиналу — из `docs/hero-balance.md` §1 (снято со сканов, `docs/reference-stats.md`). */
const original = { atk: 2.85, def: 2.56, bonus: 2.08, unique: 12.36, owners: [58, 30, 12] };
const ours = {
  atk: avg(rows.map(row => row.avgAtk)),
  def: avg(rows.map(row => row.avgDef)),
  bonus: avg(rows.map(row => row.avgBonus)),
  unique: avg(rows.map(row => row.unique)),
  owners: ['hero', 'any', 'assist'].map(key =>
    Math.round(
      (rows.reduce((sum, row) => sum + row.owners[key], 0) /
        rows.reduce((sum, row) => sum + row.copies, 0)) *
        100,
    ),
  ),
};

console.log('### Наш пул против оригинала\n');
console.log('| Показатель | Наши колоды | Оригинал (64 колоды) |');
console.log('| --- | --- | --- |');
console.log(`| Средняя атака | ${fix(ours.atk)} | ${fix(original.atk)} |`);
console.log(`| Средняя защита | ${fix(ours.def)} | ${fix(original.def)} |`);
console.log(`| Среднее усиление | ${fix(ours.bonus)} | ${fix(original.bonus)} |`);
console.log(`| Уникальных карт | ${fix(ours.unique, 1)} | ${fix(original.unique)} |`);
console.log(
  `| Владельцы: герой / любой / помощник | ${ours.owners.join(' / ')} | ${original.owners.join(' / ')} |`,
);
console.log('');
console.log(
  'Столбец «Метки осколка» — копии карт с меткой из пака героя (`tags` в `cards.js`, `docs/hero-algorithm.md` §7): ' +
    'у Снежной королевы четыре названия по три копии = 12 — это и есть её ресурс осколков.',
);
