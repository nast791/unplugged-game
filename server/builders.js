import { rules } from '#shared/constants/rules.js';
import { stacks } from '#shared/constants/deck.js';
import { shuffle } from './utils.js';

export const buildConnections = nodes =>
  (nodes ?? []).reduce(
    (acc, node) => {
      for (const raw of node.neighbors ?? []) {
        const a = String(node.id);
        const b = String(raw);
        const key = a < b ? `${a}:${b}` : `${b}:${a}`;
        if (acc.seen.has(key)) continue;
        acc.seen.add(key);
        acc.list.push({ from: node.id, to: raw });
      }
      return acc;
    },
    { seen: new Set(), list: [] },
  ).list;

export const buildDeck = (cards = []) =>
  cards.flatMap(card =>
    Array.from({ length: card.quantity || 1 }, (_, i) => ({
      ...card,
      image: card.image ?? null,
      effects: structuredClone(card.effects ?? []),
      instanceId: `${card.id}_${i + 1}`,
    })),
  );

const buildFighter = (fighter, index = 0) => {
  const { count, hp, ...rest } = fighter;
  const copies = count ?? 1;
  const id = copies > 1 ? `${fighter.id}_${index + 1}` : fighter.id;

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
    startPosition: null,
    currentPosition: null,
    active: false,
    canPassThroughEnemies: rules.canPassThroughEnemies,
  };
};

export const buildFighters = (pack, mapState, seatIndex) => {
  void mapState;
  void seatIndex;
  const heroList = pack.heroes ?? [];
  const heroUnits = heroList.map(hero => buildFighter(hero, 0));
  const assistants = (pack.assistants ?? []).flatMap(assistant => {
    const count = assistant.count || 1;
    return Array.from({ length: count }, (_, index) => buildFighter(assistant, index));
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
    placementReady: false,
    numberedHeroCommitted: false,
    fighters: buildFighters(pack, mapState, seatIndex),
    // Предметы, как помощники: на каждую копию свой объект со своим id и общей группой.
    // state — состояние копии (у катушек 'inactive' | 'active'), его задаёт сам пак.
    items: (pack.items ?? []).flatMap(item => {
      const copies = item.count ?? item.copies ?? 1;
      return Array.from({ length: copies }, (_, index) => ({
        ...item,
        id: copies > 1 ? `${item.id}_${index + 1}` : item.id,
        group: item.id,
        copies,
        state: item.state ?? 'inactive',
      }));
    }),
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

/**
 * Порядок хода для командного режима: A, B, A, B — без двух игроков одной команды подряд.
 * players — слоты игроков (human/ai); heroId — выбранный герой контента (medusa, …).
 */
export const sortPlayersByTeam = players => {
  const sorted = [...players].sort((left, right) => left.order - right.order);
  const byTeam = new Map();
  for (const player of sorted) {
    const list = byTeam.get(player.team) ?? [];
    list.push({ ...player });
    byTeam.set(player.team, list);
  }

  const teamQueues = [...byTeam.entries()]
    .sort(([, left], [, right]) => left[0].order - right[0].order)
    .map(([, list]) => list);

  const interleaved = [];
  while (interleaved.length < sorted.length) {
    for (const queue of teamQueues) {
      if (queue.length) interleaved.push(queue.shift());
    }
  }

  return interleaved.map((player, index) => ({ ...player, order: index + 1 }));
};

/** Боец для страницы героя: числа, которые игрок видит на карточке, без служебных полей пака. */
const summaryFighter = (fighter, type) => ({
  id: fighter.id,
  name: fighter.name ?? fighter.id,
  type,
  hp: Number(fighter.hp) || 0,
  move: Number(fighter.move) || 0,
  attackRange: Number(fighter.attackRange) || 1,
  count: type === 'assistant' ? Number(fighter.count) || 1 : 1,
});

/**
 * Карточка героя для страницы `/heroes/{id}`: только то, что видит игрок — числа, умение, помощники,
 * предметы и **тексты** карт. Правила карт (`rules`) наружу не отдаём: движок и контент и так уезжают
 * в браузер целиком, но странице они не нужны, а путаницы добавляют.
 */
export const buildHeroSummary = pack => {
  if (!pack) return null;
  const cards = (pack.cards ?? []).map(card => ({
    id: card.id,
    name: card.name ?? card.id,
    type: card.type ?? 'attack',
    value: Number(card.value) || 0,
    bonus: Number(card.bonus) || 0,
    text: card.text ?? '',
    quantity: Number(card.quantity) || 1,
    fighter: card.fighter ?? null,
  }));

  return {
    id: pack.id,
    name: pack.name ?? pack.id,
    color: pack.color ?? null,
    // Портрет появится вместе с артом (`public/art/heroes/{id}/portrait.webp`, docs/ui-plan.md §10);
    // пока его нет, страница и модалка показывают аватар-заглушку в цвете героя.
    portrait: null,
    terrainAffinity: pack.terrainAffinity ?? [],
    skill: pack.skill ? { title: pack.skill.title ?? 'Умение', text: pack.skill.text ?? '' } : null,
    fighters: [
      ...(pack.heroes ?? []).map(fighter => summaryFighter(fighter, 'hero')),
      ...(pack.assistants ?? []).map(fighter => summaryFighter(fighter, 'assistant')),
    ],
    items: (pack.items ?? []).map(item => ({
      id: item.id,
      name: item.name ?? item.id,
      count: Number(item.count) || 1,
      icon: item.icon ?? null,
      color: item.color ?? null,
      states: item.states ?? null,
      condition: item.condition ?? '',
    })),
    cards,
    deckSize: cards.reduce((sum, card) => sum + card.quantity, 0),
  };
};
