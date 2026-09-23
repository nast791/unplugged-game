import { stacks } from '#shared/constants/deck.js';
import { playerFields, stateFields } from '#shared/constants/state.js';
import { runUi } from '#shared/core.js';
import { runLifecycle } from '#shared/gameEngine.js';
const MAX_PARTIES = 32;
const parties = new Map();

/** Партия закончена: экран итогов (gameEnd). Итоговое состояние не храним. */
const isFinished = state => state?.hook === 'gameEnd';

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

/** Карты боя пер-рольные: своя карта видна владельцу, после вскрытия — всем. */
const projectCombat = (combat, playerId) => {
  if (!combat) return null;

  const { attackCard, defenseCard, attackValue, defenseValue, ...rest } = combat;
  const revealed = ['reveal', 'resolve', 'close'].includes(combat.stage);
  const isAttacker = String(combat.attackerPlayerId) === String(playerId);
  const isDefender = String(combat.defenderPlayerId) === String(playerId);

  const out = { ...rest };
  if ((revealed || isAttacker) && attackCard !== undefined) {
    out.attackCard = attackCard;
  }
  if ((revealed || isDefender) && defenseCard !== undefined) {
    out.defenseCard = defenseCard;
  }
  if (revealed || isAttacker) out.attackValue = attackValue;
  if (revealed || isDefender) out.defenseValue = defenseValue;
  return out;
};

/** Черновик перемещения видит только владелец, пока действие не закрыто кнопкой. */
const projectMovement = (movement, you) => {
  if (!movement) return null;
  if (String(movement.playerId) === String(you.id)) {
    return structuredClone(movement);
  }
  return null;
};

/** Выбор цели: чужим видно только, что выбор идёт. */
const projectTargeting = (targeting, you) => {
  if (!targeting) return null;

  const playerId = String(targeting.playerId);
  const base = {
    playerId,
    source: targeting.source ?? null,
    required: targeting.required === true,
  };
  if (playerId !== String(you.id)) return base;
  return { ...base, candidates: structuredClone(targeting.candidates ?? []) };
};

const projectState = (state, you) => {
  const out = {};
  for (const [key, visibility] of Object.entries(stateFields)) {
    if (!canSee(visibility, 'self')) continue;
    if (key === 'combat') {
      out.combat = projectCombat(state.combat, you.id);
    } else if (key === 'movement') {
      out.movement = projectMovement(state.movement, you);
    } else if (key === 'targeting') {
      out.targeting = projectTargeting(state.targeting, you);
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
  const movementOwnerId =
    state.movement?.playerId == null ? null : String(state.movement.playerId);
  const hideMoved =
    movementOwnerId != null && movementOwnerId !== String(you.id);
  const out = {};

  for (const [key, visibility] of Object.entries(playerFields)) {
    if (stack(key)) {
      out[key] = projectZone(key, player[key], rel);
      continue;
    }
    if (!canSee(visibility, rel)) continue;

    if (key === 'fighters') {
      out.fighters = (player.fighters ?? []).map(fighter => {
        if (hidePos) {
          return { ...fighter, currentPosition: null, startPosition: null };
        }
        if (hideMoved && String(player.id) === movementOwnerId) {
          const origin = state.movement.origins?.[String(fighter.id)];
          return {
            ...fighter,
            currentPosition: origin ?? fighter.currentPosition,
          };
        }
        return { ...fighter };
      });
    } else if (key === 'items') {
      out.items = structuredClone(player.items ?? []);
    } else {
      out[key] = player[key];
    }
  }
  return out;
};

/** gameStart до enter: один раз прогнать lifecycle на клоне для согласованного view. */
const normalizeForView = state => {
  if (state.hook !== 'gameStart' || state._enteredHooks?.gameStart) {
    return state;
  }
  return runLifecycle(structuredClone(state));
};

/** View — playerId из запроса, роль считаем на лету из id + team. */
export const view = (state, playerId) => {
  const snapshot = normalizeForView(state);
  const you = findYou(snapshot, playerId);
  return {
    ...projectState(snapshot, you),
    you: String(playerId),
    ui: runUi(snapshot, playerId),
    players: (snapshot.players ?? []).map(p => projectPlayer(p, snapshot, you)),
  };
};
