for (const hero of ['medusa','tesla','anubis','dorothy','ifrit']) {
  const pack = (await import(`../server/content/heroes/${hero}/index.js`)).default;
  const parts = [];
  for (const h of pack.heroes) parts.push(`H:${h.id} hp${h.hp} mv${h.move} rng${h.attackRange}`);
  for (const a of pack.assistants ?? []) parts.push(`A:${a.id} x${a.count} hp${a.hp} mv${a.move} rng${a.attackRange}`);
  console.log(hero.padEnd(10), parts.join(' | '), '| skill:', String(pack.skill?.text ?? '').slice(0, 90));
}
