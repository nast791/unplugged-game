const heroModules = import.meta.glob('./heroes/*/index.js', {
  eager: true,
  import: 'default',
});
const cardModules = import.meta.glob('./heroes/*/cards.js', {
  eager: true,
  import: 'default',
});
const mapModules = import.meta.glob('./maps/*.js', {
  eager: true,
  import: 'default',
});

const idFromPath = (path, pattern) => path.match(pattern)?.[1];

export const heroes = Object.fromEntries(
  Object.entries(heroModules).map(([path, hero]) => {
    const heroId = hero.id ?? idFromPath(path, /heroes\/([^/]+)\/index\.js$/);
    const cardsPath = path.replace('/index.js', '/cards.js');
    return [heroId, { ...hero, cards: cardModules[cardsPath] ?? [] }];
  }),
);

export const maps = Object.fromEntries(
  Object.entries(mapModules).map(([path, map]) => {
    const mapId = map.id ?? idFromPath(path, /maps\/([^/]+)\.js$/);
    return [mapId, map];
  }),
);
