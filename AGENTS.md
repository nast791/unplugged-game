# UnPlugged — карта проекта

Кэш для быстрого входа: где что лежит и куда идти. Содержание — в `.docs/`, код — `app/`, `shared/`,
`server/`, `bot/`. Файл уходит в каждый запрос, поэтому здесь только маршруты и порядок работы, а не
пересказ правил.

**Одна фича — одно место.** Описание живёт в одном файле; там, где о ней нужно вспомнить, стоит ссылка, а
не второй абзац того же текста. Расхождение кода и документации — ошибка в документации, но правится она
в своём единственном месте.

## 1. Что это

Браузерная настольная игра в духе Unmatched: hotseat за одним экраном, логика целиком в движке,
клиент только рисует и шлёт клики. Стиль доски примитивный: кружки, линии, сектора, текстуры.
Стек: Nuxt 4 (Vue 3 SFC), Tailwind 4, konva/vue-konva, vitest 4, pnpm; Node 24, Windows (PowerShell 5.1).
Документация проекта — `.docs/`, вход и правила ведения — `.docs/README.md`.

## 2. Как работаем

1. **Уточнили.** Непонятное в задаче — вопрос, а не догадка. Если задача совпадает со скилом
   (`.docs/skills/`), первый ответ начинается словами «читаю `.docs/skills/<name>/SKILL.md`».
2. **План.** Файлы, что меняется, чем проверяется — до первой правки; код после явного «делай».
3. **Сделали.** Минимальный дифф: не трогаем «заодно», не переформатируем нетронутые файлы, не заводим
   второй экземпляр правила или доки.
4. **Проверили и рассказали.** Что изменено (пути), что запущено (команды), что не проверено и почему.
   Коммит и пуш — только по прямой команде владельца.

## 3. Куда смотреть

| Что нужно | Файл |
| --- | --- |
| Индекс документации, правила ведения доков | `.docs/README.md` |
| Что умеет движок: хуки, фазы, факты, действия, бой, окна | `.docs/engine.md` |
| Поток движка по файлам (как читать `shared/`) | `.docs/rules/internal-logic.mdc` |
| Архитектура, слои, папки, что где лежит | `.docs/rules/architecture.mdc` |
| Стиль кода, Vue/Tailwind, именование | `.docs/rules/code-style.mdc` |
| Чек-лист полного аудита | `.docs/rules/audit.mdc` |
| Клиент: компоненты, пресеты, вёрстка | `.docs/ui.md` |
| Доска: геометрия, слои конвы, текстуры, зум | `.docs/board.md` |
| Экран партии: раскладка, шапка, меню, битва | `.docs/game-screen.md` |
| Карты и окна выбора | `.docs/cards-ui.md` |
| Стихии, старты, генератор поля | `.docs/terrain.md` |
| Контент и IP: имена карт, колода, права | `.docs/content-ip.md` |
| Герой: правила пака, карты, алгоритм | `.docs/hero-algorithm.md` |
| Статусы бойца: реестр, как ставить из карты, что закрывают, как показаны | `.docs/statuses.md` |
| Постоянные эффекты на героя: реестр, круг у гекса, строка «Важно!» в подсказке | `.docs/effects.md` |
| Баланс героев и замеры | `.docs/hero-balance.md` |
| Общие карты, возможности карт | `.docs/common-cards.md`, `.docs/card-capabilities.md` |
| Монетизация, запас героев | `.docs/monetization.md`, `.docs/hero-reserve.md` |
| Оси героев для бота | `.docs/hero-bot-axes.md` |
| Стратегии живых игроков: что из них умеет бот, что нет и почём | `.docs/bot-strategies.md` |
| Справочники по референсам | `.docs/reference-heroes.md`, `.docs/reference-stats.md`, `.docs/reference-skills.md` |
| Словарь терминов | `.docs/glossary.md` |
| Мир, мета, кампания | `.docs/world.md`, `.docs/campaign-season-1.md`, `.docs/campaign-season-1-script.md` |
| План интерфейса и экранов | `.docs/ui-plan.md` |
| Стиль иллюстраций и промты | `.docs/illustrations.md` |
| Грабли: что уже ломалось | `.docs/pitfalls.md` |
| Открытые задачи | `.docs/tasks.md` |
| Что и чем проверяем | `.docs/testing.md` |
| Ветки, коммиты, готовность, проверки | `.docs/workflow.md` |
| Ревью диффа: что считать дефектом | `.docs/review-rules.md`, `.docs/review-ignore.txt` |
| Первый день в проекте | `.docs/onboarding.md` |
| Где читать внешнюю документацию | `.docs/sources.md` |
| Почему решено так, а не иначе (ADR) | `.docs/decisions/README.md` |
| Пошаговые процедуры под типовую задачу | `.docs/skills/README.md` |
| Карточки запросов (bugfix, feature, refactor, review, audit) | `.docs/prompts/README.md` |

