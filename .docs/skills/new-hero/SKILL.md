---
name: new-hero
description: Новый герой целиком: роль и числа, умение, колода на 30 копий, паспорт, регистрация, тесты, фаззинг.
---

# Герой

## Когда брать

- Заводится новый герой: пак, колода, умение, паспорт, картинки.
- Одна карта или правка её чисел — `.docs/skills/new-card/SKILL.md`.
- Механики для умения не хватает в движке — сначала `.docs/skills/engine-change/SKILL.md`, потом обратно сюда.

## Порядок работы

1. **Паспорт и роль.** `.docs/hero-algorithm.md` §1–§9, шаблон — §10. Права и имена — `.docs/content-ip.md`. Роль и **один** приём, вокруг которого строится колода (`.docs/hero-balance.md` §6, шаг 1).
2. **Числа.** Здоровье, дальность, мобильность, помощники — по ориентирам `.docs/hero-balance.md` §2, бюджет — §3.
3. **Стихии.** `terrainAffinity` — идентификаторы из `shared/constants/terrain.js`; список проверяет `tests/unit/content/hero-affinity.test.js`.
4. **Умение.** В `server/content/heroes/<id>/index.js` поле `skill`: `{ id, type: 'skill', fighter, title, text, rules }`, правила — `[{ moment, when, then }]`. Момент — только из `shared/constants/moments.js`; `when` — факты из `shared/facts/registry.js`; `then` — действия из `shared/actions/index.js`. Текст — с меткой момента, словарь — `.docs/hero-algorithm.md:491`.
5. **Новое поле движка не заводить**, пока хватает существующих фактов и действий. Нужен новый факт или действие — через `engine-change`.
6. **Колода** `cards.js`: 12–13 уникальных карт на 30 копий, каркас, копии и владельцы — `.docs/hero-balance.md` §6, шаги 3–6. Формат одной карты, её тип и текст — `.docs/skills/new-card/SKILL.md`; поле называется `title`, а не `name`.
7. **Числа — в `shared/constants/tuning.js`**, а не в паке: карта несёт только контентные `value`/`bonus`/`quantity`, стихии — только из общих списков.
8. **`passport.md`** по шаблону `.docs/hero-algorithm.md` §10: числа, роль, матчапы, «почему так», открытые вопросы (там же §9). Комментариев в паке не пишем — разбор живёт в паспорте (`.docs/content-ip.md`). **Раздел «Стратегия бота»** — манера, фазы, плюсы, минусы, стратегии и приёмы (формат — `.docs/hero-algorithm.md` §11); та же стратегия в виде данных — запись героя в `bot/play/plans.js` (`state: 'ready'`), иначе герой остаётся `draft` и тест `tests/unit/bot/plans.test.js` этого не пропустит. **Чек-лист бота обязателен:** раздел заканчивается таблицей «Что сделано в боте (чек-лист)» — по строке на каждую стратегию, с пометкой ✅ / ⚠️ / ❌ и тем, что именно есть в `bot/play/` (формат — `.docs/hero-algorithm.md` §11). Без него паспорт не считается дописанным: пометки проверяются кодом, а не памятью. **Правка умения уже существующего героя** идёт тем же путём: сначала паспорт (раздел про умение и «Стратегия бота»), потом `index.js` — сверка бумаги после правок карт и умений описана в `.docs/skills/new-card/SKILL.md`.
9. **Регистрация.** `server/content/index.js`: `import` пака, `import` колоды, запись в `heroes` через `withCards`. Отдельного `server/content/heroes/index.js` нет.
10. **Арт.** Файлы в `server/content/heroes/<id>/images/`, имена объявлены в паке; URL собирает `server/utils.js: heroImageUrl`. Набор картинок и промт — `.docs/hero-algorithm.md` §8.
11. **Тесты.** Правило каждой карты — `tests/unit/cards/<герой>_<NN>.test.js`; умение — `tests/unit/skills/<герой>.test.js`; фикстуры — `tests/fixtures/state.js`.
12. **Фаззинг** пары и стола, затем отчёт.

## Что смотреть в проекте

- Живые паки: `server/content/heroes/{anubis,dorothy,ifrit,medusa,snow-queen,tesla}/` — `index.js` с предметами, метками (`tags`), стихиями и `skill`, `cards.js`, `passport.md`.
- Реестр контента — `server/content/index.js`; сводка героя (`buildHeroSummary`) — `server/builders.js`.
- Стражи контента в `tests/unit/content/`: `deck-size` (30 копий), `card-names`, `card-types`, `deck-bonus`, `hero-affinity`, `hero-tags`, `hero-images`, `hero-summary`.
- Что движок умеет выразить в картах — `.docs/card-capabilities.md`; общий пул и его мета — `.docs/common-cards.md`.

## Проверки

```powershell
node node_modules\vitest\vitest.mjs run tests/unit/cards/<герой>_01.test.js --pool=threads
node node_modules\vitest\vitest.mjs run tests/unit/skills/<герой>.test.js --pool=threads
node node_modules\vitest\vitest.mjs run tests/unit/content/ --pool=threads
node tests/support/deck-stats.mjs
node bot/tools/run.js --seeds=200 --heroes=<id>,tesla
node bot/tools/hotseat.js --games=200
```

Новый герой — контент, а не системная правка: полный прогон и `nuxt build` здесь не нужны (`AGENTS.md` §6, `.docs/testing.md` «Объём: сколько гонять»).

## Отчёт

- id, роль, числа героя и помощников, стихии, умение с моментом и окнами выбора;
- колода: сколько уникальных и копий, типы, владельцы, метки;
- тесты (файлы и итог), фаззинг (сиды, винрейт, длина партии, находки);
- что не проверено и что осталось открытым в паспорте.
