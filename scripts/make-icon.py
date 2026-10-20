#!/usr/bin/env python3
"""Иконка DataLaw IPTV: знак проекта «D» + кнопка «пуск».
Источник знака — assets/dmark.json (векторизованный логотип DataLaw).
Запуск: python3 scripts/make-icon.py && npx capacitor-assets generate --android
"""
import json, re
from PIL import Image, ImageDraw, ImageFilter

D = json.load(open('assets/dmark.json'))
MW, MH = D['w'], D['h']
pts = lambda path: [tuple(map(float, m)) for m in re.findall(r'(-?\d+\.?\d*) (-?\d+\.?\d*)', path)]
STEM, ARCS = pts(D['stem']), pts(D['arcs'])
S, N = 4, 1024
ACC = (61, 139, 255)
PLAY = dict(x=520, y=404, t=105)   # кнопка «пуск» в пространстве «D» между ножкой и дугой (координаты знака)

def mark_layer(size, height, cx, cy):
    W = size * S; k = W / 1024; sc = height * k / MH
    ox, oy = cx * k - MW * sc / 2, cy * k - MH * sc / 2
    L = Image.new('RGBA', (W, W), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
    tr = lambda P: [(ox + x * sc, oy + y * sc) for x, y in P]
    d.polygon(tr(STEM), fill=(255, 255, 255, 255)); d.polygon(tr(ARCS), fill=(255, 255, 255, 255))
    px, py, t = ox + PLAY['x'] * sc, oy + PLAY['y'] * sc, PLAY['t'] * sc
    d.polygon([(px - t * 0.6, py - t), (px - t * 0.6, py + t), (px + t, py)], fill=ACC + (255,))
    return L.resize((size, size), Image.LANCZOS)

def grad(size, top, bottom):
    im = Image.new('RGB', (size, size)); px = im.load()
    for y in range(size):
        c = tuple(int(top[i] + (bottom[i] - top[i]) * y / (size - 1)) for i in range(3))
        for x in range(size): px[x, y] = c
    return im

bg = grad(N, (14, 18, 30), (6, 8, 14))
glow = Image.new('RGBA', (N, N), (0, 0, 0, 0)); ImageDraw.Draw(glow).ellipse((380, 380, 1240, 1240), fill=ACC + (70,))
bg = Image.alpha_composite(bg.convert('RGBA'), glow.filter(ImageFilter.GaussianBlur(120))).convert('RGB')
bg.save('assets/icon-background.png')
mark_layer(N, 560, 512, 512).save('assets/icon-foreground.png')            # адаптивная иконка: знак в «безопасной зоне»
full = bg.convert('RGBA'); full.alpha_composite(mark_layer(N, 660, 512, 512)); full.convert('RGB').save('assets/icon-only.png')
sp = Image.new('RGBA', (2732, 2732), (0, 0, 0, 255)); sp.alpha_composite(mark_layer(1366, 760, 683, 683), (683, 683))
sp.convert('RGB').save('assets/splash.png'); sp.convert('RGB').save('assets/splash-dark.png')

# вектор для экрана «О приложении»
px, py, t = PLAY['x'], PLAY['y'], PLAY['t']
svg = (f'<svg viewBox="0 0 {MW:.0f} {MH:.0f}" fill="currentColor" aria-hidden="true"><path d="{D["stem"]}"/><path d="{D["arcs"]}"/>'
       f'<path fill="var(--accent)" d="M{px - 0.6 * t:.0f} {py - t:.0f} L{px - 0.6 * t:.0f} {py + t:.0f} L{px + t:.0f} {py} Z"/></svg>')
open('src/ui/dmark.js', 'w').write("// «D» — знак проекта DataLaw (векторизован с исходного логотипа), с кнопкой «пуск» для IPTV.\n"
                                    "// Генерируется scripts/make-icon.py.\nexport const DMARK = '" + svg + "';\n")

prev = Image.new('RGB', (1500, 520), (230, 232, 238)); base = full.convert('RGB')
def shaped(size, kind):
    im = base.resize((size, size), Image.LANCZOS); m = Image.new('L', (size, size), 0); md = ImageDraw.Draw(m)
    md.ellipse((0, 0, size, size), fill=255) if kind == 'circle' else md.rounded_rectangle((0, 0, size, size), radius=int(size * 0.22), fill=255)
    o = Image.new('RGBA', (size, size), (0, 0, 0, 0)); o.paste(im, (0, 0), m); return o
for kind, size, x, y in (('square', 440, 30, 40), ('circle', 440, 520, 40), ('square', 96, 1010, 40), ('square', 48, 1010, 190)):
    tile = shaped(size, kind); prev.paste(tile, (x, y), tile)
prev.save('/tmp/icon-preview3.png')
