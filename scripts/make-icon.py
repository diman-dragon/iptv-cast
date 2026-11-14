#!/usr/bin/env python3
"""Иконка DL-IPTV: телевизор с антенной (сразу понятно, что это ТВ), на экране — знак проекта «D»
(чёрная буква + золотая дуга) и кнопка «пуск».
Источник знака — assets/dmark.json (векторизованный логотип DataLaw).
Запуск из корня проекта:  python3 scripts/make-icon.py
Скрипт сам пишет assets/*.png, все mipmap-* и splash.png для Android и src/ui/dmark.js.
"""
import json, re, glob, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

RES = 'android/app/src/main/res'
D = json.load(open('assets/dmark.json'))
MW, MH = D['w'], D['h']
pts = lambda path: [tuple(map(float, m)) for m in re.findall(r'(-?\d+\.?\d*) (-?\d+\.?\d*)', path)]
STEM, ARCS = pts(D['stem']), pts(D['arcs'])
PLAY = dict(x=545, y=404, t=100)   # кнопка «пуск» между ножкой и дугой (координаты знака)

GOLD_TOP, GOLD_BOT = (240, 208, 126), (170, 124, 38)
GOLD = (201, 162, 74)
INK_TOP, INK_BOT = (62, 62, 64), (22, 22, 24)
PLAY_COL = (176, 128, 36)
S = 2            # суперсэмплинг
N = 1024
DY = 34          # сдвиг композиции вниз, чтобы она была по центру «безопасной зоны»


def grad_img(size, top, bot, y0=0, y1=None):
    """Вертикальный градиент как RGBA-картинка."""
    w, h = size
    y1 = h if y1 is None else y1
    t = np.clip((np.arange(h) - y0) / max(1, (y1 - y0)), 0, 1)[:, None, None]
    a = np.array(top, float)[None, None, :]; b = np.array(bot, float)[None, None, :]
    arr = (a + (b - a) * t) * np.ones((1, w, 1))
    arr = np.concatenate([arr, np.full((h, w, 1), 255.0)], axis=2)
    return Image.fromarray(arr.astype('uint8'), 'RGBA')


def paint(canvas, mask, top, bot, y0, y1):
    """Заливает градиентом область mask (L) на canvas (RGBA)."""
    canvas.alpha_composite(Image.composite(grad_img(canvas.size, top, bot, y0, y1),
                                           Image.new('RGBA', canvas.size, (0, 0, 0, 0)), mask))


def poly_mask(size, polys):
    m = Image.new('L', size, 0); d = ImageDraw.Draw(m)
    for p in polys: d.polygon(p, fill=255)
    return m


def tv_layer():
    """Прозрачный слой 1024×1024 с телевизором (без фона)."""
    W = N * S; k = S
    L = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    cx = 512; cy = 540 + DY
    SW, SH, R, FR = 740, 480, 120, 34        # внешний размер экрана, радиус, толщина рамки
    x0, y0, x1, y1 = cx - SW / 2, cy - SH / 2, cx + SW / 2, cy + SH / 2
    box = lambda a, b, c, d: (a * k, b * k, c * k, d * k)

    # тень под телевизором
    sh = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle(box(x0, y0 + 24, x1, y1 + 24), radius=R * k, fill=(0, 0, 0, 120))
    L.alpha_composite(sh.filter(ImageFilter.GaussianBlur(26 * k)))

    # антенна: два золотых «уса»
    am = Image.new('L', (W, W), 0); ad = ImageDraw.Draw(am)
    base = (cx, y0 + 6)
    for tip in ((cx - 132, y0 - 148), (cx + 132, y0 - 148)):
        ad.line([(base[0] * k, base[1] * k), (tip[0] * k, tip[1] * k)], fill=255, width=22 * k)
        ad.ellipse(((tip[0] - 20) * k, (tip[1] - 20) * k, (tip[0] + 20) * k, (tip[1] + 20) * k), fill=255)
        ad.ellipse(((base[0] - 11) * k, (base[1] - 11) * k, (base[0] + 11) * k, (base[1] + 11) * k), fill=255)
    paint(L, am, GOLD_TOP, GOLD_BOT, (y0 - 170) * k, (y0 + 10) * k)

    # подставка
    fm = Image.new('L', (W, W), 0); fd = ImageDraw.Draw(fm)
    fd.rounded_rectangle(box(cx - 132, y1 - 4, cx + 132, y1 + 44), radius=24 * k, fill=255)
    fd.rectangle(box(cx - 40, y1 - 10, cx + 40, y1 + 8), fill=255)
    paint(L, fm, GOLD_TOP, GOLD_BOT, (y0) * k, (y1 + 50) * k)

    # рамка (золото)
    om = Image.new('L', (W, W), 0)
    ImageDraw.Draw(om).rounded_rectangle(box(x0, y0, x1, y1), radius=R * k, fill=255)
    paint(L, om, GOLD_TOP, GOLD_BOT, y0 * k, y1 * k)

    # экран (светлый, как включённый)
    im = Image.new('L', (W, W), 0)
    ImageDraw.Draw(im).rounded_rectangle(box(x0 + FR, y0 + FR, x1 - FR, y1 - FR), radius=(R - FR) * k, fill=255)
    paint(L, im, (253, 251, 246), (230, 223, 208), (y0 + FR) * k, (y1 - FR) * k)

    # знак «D» на экране
    mh = 352
    sc = mh * k / MH
    mx, my = cx * k - MW * sc / 2 + 4 * k, (cy + 2) * k - MH * sc / 2
    tr = lambda P: [(mx + x * sc, my + y * sc) for x, y in P]
    sm = poly_mask((W, W), [tr(STEM)])
    paint(L, sm, INK_TOP, INK_BOT, my, my + MH * sc)
    am2 = poly_mask((W, W), [tr(ARCS)])
    paint(L, am2, GOLD_TOP, GOLD_BOT, my, my + MH * sc)
    px, py, t = mx + PLAY['x'] * sc, my + PLAY['y'] * sc, PLAY['t'] * sc
    pm = poly_mask((W, W), [[(px - t * 0.6, py - t), (px - t * 0.6, py + t), (px + t, py)]])
    paint(L, pm, (205, 158, 52), PLAY_COL, py - t, py + t)
    return L.resize((N, N), Image.LANCZOS)


