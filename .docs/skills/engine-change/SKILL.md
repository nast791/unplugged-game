---
name: engine-change
description: Правка движка: где живёт правило, фаза, действие и факт, проекция состояния, тесты, неизменность, сборка.
---

# Движок

## Когда брать

- Меняются хуки, фазы, действия, факты, правила боя, окна выбора, проекция состояния.
- Контент (карта, герой) выражается существующими средствами — это `new-card`/`new-hero`. Сначала убедись, что нужного факта или действия правда нет, иначе в движке заведётся механика под один текст.
- Второй экземпляр правила уже есть — не заводить третий, а свести в одно место (`.docs/rules/architecture.mdc`).

## Порядок работы

1. **Правило.** `shared/rules/run.js` — прогон `rules` по моменту; правила одного момента независимы, условия читаются до действий (`.docs/engine.md:20`).
2. **Хук и фаза.** Хуки и их порядок — `shared/constants/hooks.js` (`lifecycle`, `turn`, `combat`); кирпичи хуков — `shared/lifecycle/` (`lifecycleHooks`, `isCoreHook` в `shared/lifecycle/registry.js`); брики — `shared/phases/<name>.js` (`handLimit`, `choose`, `movement`, `attack`, `defense`, `waiting`, `place`, `pickNumHero`, `finished`).
3. **Действие.** `shared/actions/<домен>.js`; регистрация в `shared/actions/index.js` (движок, контент, бот) или в `shared/actions/moves.js` (`commonMoves`, для клиента). Действие без записи в реестр не существует.
4. **Факт.** `shared/facts/<домен>.js`, реестр — `shared/facts/registry.js`; факт — чистая функция от `state`, без побочек.
5. **Проекция.** `shared/constants/state.js` (`stateFields`, `playerFields`) и `server/party.js` (`projectTargeting`, `projectMovement`, `projectCombat`): новое поле попадает в проекцию и в тест, иначе клиент и бот его не увидят.
6. **Константы.** Числа — `shared/constants/tuning.js`; моменты — `moments.js`; хуки — `hooks.js`. Не хардкодить в правиле то, что уже лежит в константах.
7. **Тесты.** `tests/unit/core/*` (правила, факты, ход, форк) и `tests/unit/phases/*`; новое поведение — отдельный тест рядом, а не в чужом файле.
8. **Неизменность.** Новую правимую ветку состояния провести через `shared/helpers/fork.js`, затем `tests/unit/core/immutability.test.js`.
9. **Фаззинг и сборка.** Пара, стол, полный набор, `nuxt build` — движок и есть та системная правка, ради которой всё это гоняется (`AGENTS.md` §6).

## Напоминания

- **Механика изменила смысл — сверь бумагу.** Движок поменял правило, статус, лимит или проекцию — паспорта
  героев, которые этим пользуются, и `bot/play/plans.js` могли устареть в тот же миг: в паспорте живут
  «плюсы», «минусы» и приёмы, которые держатся на числах и на поведении движка. Найти затронутые — `grep` по
  имени действия/факта/статуса в `server/content/**/passport.md` и `.docs/`. Порядок сверки —
  `.docs/skills/new-card/SKILL.md`, раздел «Сверка с паспортом и планом».
- Правила одного момента независимы; порядок объектов в `rules` не даёт приоритета (`.docs/engine.md:20`).
- Неизвестный момент — ошибка (`isMoment`), а не тишина. Новых моментов не выдумывать.
- `Math.random` и `Date.now` в логике запрещены: случайность — от сида (`shared/helpers/random.js`), время — из `state` или от хоста (`.docs/ui.md:89`, `.docs/review-rules.md:46`).
- Ход считается на форке (`shared/helpers/fork.js`); мутировать вход в `runAction` нельзя.
- Правило живёт в `shared/`, а не в паке героя: иначе его не получат остальные герои.

## Что смотреть в проекте

- `.docs/engine.md`, `.docs/rules/internal-logic.mdc`, `.docs/rules/architecture.mdc`, `.docs/pitfalls.md`.
- `shared/core.js`, `shared/publicApi.js`, `shared/constants/moments.js`, `shared/constants/hooks.js`.
- Последствия для клиента: `.docs/cards-ui.md`, `.docs/game-screen.md`.

## Проверки

```powershell
node node_modules\vitest\vitest.mjs run tests/unit/core/ --pool=threads
node node_modules\vitest\vitest.mjs run tests/unit/phases/ --pool=threads
node node_modules\vitest\vitest.mjs run tests/unit/core/immutability.test.js --pool=threads
node node_modules\vitest\vitest.mjs run --pool=threads
node bot/tools/run.js --seeds=200 --heroes=anubis,tesla
node bot/tools/hotseat.js --games=200
$env:UI_SEEDS='10'; node node_modules\vitest\vitest.mjs run tests/scenarios/hotseat-ui.test.js --pool=threads
node node_modules\nuxt\bin\nuxt.mjs build
```

Глубже неизменность: `$env:IMMUTABLE_SEEDS='40'; $env:IMMUTABLE_STEPS='200'` перед прогоном теста (`.docs/engine.md:276`).

## Отчёт

- что изменено по слоям: правило, фаза, действие, факт, проекция — файл и строка;
- новый момент, хук, действие или поле: где зарегистрированы, какой тест их держит;
- неизменность: какая ветка добавлена в форк или почему не потребовалась;
- фаззинг: сиды, находки, полный прогон; сборка — `BUILD_EXIT`;
- риск для существующих героев и как он проверен.
