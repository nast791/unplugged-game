/**
 * Сводка по сканам оригинальных колод из `.refs/_stats/*.csv`.
 *
 * Данные снимают с картинок `.refs/<герой>/NN.webp`: тип карты, значение, усиление, число копий,
 * владелец и короткие пометки механик. Скрипт ничего не пишет — только считает и печатает markdown,
 * который переносится в `docs/reference-stats.md`.
 *
 * Запуск: node tests/support/reference-stats.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const STATS_DIR = join(process.cwd(), '.refs', '_stats');

/** Минимальный CSV-разбор: поля в кавычках поддерживаются, чего нет — то не нужно. */
const parseCsv = text =>
  text
    .split(/\r?\n/)
    .filter(line => line.trim() !== '')
    .map(line => {
      const fields = [];
      let field = '';
      let quoted = false;
      for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        if (quoted) {
          if (char === '"' && line[index + 1] === '"') {
            field += '"';
            index += 1;
          } else if (char === '"') {
            quoted = false;
          } else {
            field += char;
          }
        } else if (char === '"') {
          quoted = true;
        } else if (char === ',') {
          fields.push(field);
          field = '';
        } else {
          field += char;
        }
      }
      fields.push(field);
      return fields.map(value => value.trim());
    });

const toRows = (files, columns) => {
  const rows = [];
  for (const file of files) {
    const lines = parseCsv(readFileSync(join(STATS_DIR, file), 'utf8'));
    for (const line of lines.slice(1)) {
      const row = { __file: file };
      columns.forEach((name, index) => {
        row[name] = line[index] ?? '';
      });
      if (row[columns[0]]) rows.push(row);
    }
  }
  return rows;
};

const number = value => {
  const parsed = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) && String(value ?? '').trim() !== '' ? parsed : null;
};

/**
 * Разбор писали несколько агентов, и часть заметок вышла двойной кодировкой
 * (UTF-8 прочитали как CP1251). Текст восстановим в памяти, файлы не трогаем.
 */
const cp1251ToByte = (() => {
  const decoder = new TextDecoder('windows-1251');
  const map = new Map();
  for (let byte = 0; byte < 256; byte += 1) {
    map.set(decoder.decode(Uint8Array.from([byte])), byte);
  }
  return map;
})();