## 4. Карта кода

| Путь | Что там |
| --- | --- |
| `shared/publicApi.js` | вход движка для клиента, сервера и бота: `runAction` (проверки контракта) и ре-экспорт `runLifecycle`, `runPhase`, `runUi`, `runFact(s)` |
| `shared/core.js` | сам движок: реестр хуков, фазы, действия, форк состояния, UI-проекция |
| `shared/lifecycle/`, `shared/phases/` | хуки и фазы-брики |
| `shared/facts/` | факты для условий правил (`CELLS`, `FIGHTERS`, `run.js`) |
| `shared/actions/` | универсальные экшены |
| `shared/constants/` | хуки, моменты, правила, стихии, места, видимость полей; `ui.js` — константы интерфейса (пункты меню, советы лобби), `hints.js` — словарь текстов подсказок партии (один ключ на подсказку фазы, `.docs/engine.md`); **`tuning.js` — меняемые числа: таймауты, правила партии, лимиты, длительности анимаций** (правило владельца, m01732: всё в одном месте, чтобы не искать по файлам; `rules.js` собирает `rules` из `RULES`, а `app/constants/animation.js` ре-экспортирует `ANIMATION_DURATIONS`) |
| `shared/helpers/` | `placement.js`, `mapGenerator.js`, `random.js`, `combat.js`, `ui.js` |
| `shared/skills/` | способности героев и их моменты |
| `server/content/` | `heroes/{anubis,dorothy,ifrit,medusa,snow-queen,tesla}` (у каждого `index.js`, `cards.js`, паспорт), `common/cards.js` (общий пул) |
| `server/` | `create.js` (сборка партии), `party.js` (state в памяти + `view`), `api/` (Nitro) |
| `app/pages/`, `app/composables/` | страницы `index.vue` (лобби), `game.vue` (партия), `heroes/[id].vue`, `error.vue`; композаблы в четырёх папках `game/`, `ui/`, `animations/`, `api/` — полный список и правила в `.docs/rules/architecture.mdc` |
| `app/components/{atoms,molecules,organisms}/` | атомы на `reka-ui` (префикс `A`), молекулы, организмы-секции (`<section>` первым); каждый компонент импортируется явно; конвенции — `.docs/rules/code-style.mdc`, вёрстка — `.docs/ui.md` |
| `app/constants/` | клиентские константы: `cards.js`, `health.js`, `animation.js`, `tooltips.js`, `colors.js`, `heart.js`; в композаблах констант нет |
| `app/ui/*.js`, `app/app.config.js` | пресеты на повторяющийся стилевой набор, склейка классов `cn` (`app/ui/cn.js`) — подробности в `.docs/rules/code-style.mdc` |
| `app/components/organisms/game/Board.vue` | доска на konva (в `pages/game.vue` — `<GameBoard>`); геометрия `useBoardMap`, вид `useBoardView` — `.docs/board.md` |
| `app/composables/` | четыре папки: `game/` — логика партии, `ui/` — интерфейс, `animations/` — движение, `api/` — запросы контента; `app/utils/` нет, полный список — `.docs/rules/architecture.mdc` |
| `public/patterns/*.webp` | плитки десяти стихий: 512 px (осыпь гор 256), по одной на стихию |
| `public/images/table.webp` | фон экрана партии (1920×1084, серая фактура холста): `Board.vue` кладёт его под доской в пропе `tableBg`, цвет `bg-table` остаётся подложкой на случай, когда картинка не загрузилась |
| `public/fonts/*.woff2` | вариативные шрифты интерфейса (Manrope 200–800: кириллица, латиница и расширенные разрезы) — **файлы проекта, а не пакет**: `@font-face` с `unicode-range` в `app/assets/styles.css`, прелоад и кэш папки — `nuxt.config.ts`; пакетов `@fontsource-variable/*` в проекте нет |
| `app/svg/*.svg` | SVG интерфейса (импортируются как компоненты): `app/svg/brand/` — знак (пиксельная сетка 3×3) и логотип со словом в кривых, собирают `tests/support/bake-wordmark.py` (логотип) и `bake-brand.mjs` (знак и иконки); прошлый знак — `app/svg/brand/legacy/`. В `public/` остаются только те SVG/PNG, что браузер берёт по URL: `favicon*`, `icon-{192,512}.png` |
| `bot/` | `play/` (игра), `learn/` (обучение), `tools/` (замеры) — карта `bot/README.md` |
| `tests/support/` | пекарь плиток (`bake-tiles.mjs`), превью текстур (`pattern-preview.mjs`), сводки (`deck-stats.mjs`, `reference-stats.mjs`), клиентский прогон стола (`hotseat-ui.js`: настоящая сессия и панели, клики по подсветке), браузерный обход партии (`hotseat-browser.mjs`: Chrome, клики по канве, скриншоты) |
| `.docs/`, `TODO`, `.refs/` | документация и задачи; `.refs/` — только для чтения глазами |

