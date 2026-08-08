import { createError, defineEventHandler, getQuery } from 'h3';
import { load, view } from '../../party.js';

const one = value => {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw != null ? String(raw).trim() : '';
};

export default defineEventHandler(event => {
  const query = getQuery(event);
  const gameId = one(query.gameId);
  const playerId = one(query.playerId);
  if (!gameId || !playerId) {
    throw createError({ statusCode: 400, message: 'нужны gameId и playerId' });
  }
  const state = load(gameId);
  if (!state) throw createError({ statusCode: 404, message: 'партия не найдена' });
  try {
    return view(state, playerId);
  } catch (e) {
    throw createError({
      statusCode: 400,
      message: e instanceof Error ? e.message : 'view failed',
    });
  }
});