def bg_layer(size=N):
    bg = grad_img((size, size), (30, 30, 36), (9, 9, 12)).convert('RGBA')
    glow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((size * 0.15, size * 0.2, size * 0.85, size * 0.9), fill=GOLD + (46,))
    bg.alpha_composite(glow.filter(ImageFilter.GaussianBlur(size * 0.1)))
    return bg


def rounded(im, kind):
    s = im.width
    m = Image.new('L', (s * 4, s * 4), 0); md = ImageDraw.Draw(m)
    if kind == 'circle': md.ellipse((0, 0, s * 4, s * 4), fill=255)
    else: md.rounded_rectangle((0, 0, s * 4, s * 4), radius=int(s * 4 * 0.22), fill=255)
    m = m.resize((s, s), Image.LANCZOS)
    o = Image.new('RGBA', (s, s), (0, 0, 0, 0)); o.paste(im.convert('RGBA'), (0, 0), m); return o


tv = tv_layer(); bg = bg_layer()
full = bg.copy(); full.alpha_composite(tv)

# --- исходники для capacitor-assets и Play Store
bg.convert('RGB').save('assets/icon-background.png')
tv.save('assets/icon-foreground.png')
full.convert('RGB').save('assets/icon-only.png')

# --- mipmap-* (адаптивная иконка живёт в рамке 72 из 108 dp, обычная — 48 dp)
DENS = {'ldpi': 0.75, 'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
for name, f in DENS.items():
    d = f'{RES}/mipmap-{name}'
    os.makedirs(d, exist_ok=True)
    a, l = round(72 * f), round(48 * f)
    tv.resize((a, a), Image.LANCZOS).save(f'{d}/ic_launcher_foreground.png')
    bg.resize((a, a), Image.LANCZOS).convert('RGB').save(f'{d}/ic_launcher_background.png')
    rounded(full.resize((l, l), Image.LANCZOS), 'square').save(f'{d}/ic_launcher.png')
    rounded(full.resize((l, l), Image.LANCZOS), 'circle').save(f'{d}/ic_launcher_round.png')


# --- заставка: чёрный фон + телевизор по центру
def splash(w, h):
    im = Image.new('RGBA', (w, h), (0, 0, 0, 255))
    s = int(min(w, h) * 0.56)
    im.alpha_composite(tv.resize((s, s), Image.LANCZOS), ((w - s) // 2, (h - s) // 2))
    return im.convert('RGB')

splash(2732, 2732).save('assets/splash.png'); splash(2732, 2732).save('assets/splash-dark.png')
for p in glob.glob(f'{RES}/drawable*/splash.png'):
    w, h = Image.open(p).size
    splash(w, h).save(p)

# --- вектор для экрана «О приложении»: чёрная/текстовая «D» + золотая дуга + play
px, py, t = PLAY['x'], PLAY['y'], PLAY['t']
svg = (f'<svg viewBox="0 0 {MW:.0f} {MH:.0f}" aria-hidden="true"><path fill="currentColor" d="{D["stem"]}"/>'
       f'<path fill="#c9a24a" d="{D["arcs"]}"/>'
       f'<path fill="var(--accent)" d="M{px - 0.6 * t:.0f} {py - t:.0f} L{px - 0.6 * t:.0f} {py + t:.0f} L{px + t:.0f} {py} Z"/></svg>')
open('src/ui/dmark.js', 'w').write("// «D» — знак проекта DataLaw (чёрная буква + золотая дуга), с кнопкой «пуск» для IPTV.\n"
                                    "// Генерируется scripts/make-icon.py.\nexport const DMARK = '" + svg + "';\n")

# --- превью
prev = Image.new('RGB', (1500, 520), (232, 234, 240)); x = 30
for kind, size, xx, yy in (('square', 440, 30, 40), ('circle', 440, 520, 40), ('square', 96, 1010, 40), ('square', 48, 1010, 190)):
    tile = rounded(full.resize((size, size), Image.LANCZOS), kind); prev.paste(tile, (xx, yy), tile)
prev.save('/tmp/icon-preview.png')