## 5. Команды

```powershell
pnpm dev                                     # Nuxt на localhost:3000 (/game — клиентская)
node node_modules\vitest\vitest.mjs run tests/unit/client/board-geometry.test.js --pool=threads
node node_modules\vitest\vitest.mjs run --pool=threads      # весь набор, только когда нужно
node bot/tools/run.js --seeds=200 --heroes=anubis,tesla  # фаззинг пары (то же: pnpm test:bot)
node bot/tools/run.js --seeds=20 --policy=search         # живой бот на паре героев (метрики, не фаззинг)
node bot/tools/hotseat.js --games=500                    # фаззинг стола на 4 людей (то же: pnpm test:hotseat)
node bot/tools/hotseat.js --seed=18 --players=4          # разобрать одну находку по сиду (лог действий в отчёте)
$env:UI_SEEDS='20'; node node_modules\vitest\vitest.mjs run tests/scenarios/hotseat-ui.test.js --pool=threads  # клиентский прогон того же стола: клики по подсветке, пустые экраны, кнопки-пустышки, падения панелей
node tests/support/hotseat-browser.mjs --steps=60 --seed=5 --headful  # живой Chrome: канва, карты, кнопки, скриншоты в .workbuddy/browser/<сид>
node node_modules\vitest\vitest.mjs run tests/unit/core/immutability.test.js --pool=threads
pnpm test:matrix -- --games=200 --policy=search   # матрица матчапов и метрики по героям (живой бот)
pnpm test:matrix -- --policy=net --policy-b=search --games=10 --workers=8  # две оценки листа (.docs/hero-balance.md §17)
$env:SEARCH_TIME='400'; node bot/tools/matrix.js --games=40 --policy=search --workers=8  # замер баланса — только живьём (.docs/hero-balance.md §5)
$env:SEARCH_TIME='400'; node bot/tools/stats.js --games=60 --workers=12 --policy=search  # разрез по героям + профиль героя: что влияет, что нет (`.docs/skills/bot-balance/SKILL.md`)
node bot/tools/think.js --time=1000 --samples=5          # проба хода с бюджетом времени (тот же код, что в браузере); --turn=0 — лист по глубине вместо «думать ход целиком»
node bot/learn/train.js --games=1500 --epochs=300 --workers=12 --chunk=60   # обучение оценки (.docs/hero-balance.md §18)
# Ученик и Python-тренер удалены (m03565, .docs/hero-balance.md §64): команд `rank.js`, `trainer/*` и политики `qprior` больше нет;
# замеры идут живым ботом — `matrix.js`/`stats.js` политикой `search` с выученным листом (.docs/hero-balance.md §62–§63).
node tests/support/bake-tiles.mjs            # плитки → public/patterns + проба
python tests/support/bake-wordmark.py       # логотип: знак-сетка + слово Onest в кривых → app/svg/brand/logo*.svg (шрифт — tests/support/fonts/Onest-700.ttf)
node tests/support/bake-brand.mjs            # знак-сетка → app/svg/brand/mark*.svg; иконки для URL → public/favicon*, icon-*.png (нужен sharp)
python tests/support/bake-logo.py            # прошлый знак (скруглённая U) → app/svg/brand/legacy (нужны fontTools, brotli, uharfbuzz)
node tests/support/pattern-preview.mjs       # превью текстур → PNG в системный temp
node tests/support/reference-stats.mjs       # сводка по колодам → .docs/reference-stats.md
node tests/support/deck-stats.mjs            # сводка по нашим колодам → .docs/hero-balance.md §8
node node_modules\prettier\bin\prettier.cjs --write <файлы…>
pnpm docs:check                               # документация: каждый файл есть в карте, frontmatter, живые ссылки
node node_modules\nuxt\bin\nuxt.mjs build    # ожидаем BUILD_EXIT=0
```

## 6. Проверки

- **Вёрстку и стили агент не проверяет вообще** (требование владельца): шаблоны, классы, цвета, размеры,
  отступы, шрифты, флаги отрисовки — это владелец смотрит глазами сама. Ни тестов, ни сборки после таких
  правок не гоняем: сборка `nuxt build` идёт 5–6 минут, и это время тратится зря. Сломанный шаблон тоже
  видно глазами — страница просто не отрисуется.
- **Не гоняем тесты по 20 минут и не гоняем их после каждой правки.** Полный набор — только под системную
  правку (движок, генератор, контент-схемы, конфиг сборки, зависимости), которую владелец явно просил
  проверить.
- Логика — тесты затронутого файла, не весь набор.
- Системное (движок, генератор, контент-схемы, конфиг сборки, зависимости) — весь набор + фаззинг + сборка.
- Shell — PowerShell 5.1, только `node node_modules\...` вместо `pnpm exec`; повышение прав не запрашиваем.
- Документация — `pnpm docs:check`: каждый док упомянут в карте `AGENTS.md`, у правил и скилов
  есть frontmatter, относительные ссылки живые.
- **Текст файлов правим только инструментами правки** (`read`/`edit`/`write` или Node с `fs` в UTF-8).
  `Get-Content`/`Set-Content` в PowerShell 5.1 читают UTF-8 как ANSI и превращают кириллицу в мусор
  (`app/composables/ui/useBoardMap.js` и `server/utils.js` уже пострадали; лечится обратным маппингом
  cp1251 → UTF-8, но лучше не доводить).

## 7. Скилы

| Задача | Скил |
| --- | --- |
| Новый герой целиком: пак, карты, паспорт, тесты | `.docs/skills/new-hero/SKILL.md` |
| Новая карта или правка текста карты | `.docs/skills/new-card/SKILL.md` |
| Правка движка: хук, фаза, действие, факт | `.docs/skills/engine-change/SKILL.md` |
| Новый компонент или экран | `.docs/skills/new-component/SKILL.md` |
| Замер бота и разбор его находок | `.docs/skills/bot-measure/SKILL.md` |
| Переучивание бота, победы по всем героям, профиль героя (что влияет, что нет), рекомендации по коридору | `.docs/skills/bot-balance/SKILL.md` |
| Аудит перед merge: что проверить целиком | `.docs/skills/audit/SKILL.md` |
| Ревью диффа по правилам проекта | `.docs/skills/code-review/SKILL.md` |

Скил — это порядок работы и чек-лист, а не второй экземпляр правил: правила кода в `.docs/rules/`, каждая
фича — в своём файле из таблицы выше. Каталог и формат — `.docs/skills/README.md`.
