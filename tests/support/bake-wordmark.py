#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Запекание логотипа UnPlugged: знак-сетка + слово «nPlugged» нормальным шрифтом в кривых.

Знак — пиксельная сетка 3×3 (шесть квадратов 24 с шагом 29 плюс улетевший квадрат 16): буква U, из
которой вынули верхний правый контакт. Слово набирается обычной гарнитурой — контраст в логотипе даёт
не вторая пиксельная азбука, а «пиксельный знак против гладкого слова». По умолчанию берётся Onest
(weight 700), файл шрифта лежит в репозитории — `tests/support/fonts/Onest-700.ttf`; любая другая
гарнитура подставляется ключом `--font`.

Слово переводится **в кривые**: SVG логотипа не должен зависеть от того, установлен ли шрифт у того, кто
его откроет (иначе в Illustrator/Figma/на печати буквы подменятся запасным — это и есть «качество
страдает»). Кривые снимаются с того же файла, что грузит фронтенд, кернинг считает HarfBuzz.

Запуск (нужны fontTools, brotli, uharfbuzz):
  python tests/support/bake-wordmark.py                          # боевой набор в app/svg/brand
  python tests/support/bake-wordmark.py --font .workbuddy/fonts/Poppins-700.ttf \
      --out-dir .workbuddy/wordmark --suffix=-poppins            # проба другой гарнитуры
