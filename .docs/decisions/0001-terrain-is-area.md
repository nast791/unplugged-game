# 0001. Стихия — это область

- **Дата:** 2026-11-17
- **Статус:** принято

## Контекст

Клетки на стыке земель принадлежат сразу двум-трём областям. Пока стихия была ярлыком, правила «в области»
и расстановка на цветной клетке видели только основной цвет.

## Решение

`node.terrain` — строка или массив 2–3 стихий, клетка принадлежит всем своим областям. Набор дают
`nodeAllTerrains`, `cellTerrains`, общность — `sharesArea` (`shared/helpers/placement.js`). Временная стихия
живёт в `node.extraTerrain` (`shared/actions/terrain.js`) и базовую не подменяет.

## Следствия

- Расстановка идёт по области номерной клетки (`startAreaCellIds`); контракт — `.docs/terrain.md` §7.
- Генератор не берёт цветную клетку на старт: `isSingleTerrainCell` (`shared/helpers/mapGenerator.js`).
- Клиент рисует добавку отдельно: `app/composables/ui/useBoardMap.js` (`terrainsOf`, `permanentCountOf`).
- Тесты: `tests/unit/core/terrain.test.js`, `tests/unit/core/temporary-terrain.test.js`.

## Альтернативы

- **Строка + флаг «двухцветная».** Отклонено: цвет второй области жил бы отдельно от `terrain`.
- **Временная стихия правкой `node.terrain`.** Отклонено: в конце хода нечего снять, базовая теряется.
