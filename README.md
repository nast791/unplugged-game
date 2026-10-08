# UnPlugged

Клиент настольной игры на Nuxt 4. Логика партии — своя, в `shared/` (жизненный цикл → фазы → экшены,
правила `moment + when + then`); внешних движков в проекте нет.

## Требования

- Node.js `>= 20`
- pnpm `11.10.0` (см. `packageManager` в `package.json`)

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
| `pnpm test` | все тесты (vitest) |
| `pnpm test:watch` | тесты в режиме наблюдения |
| `pnpm test:bot` | бот сам играет дуэль Медуза против Теслы и ищет баги |

Прогон бота: по умолчанию 60 партий, длинная серия — `pnpm test:bot -- --seeds=2000`,
разбор одной партии по сиду — `pnpm test:bot -- --seed=50` (сид воспроизводим: в отчёте есть
лог последних действий и сообщение движка). Ненулевой код возврата — бот нашёл падение,
тупик или нарушенный инвариант. Тот же прогон идёт в `pnpm test`.

## Стек

- **Nuxt 4** + Vue 3
- **Свой движок партии** — `shared/core.js` (`runLifecycle` / `runAction` / `runUi` / `runFact`),
  вход для клиента и сервера — `shared/publicApi.js`
- **Tailwind CSS 4** (`@tailwindcss/vite`)
- **Konva** / **vue-konva** — canvas-сцена
- **@nuxt/image**, **@nuxt/icon**, **@peterbud/nuxt-query**
- **Manrope** — шрифт интерфейса: вариативные WOFF2 лежат в проекте (`public/fonts/`, лицензия OFL),
  подключаются `@font-face` в `app/assets/styles.css`, прелоадятся и кэшируются из `nuxt.config.ts`;
  метрика заглавной для знака в логотипе считается `node tests/support/font-metrics.mjs`
  (`docs/ui-plan.md` §9.3)

Версии в `package.json` зафиксированы без `^`.

## Структура

```
app/                 # страницы, компоненты доски, composables (клиент)
server/              # сборка партии (create.js), проекции (party.js), API (api/), контент (content/)
shared/              # движок: core, lifecycle, phases, actions, facts, rules
tests/               # unit, scenarios, фаззинг-бот (support/)
nuxt.config.ts
```

Сборка партии отделена от HTTP: `server/create.js` — домен, `server/api/game/create.post.js` — адаптер
(его нельзя импортировать из тестов и бота: он тянет Nitro).