Инструмент разработки: в сборку не входит. Знак и иконки (включая растровые) собирает
`tests/support/bake-brand.mjs`; геометрия знака здесь повторена намеренно — числа те же.
"""

import argparse
import glob
import os
import sys
import tempfile

import uharfbuzz as hb
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

TEXT = 'nPlugged'

# Цвета знака (docs/ui-plan.md §9.2).
CYAN, VIOLET, PINK = '#22D3EE', '#8B5CF6', '#D946EF'
# Те же три цвета на ступень темнее — для светлого фона, иначе голубой на белом слепнет.
CYAN_D, VIOLET_D, PINK_D = '#0891B2', '#7C3AED', '#C026D3'

# Геометрия знака: та же, что в tests/support/bake-brand.mjs (x, y, размер, прозрачность).
GRID = [
    (12, 12, 24, 1.0),
    (12, 41, 24, 1.0),
    (12, 70, 24, 1.0),
    (41, 70, 24, 1.0),
    (70, 70, 24, 1.0),
    (70, 41, 24, 1.0),
]
# В локапе — только крупный улетевший квадрат: мелкий попадал в x-height первой буквы слова.
FLYING = [(86, 4, 16, 0.9)]
MARK_LEFT, MARK_RIGHT = 12.0, 102.0
MARK_TOP, MARK_BOTTOM = 4.0, 94.0
# Высоту знака считаем **по сетке**, а не по улетевшему квадрату: буква U должна быть ровно
# в высоту заглавной слова (как «P»), а квадрат торчит выше — он и читается как отлетевший.
GRID_TOP = min(y for _, y, _, _ in GRID)
# Просвет до слова тоже считаем от сетки (правого края буквы U), а не от улетевшего квадрата:
# иначе `--gap` не совпадает с тем, что видно глазом.
GRID_RIGHT = max(x + size for x, _, size, _ in GRID)


def fmt(value):
    """Число в SVG: без хвостовых нулей, координаты — до сотых."""
    text = f'{round(float(value), 2):.2f}'.rstrip('0').rstrip('.')
    return '0' if text in ('', '-0') else text


def box(x0, y0, x1, y1):
    """viewBox: начало и размер, а не второй угол."""
    return ' '.join(fmt(value) for value in (x0, y0, x1 - x0, y1 - y0))


def rect(x, y, width, height):
    return f'M{fmt(x)} {fmt(y)} H{fmt(x + width)} V{fmt(y + height)} H{fmt(x)} Z'


def font_file(override):
    """Файл шрифта слова и подпись для комментария.

    По умолчанию — шрифт из репозитория (`tests/support/fonts/Onest-700.ttf`): логотип не обязан
    совпадать со шрифтом интерфейса, а сборка должна работать без сети и не зависеть от того, что
    лежит в node_modules. Если файла нет, берём Manrope из node_modules.
    """
    if override:
        path = override if os.path.isabs(override) else os.path.join(ROOT, override)
        if not os.path.exists(path):
            sys.exit(f'не найден шрифт {override}')
        return path, os.path.splitext(os.path.basename(path))[0]
    local = os.path.join(ROOT, 'tests', 'support', 'fonts', 'Onest-700.ttf')
    if os.path.exists(local):
        return local, 'Onest'
    # Запасной вариант — шрифт интерфейса из проекта (`public/fonts`, пакетов `@fontsource` больше нет).
    fallback = os.path.join(ROOT, 'public', 'fonts', 'manrope-latin.woff2')
    if not os.path.exists(fallback):
        sys.exit('не найден шрифт для слова: положите tests/support/fonts/Onest-700.ttf или укажите --font')
    return fallback, 'Manrope'


class Face:
    """Шрифт на нужном весе: один и тот же файл читают HarfBuzz и контуры."""

    def __init__(self, path, weight):
        self.font = TTFont(path)
        self.font.flavor = None
        if 'fvar' in self.font:
            instancer.instantiateVariableFont(
                self.font, {'wght': weight}, inplace=True, updateFontNames=False
            )
        handle, self.path = tempfile.mkstemp(suffix='.ttf', prefix='logo-face-')
        os.close(handle)
        self.font.save(self.path)
        self.glyph_set = self.font.getGlyphSet()
        self.upem = self.font['head'].unitsPerEm
        self.cap = float(self.font['OS/2'].sCapHeight or 0) or 0.7 * self.upem

    def close(self):
        os.unlink(self.path)

    def layout(self, text):
        """Раскладка строки: кернинг считает HarfBuzz, признаки — как в браузере."""
        blob = hb.Blob.from_file_path(self.path)
        hb_font = hb.Font(hb.Face(blob))
        buf = hb.Buffer()
        buf.add_str(text)
        buf.direction = 'ltr'
        buf.script = 'Latn'
        buf.language = 'en'
        hb.shape(hb_font, buf, {'kern': True, 'liga': True, 'calt': True})
        return [
            {
                'name': self.font.getGlyphName(info.codepoint),
                'advance': position.x_advance,
                'offset': position.x_offset,
            }
            for info, position in zip(buf.glyph_infos, buf.glyph_positions)
        ]

    def outline(self, name, offset_x, offset_y=0.0, scale=1.0):
        """Контур глифа в координатах SVG: единицы шрифта, начало координат — базовая линия."""
        transform = (scale, 0, 0, -scale, offset_x, offset_y)  # шрифт смотрит вверх, SVG — вниз
        pen = SVGPathPen(self.glyph_set, ntos=fmt)
        bounds_pen = BoundsPen(self.glyph_set)
        self.glyph_set[name].draw(TransformPen(pen, transform))
        self.glyph_set[name].draw(TransformPen(bounds_pen, transform))
        return pen.getCommands(), bounds_pen.bounds


def union(first, second):
    if second is None:
        return first
    if first is None:
        return second
    return (
        min(first[0], second[0]),
        min(first[1], second[1]),
        max(first[2], second[2]),
        max(first[3], second[3]),
    )


class Wordmark:
    """Слово кривыми: буквы, ширина полосы (с трекингом) и чернильная рамка."""

    def __init__(self, face, text, tracking_em):
        self.glyphs = face.layout(text)
        tracking = tracking_em * face.upem
        self.cap = face.cap
        self.step = {}
        pen_x = 0.0
        ink = None
        for index, glyph in enumerate(self.glyphs):
            offset = pen_x + glyph['offset'] + index * tracking
            _, bounds = face.outline(glyph['name'], offset)
            self.step[index] = offset
            ink = union(ink, bounds)
            pen_x += glyph['advance']
        self.advance = pen_x + len(self.glyphs) * tracking
        self.ink = ink

    def markup(self, face, dx, dy, scale=1.0):
        return '\n'.join(
            f'      <path d="{face.outline(glyph["name"], self.step[index] * scale + dx, dy, scale)[0]}"/>'
            for index, glyph in enumerate(self.glyphs)
        )


def stamp(note):
    return (
        '  <!--\n'
        '    Логотип UnPlugged. Собран бейкером tests/support/bake-wordmark.py — руками не правим,\n'
        '    правки теряются при пересборке.\n'
        f'    {note}\n'
        '    Прошлая версия знака (скруглённая U) — в app/svg/brand/legacy/.\n'
        '  -->\n'
    )


def gradient(gradient_id, x1, y1, x2, y2, stops):
    body = ''.join(f'\n      <stop offset="{offset}" stop-color="{color}"/>' for offset, color in stops)
    return (
        f'    <linearGradient id="{gradient_id}" gradientUnits="userSpaceOnUse"'
        f' x1="{fmt(x1)}" y1="{fmt(y1)}" x2="{fmt(x2)}" y2="{fmt(y2)}">{body}\n'
        '    </linearGradient>'
    )


def mark_paths(scale, dx, dy):
    """Квадраты знака с впечённым преобразованием: трансформов в файле не оставляем."""
    return [
        (
            rect(dx + (x - MARK_LEFT) * scale, dy + (y - MARK_BOTTOM) * scale, size * scale, size * scale),
            alpha,
        )
        for x, y, size, alpha in GRID + FLYING
    ]


def squares_markup(paths):
    return '\n'.join(
        f'      <path d="{data}"' + ('' if alpha == 1 else f' opacity="{fmt(alpha)}"') + '/>'
        for data, alpha in paths
    )


def horizontal(face, wordmark, spec, mode):
    """Основной логотип: знак первой буквой, слово продолжает его градиент одной полосой."""
    cap = wordmark.cap
    # Буква U в знаке = высота заглавной буквы слова; улетевший квадрат выходит выше неё.
    scale = cap * spec['mark_scale'] / (MARK_BOTTOM - GRID_TOP)
    mark_width = (MARK_RIGHT - MARK_LEFT) * scale
    # Просвет меряем от правого края буквы U (сетки), а не от улетевшего квадрата: квадрат
    # висит выше линии заглавных и в просвет не вмешивается.
    text_x = (GRID_RIGHT - MARK_LEFT) * scale + cap * spec['gap']
    ink = wordmark.ink
    frame = (
        0.0,
        min(-(MARK_BOTTOM - MARK_TOP) * scale, ink[1]),
        max(mark_width, text_x + ink[2]),
        max(0.0, ink[3]),
    )
    mono = mode == 'mono'
    light = mode == 'light'
    stops = [CYAN_D, VIOLET_D, PINK_D] if light else [CYAN, VIOLET, PINK]
    if mono:
        defs, fill = '', 'currentColor'
    else:
        defs = (
            '  <defs>\n'
            + gradient(
                'up-logo',
                0,
                0,
                text_x + wordmark.advance,
                0,
                [(0, stops[0]), (0.45, stops[1]), (1, stops[2])],
            )
            + '\n  </defs>\n'
        )
        fill = 'url(#up-logo)'
    note = f'Знак — пиксельная сетка, слово — {spec["label"]} (weight {spec["weight"]}) в кривых.'
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + box(*frame) + '" role="img">\n'
        + stamp(note)
        + '  <title>UnPlugged</title>\n'
        + defs
        + f'  <g fill="{fill}">\n{squares_markup(mark_paths(scale, 0, 0))}\n'
        + wordmark.markup(face, text_x, 0)
        + '\n  </g>\n</svg>\n'
    )


def stacked(face, wordmark, spec):
    """Квадратная раскладка: знак над словом — для аватара, обложки, печати.

    Слово здесь мельче знака: оно длинное («nPlugged» — восемь знаков), и в натуральную величину
    раскладка вышла бы полосой 6:1. Ширину слова подгоняем под `stack_width` ширин знака, поэтому
    блок остаётся почти квадратным.
    """
    cap = wordmark.cap
    scale = cap * spec['mark_scale'] / (MARK_BOTTOM - GRID_TOP)
    mark_height = (MARK_BOTTOM - MARK_TOP) * scale
    mark_width = (MARK_RIGHT - MARK_LEFT) * scale
    word_scale = min(1.0, spec['stack_width'] * mark_width / wordmark.advance)
    word_width = wordmark.advance * word_scale
    width = max(mark_width, word_width)
    mark_x = (width - mark_width) / 2
    text_x = (width - word_width) / 2
    baseline = mark_height + cap * spec['stack_gap'] + cap * word_scale
    defs = (
        '  <defs>\n'
        + gradient('up-stack-mark', mark_x, 0, mark_x + mark_width, 0, [(0, CYAN), (1, VIOLET)])
        + '\n'
        + gradient('up-stack-word', text_x, baseline - cap * word_scale, text_x + word_width, baseline, [(0, VIOLET), (1, PINK)])
        + '\n  </defs>\n'
    )
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="'
        + box(0, 0, width, baseline + max(0.0, wordmark.ink[3]) * word_scale)
        + '" role="img">\n'
        + stamp(f'Квадратная раскладка: знак над словом ({spec["label"]}, weight {spec["weight"]}).')
        + '  <title>UnPlugged</title>\n'
        + defs
        + f'  <g fill="url(#up-stack-mark)">\n{squares_markup(mark_paths(scale, mark_x, mark_height))}\n  </g>\n'
        + f'  <g fill="url(#up-stack-word)">\n{wordmark.markup(face, text_x, baseline, word_scale)}\n  </g>\n</svg>\n'
    )


def write(directory, name, content):
    os.makedirs(directory, exist_ok=True)
    target = os.path.join(directory, name)
    with open(target, 'w', encoding='utf-8', newline='\n') as handle:
        handle.write(content)
    print(f'{os.path.relpath(target, ROOT)}  {len(content.encode("utf-8"))} Б')


def main():
    # Консоль Windows бывает в cp1251: без этого печать «×» или длинного тире роняет бейкер уже после записи.
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except (AttributeError, ValueError):
        pass
    parser = argparse.ArgumentParser(description='Запекание логотипа UnPlugged')
    parser.add_argument('--font', default='', help='файл шрифта слова (TTF/WOFF2); по умолчанию tests/support/fonts/Onest-700.ttf')
    parser.add_argument('--label', default='', help='как назвать шрифт в комментарии файла')
    parser.add_argument('--weight', type=int, default=700, help='вес (для вариативных шрифтов)')
    parser.add_argument('--tracking', type=float, default=-0.01, help='трекинг в em, отрицательный — плотнее')
    parser.add_argument('--mark-scale', type=float, default=1.0, help='высота знака относительно высоты заглавной')
    parser.add_argument('--gap', type=float, default=0.1, help='просвет до слова, в долях высоты заглавной (от правого края буквы U)')
    parser.add_argument('--stack-width', type=float, default=1.6, help='ширина слова в стакед, в ширинax знака')
    parser.add_argument('--stack-gap', type=float, default=0.45, help='просвет в стакед, в долях высоты заглавной')
    parser.add_argument('--out-dir', default=os.path.join(ROOT, 'app', 'svg', 'brand'))
    parser.add_argument('--suffix', default='', help='добавка к имени файла (для проб)')
    parser.add_argument('--text', default=TEXT)
    args = parser.parse_args()

    path, default_label = font_file(args.font)
    label = args.label or default_label
    face = Face(path, args.weight)
    try:
        wordmark = Wordmark(face, args.text, args.tracking)
        spec = {
            'label': label,
            'weight': args.weight,
            'mark_scale': args.mark_scale,
            'gap': args.gap,
            'stack_width': args.stack_width,
            'stack_gap': args.stack_gap,
        }
        write(args.out_dir, f'logo{args.suffix}.svg', horizontal(face, wordmark, spec, 'gradient'))
        write(args.out_dir, f'logo-on-light{args.suffix}.svg', horizontal(face, wordmark, spec, 'light'))
        write(args.out_dir, f'logo-mono{args.suffix}.svg', horizontal(face, wordmark, spec, 'mono'))
        write(args.out_dir, f'logo-stacked{args.suffix}.svg', stacked(face, wordmark, spec))
        print(f'{label}: вес {args.weight}, трекинг {args.tracking}em, знак {args.mark_scale}x заглавной')
    finally:
        face.close()


if __name__ == '__main__':
    main()
