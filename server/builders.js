import { rules } from '#shared/constants/rules.js';
import { stacks } from '#shared/constants/deck.js';
import { shuffle } from './utils.js';

export const buildConnections = nodes =>
  (nodes ?? []).reduce((acc, node) => {
    for (const raw of node.neighbors ?? []) {
      const a = String(node.id);
      const b = String(raw);
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (acc.seen.has(key)) continue;
      acc.seen.add(key);
      acc.list.push({ from: node.id, to: raw });
    }
    return acc;
  }, { seen: new Set(), list: [] }).list;

export const buildDeck = (cards = []) =>
  cards.flatMap(card =>
    Array.from({ length: card.quantity || 1 }, (_, i) => ({
      ...card,
      image: card.image ?? null,
      effects: structuredClone(card.effects ?? []),
      instanceId: `${card.id}_${i + 1}`,
    })),
  );

const autoStartCell = (mapState, seatIndex) => {
  const startArea = Number(seatIndex) + 1;
  return (
    (mapState?.nodes ?? []).find(
      n => Number(n.position) === startArea && n.heroStart === true,
    ) ?? null
  );
};

export const buildFighter = (fighter, index = 0, { mapState, seatIndex, heroCount } = {}) => {
  const { count, hp, ...rest } = fighter;
  const copies = count ?? 1;
  const id = copies > 1 ? `${fighter.id}_${index + 1}` : fighter.id;
  const startCell =
    fighter.type === 'hero' && heroCount === 1
      ? autoStartCell(mapState, seatIndex)
      : null;
  const cellId = startCell?.id ?? null;

  return {
    ...rest,
    id,
    group: fighter.type === 'assistant' ? fighter.id : null,
    copies: fighter.type === 'assistant' ? copies : 1,
    image: fighter.image ?? null,
    attackRange: fighter.attackRange ?? 1,
    size: fighter.size ?? 1,
    move: fighter.move ?? 0,
    startHp: hp,
    currentHp: hp,
    startPosition: cellId,
    currentPosition: cellId,
    active: false,
    canPassThroughEnemies: rules.canPassThroughEnemies,
  };
};

export const buildFighters = (pack, mapState, seatIndex) => {
  const heroList = pack.heroes ?? [];
  const ctx = { mapState, seatIndex, heroCount: heroList.length };
  const heroUnits = heroList.map(hero => buildFighter(hero, 0, ctx));
  const assistants = (pack.assistants ?? []).flatMap(assistant => {
    const n = assistant.count || 1;
    return Array.from({ length: n }, (_, i) => buildFighter(assistant, i, ctx));
  });
  return [...heroUnits, ...assistants];
};

export const buildPlayer = (slot, pack, seatIndex, mapState, rng) => {
  const deck = shuffle(buildDeck(pack.cards ?? []), rng);
  const hand = [];
  while (hand.length < rules.openingHand && deck.length) hand.push(deck.pop());

  return {
    id: slot.heroId,
    heroId: slot.heroId,
    order: slot.order,
    control: slot.control,
    name: pack.name,
    team: slot.team,
    color: pack.color ?? null,
    skill: pack.skill ?? null,
    fighters: buildFighters(pack, mapState, seatIndex),
    items: (pack.items ?? []).map((item, i) => ({
      ...item,
      id: item.count > 1 ? `${item.id}_${i + 1}` : item.id,
      copies: item.count ?? item.copies ?? 1,
      state: item.state ?? 'inactive',
    })),
    deck: {
      visibility: structuredClone(stacks.find(s => s.name === 'deck').visibility),
      cards: deck,
    },
    hand: {
      visibility: structuredClone(stacks.find(s => s.name === 'hand').visibility),
      cards: hand,
    },
    discard: {
      visibility: structuredClone(stacks.find(s => s.name === 'discard').visibility),
      cards: [],
    },
  };
};
