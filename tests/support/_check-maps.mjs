import { generateMap } from '../../shared/helpers/mapGenerator.js';

const seen = new Set();
for (const players of [2, 3, 4]) {
  for (let seed = 1; seed <= 40; seed += 1) {
    const map = generateMap({ players, seed });
    const nodes = map.cells ?? map.nodes ?? [];
    for (const node of nodes) {
      const list = Array.isArray(node.terrain) ? node.terrain : [node.terrain];
      for (const terrain of list) if (terrain) seen.add(terrain);
    }
  }
}
console.log('РєР»СЋС‡Рё:', Object.keys(generateMap({ players: 2, seed: 7 })).join(', '));
console.log('Р·РµРјР»Рё РЅР° 120 РєР°СЂС‚Р°С…:', [...seen].sort().join(', '));
console.log('РјР°Рє РµСЃС‚СЊ?', seen.has('poppy') ? 'Р”Рђ' : 'РЅРµС‚');

