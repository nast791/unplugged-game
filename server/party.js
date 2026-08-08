import { stacks } from '#shared/constants/deck.js';
import { playerFields, stateFields } from '#shared/constants/state.js';

const MAX_PARTIES = 32;
const parties = new Map();

const isFinished = state => state?.winner != null;

const trimParties = () => {
  while (parties.size > MAX_PARTIES) {
    const oldest = parties.keys().next().value;
    parties.delete(oldest);
  }
};

export const save = state => {
  const id = String(state.id);
  if (isFinished(state)) {
    remove(id);
    return;
  }
  const snapshot = structuredClone(state);
  if (parties.has(id)) parties.delete(id);
  parties.set(id, snapshot);
  trimParties();
};

export const load = id => {
  const key = String(id);
  const state = parties.get(key);
  if (!state) return null;
  parties.delete(key);
  parties.set(key, state);
  return structuredClone(state);
};
export const remove = id => parties.delete(String(id));

const stack = name => stacks.find(s => s.name === name);

const findYou = (state, playerId) => {
  const you = state.players.find(p => String(p.id) === String(playerId));
  if (!you) throw new Error(`party.view: нет игрока "${playerId}"`);
  return you;
};

/** Роль обращающегося (you) относительно другого игрока. В state не пишем — она разная у каждого клиента. */
const role = (you, player) => {
  if (String(player.id) === String(you.id)) return 'self';
  if (
    you.team != null &&
    player.team != null &&
    String(you.team) === String(player.team)
  ) {
    return 'team';
  }
  return 'enemy';
};

const canSee = (visibility, rel) => {
  const roles = visibility ?? [];
  if (!roles.length) return false;
  return roles.includes(rel);
};

const isPublicField = visibility =>
  canSee(visibility, 'self') &&
  canSee(visibility, 'team') &&
  canSee(visibility, 'enemy');

const projectState = (state, rel) => {
  const out = {};
  for (const [key, visibility] of Object.entries(stateFields)) {
    if (!canSee(visibility, rel)) continue;
    if (key === 'combat') {
      out.combat = state.combat
        ? (({ attackCard, defenseCard, ...rest }) => rest)(state.combat)
        : null;
    } else if (key === 'settings') {
      const settings = structuredClone(state.settings ?? {});
      delete settings.seed;
      out.settings = settings;
    } else {
      out[key] = structuredClone(state[key]);
    }
  }
  return out;
};

const projectZone = (name, zone, rel) => {
  const vis = zone?.visibility ?? stack(name)?.visibility ?? playerFields[name] ?? [];
  const cards = zone?.cards ?? [];
  return {
    visibility: structuredClone(zone?.visibility ?? []),
    count: cards.length,
    cards: canSee(vis, rel) ? cards.map(c => ({ ...c })) : undefined,
  };
};

const projectPlayer = (player, state, you) => {
  const rel = role(you, player);
  const hidePos = state.hook === 'gameStart' && rel !== 'self';
  const out = {};

  for (const [key, visibility] of Object.entries(playerFields)) {
    if (stack(key)) {
      out[key] = projectZone(key, player[key], rel);
      continue;
    }
    if (!canSee(visibility, rel)) continue;

    if (key === 'fighters') {
      out.fighters = (player.fighters ?? []).map(f =>
        hidePos
          ? { ...f, currentPosition: null, startPosition: null }
          : { ...f },
      );
    } else if (key === 'items') {
      out.items = structuredClone(player.items ?? []);
    } else {
      out[key] = player[key];
    }
  }
  return out;
};

/** Ответ POST /api/game/create — без playerId, без скрытых зон. */
export const createResponse = state => {
  const out = projectState(state, 'self');
  out.players = (state.players ?? []).map(player => {
    const outPlayer = {};
    for (const [key, visibility] of Object.entries(playerFields)) {
      if (stack(key) || !isPublicField(visibility)) continue;
      outPlayer[key] = player[key];
    }
    return outPlayer;
  });
  return out;
};

/** View — playerId из запроса, роль считаем на лету из id + team. */
export const view = (state, playerId) => {
  const you = findYou(state, playerId);
  return {
    ...projectState(state, 'self'),
    you: String(playerId),
    players: (state.players ?? []).map(p => projectPlayer(p, state, you)),
  };
};
