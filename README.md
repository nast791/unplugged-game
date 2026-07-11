# UnPlugged

Клиент настольной игры на Nuxt 4. Общая логика партии — через пакет [`@nast791/engine`](https://github.com/nast791/tabletop-engine) (без boardgame.io).

## Требования

- Node.js `>= 20`
- pnpm `11.10.0` (см. `packageManager` в `package.json`)
- доступ к GitHub Packages для scope `@nast791` (`read:packages`)

В `%USERPROFILE%\.npmrc`:

```ini
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_PAT
```

В проекте уже есть `.npmrc` с `@nast791:registry=https://npm.pkg.github.com`.

## Установка

```bash
pnpm install
```

## Скрипты

| Команда | Описание |
|---------|----------|
| `pnpm dev` | dev-сервер |
| `pnpm build` | production-сборка |
| `pnpm preview` | превью собранного приложения |
| `pnpm generate` | статическая генерация |
| `pnpm clean` | очистка `.nuxt` / кэша |
| `pnpm format` | Prettier |
| `pnpm tabletop-engine:update` | обновить пакеты `@nast791/*` |
| `pnpm tabletop-engine:update:engine` | обновить только `@nast791/engine` |

## Стек

- **Nuxt 4** + Vue 3
- **@nast791/engine** — create / action / view партии
- **Tailwind CSS 4** (`@tailwindcss/vite`)
- **Konva** / **vue-konva** — canvas-сцена
- **@nuxt/image**, **@nuxt/icon**, **@peterbud/nuxt-query**
- **Onest** (`@fontsource-variable/onest`)

Версии в `package.json` зафиксированы без `^`.

## Движок

Модуль подключён в `nuxt.config.ts`:

```ts
modules: ['@nast791/engine', /* … */],
tabletopEngine: {
  apiPrefix: '/api/tabletop',
},
```

Автоимпорт composables:

| Composable | Назначение |
|------------|------------|
| `useGameSetup` | настройки партии (map, rules, options) |
| `usePlayerSetup` | слоты игроков |
| `useGameView` | живая партия: create / action / view |
| `useGameHelpers` | `isMyTurn`, `me`, `phase`, … |

API (Nitro):

| Метод | Путь |
|-------|------|
| `POST` | `/api/tabletop/create` |
| `POST` | `/api/tabletop/action` |
| `GET` | `/api/tabletop/view?gameId=&playerId=` |

Документация движка: [`@nast791/engine` README](https://github.com/nast791/tabletop-engine/tree/main/packages/engine).

## Структура

```
app/
  assets/          # стили (Tailwind + тема)
  layouts/
  pages/
  plugins/         # vue-konva (client)
  app.vue
nuxt.config.ts
```
