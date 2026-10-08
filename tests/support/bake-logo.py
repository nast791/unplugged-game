#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Запекание **прошлой** версии логотипа UnPlugged (`app/svg/brand/legacy/`).

Знак здесь — скруглённая буква U из старой фавиконки, слово — Manrope в кривых. Текущий знак — пиксельная
сетка 3×3, её собирает `tests/support/bake-brand.mjs`; этот бейкер оставлен, чтобы прежний логотип можно
было пересобрать и не потерять (решение владельца: старый логотип храним в SVG).

Слово «nPlugged» переводится **в кривые**: SVG логотипа не должен зависеть от того, установлен ли
шрифт у того, кто его откроет (иначе в Illustrator/Figma/на печати буквы подменятся запасным
шрифтом — это и есть «качество страдает»). Кривые снимаются с того же файла шрифта, что грузит
фронтенд, кернинг считает HarfBuzz, поэтому слово совпадает с вёрсткой лобби: Manrope Variable,
weight 600, tracking-tight (−0.025em). Высота заглавной Manrope — `1440/2000 = 0.72em`
(`tests/support/font-metrics.mjs`), знак рисуется ровно в неё.

Знак берётся из старой `public/favicon.svg` (копия — `app/svg/brand/legacy/favicon-u.svg`) — геометрия
буквы U и облака пикселей оттуда, без перерисовки. Единственная правка против неё: градиент задан в
координатах знака (`userSpaceOnUse`), а не по рамке каждого элемента, — там каждый квадратик облака
получал свою полную радугу cyan → violet → pink и облако читалось пёстрым.

Запуск (нужны fontTools, brotli, uharfbuzz):
  python tests/support/bake-logo.py
