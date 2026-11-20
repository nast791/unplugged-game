import {
  deckCardIds,
  deckCards,
  deckSize,
  heroAssistants,
  heroIds as poolHeroIds,
  heroItems,
  heroName,
} from './pool.js';
import { percent, summarizeMetrics } from './metrics.js';

/**
 * Профиль героя для отчёта: что в партиях реально работает, а что нет. Только числа из серии и
 * статика пака — без порогов «хорошо/плохо»: ориентиры живут в `.docs/hero-balance.md`.
 */

/** Подписи типов карт — те же слова, что в распределении действий метрик. */
const typeNames = {
  attack: 'атака',
  defense: 'защита',
  effect: 'эффект',
  hybrid: 'гибрид',
};

const stateNames = { active: 'активен', inactive: 'неактивен' };

/** Все действия в правилах карты, включая вложенные ветки `then`. */
const actionsOfCard = card => {
  const found = new Set();
  const walk = node => {
    if (node == null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const entry of node) walk(entry);
      return;
    }
    if (typeof node.action === 'string') found.add(node.action);
    for (const value of Object.values(node)) {
      if (value !== node.action) walk(value);
    }
  };
  walk(card.rules);
  return found;
};

/** Состав колоды из пака: статика, без партии. Количество — копии, уникальность — разные id. */
export const deckProfile = heroId => {
  const cards = deckCards(heroId);
  const types = {};
  let terrain = 0;
  let movement = 0;

  for (const card of cards) {
    const type = card.type ?? 'other';
    types[type] = (types[type] ?? 0) + (Number(card.quantity) || 1);
    const actions = actionsOfCard(card);
    if (actions.has('SET_CELL_TERRAIN')) terrain += 1;
    if (actions.has('SET_MOVEMENT')) movement += 1;
  }

  const assistants = heroAssistants(heroId);
  const count = assistants.reduce((sum, entry) => sum + (Number(entry.count) || 1), 0);
  const hp = assistants.reduce(
    (sum, entry) => sum + (Number(entry.count) || 1) * (Number(entry.hp) || 0),
    0,
  );

  return {
    cards: deckSize(heroId),
    unique: deckCardIds(heroId).length,
    types,
    assistants: { count, hp },
    terrain,
    movement,
  };
};

/** Винрейт героя по каждому сопернику: лучшие и худшие берутся с краёв сортировки. */
const matchupsOf = (reports, heroId) => {
  const table = new Map();

  for (const report of reports) {
    if (report.status !== 'finished') continue;
    const players = (report.state?.players ?? []).map(player => String(player.id));
    if (!players.includes(heroId)) continue;
    const opponent = players.find(other => other !== heroId);
    if (opponent == null) continue;
    const row = table.get(opponent) ?? { games: 0, wins: 0 };
    row.games += 1;
    if (String(report.state.winner) === heroId) row.wins += 1;
    table.set(opponent, row);
  }

  const opponents = [...table.entries()]
    .map(([opponentId, row]) => ({
      heroId: opponentId,
      name: heroName(opponentId),
      games: row.games,
      wins: row.wins,
      rate: percent(row.wins, row.games),
    }))
    .sort((left, right) => right.rate - left.rate || right.games - left.games);
  const size = Math.min(3, Math.max(1, Math.floor(opponents.length / 2)));

  return {
    opponents,
    best: opponents.slice(0, size),
    worst: opponents.slice(-size).reverse(),
  };
};

