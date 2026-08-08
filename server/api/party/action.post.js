import { createError, defineEventHandler, readBody } from 'h3';
import { load, save, view } from '../../party.js';

export default defineEventHandler(async event => {
  const body = (await readBody(event)) ?? {};
  if (!body.gameId || !body.action?.playerId) {
    throw createError({
      statusCode: 400,
      message: 'нужны gameId и action.playerId',
    });
  }
  const state = load(body.gameId);
  if (!state) throw createError({ statusCode: 404, message: 'партия не найдена' });
  // apply(state, action) — следующий шаг
  save(state);
  try {
    return view(state, body.action.playerId);
  } catch (e) {
    throw createError({
      statusCode: 400,
      message: e instanceof Error ? e.message : 'action failed',
    });
  }
});