Инструмент разработки: в сборку не входит, нужен только для пересборки логотипа.
"""

import glob
import os
import sys
import tempfile

import uharfbuzz as hb
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_DIR = os.path.join(ROOT, 'app', 'svg', 'brand', 'legacy')

TEXT = 'nPlugged'
WEIGHT = 600
TRACKING_EM = -0.025  # tracking-tight из Tailwind, как в компоненте логотипа

# Цвета знака (docs/ui-plan.md §9.2): голубой — информация, фиолетовый и розовый — цвета знака.
CYAN, VIOLET, PINK = '#22D3EE', '#8B5CF6', '#D946EF'
# Тот же градиент, но для светлого фона: те же три цвета на ступень темнее, иначе голубой на белом слепнет.
CYAN_D, VIOLET_D, PINK_D = '#0891B2', '#7C3AED', '#C026D3'

# Геометрия знака из public/favicon.svg (система координат фавиконки 100×80).
MARK_U = 'M22 15 V48 C22 62 35 72 50 72 C65 72 78 62 78 48 V15 H65 V48 C65 55 58 60 50 60 C42 60 35 55 35 48 V15 H22Z'
MARK_CLOUD_U = 'M22 15 V48 C22 62 35 72 50 72 C65 72 78 62 78 48 V42 H65 V48 C65 55 58 60 50 60 C42 60 35 55 35 48 V15 H22Z'
MARK_BOX = (22.0, 15.0, 78.0, 72.0)  # x0, y0, x1, y1 — рамка буквы
CLOUD = [  # облако пикселей: x, y, размер, прозрачность — как в фавиконке
    (75, 15, 7, 1.0),
    (85, 22, 5, 1.0),
    (80, 5, 4, 1.0),
    (90, 12, 3, 1.0),
    (88, 2, 2, 1.0),
    (70, 2, 3, 1.0),
    (82, 18, 3, 1.0),
    (86, 32, 4, 0.7),
]


def fmt(value):
    """Число в SVG: без хвостовых нулей, координаты — до сотых."""
    text = f'{round(float(value), 2):.2f}'.rstrip('0').rstrip('.')
    return '0' if text in ('', '-0') else text


def font_file():
    # Шрифт берём тот же, что рисует живой логотип в лобби (`--font-display` из `app/assets/styles.css`):
    # иначе запечённое слово разойдётся с тем, что видно на странице. Сейчас это Manrope Variable,
    # и файл шрифта лежит в проекте — `public/fonts/manrope-latin.woff2`.
    path = os.path.join(ROOT, 'public', 'fonts', 'manrope-latin.woff2')
    if not os.path.exists(path):
        sys.exit('не найден Manrope Variable: ожидается public/fonts/manrope-latin.woff2')
    return path


def load_instance(weight):
    """Шрифт, зафиксированный на нужном весе: один и тот же файл читают и HarfBuzz, и контуры."""
    font = TTFont(font_file())
    font.flavor = None
    if 'fvar' in font:
        instancer.instantiateVariableFont(font, {'wght': weight}, inplace=True, updateFontNames=False)
    handle, path = tempfile.mkstemp(suffix='.ttf', prefix='manrope-')
    os.close(handle)
    font.save(path)
    return font, path


def shape(path):
    """Раскладка строки: id глифов, позиции (кернинг считает HarfBuzz). Лигатуры выключены."""
    blob = hb.Blob.from_file_path(path)
    face = hb.Face(blob)
    font = hb.Font(face)
    buf = hb.Buffer()
    buf.add_str(TEXT)
    buf.direction = 'ltr'
    buf.script = 'Latn'
    buf.language = 'en'
    hb.shape(font, buf, {'kern': True, 'liga': False, 'calt': False})
    return list(zip(buf.glyph_infos, buf.glyph_positions))


def glyph_path(font, name, offset_x):
    """Контур глифа в координатах SVG: единицы шрифта, начало координат — базовая линия."""
    glyph_set = font.getGlyphSet()
    transform = (1, 0, 0, -1, offset_x, 0)  # шрифт смотрит вверх, SVG — вниз
    pen = SVGPathPen(glyph_set, ntos=fmt)
    bounds_pen = BoundsPen(glyph_set)
    glyph_set[name].draw(TransformPen(pen, transform))
    glyph_set[name].draw(TransformPen(bounds_pen, transform))
    return pen.getCommands(), bounds_pen.bounds


def union(box, other):
    if other is None:
        return box
    if box is None:
        return other
    return (
        min(box[0], other[0]),
        min(box[1], other[1]),
        max(box[2], other[2]),
        max(box[3], other[3]),
    )


def build_wordmark():
    """Слово кривыми: пути, ширина полосы (с трекингом) и чернильная рамка."""
    font, path = load_instance(WEIGHT)
    try:
        shaped = shape(path)
        upem = font['head'].unitsPerEm
        cap_height = font['OS/2'].sCapHeight
        tracking = TRACKING_EM * upem
        paths = []
        pen_x = 0.0
        ink = None
        for index, (info, position) in enumerate(shaped):
            name = font.getGlyphName(info.codepoint)
            offset = pen_x + position.x_offset + index * tracking
            data, bounds = glyph_path(font, name, offset)
            paths.append(data)
            ink = union(ink, bounds)
            pen_x += position.x_advance
        advance = pen_x + len(shaped) * tracking
        return {
            'paths': paths,
            'advance': advance,
            'ink': ink,
            'cap': float(cap_height),
            'upem': float(upem),
        }
    finally:
        os.unlink(path)


def stamp():
    return (
        '  <!--\n'
        '    ПРОШЛАЯ версия логотипа UnPlugged (скруглённая буква U). Собран бейкером\n'
        '    tests/support/bake-logo.py — руками не правим, правки теряются при пересборке.\n'
        '    Текущий знак — пиксельная сетка 3×3, её собирает tests/support/bake-brand.mjs.\n'
        '    Текст переведён в кривые (Manrope Variable, weight 600, tracking −0.025em): файл не зависит\n'
        '    от установленного шрифта. Знак — буква U и облако пикселей из старой public/favicon.svg.\n'
        '  -->\n'
    )


def gradient(gradient_id, x1, y1, x2, y2, stops):
    body = ''.join(f'\n      <stop offset="{offset}" stop-color="{color}"/>' for offset, color in stops)
    return (
        f'    <linearGradient id="{gradient_id}" gradientUnits="userSpaceOnUse"'
        f' x1="{fmt(x1)}" y1="{fmt(y1)}" x2="{fmt(x2)}" y2="{fmt(y2)}">{body}\n'
        '    </linearGradient>'
    )


def transform_path(data, transform):
    """Путь с впечённым преобразованием.

    Трансформы в атрибуте (`<g transform>`) не оставляем: `gradientUnits="userSpaceOnUse"` внутри
    преобразованной группы рендереры понимают по-разному (браузер и librsvg расходятся), и градиент
    знака в одной раскладке читался полосой, а в другой — одним цветом. Все координаты — абсолютные.
    """
    pen = SVGPathPen(None, ntos=fmt)
    parse_path(data, TransformPen(pen, transform))
    return pen.getCommands()


def view_box(box):
    """Рамка (x0, y0, x1, y1) → viewBox: SVG ждёт начало и **размер**, а не второй угол."""
    return ' '.join(fmt(value) for value in (box[0], box[1], box[2] - box[0], box[3] - box[1]))


def write(name, content):
    os.makedirs(OUT_DIR, exist_ok=True)
    target = os.path.join(OUT_DIR, name)
    with open(target, 'w', encoding='utf-8', newline='\n') as handle:
        handle.write(content)
    print(f'{os.path.relpath(target, ROOT)}  {len(content.encode("utf-8"))} Б')


def horizontal(wordmark, mono, dark):
    """Основной логотип: знак первой буквой, слово продолжает его градиент одной полосой."""
    cap = wordmark['cap']
    scale = cap / (MARK_BOX[3] - MARK_BOX[1])  # высота знака = высота заглавной буквы
    mark_width = (MARK_BOX[2] - MARK_BOX[0]) * scale
    text_x = mark_width
    ink = wordmark['ink']
    box = (
        0.0,
        min(-cap, ink[1]),
        max(mark_width, text_x + ink[2]),
        max(0.0, ink[3]),
    )

    if mono:
        defs, mark_fill, text_fill = '', 'currentColor', 'currentColor'
    else:
        stops = [(0, CYAN_D if dark else CYAN), (1, VIOLET_D if dark else VIOLET)]
        text_stops = [(0, VIOLET_D if dark else VIOLET), (1, PINK_D if dark else PINK)]
        defs = (
            '  <defs>\n'
            + gradient('up-logo-mark', 0, 0, mark_width, 0, stops)
            + '\n'
            + gradient('up-logo-text', text_x, 0, text_x + wordmark['advance'], 0, text_stops)
            + '\n  </defs>\n'
        )
        mark_fill, text_fill = 'url(#up-logo-mark)', 'url(#up-logo-text)'

    mark_path = transform_path(
        MARK_U,
        (scale, 0, 0, scale, -MARK_BOX[0] * scale, -MARK_BOX[3] * scale),
    )
    glyphs = '\n'.join(
        f'      <path d="{transform_path(data, (1, 0, 0, 1, text_x, 0))}"/>' for data in wordmark['paths']
    )
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="'
        + view_box(box)
        + '" role="img">\n'
        + stamp()
        + '  <title>UnPlugged</title>\n'
        + defs
        + f'  <path d="{mark_path}" fill="{mark_fill}"/>\n'
        + f'  <g fill="{text_fill}">\n'
        + glyphs
        + '\n  </g>\n'
        + '</svg>\n'
    )


def stacked(wordmark, gap_ratio=0.3):
    """Квадратная раскладка: знак над словом — для аватара, обложки, печати.

    Знак занимает верх полосы (y 0…cap), слово стоит ниже на просвет `gap_ratio` от высоты
    заглавной: его верх — на `cap + gap`, базовая линия — ещё на `cap` ниже.
    """
    cap = wordmark['cap']
    scale = cap / (MARK_BOX[3] - MARK_BOX[1])
    mark_width = (MARK_BOX[2] - MARK_BOX[0]) * scale
    gap = cap * gap_ratio
    baseline = 2 * cap + gap
    width = max(mark_width, wordmark['advance'])
    mark_x = (width - mark_width) / 2
    text_x = (width - wordmark['advance']) / 2
    ink = wordmark['ink']
    box = (0.0, 0.0, width, baseline + max(0.0, ink[3]))

    defs = (
        '  <defs>\n'
        + gradient('up-stack-mark', mark_x, 0, mark_x + mark_width, 0, [(0, CYAN), (1, VIOLET)])
        + '\n'
        + gradient('up-stack-text', text_x, 0, text_x + wordmark['advance'], 0, [(0, VIOLET), (1, PINK)])
        + '\n  </defs>\n'
    )
    mark_path = transform_path(
        MARK_U,
        (scale, 0, 0, scale, mark_x - MARK_BOX[0] * scale, cap - MARK_BOX[3] * scale),
    )
    glyphs = '\n'.join(
        f'      <path d="{transform_path(data, (1, 0, 0, 1, text_x, baseline))}"/>'
        for data in wordmark['paths']
    )
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="'
        + view_box(box)
        + '" role="img">\n'
        + stamp()
        + '  <title>UnPlugged</title>\n'
        + defs
        + f'  <path d="{mark_path}" fill="url(#up-stack-mark)"/>\n'
        + '  <g fill="url(#up-stack-text)">\n'
        + glyphs
        + '\n  </g>\n'
        + '</svg>\n'
    )


def mark(cloud, mono):
    """Знак целиком: буква U (с облаком пикселей или без) в системе координат фавиконки."""
    width = 100.0 if cloud else MARK_BOX[2] - MARK_BOX[0]
    height = 80.0 if cloud else MARK_BOX[3] - MARK_BOX[1]
    box = (0.0, 0.0, width, height) if cloud else MARK_BOX
    if mono:
        defs, fill = '', 'currentColor'
    else:
        defs = (
            '  <defs>\n'
            + gradient(
                'up-mark',
                MARK_BOX[0],
                MARK_BOX[1],
                MARK_BOX[2],
                MARK_BOX[3],
                [(0, CYAN), (0.5, VIOLET), (1, PINK)],
            )
            + '\n  </defs>\n'
        )
        fill = 'url(#up-mark)'
    squares = ''
    if cloud:
        rows = '\n'.join(
            f'    <rect x="{fmt(x)}" y="{fmt(y)}" width="{fmt(size)}" height="{fmt(size)}"'
            + (f' opacity="{fmt(alpha)}"' if alpha != 1 else '')
            + '/>'
            for x, y, size, alpha in CLOUD
        )
        squares = f'  <g fill="{fill}">\n{rows}\n  </g>\n'
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="'
        + view_box(box)
        + '" role="img">\n'
        + stamp()
        + '  <title>UnPlugged</title>\n'
        + defs
        + f'  <path d="{MARK_CLOUD_U if cloud else MARK_U}" fill="{fill}"/>\n'
        + squares
        + '</svg>\n'
    )


def main():
    wordmark = build_wordmark()
    write('logo.svg', horizontal(wordmark, mono=False, dark=False))
    write('logo-on-light.svg', horizontal(wordmark, mono=False, dark=True))
    write('logo-mono.svg', horizontal(wordmark, mono=True, dark=False))
    write('logo-stacked.svg', stacked(wordmark))
    write('mark-u.svg', mark(cloud=False, mono=False))
    write('mark.svg', mark(cloud=True, mono=False))
    write('mark-mono.svg', mark(cloud=True, mono=True))
    print(f'знак: высота {fmt(wordmark["cap"])} при upem {fmt(wordmark["upem"])}, слово {fmt(wordmark["advance"])}')


if __name__ == '__main__':
    main()
