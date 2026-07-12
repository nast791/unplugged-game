import { fileURLToPath } from 'node:url';
import { defineVitestConfig } from '@nuxt/test-utils/config';

export default defineVitestConfig({
  test: {
    name: 'unit',
    environment: 'node',
    include: ['tests/**/*.test.js'],
    globals: false,
  },
  resolve: {
    alias: {
      '#shared': fileURLToPath(new URL('./shared', import.meta.url)),
      '#tabletop-card-effects': fileURLToPath(
        new URL('./shared/cardEffects.js', import.meta.url),
      ),
    },
  },
});
