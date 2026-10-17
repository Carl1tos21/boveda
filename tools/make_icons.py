#!/usr/bin/env python3
"""
Genera los iconos PNG de Bóveda (manifest PWA + apple-touch-icon + favicon).

El dibujo replica el logo de la app: cuadrado redondeado con degradado
azul -> turquesa y el escudo blanco del icono `sh`.

    uso:  python3 tools/make_icons.py
"""
import pathlib

from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'icons'

C1 = (0x5b, 0x8c, 0xff)   # azul
C2 = (0x37, 0xd0, 0xc0)   # turquesa
SS = 4                    # supermuestreo (bordes suaves)


def _bezier(p0, p1, p2, p3, n):
    """Puntos de una curva de Bézier cúbica (sin incluir p0)."""
    out = []
    for i in range(1, n + 1):
        t = i / n
        u = 1 - t
        x = u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0]
        y = u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1]
        out.append((x, y))
    return out


def shield_polygon():
    """
    Contorno del escudo, a partir del mismo path SVG que usa la app:
        M12 3 l8 3 v6 c0 5 -3.5 8 -8 9 c-4.5 -1 -8 -4 -8 -9 V6 z
    (coordenadas en un lienzo de 24x24)
    """
    pts = [(12, 3), (20, 6), (20, 12)]
    pts += _bezier((20, 12), (20, 17), (16.5, 20), (12, 21), 28)   # lado derecho
    pts += _bezier((12, 21), (7.5, 20), (4, 17), (4, 12), 28)      # lado izquierdo
    pts += [(4, 6)]
    return pts


def gradient(size):
    """Degradado diagonal azul -> turquesa."""
    img = Image.new('RGB', (size, size))
    draw = ImageDraw.Draw(img)
    n = size * 2
    for i in range(n):
        t = i / (n - 1)
        col = tuple(round(C1[k] + (C2[k] - C1[k]) * t) for k in range(3))
        draw.line([(i, 0), (0, i)], fill=col)
    return img


def rounded_mask(size, ratio=0.22):
    """Máscara de cuadrado redondeado, con bordes suavizados."""
    big = size * SS
    mask = Image.new('L', (big, big), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, big - 1, big - 1], radius=int(big * ratio), fill=255)
    return mask.resize((size, size), Image.LANCZOS)


def draw_shield(img, size, scale):
    """Dibuja el escudo blanco centrado, ocupando `scale` del lienzo."""
    big = size * SS
    layer = Image.new('L', (big, big), 0)
    s = big / 24.0 * scale
    off = (big - 24.0 * s) / 2.0
    pts = [(off + x * s, off + y * s) for x, y in shield_polygon()]
    ImageDraw.Draw(layer).polygon(pts, fill=255)
    img.paste(Image.new('RGB', (size, size), (255, 255, 255)),
              (0, 0), layer.resize((size, size), Image.LANCZOS))


def make(name, size, bleed=False, shield_scale=0.62, radius=0.22):
    """
    bleed=True -> icono a sangre (sin esquinas redondeadas), como exige
    Android para los maskable y como espera iOS en el apple-touch-icon.
    """
    img = gradient(size).convert('RGBA')
    if not bleed:
        img.putalpha(rounded_mask(size, radius))
    draw_shield(img, size, shield_scale)
    img.save(OUT / name, optimize=True)
    return name, size


JOBS = [
    ('icon-192.png', 192, False, 0.62, 0.22),
    ('icon-512.png', 512, False, 0.62, 0.22),
    ('icon-maskable-512.png', 512, True, 0.48, 0.22),
    ('apple-touch-icon-180.png', 180, True, 0.62, 0.22),
    ('favicon-32.png', 32, False, 0.68, 0.20),
]


def main():
    OUT.mkdir(exist_ok=True)
    print('Generando iconos en %s' % OUT)
    for job in JOBS:
        name, size = make(*job)
        print('  %-28s %dx%d' % (name, size, size))


if __name__ == '__main__':
    main()
