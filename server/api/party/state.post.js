import { createError, defineEventHandler, readBody } from 'h3';
import { load, save, view } from '../../party.js';

/** Записать state партии. Клиент присылает уже посчитанный next state. */
export default defineEventHandler(async event => {
  const body = (await readBody(event)) ?? {};
  if (!body.gameId || !body.state) {
    throw createError({
      statusCode: 400,
      message: 'нужны gameId и state',
    });
  }
  const current = load(body.gameId);
  if (!current) {
    throw createError({ statusCode: 404, message: 'партия не найдена' });
  }
  if (String(body.state.id) !== String(current.id)) {
    throw createError({
      statusCode: 400,
      message: 'state.id не совпадает с gameId',
    });
  }
  save(structuredClone(body.state));
  return view(body.state, body.playerId);
});
