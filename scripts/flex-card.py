#!/usr/bin/env python3
"""Generate a sick owner 'aura' flex card for the saad-bot !flex command."""
import math
import os
import random
import sys

from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1024, 1024
random.seed()

BG_TOP = (6, 24, 29)       # deep teal-black
BG_BOT = (1, 5, 6)          # near black
FOAM = (233, 242, 237)      # sea-foam white
CORAL = (255, 111, 97)      # living coral
CYAN = (120, 230, 255)      # electric cyan
TEAL_DIM = (40, 90, 100)


def font(size, bold=True):
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    for p in (f"/usr/share/fonts/truetype/dejavu/{name}", name):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def vgrad():
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=tuple(
            int(BG_TOP[i] + (BG_BOT[i] - BG_TOP[i]) * t) for i in range(3)))
    return img


def radial_glow(size, color, max_alpha=110):
    g = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(g)
    for r in range(size // 2, 0, -1):
        a = int(max_alpha * (r / (size // 2)) ** 2 * 0.25)
        d.ellipse([size // 2 - r, size // 2 - r, size // 2 + r, size // 2 + r],
                  fill=a)
    glow = Image.new("RGBA", (size, size), color + (0,))
    glow.putalpha(g)
    return glow.filter(ImageFilter.GaussianBlur(40))


def lightning(draw_w=26):
    pts = [(random.randint(W // 4, 3 * W // 4), -20)]
    x, y = pts[0]
    while y < H + 20:
        x += random.randint(-70, 70)
        y += random.randint(40, 110)
        pts.append((x, y))
        if random.random() < 0.25:  # branch
            bx, by = x, y
            for _ in range(4):
                bx += random.randint(-60, 60)
                by += random.randint(30, 80)
            yield [(x, y), (bx, by)]
    yield pts


def main(out):
    img = vgrad().convert("RGBA")

    # ambient coral glow behind center
    glow = radial_glow(700, CORAL, 90)
    img.alpha_composite(glow, (W // 2 - 350, H // 2 - 380))

    # embers rising
    d = ImageDraw.Draw(img, "RGBA")
    for _ in range(130):
        x = random.randint(0, W)
        y = random.randint(0, H)
        r = random.randint(1, 4)
        heat = random.random()
        col = (255, int(90 + 90 * heat), int(40 + 40 * heat), random.randint(60, 170))
        d.ellipse([x - r, y - r, x + r, y + r], fill=col)

    # lightning layer
    bolt_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bolt_layer)
    for pts in lightning():
        bd.line(pts, fill=CYAN + (150,), width=26, joint="curve")
        for bx, by in pts[1:]:
            pass
    bolt_layer = bolt_layer.filter(ImageFilter.GaussianBlur(14))
    bd = ImageDraw.Draw(bolt_layer)
    for pts in lightning():
        bd.line(pts, fill=(235, 250, 255, 230), width=5, joint="curve")
    img.alpha_composite(bolt_layer)

    # vignette
    vig = Image.new("L", (W, H), 0)
    vd = ImageDraw.Draw(vig)
    vd.ellipse([-W * 0.35, -H * 0.35, W * 1.35, H * 1.35], fill=255)
    vig = vig.filter(ImageFilter.GaussianBlur(120))
    black = Image.new("RGBA", (W, H), (0, 0, 0, 255))
    black.putalpha(Image.eval(vig, lambda v: 255 - int(v * 0.55)))
    img.alpha_composite(black)

    # frame
    d = ImageDraw.Draw(img)
    d.rectangle([28, 28, W - 28, H - 28], outline=TEAL_DIM + (255,), width=2)
    d.rectangle([44, 44, W - 44, H - 44], outline=(255, 111, 97, 120), width=1)
    for cx, cy in [(28, 28), (W - 28, 28), (28, H - 28), (W - 28, H - 28)]:
        d.rectangle([cx - 8, cy - 8, cx + 8, cy + 8], outline=CORAL + (255,), width=3)

    # glowing name
    f_big = font(190)
    f_mid = font(64)
    f_small = font(34, bold=False)

    def glow_text(pos, text, fnt, fill, glow_color, blur=28):
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ld = ImageDraw.Draw(layer)
        tw = ld.textlength(text, font=fnt)
        x = W // 2 - tw / 2
        ld.text((x, pos), text, font=fnt, fill=glow_color + (255,))
        layer = layer.filter(ImageFilter.GaussianBlur(blur))
        img.alpha_composite(layer)
        d.text((x, pos), text, font=fnt, fill=fill + (255,))

    glow_text(120, "S A A D - B O T", f_small, (150, 190, 195), TEAL_DIM, 12)
    glow_text(400, "ASHAR", f_big, FOAM, CORAL, 34)

    # divider
    d.line([(W // 2 - 220, 660), (W // 2 + 220, 660)], fill=CORAL + (255,), width=4)
    d.line([(W // 2 - 140, 672), (W // 2 + 140, 672)], fill=TEAL_DIM + (255,), width=2)

    glow_text(700, "O W N E R", f_mid, CORAL, CORAL, 22)
    glow_text(830, "the one who built the machine", font(30, bold=False),
              (150, 190, 195), TEAL_DIM, 10)

    # scanlines
    scan = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(scan)
    for y in range(0, H, 6):
        sd.line([(0, y), (W, y)], fill=(0, 0, 0, 26))
    img.alpha_composite(scan)

    img.convert("RGB").save(out, "PNG")
    print("wrote", out)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/tmp/flex.png")
