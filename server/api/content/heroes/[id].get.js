import { createError, defineEventHandler, getRouterParam } from 'h3';
import { heroes } from '../../../content/index.js';
import { buildHeroSummary } from '../../../builders.js';

/**
 * Карточка героя для страницы `/heroes/{id}`: числа, умение, помощники, предметы и тексты карт.
 * Данные берутся из контента (`server/content`), поэтому новая страница героя не требует правок клиента.
 */
export default defineEventHandler(event => {
  const id = String(getRouterParam(event, 'id') ?? '').trim();
  const summary = buildHeroSummary(heroes[id]);
  if (!summary) {
    throw createError({
      statusCode: 404,
      statusMessage: `неизвестный герой "${id}" (доступно: ${Object.keys(heroes).join(', ')})`,
    });
  }
  return summary;
});