/** Один герой: партии, карты и их свойства, умение, предметы, колода и матчапы. */
const heroProfile = (heroId, summary, reports, cardTypes) => {
  const row = summary.heroes[heroId] ?? null;
  const games = row?.games ?? 0;
  const skill = row?.skills ?? { opens: 0, picks: 0, fires: 0, applied: 0 };
  const cards = row?.cards ?? {};
  const byType = {};
  const silent = [];
  let plays = 0;
  let effectPlays = 0;
  let effectFires = 0;
  let effectValue = 0;

  for (const [cardId, card] of Object.entries(cards)) {
    const type = card.type ?? cardTypes.get(cardId) ?? 'other';
    plays += card.plays;
    byType[type] = (byType[type] ?? 0) + card.plays;
    if (type !== 'effect') continue;
    effectPlays += card.plays;
    effectFires += card.fires;
    effectValue += card.value;
    if (card.plays > 0 && card.empty === card.plays) {
      silent.push({ id: cardId, plays: card.plays, empty: card.empty });
    }
  }
  silent.sort((left, right) => right.plays - left.plays);

  const items = heroItems(heroId).map(item => {
    const recorded = row?.items?.[item.id] ?? null;
    return {
      key: String(item.id),
      name: item.name ?? String(item.id),
      games,
      activeGames: recorded?.activeGames ?? 0,
      changes: recorded?.changes ?? 0,
      states: [...(recorded?.states ?? [])].sort(),
    };
  });

  return {
    heroId,
    name: heroName(heroId),
    games,
    wins: row?.wins ?? 0,
    winrate: percent(row?.wins ?? 0, games),
    avgSteps: games > 0 ? Math.round((row?.steps ?? 0) / games) : 0,
    cards: {
      plays,
      byType,
      effects:
        effectPlays > 0
          ? {
              plays: effectPlays,
              fires: Math.round((effectFires / effectPlays) * 10) / 10,
              value: Math.round((effectValue / effectPlays) * 10) / 10,
            }
          : null,
      silent,
    },
    skill: {
      games,
      opens: skill.opens,
      picks: skill.picks,
      fires: skill.fires,
      applied: skill.applied,
      appliedShare: percent(skill.applied, games),
    },
    items,
    silentItems: items
      .filter(item => item.activeGames === 0)
      .map(item => ({ key: item.key, name: item.name })),
    deck: deckProfile(heroId),
    matchups: matchupsOf(reports, heroId),
  };
};

/** Герои серии в порядке реестра: сначала известные контенту, затем незнакомые. */
const heroList = summary => {
  const seen = Object.keys(summary.heroes);
  const known = poolHeroIds.filter(heroId => seen.includes(heroId));
  return [...known, ...seen.filter(heroId => !known.includes(heroId)).sort()];
};

/** Профили по серии: `heroes` ограничивает список (например, разрез отчёта по героям). */
export const heroProfiles = (reports, heroes = null) => {
  const summary = summarizeMetrics(reports);
  const cardTypes = new Map(
    Object.entries(summary.cards).map(([cardId, card]) => [cardId, card.type]),
  );
  return (heroes ?? heroList(summary)).map(heroId =>
    heroProfile(heroId, summary, reports, cardTypes),
  );
};

/** Блок профиля героя: строка на героя и по строке на раздел. */
export const profileLines = profiles => {
  const lines = ['\n### Профиль героев'];
  for (const profile of profiles) lines.push(...profileBlock(profile));
  return lines;
};

const profileBlock = profile => {
  const { deck, cards, skill, items, matchups } = profile;
  const lines = [
    `${profile.name}: партий ${profile.games}, побед ${profile.winrate}%, ` +
      `средняя длина ${profile.avgSteps}`,
  ];

  const deckTypes = Object.entries(deck.types)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1])
    .map(([type, count]) => `${typeNames[type] ?? type} ${count}`);
  const deckParts = [`${deck.cards} карт (уникальных ${deck.unique})`];
  if (deckTypes.length > 0) deckParts.push(deckTypes.join(', '));
  if (deck.assistants.count > 0) {
    deckParts.push(`помощники ${deck.assistants.count} (${deck.assistants.hp} hp)`);
  }
  deckParts.push(`карт с перемещением ${deck.movement}, с землёй ${deck.terrain}`);
  lines.push(`  колода: ${deckParts.join('; ')}`);

  if (cards.plays > 0) {
    const byType = Object.entries(cards.byType)
      .filter(([, count]) => count > 0)
      .sort((left, right) => right[1] - left[1])
      .map(([type, count]) => `${typeNames[type] ?? type} ${count}`);
    lines.push(`  карты: ${cards.plays} розыгрышей (${byType.join(', ')})`);
  }

  if (cards.effects != null) {
    const { plays, fires, value } = cards.effects;
    lines.push(`  эффекты: ${plays} розыгрышей, срабатываний в среднем ${fires}, пользы ${value}`);
  }

  if (cards.silent.length > 0) {
    lines.push(
      `  свойство ни разу не сработало: ${cards.silent
        .map(card => `${card.id} (${card.plays} розыгрышей, ${card.empty} срабатываний)`)
        .join(', ')}`,
    );
  }

  if (skill.games > 0) {
    lines.push(
      `  умение: окон ${skill.opens}, с выбором ${skill.picks}, само ${skill.fires}, ` +
        `применено в ${skill.applied} из ${skill.games} партий (${skill.appliedShare}%)`,
    );
  }

  const itemParts = items.map(item => {
    const states =
      item.states.length > 0
        ? ` (${item.states.map(state => stateNames[state] ?? state).join(', ')})`
        : '';
    return `${item.name} — активен в ${item.activeGames} из ${item.games}, смен ${item.changes}${states}`;
  });
  lines.push(`  предметы: ${itemParts.length > 0 ? itemParts.join('; ') : 'нет'}`);

  if (profile.silentItems.length > 0) {
    lines.push(`  ни разу не включались: ${profile.silentItems.map(item => item.name).join(', ')}`);
  }

  const best = matchups.best.map(entry => `${entry.name} ${entry.rate}% (${entry.games})`);
  const worst = matchups.worst.map(entry => `${entry.name} ${entry.rate}% (${entry.games})`);
  const same =
    best.length === worst.length &&
    matchups.best.every((entry, index) => entry.heroId === matchups.worst[index].heroId);
  if (best.length > 0) {
    lines.push(
      same
        ? `  матчапы: против ${best.join(', ')}`
        : `  матчапы: сильнее — ${best.join(', ')}; слабее — ${worst.join(', ')}`,
    );
  }

  return lines;
};

