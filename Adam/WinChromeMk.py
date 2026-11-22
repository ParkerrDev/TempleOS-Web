"""Build pixel-aligned decoration fonts from TempleOS's 8x8 sys_font_std.
Requires fonttools[woff]. Only the selected DPI's font is loaded by the site.
"""
from base64 import b64decode
from math import ceil
from pathlib import Path
import re
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString

root = Path(__file__).resolve().parent
source = (root / '../hemu/holyc-wasm/src/runtime/font.js').read_text()
bits = b64decode(re.search(r'const B64 = "([^"]+)"', source)[1])
assert len(bits) == 256 * 8

for scale, phases in [(1, 1), (1.25, 4), (1.5, 2), (1.75, 4), (2, 1)]:
    glyphs, metrics, shared = {}, {}, {}

    def glyph(name, ch, phase):
        pen, paths = TTGlyphPen(glyphs), []
        for y in range(8):
            x = 0
            while x < 8:
                if not bits[ch * 8 + y] & (1 << x):
                    x += 1
                    continue
                start = x
                while x < 8 and bits[ch * 8 + y] & (1 << x):
                    x += 1
                # Match nearest-neighbor sampling at output pixel centers.
                a = (ceil((start + phase) * scale - .5) - ceil(phase * scale - .5)) * 64
                b = (ceil((x + phase) * scale - .5) - ceil(phase * scale - .5)) * 64
                top = (16 - ceil(y * scale - .5)) * 64
                bottom = (16 - ceil((y + 1) * scale - .5)) * 64
                paths.append((a, b, top, bottom))
        key = tuple(paths)
        if key in shared:
            pen.addComponent(shared[key], (1, 0, 0, 1, 0, 0))
        else:
            for a, b, top, bottom in paths:
                pen.moveTo((a, top))
                pen.lineTo((b, top))
                pen.lineTo((b, bottom))
                pen.lineTo((a, bottom))
                pen.closePath()
            shared[key] = name
        glyphs[name] = pen.glyph()
        metrics[name] = (round(8 * scale) * 64, min((p[0] for p in paths), default=0))

    glyph('.notdef', 46, 0)
    for ch in range(256):
        for phase in range(phases):
            glyph(f'g{ch}_{phase}', ch, phase)
    font = FontBuilder(1024, isTTF=True)
    font.setupGlyphOrder(list(glyphs))
    font.setupCharacterMap({**{c: f'g{c}_0' for c in range(32, 256)},
                            **{0xe000 + c: f'g{c}_0' for c in range(256)}})
    font.setupGlyf(glyphs)
    font.setupHorizontalMetrics(metrics)
    font.setupHorizontalHeader(ascent=1024, descent=0)
    name = f'TempleChrome{round(scale * 100)}'
    font.setupNameTable(dict(familyName=name, styleName='Regular',
                            uniqueFontIdentifier=name, fullName=name, psName=name))
    font.setupOS2(sTypoAscender=1024, sTypoDescender=0, usWinAscent=1024, usWinDescent=0)
    font.setupPost()
    font.setupMaxp()
    if phases > 1:
        alternates = '\n'.join(f'sub g{c}_0 from [' +
                              ' '.join(f'g{c}_{p}' for p in range(phases)) + '];'
                              for c in range(256))
        addOpenTypeFeaturesFromString(font.font, 'feature cv01 {\n' + alternates + '\n} cv01;')
    font.font['head'].created = font.font['head'].modified = 2082844800
    font.font.recalcTimestamp = False
    font.font.flavor = 'woff2'
    path = root / f'Fonts/WinChrome-{round(scale * 100)}.woff2'
    font.font.save(path)
    print(f'{path.name}: {path.stat().st_size} bytes')
