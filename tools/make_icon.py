"""Dessine l'icône de DeskCosy (robot jardinier) : assets/img/deskcosy.ico et deskcosy.png.
Usage : python tools/make_icon.py"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = 1024  # dessin en grand, réduit ensuite (bords lisses)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def draw():
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    # fond : carré arrondi, dégradé vert
    bg = Image.new('RGBA', (S, S))
    g = ImageDraw.Draw(bg)
    for y in range(S):
        g.line([(0, y), (S, y)], fill=lerp((138, 214, 98), (62, 140, 52), y / S) + (255,))
    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([24, 24, S - 24, S - 24], 210, fill=255)
    im.paste(bg, (0, 0), mask)
    d = ImageDraw.Draw(im)

    # terre en bas
    soil = Image.new('L', (S, S), 0)
    ImageDraw.Draw(soil).rectangle([0, 800, S, S], fill=255)
    soil = Image.composite(soil, Image.new('L', (S, S), 0), mask)
    im.paste((120, 78, 46, 255), (0, 0), soil)
    d.rectangle([24, 800, S - 24, 826], fill=(146, 98, 58))

    # corps du robot
    d.rounded_rectangle([322, 590, 702, 830], 70, fill=(70, 120, 200))
    d.rounded_rectangle([322, 590, 702, 640], 40, fill=(96, 148, 226))
    d.ellipse([462, 670, 562, 770], fill=(255, 200, 60))           # voyant batterie
    d.rectangle([497, 692, 527, 748], fill=(70, 120, 200))

    # tête
    d.rounded_rectangle([262, 300, 762, 610], 110, fill=(92, 150, 230))
    d.rounded_rectangle([312, 350, 712, 562], 80, fill=(28, 40, 64))  # écran
    d.rounded_rectangle([392, 410, 462, 500], 30, fill=(124, 230, 140))  # yeux
    d.rounded_rectangle([562, 410, 632, 500], 30, fill=(124, 230, 140))
    d.ellipse([340, 500, 390, 540], fill=(255, 130, 150))         # joues
    d.ellipse([634, 500, 684, 540], fill=(255, 130, 150))
    d.rounded_rectangle([230, 410, 272, 500], 18, fill=(70, 120, 200))  # oreilles
    d.rounded_rectangle([752, 410, 794, 500], 18, fill=(70, 120, 200))

    # pousse sur la tête (antenne)
    d.rounded_rectangle([497, 150, 527, 310], 14, fill=(46, 120, 40))
    d.chord([300, 120, 520, 280], 0, 360, fill=(46, 160, 60))      # feuille gauche
    d.polygon([(512, 230), (330, 170), (420, 260)], fill=(46, 160, 60))
    d.ellipse([510, 60, 740, 220], fill=(110, 200, 80))            # feuille droite
    d.line([(520, 200), (680, 110)], fill=(70, 150, 50), width=14)
    d.line([(512, 220), (360, 170)], fill=(30, 120, 45), width=12)
    return im


def main():
    im = draw()
    out = os.path.join(ROOT, 'assets', 'img')
    im.resize((256, 256), Image.LANCZOS).save(os.path.join(out, 'deskcosy.png'))
    sizes = [(16, 16), (20, 20), (24, 24), (32, 32), (40, 40), (48, 48), (64, 64), (128, 128), (256, 256)]
    im.save(os.path.join(out, 'deskcosy.ico'), sizes=sizes)
    print('ok')


if __name__ == '__main__':
    main()