/** Итог серии короткой строкой: умения, предметы и то, что ни разу не пригодилось. */
export const seriesLines = summary => {
  const { skills, items, silentCards, silentSkills, silentItems, cards } = summary;
  const lines = [
    `  умения и предметы: окон ${skills.opens}, с выбором ${skills.picks}, ` +
      `само ${skills.fires}; предметы активны в ${items.activeGames} партиях, смен ${items.changes}`,
  ];

  if (silentSkills.length > 0) {
    const names = silentSkills.map(heroId => heroName(heroId));
    lines.push(`  умения ни разу не применились: ${names.join(', ')}`);
  }

  if (silentCards.length > 0) {
    lines.push(
      `  свойства ни разу не сработали: ${silentCards
        .map(cardId => `${cardId} (${cards[cardId].plays})`)
        .join(', ')}`,
    );
  }

  if (silentItems.length > 0) {
    lines.push(
      `  предметы ни разу не включились: ${silentItems
        .map(label => {
          const [heroId, group] = label.split(':');
          const item = heroItems(heroId).find(entry => String(entry.id) === group);
          return `${item?.name ?? group} (${heroName(heroId)})`;
        })
        .join(', ')}`,
    );
  }

  if (summary.discardHeavy?.length > 0) {
    lines.push(
      `  чаще сбрасываются, чем играются: ${summary.discardHeavy
        .slice(0, 6)
        .map(card => `${card.cardId} (${card.discarded} сбросов на ${card.plays} розыгрышей)`)
        .join(', ')}`,
    );
  }

  if (summary.neverPlayed?.length > 0) {
    lines.push(
      `  ни разу не сыграны: ${summary.neverPlayed
        .slice(0, 6)
        .map(card => `${card.cardId} (добрано ${card.drawn})`)
        .join(', ')}`,
    );
  }

  if (summary.silentRules?.length > 0) {
    lines.push(
      `  механики ни разу не сработали: ${summary.silentRules
        .slice(0, 8)
        .map(rule => `${rule.cardId}#${rule.index} (${rule.plays} розыгрышей)`)
        .join(', ')}`,
    );
  }

  return lines;
};

/**
 * Карты героев для отчёта: добор, розыгрыши, сброс без розыгрыша и срабатывания каждого правила.
 * Возвращает данные, а таблицу рисует инструмент — у него уже есть свой форматтер markdown.
 */
export const cardStats = (reports, heroes = null) => {
  const summary = summarizeMetrics(reports);
  return (heroes ?? heroList(summary)).map(heroId => {
    const row = summary.heroes[heroId] ?? null;
    const rows = deckCards(heroId).map(card => {
      const cardId = String(card.id);
      const stat = row?.cards?.[cardId] ?? null;
      const type = stat?.type ?? card.type ?? 'other';
      const plays = stat?.plays ?? 0;
      return {
        cardId,
        title: card.title ?? cardId,
        type,
        drawn: stat?.drawn ?? 0,
        plays,
        discarded: stat?.discarded ?? 0,
        rules: (stat?.rules ?? []).flatMap((rule, index) =>
          rule == null ? [] : [{ index, plays: rule.plays, fires: rule.fires }],
        ),
        value: type === 'effect' && plays > 0 ? Math.round((stat.value / plays) * 10) / 10 : null,
      };
    });
    return { heroId, name: heroName(heroId), rows };
  });
};
