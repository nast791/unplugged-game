import { modes } from '#shared/constants/modes.js';

const CONTROLS = new Set(['human', 'ai']);

const validateFfaTeams = (heroes, errors) => {
  const teams = new Set();
  for (const [i, raw] of heroes.entries()) {
    const team = raw?.team != null ? String(raw.team).trim() : '';
    if (!team) continue;
    if (teams.has(team)) {
      errors.push(`heroes[${i}]: в FFA у каждого игрока своя команда`);
    }
    teams.add(team);
  }
};

const validateTeams2v2 = (heroes, errors) => {
  const counts = new Map();
  for (const raw of heroes) {
    const team = raw?.team != null ? String(raw.team).trim() : '';
    if (!team) continue;
    counts.set(team, (counts.get(team) ?? 0) + 1);
  }
  const sizes = [...counts.values()];
  if (sizes.length !== 2 || sizes.some(n => n !== 2)) {
    errors.push('teams: нужны две команды по 2 игрока');
  }
};

export const validateCreate = (body, { heroes: HEROES, maps: MAPS }) => {
  const errors = [];
  const mapId = body?.mapId != null ? String(body.mapId).trim() : '';
  const modeName =
    body?.mode == null || body.mode === ''
      ? modes.find(m => m.default)?.name
      : String(body.mode).trim();
  const modeDef = modes.find(m => m.name === modeName);
  const heroes = body?.heroes ?? [];

  if (!mapId) errors.push('mapId обязателен');
  else if (!MAPS[mapId]) {
    errors.push(
      `неизвестная карта "${mapId}" (доступно: ${Object.keys(MAPS).join(', ')})`,
    );
  }

  if (!modeDef) {
    errors.push(
      `неизвестный mode "${modeName}" (доступно: ${modes.map(m => m.name).join(', ')})`,
    );
  }

  if (!Array.isArray(body?.heroes)) {
    errors.push('heroes: нужен массив');
  } else if (modeDef) {
    if (heroes.length < modeDef.minPlayers) {
      errors.push(`heroes: минимум ${modeDef.minPlayers}`);
    }
    if (heroes.length > modeDef.maxPlayers) {
      errors.push(`heroes: максимум ${modeDef.maxPlayers}`);
    }
  }

  const orders = new Set();
  const heroIds = new Set();
  let humans = 0;

  for (const [i, raw] of heroes.entries()) {
    const heroId = raw?.heroId != null ? String(raw.heroId).trim() : '';
    const team = raw?.team != null ? String(raw.team).trim() : '';
    const order = Number(raw?.order);
    const control =
      raw?.control != null ? String(raw.control).trim().toLowerCase() : '';

    if (!heroId) errors.push(`heroes[${i}]: heroId обязателен`);
    else if (!HEROES[heroId]) {
      errors.push(
        `heroes[${i}]: неизвестный герой "${heroId}" (доступно: ${Object.keys(HEROES).join(', ')})`,
      );
    } else if (heroIds.has(heroId)) {
      errors.push(`heroes[${i}]: heroId "${heroId}" уже занят`);
    } else {
      heroIds.add(heroId);
    }
    if (!team) errors.push(`heroes[${i}]: team обязателен`);
    if (!Number.isInteger(order) || order < 1) {
      errors.push(`heroes[${i}]: order — целое число ≥ 1`);
    } else if (orders.has(order)) {
      errors.push(`heroes[${i}]: order ${order} уже занят`);
    } else {
      orders.add(order);
    }
    if (!CONTROLS.has(control)) {
      errors.push(`heroes[${i}]: control — human или ai`);
    } else if (control === 'human') {
      humans += 1;
    }
  }

  if (modeDef && !errors.length) {
    if (humans < modeDef.minHumans) {
      errors.push(`mode ${modeDef.name}: минимум ${modeDef.minHumans} control=human`);
    }
    if (humans > modeDef.maxHumans) {
      errors.push(`mode ${modeDef.name}: максимум ${modeDef.maxHumans} control=human`);
    }
    if (modeDef.name === 'vs_ai' && humans !== 1) {
      errors.push('vs_ai: ровно один control=human, остальные ai');
    }
    if (modeDef.name === 'hotseat' && humans !== heroes.length) {
      errors.push('hotseat: все слоты control=human');
    }
    if (modeDef.format === 'ffa') validateFfaTeams(heroes, errors);
    if (modeDef.format === 'teams_2v2') validateTeams2v2(heroes, errors);
  }

  return errors.length ? { errors } : true;
};
