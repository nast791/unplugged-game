import { modes } from '#shared/constants/modes.js';
import { rules } from '#shared/constants/rules.js';
import { isTerrainId } from '#shared/constants/terrain.js';
import { runLifecycle } from '#shared/publicApi.js';
import generateMap from '#shared/helpers/mapGenerator.js';
import { heroes as HEROES, maps as MAPS } from './content/index.js';
import { buildConnections, buildPlayer, sortPlayersByTeam } from './builders.js';
import { load, save, view } from './party.js';
import { createRng } from './utils.js';
import { validateCreate } from './validations.js';

/** Сколько бойцов у пака героя: сам герой (герои) плюс помощники с учётом их количества. */
export const packFighterCount = pack =>
  (pack?.heroes ?? []).length +
  (pack?.assistants ?? []).reduce((sum, assistant) => sum + (Number(assistant.count) || 1), 0);

/**
 * Сборка партии: домен без HTTP. Здесь создаётся state, сохраняется в памяти процесса (`party.save`)
 * и отдаётся проекция на игрока. HTTP-адаптер — `api/game/create.post.js`; его импортировать нельзя
 * ни тестам, ни боту: он тянет Nitro (`h3`), а движок должен запускаться обычным Node
 * (`pnpm test:bot` — прогон фаззинг-бота, обучение ботов и разбор партий по сиду).
 */
const badRequest = message => {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
};

/**
 * Клетка без стихии или с чужой стихией — ошибка контента, а не повод что-то подставить: такая клетка
 * не входит ни в одну область, и рисовать её нечем. Проверяем здесь, в единственной точке сборки поля,
 * поэтому дальше и правила, и отрисовка работают с заведомо валидными стихиями.
 */
const mapTerrainError = (nodes, mapId) => {
  for (const node of nodes) {
    const raw = node?.terrain;
    const list = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
    if (!list.length) return `карта "${mapId}": у клетки ${node?.id} нет стихии`;
    for (const terrain of list) {
      if (!isTerrainId(terrain)) {
        return `карта "${mapId}": у клетки ${node?.id} неизвестная стихия "${String(terrain)}"`;
      }
    }
  }
  return null;
};

/** Целое из запроса или `null`: пустая строка и мусор значит «как решит движок». */
const optionalInteger = raw => {
  if (raw == null || raw === '') return null;
  const value = Number(raw);
  return Number.isInteger(value) ? value : null;
};

/** testId/testSeed — только для unit-тестов */
export const createGame = (body, { testId, testSeed } = {}) => {
  const valid = validateCreate(body, { heroes: HEROES, maps: MAPS });
  if (valid !== true) throw badRequest(valid.errors.join('; '));

  const modeName =
    body.mode == null || body.mode === ''
      ? modes.find(m => m.default)?.name
      : String(body.mode).trim();
  const modeDef = modes.find(m => m.name === modeName);
  const mapId = String(body.mapId).trim();
  let playerSlots = [...body.heroes]
    .map(raw => ({
      heroId: String(raw.heroId).trim(),
      team: String(raw.team).trim(),
      order: Number(raw.order),
      control: String(raw.control).trim().toLowerCase(),
    }))
    .sort((a, b) => a.order - b.order);

  if (modeDef.format === 'teams_2v2') {
    playerSlots = sortPlayersByTeam(playerSlots);
  }
  // Сид приходит из лобби (одно и то же число — то же поле и та же раздача), иначе выбирается случайно.
  const seed =
    (Number.isInteger(testSeed) ? testSeed : optionalInteger(body.seed)) ??
    Math.floor(Math.random() * 0x100000000);
  // Размер поля: `null` — «Авто», генератор сам выберет по пресету своего числа игроков.
  const cells = optionalInteger(body.cells);
  // Лимит времени на ход, секунды: 0 — без лимита. Правила движка, поэтому лежит в `settings`, а не в UI.
  const turnLimit = optionalInteger(body.turnLimit) ?? 0;
  const rng = createRng(seed);
  // «generated» — поле, собранное генератором по сиду партии: клетки, зоны стихий и стартовые области
  const mapPack =
    mapId === 'generated'
      ? generateMap({
          players: playerSlots.length,
          seed,
          cells,
          id: 'generated',
          fightersPerPlayer: playerSlots.map(slot => packFighterCount(HEROES[slot.heroId])),
        })
      : MAPS[mapId];
  const nodes = mapPack.nodes ?? [];
  const terrainProblem = mapTerrainError(nodes, mapId);
  if (terrainProblem) throw badRequest(terrainProblem);
  const mapState = {
    id: mapPack.id,
    name: mapPack.name,
    nodes,
    connections: buildConnections(nodes),
    settings: { ...(mapPack.settings ?? {}) },
  };

  const players = playerSlots.map((slot, seatIndex) =>
    buildPlayer(slot, HEROES[slot.heroId], seatIndex, mapState, rng),
  );
  const id = testId ?? `game_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  const state = {
    id,
    hook: 'gameStart',
    round: 1,
    winner: null,
    turn: {
      index: 0,
      playerId: null,
      actionsTotal: rules.actionsPerTurn,
      actionsLeft: rules.actionsPerTurn,
      bonus: { movement: 0, attack: 0, defense: 0, actions: 0 },
      actedRound: [],
    },
    map: mapState,
    settings: {
      mapId,
      mode: modeDef.name,
      format: modeDef.format,
      seating: modeDef.seating,
      seed,
      // Просьбы лобби, а не правила движка: размер поля (null — авто) и лимит времени на ход в секундах.
      // Клиент читает их из проекции (`settings`), поэтому свои настройки он видит, а сид — нет.
      cells: cells ?? null,
      turnLimit,
      heroes: playerSlots.map(slot => ({ ...slot })),
    },
    players,
    combat: null,
    log: { battles: [], feed: [] },
  };

  save(runLifecycle(state));
  return load(id) ?? state;
};

/** Ответ на создание партии: полное состояние для хоста (без сида) и проекция на игрока. */
export const createGameResponse = (body, opts) => {
  const state = createGame(body, opts);
  const playerId =
    body.playerId != null && String(body.playerId).trim()
      ? String(body.playerId).trim()
      : ((state.settings?.heroes ?? []).find(h => h.control === 'human')?.heroId ??
        [...(state.players ?? [])].sort(
          (left, right) => Number(left.order ?? 0) - Number(right.order ?? 0),
        )[0]?.id);
  const host = structuredClone(state);
  delete host.settings?.seed;
  return { host, ...view(state, playerId) };
};

export default createGame;
