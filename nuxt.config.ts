import svgLoader from 'vite-svg-loader';
import tailwindcss from '@tailwindcss/vite';

export default defineNuxtConfig({
  compatibilityDate: '2026-07-11',
  devtools: { enabled: true },
  features: {
    devLogs: false,
  },
  modules: [
    '@nast791/engine',
    '@nast791/cards',
    '@nuxt/test-utils/module',
    '@nuxt/image',
    '@peterbud/nuxt-query',
    '@nuxt/icon',
  ],
  tabletopEngine: {
    apiPrefix: '/api/tabletop',
    actions: '#shared/actions/index.js',
  },
  tabletopCards: {
    effects: '#shared/cardEffects.js',
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
        { name: 'theme-color', content: '#fff' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg', sizes: 'any' },
        { rel: 'alternate icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/favicon-180.png' },
        { rel: 'manifest', href: '/manifest.json' },
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
    serverBundle: 'remote',
  },
});
