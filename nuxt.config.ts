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
  appConfig: {
    ui: {
      screens: parseBreakpoints(stylesCss),
    },
  },
  modules: ['@nuxt/test-utils/module', '@nuxt/image', '@peterbud/nuxt-query', '@nuxt/icon'],
  alias: {
    '#shared': fileURLToPath(new URL('./shared', import.meta.url)),
  },
  components: [],
  /**
   * Картинки паков героев отдаёт API-маршрут по адресу с версией в строке запроса (`?v=23`),
   * а ipx такой адрес не берёт (он ждёт файл из `public/`). Провайдер `none` отдаёт адрес как есть.
   */
  image: {
    providers: {
      none: { provider: 'none' },
    },
  },
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
    externals: {
      inline: [/[\\/]shared[\\/]/],
    },
    watch: ['shared'],
  },
  routeRules: {
    '/game': { ssr: false },
    '/heroes/**': { ssr: false },
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
    autoImports: ['useQuery', 'useQueryClient', 'useMutation', 'useQueries'],
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
    serverBundle: { collections: ['lucide', 'game-icons', 'material-symbols'] },
    clientBundle: {
      scan: true,
      icons: ['arcticons:mistplay', 'material-symbols:arrow-left', 'material-symbols:arrow-right'],
    },
  },
});
