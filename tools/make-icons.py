# アプリアイコン（PNG）を元画像から作る: python tools/make-icons.py
# 元画像は icons/source-dark.png（ホーム画面用・黒地）と icons/source-light.png（ライトモードのタブ用・白地）
from pathlib import Path

from PIL import Image

ICONS = Path(__file__).resolve().parent.parent / 'icons'
BG = (20, 21, 23)  # 黒地の背景色


def full_bleed(img):
    # 角の丸め（半径およそ96px）の外側の白と、縁のにじみを背景色で塗り、正方形いっぱいの画像にする。丸めは OS がかける
    img = img.convert('RGB').copy()
    w, h = img.size
    r = 96
    px = img.load()
    for y in range(h):
        for x in range(w):
            cx = r if x < r else w - 1 - r if x > w - 1 - r else x
            cy = r if y < r else h - 1 - r if y > h - 1 - r else y
            if ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5 > r - 8:
                px[x, y] = BG
    return img


def save(img, name, size):
    img.resize((size, size), Image.LANCZOS).save(ICONS / name, optimize=True)


dark = full_bleed(Image.open(ICONS / 'source-dark.png'))
save(dark, 'icon-180.png', 180)
save(dark, 'icon-192.png', 192)
save(dark, 'icon-512.png', 512)
save(dark, 'favicon-dark.png', 96)

# 丸や角丸で切り抜かれても欠けないよう、絵を縮めて余白をとる（maskable）
inner = dark.resize((400, 400), Image.LANCZOS)
mask = Image.new('RGB', (512, 512), BG)
mask.paste(inner, (56, 56))
mask.save(ICONS / 'icon-maskable-512.png', optimize=True)

save(Image.open(ICONS / 'source-light.png').convert('RGB'), 'favicon-light.png', 96)
print('ok')
