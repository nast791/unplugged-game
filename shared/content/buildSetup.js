import arenaMap from './maps/arena.js';
import alphaHero from './heroes/alpha/index.js';
import alphaCards from './heroes/alpha/cards.js';
import betaHero from './heroes/beta/index.js';
import betaCards from './heroes/beta/cards.js';

const HERO_PACKS = {
  alpha: { ...alphaHero, cards: alphaCards },
  beta: { ...betaHero, cards: betaCards },
};

const MAP_PACKS = {
  arena: arenaMap,
};

export const getHeroPack = heroId => {
  const pack = HERO_PACKS[heroId];
  if (!pack) throw new Error(`Неизвестный герой: ${heroId}`);
  return pack;
};

export const getMapPack = mapId => {
  const pack = MAP_PACKS[mapId];
  if (!pack) throw new Error(`Неизвестная карта: ${mapId}`);
  return pack;
};

/** Колода-шаблон → инстансы карт. */
export const expandDeck = (cardDefs = []) =>
  cardDefs.flatMap(card =>
    Array.from({ length: card.quantity || 1 }, (_, i) => {
      const { quantity: _quantity, ...rest } = card;
      return {
        ...rest,
        instanceId: `${card.id}_${i}`,
      };
    }),
  );

const buildFighter = (def, type, index = 0) => {
  const { count: _count, ...rest } = def;
  const id = def.count && def.count > 1 ? `${def.id}_${index + 1}` : def.id;
  return {
    ...rest,
    id,
    type,
    currentHp: def.hp,
    rangeType: def.rangeType ?? def.attackType ?? 'melee',
    active: false,
    bonusMovement: 0,
    canPassThroughEnemies: false,
    position: null,
    startPosition: null,
  };
};

export const buildFighters = heroPack => {
  const heroes = (heroPack.heroes ?? []).map(h => buildFighter(h, 'hero'));
  const assistants = (heroPack.assistants ?? []).flatMap(a =>
    Array.from({ length: a.count || 1 }, (_, i) => buildFighter(a, 'assistant', i)),
  );
  return [...heroes, ...assistants];
};

export const buildMapState = (mapId = 'arena') => {
  const map = getMapPack(mapId);
  return {
    id: map.id,
    name: map.name,
    players: map.players,
    settings: map.settings,
    nodes: map.nodes,
  };
};

/** Клетка heroStart в стартовой зоне игрока (position === seatId+1). */
export const findHeroStartCell = (map, seatId) => {
  const zone = Number(seatId) + 1;
  return (map?.nodes ?? []).find(
    n => Number(n.position) === zone && n.heroStart === true,
  ) ?? null;
};

/** Герои на фиксированные heroStart-клетки; помощники без позиции. */
export const autoPlaceHeroes = (map, seats = []) =>
  seats.map(seat => {
    const cell = findHeroStartCell(map, seat.id);
    if (!cell || !Array.isArray(seat.fighters)) return seat;
    return {
      ...seat,
      fighters: seat.fighters.map(f => {
        if (f.type !== 'hero') return f;
        return {
          ...f,
          position: cell.id,
          startPosition: cell.id,
        };
      }),
    };
  });

/** Слот для usePlayerSetup.add. hand пустой — раздачу делает engine. */
export const buildPlayerSeat = ({ seatId, team, heroId } = {}) => {
  const heroPack = getHeroPack(heroId);
  return {
    id: String(seatId),
    team,
    packId: heroPack.id,
    name: heroPack.name,
    color: heroPack.color,
    skill: heroPack.skill ?? null,
    items: (heroPack.items ?? []).flatMap(item =>
      Array.from({ length: item.count || 1 }, (_, i) => {
        const { count: _count, ...rest } = item;
        return {
          ...rest,
          id: item.count ? `${item.id}_${i + 1}` : item.id,
          group: item.count ? item.id : null,
        };
      }),
    ),
    fighters: buildFighters(heroPack),
    placementReady: false,
    deck: expandDeck(heroPack.cards),
    hand: [],
    discard: [],
  };
};

/** Лобби по умолчанию: arena + alpha vs beta; герои уже на heroStart. */
export const buildDefaultLobbySetup = () => {
  const map = buildMapState('arena');
  const seats = autoPlaceHeroes(map, [
    buildPlayerSeat({ seatId: '0', team: 'A', heroId: 'alpha' }),
    buildPlayerSeat({ seatId: '1', team: 'B', heroId: 'beta' }),
  ]);
  return { map, seats };
};
