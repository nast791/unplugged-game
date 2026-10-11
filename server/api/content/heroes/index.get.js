import { defineEventHandler } from 'h3';
import { heroes } from '../../../content/index.js';
import { buildHeroSummary } from '../../../builders.js';

export default defineEventHandler(() =>
  Object.fromEntries(Object.entries(heroes).map(([id, pack]) => [id, buildHeroSummary(pack)])),
);