const readableCyrillic = /^[А-Яа-яЁё0-9 .,;:!?()«»—–\-/×+%"'№†]*$/;
const repairNote = text => {
  if (!/[РС][А-Яа-яІіЇїЄє]/.test(text)) return text;
  const bytes = [];
  for (const char of text) {
    const byte = cp1251ToByte.get(char);
    if (byte == null) return text;
    bytes.push(byte);
  }
  const repaired = new TextDecoder('utf-8').decode(Uint8Array.from(bytes));
  return readableCyrillic.test(repaired) && /[А-Яа-яЁё]/.test(repaired) ? repaired : text;
};

const avg = list => (list.length === 0 ? null : list.reduce((sum, x) => sum + x, 0) / list.length);
const median = list => {
  if (list.length === 0) return null;
  const sorted = [...list].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};
const fix = (value, digits = 2) => (value == null ? '—' : value.toFixed(digits).replace('.', ','));
const share = (part, total) =>
  total === 0 ? '—' : `${((part / total) * 100).toFixed(1).replace('.', ',')}%`;

const histogram = (list, keys) => {
  const counts = new Map();
  for (const item of list) counts.set(item, (counts.get(item) ?? 0) + 1);
  const order = keys ?? [...counts.keys()].sort((a, b) => a - b);
  return order.map(key => `${key}: ${counts.get(key) ?? 0}`).join(' · ');
};

let entries = [];
try {
  entries = readdirSync(STATS_DIR);
} catch {
  console.log(`Нет папки ${STATS_DIR}: сначала соберите CSV разбора.`);
  process.exit(0);
}

const cardFiles = entries.filter(name => name.endsWith('-cards.csv'));
const heroFiles = entries.filter(name => name.endsWith('-heroes.csv'));

/** Не-UTF-8 файл (например, записанный в CP1251) даёт символ замены — о таком лучше знать сразу. */
const brokenEncoding = [...cardFiles, ...heroFiles].filter(name =>
  readFileSync(join(STATS_DIR, name), 'utf8').includes('\uFFFD'),
);

/**
 * Разбор шёл партиями (`batchN-cards.csv`) и по отдельным героям (`<герой>-cards.csv`).
 * Файл героя — уточнение: он важнее строк того же героя из партии (перечитка после правки разметки).
 * Карты и панели героев считаем отдельно: у части героев перечитаны только карты.
 */
const perHeroOf = (names, suffix) =>
  new Set(names.filter(name => !name.startsWith('batch')).map(name => name.replace(suffix, '')));
const perHeroCards = perHeroOf(cardFiles, /-cards\.csv$/);
const perHeroHeroes = perHeroOf(heroFiles, /-heroes\.csv$/);
const overridden = (row, perHero) => row.__file.startsWith('batch') && perHero.has(row.hero);

/** Предметы вне колоды (`itemN.webp`) в средние по картам не входят — считаем их отдельно. */
const isItem = card => /^item/i.test(card.file);
const allCards = toRows(cardFiles, [
  'hero',
  'file',
  'type',
  'value',
  'boost',
  'copies',
  'owner',
  'flags',
]);

/**
 * Владельца писали и кодом (`hero` / `any` / `sidekick`), и словом с карты («ВСЕ» или имя бойца),
 * поэтому перед подсчётом приводим всё к трём кодам: имя героя — карта героя, любое другое имя — помощник.
 */
const normalizeOwner = card => {
  const raw = String(card.owner ?? '').trim();
  const key = raw.toLowerCase();
  if (key === 'any' || key === 'все' || key === 'all') return 'any';
  if (key === 'hero' || key === 'sidekick') return key;
  if (raw === '' || raw === '?') return '?';
  return key === String(card.hero).toLowerCase() ? 'hero' : 'sidekick';
};
const withOwner = rows => rows.map(row => ({ ...row, owner: normalizeOwner(row) }));
const cards = withOwner(allCards.filter(card => !overridden(card, perHeroCards) && !isItem(card)));
const items = withOwner(allCards.filter(card => !overridden(card, perHeroCards) && isItem(card)));
const heroes = toRows(heroFiles, [
  'hero',
  'hp',
  'move',
  'range',
  'sidekicks',
  'sidekick_hp',
  'note',
]).filter(hero => !overridden(hero, perHeroHeroes));

const heroesWithCards = [...new Set(cards.map(card => card.hero))];
/** Незаполненный владелец — не «нет владельца», а «не прочиталось»: из долей такие строки выкидываем. */
const ownedCards = cards.filter(
  card => card.owner === 'hero' || card.owner === 'any' || card.owner === 'sidekick',
);
/** Пустое значение у эффекта — норма, поэтому у чисел считаем только явное «?». */
const unknown = field =>
  cards.filter(card =>
    ['value', 'boost', 'copies'].includes(field)
      ? card[field] === '?'
      : card[field] === '?' || card[field] === '',
  ).length;

console.log(`# Сводка разбора\n`);
console.log(`Файлов карт: ${cardFiles.length}, файлов героев: ${heroFiles.length}`);
console.log(`Героев с картами: ${heroesWithCards.length}, строк-карт: ${cards.length}`);
console.log(`Предметов вне колоды: ${items.length}`);
console.log(
  `Не читается: тип ${unknown('type')}, значение ${unknown('value')}, усиление ${unknown('boost')}, копии ${unknown('copies')}, владелец ${cards.length - ownedCards.length}\n`,
);
if (brokenEncoding.length > 0) {
  console.log(`Не UTF-8 (проверить кодировку): ${brokenEncoding.join(', ')}\n`);
}

const perHero = heroesWithCards
  .map(hero => {
    const own = cards.filter(card => card.hero === hero);
    const byType = type => own.filter(card => card.type === type);
    const values = type =>
      byType(type)
        .map(card => number(card.value))
        .filter(value => value != null);
    const copies = own.map(card => number(card.copies)).filter(value => value != null);
    return {
      hero,
      unique: own.length,
      atk: byType('atk').length,
      def: byType('def').length,
      ver: byType('ver').length,
      sch: byType('sch').length,
      owners: {
        hero: own.filter(card => card.owner === 'hero').length,
        any: own.filter(card => card.owner === 'any').length,
        sidekick: own.filter(card => card.owner === 'sidekick').length,
      },
      attackValues: [...values('atk'), ...values('ver')],
      defenseValues: [...values('def'), ...values('ver')],
      boosts: own.map(card => number(card.boost)).filter(value => value != null),
      copies,
      deckSize: copies.reduce((sum, x) => sum + x, 0),
      /** Строки карт героя — для средних «по копиям» (сколько таких карт реально лежит в колоде). */
      weights: own.map(card => ({
        type: card.type,
        value: number(card.value),
        boost: number(card.boost),
        copies: number(card.copies) ?? 1,
      })),
      flags: own
        .flatMap(card => (card.flags ? card.flags.split(';').map(x => x.trim()) : []))
        .filter(Boolean),
    };
  })
  .sort((left, right) => left.hero.localeCompare(right.hero));

/** Средневзвешенное по копиям: карта в трёх копиях весит втрое. */
const weighted = (rows, field, types) => {
  let sum = 0;
  let weight = 0;
  for (const row of rows) {
    if (types && !types.includes(row.type)) continue;
    if (row[field] == null) continue;
    sum += row[field] * row.copies;
    weight += row.copies;
  }
  return weight === 0 ? null : sum / weight;
};
const allWeightRows = perHero.flatMap(hero => hero.weights);

/**
 * Полная колода — та, где в альбоме есть все копии: не меньше 30 карт.
 * Ширину колоды считаем только по полным: у неполных часть карт просто не отсканирована.
 */
const COMPLETE_DECK = 30;
const completeDecks = perHero.filter(hero => hero.deckSize >= COMPLETE_DECK);
const incompleteDecks = perHero.filter(hero => hero.deckSize < COMPLETE_DECK);
const uniqueCounts = completeDecks.map(hero => hero.unique);
console.log(`## Уникальных карт на героя\n`);
console.log(
  `Считано по ${completeDecks.length} полным колодам (не меньше ${COMPLETE_DECK} карт по копиям): среднее ${fix(avg(uniqueCounts))}, медиана ${fix(median(uniqueCounts), 1)}, минимум ${Math.min(...uniqueCounts)}, максимум ${Math.max(...uniqueCounts)}`,
);
console.log(`\nРаспределение: ${histogram(uniqueCounts)}`);
console.log(
  `\nНеполные колоды (из ширины исключены): ${incompleteDecks.map(hero => `${hero.hero} — ${hero.deckSize}`).join(', ')}`,
);
console.log(
  `\nДля справки, по всем ${perHero.length} колодам вышло бы ${fix(avg(perHero.map(hero => hero.unique)))} уникальных.\n`,
);

const allAttack = perHero.flatMap(hero => hero.attackValues);
const allDefense = perHero.flatMap(hero => hero.defenseValues);
const allBoosts = perHero.flatMap(hero => hero.boosts);
const allCopies = perHero.flatMap(hero => hero.copies);
console.log(`## Значения\n`);
console.log(
  `Средние — по уникальным картам; «по копиям» — средневзвешенное, где карта в трёх копиях весит втрое.\n`,
);
console.log(
  `Атака (атаки + гибриды, ${allAttack.length} карт): среднее ${fix(avg(allAttack))}, по копиям ${fix(weighted(allWeightRows, 'value', ['atk', 'ver']))}, медиана ${fix(median(allAttack), 1)}, максимум ${Math.max(...allAttack)}`,
);
console.log(`\nРаспределение атак: ${histogram(allAttack)}\n`);
console.log(
  `Защита (защиты + гибриды, ${allDefense.length} карт): среднее ${fix(avg(allDefense))}, по копиям ${fix(weighted(allWeightRows, 'value', ['def', 'ver']))}, медиана ${fix(median(allDefense), 1)}, максимум ${Math.max(...allDefense)}`,
);
console.log(`\nРаспределение защит: ${histogram(allDefense)}\n`);
console.log(
  `Усиление (${allBoosts.length} карт): среднее ${fix(avg(allBoosts))}, по копиям ${fix(weighted(allWeightRows, 'boost'))}, медиана ${fix(median(allBoosts), 1)}, максимум ${Math.max(...allBoosts)}`,
);
console.log(`\nРаспределение усилений: ${histogram(allBoosts)}\n`);
console.log(
  `Копии (${allCopies.length} карт): среднее ${fix(avg(allCopies))}, распределение ${histogram(allCopies, [1, 2, 3, 4])}\n`,
);
console.log(
  `Размер колоды по копиям: среднее ${fix(avg(perHero.map(hero => hero.deckSize)), 1)} карт (минимум ${Math.min(...perHero.map(hero => hero.deckSize))}, максимум ${Math.max(...perHero.map(hero => hero.deckSize))})\n`,
);

const sumBy = (key, list = perHero) => list.reduce((sum, hero) => sum + hero[key], 0);
console.log(`## Типы карт на героя\n`);
for (const [name, key] of [
  ['Атаки', 'atk'],
  ['Защиты', 'def'],
  ['Гибриды', 'ver'],
  ['Эффекты', 'sch'],
]) {
  console.log(
    `${name}: ${fix(avg(perHero.map(hero => hero[key])))} на героя, ${share(sumBy(key), cards.length)} всех карт`,
  );
}
console.log(
  `\nТолько по ${completeDecks.length} полным колодам: ${['Атаки', 'Защиты', 'Гибриды', 'Эффекты'].map((name, index) => `${name.toLowerCase()} ${fix(avg(completeDecks.map(hero => hero[['atk', 'def', 'ver', 'sch'][index]])))}`).join(', ')}.\n`,
);

console.log(`## Владельцы карт\n`);
console.log(`Считано по ${ownedCards.length} картам с читаемым владельцем (из ${cards.length}).\n`);
for (const [key, name] of [
  ['hero', 'только герой'],
  ['any', 'любой боец'],
  ['sidekick', 'помощники'],
]) {
  const total = perHero.reduce((sum, hero) => sum + hero.owners[key], 0);
  console.log(
    `${name}: ${fix(avg(perHero.map(hero => hero.owners[key])))} на героя, ${share(total, ownedCards.length)} карт`,
  );
}
console.log('');

const flagCounts = new Map();
const flagHeroes = new Map();
for (const hero of perHero) {
  for (const flag of new Set(hero.flags)) flagHeroes.set(flag, (flagHeroes.get(flag) ?? 0) + 1);
  for (const flag of hero.flags) flagCounts.set(flag, (flagCounts.get(flag) ?? 0) + 1);
}
console.log(`## Пометки механик\n`);
console.log(`| Пометка | Карт | Героев |`);
console.log(`| --- | --- | --- |`);
for (const [flag, count] of [...flagCounts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`| ${flag} | ${count} | ${flagHeroes.get(flag) ?? 0} |`);
}
console.log('');
console.log(`## Пометки по героям\n`);
for (const [flag] of [...flagCounts.entries()].sort((a, b) => b[1] - a[1])) {
  const who = perHero
    .filter(hero => hero.flags.includes(flag))
    .map(hero => hero.hero)
    .sort((left, right) => left.localeCompare(right));
  console.log(`- **${flag}**: ${who.join(', ')}`);
}
console.log('');

const hp = heroes.map(hero => number(hero.hp)).filter(value => value != null);
const moves = heroes.map(hero => number(hero.move)).filter(value => value != null);
const sidekicks = heroes.map(hero => number(hero.sidekicks)).filter(value => value != null);
const ranged = heroes.filter(hero => String(hero.range).toLowerCase().startsWith('r')).length;
console.log(`## Герои\n`);
console.log(
  `Здоровье: среднее ${fix(avg(hp), 1)}, медиана ${fix(median(hp), 0)}, от ${Math.min(...hp)} до ${Math.max(...hp)}`,
);
console.log(`\nРаспределение здоровья: ${histogram(hp)}\n`);
console.log(`Перемещение: среднее ${fix(avg(moves), 2)}, распределение ${histogram(moves)}\n`);
console.log(
  `Дальний бой: ${ranged} героев из ${heroes.length} (${share(ranged, heroes.length)})\n`,
);
console.log(
  `Помощники: среднее ${fix(avg(sidekicks), 2)} на героя, без помощников ${sidekicks.filter(x => x === 0).length} героев, распределение ${histogram(sidekicks)}\n`,
);

console.log(`## По героям\n`);
console.log(
  `| Герой | Уник. | Атаки | Защиты | Гибриды | Эффекты | Ср. атака | Ср. защита | Ср. усил. | Герой | Any | Помощ. | Колода |`,
);
console.log(`| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |`);
for (const hero of perHero) {
  console.log(
    `| ${hero.hero} | ${hero.unique} | ${hero.atk} | ${hero.def} | ${hero.ver} | ${hero.sch} | ${fix(avg(hero.attackValues), 2)} | ${fix(avg(hero.defenseValues), 2)} | ${fix(avg(hero.boosts), 1)} | ${hero.owners.hero} | ${hero.owners.any} | ${hero.owners.sidekick} | ${hero.deckSize} |`,
  );
}

console.log(`\n## Заметки по героям\n`);
for (const hero of [...heroes].sort((left, right) => left.hero.localeCompare(right.hero))) {
  console.log(
    `- **${hero.hero}** — ${hero.hp} hp, шаг ${hero.move}, ${hero.range}, помощников ${hero.sidekicks}: ${repairNote(hero.note)}`,
  );
}
