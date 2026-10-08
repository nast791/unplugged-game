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
      // Как в Nuxt: `~` — папка приложения. Нужно тестам, которые тянут композаблы (`useSortable`
      // импортирует `~/utils/sortable.js`).
      '~': fileURLToPath(new URL('./app', import.meta.url)),
      '@': fileURLToPath(new URL('./app', import.meta.url)),
    },
  },
});
