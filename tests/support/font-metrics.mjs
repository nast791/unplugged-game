/**
 * Метрики шрифта интерфейса: высота заглавной (`sCapHeight`) и строчной (`sxHeight`) к `unitsPerEm`.
 *
 * Зачем: знак в логотипе — SVG-буква U из фавиконки (`app/components/lobby/LogoMark.vue`), и её высота
 * должна совпадать с высотой заглавной буквы шрифта, иначе знак «плавает» в строке. Высота задаётся как
 * `h-[<ratio>em]`, а ratio берётся отсюда — на глаз его подбирать не нужно. При смене шрифта запускаем
 * снова и правим один класс.
 *
 * WOFF2 разбирается руками: поток разворачивается `zlib`, таблицы `head` и `OS/2` в нём не
 * трансформированы, поэтому читаются по своим смещениям.
 *
 *   node tests/support/font-metrics.mjs                       # шрифт проекта (Manrope) + Onest для сравнения
 *   node tests/support/font-metrics.mjs <file.woff2> [...]    # конкретные файлы
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/** Порядок тегов WOFF2: индекс в байтах флагов таблицы (спецификация WOFF2, `known tags`). */
const KNOWN_TAGS = [
  'cmap',
  'head',
  'hhea',
  'hmtx',
  'maxp',
  'name',
  'OS/2',
  'post',
  'cvt ',
  'fpgm',
  'glyf',
  'loca',
  'prep',
  'CFF ',
  'VORG',
  'EBDT',
  'EBLC',
  'gasp',
  'hdmx',
  'kern',
  'LTSH',
  'PCLT',
  'VDMX',
  'vhea',
  'vmtx',
  'BASE',
  'GDEF',
  'GPOS',
  'GSUB',
  'EBSC',
  'JSTF',
  'MATH',
  'CBDT',
  'CBLC',
  'COLR',
  'CPAL',
  'SVG ',
  'sbix',
  'acnt',
  'avar',
  'bdat',
  'bloc',
  'bsln',
  'cvar',
  'fdsc',
  'feat',
  'fmtx',
  'fvar',
  'gvar',
  'hsty',
  'just',
  'lcar',
  'mort',
  'morx',
  'opbd',
  'prop',
  'trak',
  'Zapf',
  'Silf',
  'Glat',
  'Gloc',
  'Feat',
  'Sill',
];

/** Разбор WOFF2: каталог таблиц + brotli-поток. Возвращает найденные таблицы по тегам. */
const readWoff2 = file => {
  const buf = fs.readFileSync(file);
  const numTables = buf.readUInt16BE(12);
  let pos = 48;

  const readBase128 = () => {
    let value = 0;
    for (let i = 0; i < 5; i += 1) {
      const byte = buf[pos];
      pos += 1;
      value = (value << 7) | (byte & 0x7f);
      if (!(byte & 0x80)) break;
    }
    return value;
  };

  const directory = [];
  for (let i = 0; i < numTables; i += 1) {
    const flags = buf[pos];
    pos += 1;
    const tagIndex = flags & 0x3f;
    const transformVersion = (flags >> 6) & 0x03;
    const tag = tagIndex === 0x3f ? buf.toString('latin1', pos, (pos += 4)) : KNOWN_TAGS[tagIndex];
    const origLength = readBase128();
    // у glyf/loca трансформированным считается вариант 0, у остальных таблиц — только 3
    const isGlyfLoca = tag === 'glyf' || tag === 'loca';
    const transformed = isGlyfLoca ? transformVersion !== 3 : transformVersion === 3;
    directory.push({ tag, length: transformed ? readBase128() : origLength });
  }

  const raw = zlib.brotliDecompressSync(buf.subarray(pos));
  const tables = {};
  let offset = 0;
  for (const table of directory) {
    tables[table.tag] = raw.subarray(offset, offset + table.length);
    offset += table.length;
  }
  return tables;
};

const metricsOf = file => {
  const tables = readWoff2(file);
  const unitsPerEm = tables.head.readUInt16BE(18);
  const os2 = tables['OS/2'];
  const version = os2.readUInt16BE(0);
  if (version < 2) throw new Error(`${path.basename(file)}: OS/2 v${version} без sCapHeight`);
  return {
    unitsPerEm,
    capHeight: os2.readUInt16BE(88),
    xHeight: os2.readInt16BE(86),
  };
};

const filesFromArgs = () => {
  if (process.argv.length > 2) return process.argv.slice(2);
  // Шрифты интерфейса лежат в `public/fonts/` (`app/assets/styles.css`), пакетов `@fontsource` в проекте нет.
  const dir = path.join('public', 'fonts');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(name => name.endsWith('.woff2') && !name.includes('ext'))
    .map(name => path.join(dir, name));
};

for (const file of filesFromArgs()) {
  const { unitsPerEm, capHeight, xHeight } = metricsOf(file);
  const cap = capHeight / unitsPerEm;
  console.log(`${path.basename(file)}`);
  console.log(`  unitsPerEm ${unitsPerEm} · cap ${capHeight} → ${cap.toFixed(4)}em · x ${xHeight}`);
  console.log(`  знак в логотипе: h-[${cap.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}em]`);
}
