import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import svgLoader from 'vite-svg-loader';
import tailwindcss from '@tailwindcss/vite';

/**
 * Брейкпоинты Tailwind 4 объявлены в CSS-теме (`@theme` → `--breakpoint-*` в `app/assets/styles.css`),
 * а в JS они нужны для art-direction (`lg:src` в `APicture`). Читаем тот же файл, что подключает Tailwind,
 * чтобы не дублировать значения в отдельном JS-файле: правишь тему — меняются и они.
 */
const parseBreakpoints = css =>
  Object.fromEntries(
    [...String(css).matchAll(/--breakpoint-([a-zA-Z0-9-]+)\s*:\s*([^;]+);/g)].map(match => [
      match[1],
      match[2].trim(),
    ]),
  );

const stylesCss = readFileSync(
  fileURLToPath(new URL('./app/assets/styles.css', import.meta.url)),
  'utf8',
);

export default defineNuxtConfig({
  compatibilityDate: '2026-07-11',
  devtools: { enabled: true },
  features: {
    devLogs: false,
  },
  /** `ui.screens` — из темы; пресеты компонентов добавляет `app/app.config.js` (Nuxt их домешивает). */
  appConfig: {
    ui: {
      screens: parseBreakpoints(stylesCss),
    },
  },
  modules: ['@nuxt/test-utils/module', '@nuxt/image', '@peterbud/nuxt-query', '@nuxt/icon'],
  alias: {
    '#shared': fileURLToPath(new URL('./shared', import.meta.url)),
  },
  /**
   * Раскладка компонентов по конвенции владельца: `atoms` — универсальные кирпичики (имя всегда с `A`),
   * `molecules` — небольшие сборки из атомов, `organisms` — секции. У этих каталогов префикс пути выключен,
   * поэтому имя компонента равно имени файла (`ALoader`, `Logo`, `Menu`, `Footer`). У `game` префикс задан
   * руками: файл остаётся `game/Board.vue` (на него ссылаются документы), а компонент — `<GameBoard>`,
   * как его и зовёт `pages/game.vue`.
   */
  components: [
    { path: '~/components/atoms', pathPrefix: false },
    { path: '~/components/molecules', pathPrefix: false },
    { path: '~/components/organisms', pathPrefix: false },
    { path: '~/components/game', prefix: 'Game' },
  ],
  /** Версия сборки в подвале лобби: `npm_package_version` есть только при запуске через pnpm-скрипты. */
  runtimeConfig: {
    public: {
      appVersion: process.env.npm_package_version || '0.0.0-dev',
    },
  },
  vite: {
    optimizeDeps: {
      include: ['vue-konva', 'konva'],
      esbuildOptions: {
        define: {
          global: 'window',
        },
      },
    },
    plugins: [svgLoader({ svgo: false }), tailwindcss()],
    build: {
      cssMinify: 'lightningcss',
      sourcemap: false,
      modulePreload: {
        polyfill: false,
      },
    },
    css: {
      devSourcemap: false,
    },
  },
  nitro: {
    compressPublicAssets: true,
    sourceMap: false,
    // Хост-код партии (actions/events/helpers) — зона проекта, не engine.
    externals: {
      inline: [/[\\/]shared[\\/]/],
    },
    watch: ['shared'],
  },
  /**
   * Страница партии живёт на состоянии вкладки (hotseat: состояние партии лежит в клиенте), поэтому
   * рендерить её на сервере нечем: серверный `useState` пуст, `bootstrap` падает, и сервер отдавал
   * разметку «партии нет», а клиент после восстановления из sessionStorage — саму игру. Отсюда ошибка
   * гидратации. Пусть страница рендерится только на клиенте.
   */
  routeRules: {
    '/game': { ssr: false },
    /**
     * Страница героя — как партия: данные приходят запросом (`/api/content/heroes/{id}`), разметку
     * собирает клиент.
     *
     * `ssr: false` тут не только по этой причине: в текущей конфигурации SSR находит **только** `/`,
     * а любой другой маршрут отвечает `Page not found`, пока у него не выключен SSR. Проверено на чистом
     * кэше сборки (`node_modules/.cache/nuxt` удалён) и на трёх пробных страницах — `/probe-flat.vue`,
     * `probe-dir/index.vue` и `heroes/[id].vue`: сканер страниц их видит (`pages:extend` перечисляет
     * маршруты), vue-router их матчит, а SSR-рендер падает в `pages/runtime/plugins/router.js:afterEach`
     * с пустым `to.matched`. Отключение `payloadExtraction` и `@nuxt/test-utils/module` не помогло.
     * Разбираться с этим отдельной задачей (`TODO`), пока — `ssr: false`, как у `/game`.
     */
    '/heroes/**': { ssr: false },
    /** Файлы шрифтов не хешируются сборкой: кэшируем папку, новая версия приезжает новым именем. */
    '/fonts/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
  },
  app: {
    head: {
      titleTemplate: 'UnPlugged: %s',
      meta: [
        { charset: 'utf-8' },
        {
          name: 'viewport',
          content:
            'viewport-fit=cover, width=device-width, initial-scale=1, user-scalable=1, minimum-scale=1, maximum-scale=5',
        },
        { name: 'format-detection', content: 'telephone=no' },
        { name: 'theme-color', content: '#12161b' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg', sizes: 'any' },
        { rel: 'alternate icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/favicon-180.png' },
        { rel: 'manifest', href: '/manifest.json' },
        /** Греем кириллицу и латиницу: интерфейс русский, цифры и латинские имена — в латинице. */
        {
          rel: 'preload',
          as: 'font',
          type: 'font/woff2',
          href: '/fonts/manrope-cyrillic.woff2',
          crossorigin: 'anonymous',
        },
        {
          rel: 'preload',
          as: 'font',
          type: 'font/woff2',
          href: '/fonts/manrope-latin.woff2',
          crossorigin: 'anonymous',
        },
      ],
    },
    pageTransition: false,
    layoutTransition: false,
  },
  css: ['~/assets/styles.css'],
  nuxtQuery: {
    autoImports: ['useQuery', 'useMutation', 'useQueries'],
    devtools: true,
    queryClientOptions: {
      defaultOptions: {
        queries: {
          networkMode: 'always',
          staleTime: 60000 * 60 * 2,
          refetchOnWindowFocus: false,
        },
        mutations: {
          networkMode: 'always',
        },
      },
    },
  },
  typescript: {
    strict: true,
  },
  spaLoadingTemplate: false,
  experimental: {
    payloadExtraction: true,
    typedPages: true,
  },
  icon: {
    /**
     * Иконки — SVG из локальной коллекции Lucide (`@iconify-json/lucide`): без сети и без растровых
     * картинок (`docs/ui-plan.md` §2.6). `clientBundle.scan` кладёт в бандл только те иконки, которые
     * реально встречаются в шаблонах.
     */
    serverBundle: { collections: ['lucide'] },
    clientBundle: { scan: true },
  },
});
