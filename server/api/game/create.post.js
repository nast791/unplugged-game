import { createError, defineEventHandler, readBody } from 'h3';
import { createGameResponse } from '../../create.js';

/**
 * POST /api/game/create — HTTP-адаптер сборки партии: тело запроса и коды ошибок.
 * Сама сборка — в `server/create.js` (домен без Nitro, им пользуются тесты и бот).
 */
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
