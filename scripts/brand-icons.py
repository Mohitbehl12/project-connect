"""Draws the TwoFold logo (two overlapping rings with a filled centre) at every size the web site and the
apps need. Run from the repo root: python3 scripts/brand-icons.py  (needs Pillow)."""
from PIL import Image, ImageDraw, ImageChops

CREAM, RING, LENS = (255, 244, 236), (153, 60, 29), (216, 90, 48)
SS = 4  # supersampling for smooth edges

def logo(size, scale, ring=RING, lens=LENS, bg=None, radius=0):
    S = size * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    if bg:
        ImageDraw.Draw(img).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(radius * S), fill=bg + (255,))
    c, r, off, w = S / 2, 0.225 * S * scale, 0.118 * S * scale, 0.055 * S * scale
    a = Image.new("L", (S, S), 0); ImageDraw.Draw(a).ellipse([c - off - r, c - r, c - off + r, c + r], fill=255)
    b = Image.new("L", (S, S), 0); ImageDraw.Draw(b).ellipse([c + off - r, c - r, c + off + r, c + r], fill=255)
    img.paste(Image.new("RGBA", (S, S), lens + (255,)), (0, 0), ImageChops.multiply(a, b))
    d = ImageDraw.Draw(img)
    for x in (c - off, c + off):
        d.ellipse([x - r - w / 2, c - r - w / 2, x + r + w / 2, c + r + w / 2], outline=ring + (255,), width=int(w))
    return img.resize((size, size), Image.LANCZOS)

def save(img, path, rgb=False):
    (img.convert("RGB") if rgb else img).save(path)

W = (255, 255, 255)
save(logo(1024, 1.0, bg=CREAM), "mobile/assets/icon.png", rgb=True)
save(logo(1024, 0.62), "mobile/assets/adaptive-icon.png")
save(logo(1024, 0.62, ring=W, lens=W), "mobile/assets/adaptive-icon-mono.png")
save(logo(96, 1.05, ring=W, lens=W), "mobile/assets/notification-icon.png")
save(logo(1024, 0.8), "mobile/assets/splash-icon.png")
for n in (180, 192, 512):
    save(logo(n, 1.0, bg=CREAM), f"mobile/public/icons/icon-{n}.png", rgb=True)
tile = lambda n: logo(n, 1.15, bg=CREAM, radius=0.22)
save(tile(64), "mobile/assets/favicon.png")
save(tile(64), "public/twofold-mark.png")
save(tile(48), "src/app/icon.png")
tile(64).save("public/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
print("TwoFold icons written.")
