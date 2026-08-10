import { createError, defineEventHandler, readBody } from 'h3';
import { modes } from '#shared/constants/modes.js';
import { rules } from '#shared/constants/rules.js';
import { save, load, view } from '../../party.js';
import { heroes as HEROES, maps as MAPS } from '../../content/index.js';
import { validateCreate } from '../../validations.js';
import { buildConnections, buildPlayer, sortPlayersByTeam } from '../../builders.js';
import { createRng } from '../../utils.js';
import { runLifecycle } from '#shared/gameEngine.js';

const badRequest = message => {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
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
  const seed =
    Number.isInteger(testSeed) ? testSeed : Math.floor(Math.random() * 0x100000000);
  const rng = createRng(seed);
  const mapPack = MAPS[mapId];
  const nodes = mapPack.nodes ?? [];
  const mapState = {
    id: mapPack.id,
    name: mapPack.name,
    nodes,
    connections: buildConnections(nodes),
  };

  const players = playerSlots.map((slot, seatIndex) =>
    buildPlayer(slot, HEROES[slot.heroId], seatIndex, mapState, rng),
  );
  const id =
    testId ??
    `game_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

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
      heroes: playerSlots.map(slot => ({ ...slot })),
    },
    players,
    combat: null,
    log: { battles: [], feed: [] },
  };

  save(runLifecycle(state));
  return load(id) ?? state;
};

export const createGameResponse = (body, opts) => {
  const state = createGame(body, opts);
  const playerId =
    body.playerId != null && String(body.playerId).trim()
      ? String(body.playerId).trim()
      : (state.settings?.heroes ?? []).find(h => h.control === 'human')?.heroId ??
        [...(state.players ?? [])].sort(
          (left, right) => Number(left.order ?? 0) - Number(right.order ?? 0),
        )[0]?.id;
  const host = structuredClone(state);
  delete host.settings?.seed;
  return { host, ...view(state, playerId) };
};

export default defineEventHandler(async event => {
  const body = (await readBody(event)) ?? {};
  try {
    return createGameResponse(body);
  } catch (e) {
    throw createError({
      statusCode: e?.statusCode ?? 500,
      message: e instanceof Error ? e.message : 'create failed',
    });
  }
});
