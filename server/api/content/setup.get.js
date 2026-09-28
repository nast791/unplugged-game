import { defineEventHandler } from 'h3';
import { maps, heroes } from '../../content/index.js';

/**
 * Что можно выбрать в лобби: карты и герои берутся из контента (`server/content`), поэтому клиенту
 * не нужно знать их список — раньше он был захардкожен и пережил удаление героя.
 */
export default defineEventHandler(() => ({
  maps: [
    ...Object.values(maps).map(map => ({
      id: map.id,
      name: map.name ?? map.id,
    })),
    // поле, которое генератор собирает по сиду партии: клетки, зоны стихий и стартовые области
    { id: 'generated', name: 'Случайное поле (по сиду партии)' },
  ],
  heroes: Object.values(heroes).map(hero => ({
    id: hero.id,
    name: hero.name ?? hero.id,
    // главный герой пака: его здоровье показываем в списке выбора
    health: (hero.heroes ?? [])[0]?.hp ?? null,
    fighters:
      (hero.heroes ?? []).length +
      (hero.assistants ?? []).reduce((sum, assistant) => sum + (Number(assistant.count) || 1), 0),
  })),
}));
