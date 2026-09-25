#!/usr/bin/env python3
"""Generate 64×64 pixel enemies with walk/flap frames + TS embed."""
from __future__ import annotations

import base64
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT_PNG = ROOT / "tools" / "pixelorama" / "exports"
OUT_TEX = ROOT / "game" / "WxGame" / "assets" / "textures" / "enemies"
OUT_TS = ROOT / "game" / "WxGame" / "assets" / "scripts" / "game" / "enemy" / "EnemyPixelData.ts"

W = H = 64


def rgba(c):
    if isinstance(c, tuple):
        return c if len(c) == 4 else (*c, 255)
    h = c.lstrip("#")
    if len(h) == 6:
        return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4)) + (255,)
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4, 6))


def new_img():
    return Image.new("RGBA", (W, H), (0, 0, 0, 0))


def fill_ellipse(d, box, c):
    d.ellipse(box, fill=rgba(c))


def disc(d, cx, cy, r, c):
    fill_ellipse(d, (cx - r, cy - r, cx + r, cy + r), c)


def shadow(d, cy=52):
    fill_ellipse(d, (18, cy - 3, 46, cy + 5), (0, 0, 0, 70))


def b64_rgba(im: Image.Image) -> str:
    return base64.b64encode(im.tobytes("raw", "RGBA")).decode("ascii")


# ── frame painters: phase 0..n-1 ───────────────────────────────────

def frames_fast(n=4) -> list[Image.Image]:
    """影犬/鼠：四帧奔跑步，腿交替蹬地。"""
    out = []
    for f in range(n):
        im = new_img()
        d = ImageDraw.Draw(im)
        # 腾空相位：1、3 略抬起
        air = 1 if f in (1, 3) else 0
        by = -2 * air
        shadow(d, 52 - air)
        # 残影只在疾跑帧
        if f % 2 == 1:
            fill_ellipse(d, (4, 30 + by, 20, 44 + by), (60, 160, 200, 70))
            fill_ellipse(d, (8, 28 + by, 26, 46 + by), (60, 160, 200, 110))
        # 身
        fill_ellipse(d, (16, 26 + by, 52, 48 + by), "#1a4a5c")
        fill_ellipse(d, (18, 24 + by, 50, 46 + by), "#3cb4d8")
        d.polygon([(48, 30 + by), (60, 36 + by), (48, 42 + by)], fill=rgba("#2a90b0"))
        disc(d, 44, 34 + by, 2, "#ffe66a")
        for x in (22, 28, 34, 40):
            d.polygon([(x, 24 + by), (x + 3, 24 + by), (x + 1, 16 + by)], fill=rgba("#145060"))
        # 腿交替：f0 前伸后蹬 / f1 收腿 / f2 对侧 / f3 收腿
        leg = rgba("#0e3040")
        if f == 0:
            d.line([(22, 44 + by), (14, 56)], fill=leg, width=3)   # 前腿前伸触地
            d.line([(38, 44 + by), (46, 50)], fill=leg, width=3)   # 后腿后蹬
            d.line([(26, 44 + by), (22, 52)], fill=leg, width=2)
            d.line([(34, 44 + by), (40, 48)], fill=leg, width=2)
        elif f == 1:
            d.line([(22, 44 + by), (18, 50)], fill=leg, width=3)
            d.line([(38, 44 + by), (42, 50)], fill=leg, width=3)
            d.line([(26, 44 + by), (28, 48)], fill=leg, width=2)
            d.line([(34, 44 + by), (32, 48)], fill=leg, width=2)
        elif f == 2:
            d.line([(22, 44 + by), (16, 50)], fill=leg, width=3)   # 对侧
            d.line([(38, 44 + by), (48, 56)], fill=leg, width=3)
            d.line([(26, 44 + by), (20, 48)], fill=leg, width=2)
            d.line([(34, 44 + by), (42, 52)], fill=leg, width=2)
        else:
            d.line([(24, 44 + by), (20, 50)], fill=leg, width=3)
            d.line([(36, 44 + by), (40, 50)], fill=leg, width=3)
            d.line([(28, 44 + by), (26, 48)], fill=leg, width=2)
            d.line([(32, 44 + by), (34, 48)], fill=leg, width=2)
        # 爪尖
        for lx, ly in ([(14, 56), (46, 50)] if f == 0 else [(16, 50), (48, 56)] if f == 2 else [(18, 50), (42, 50)]):
            disc(d, lx, ly, 1, "#ffe66a")
        out.append(im)
    return out


def frames_spider(n=4) -> list[Image.Image]:
    out = []
    for f in range(n):
        im = new_img()
        d = ImageDraw.Draw(im)
        shadow(d)
        phase = f * 0.5
        for i, y in enumerate((24, 30, 36, 42)):
            # 腿尖左右交替前后
            off = 4 if (i + f) % 2 == 0 else -4
            d.line([(28, 34), (8 + off, y)], fill=rgba("#2a1818"), width=2)
            d.line([(36, 34), (56 - off, y)], fill=rgba("#2a1818"), width=2)
        fill_ellipse(d, (18, 28, 38, 48), "#2a1818")
        fill_ellipse(d, (20, 30, 36, 46), "#4a2828")
        fill_ellipse(d, (34, 28, 50, 44), "#3a2020")
        for x, y in ((40, 32), (44, 32), (40, 36), (44, 36)):
            disc(d, x, y, 1, "#ff3030")
        d.polygon([(48, 36), (54, 34), (50, 38)], fill=rgba("#1a1010"))
        d.polygon([(48, 38), (54, 42), (50, 40)], fill=rgba("#1a1010"))
        # 腹轻微左右偏
        _ = phase
        out.append(im)
    return out


def frames_beetle(n=4) -> list[Image.Image]:
    out = []
    for f in range(n):
        im = new_img()
        d = ImageDraw.Draw(im)
        shadow(d)
        fill_ellipse(d, (16, 20, 48, 50), "#3a2818")
        fill_ellipse(d, (18, 18, 46, 46), "#6b4a28")
        fill_ellipse(d, (22, 20, 42, 40), "#8a6238")
        d.line([(32, 20), (32, 46)], fill=rgba("#2a1a10"), width=2)
        fill_ellipse(d, (40, 28, 54, 42), "#5a3a20")
        disc(d, 48, 34, 2, "#ff4433")
        disc(d, 50, 36, 2, "#ff4433")
        for i, y in enumerate((28, 34, 40)):
            off = 3 if (i + f) % 2 == 0 else -3
            d.line([(18, y), (8, y - 4 + off)], fill=rgba("#2a1a10"), width=2)
            d.line([(46, y), (56, y - 4 - off)], fill=rgba("#2a1a10"), width=2)
        out.append(im)
    return out


def frames_snake(n=4) -> list[Image.Image]:
    out = []
    for f in range(n):
        im = new_img()
        d = ImageDraw.Draw(im)
        shadow(d, 50)
        wave = f
        base = [
            (12, 36 + (1 if wave % 2 == 0 else -1), 8),
            (20, 30 + (-1 if wave % 2 == 0 else 1), 9),
            (28, 34 + (1 if wave % 2 == 0 else -1), 9),
            (36, 28 + (-1 if wave % 2 == 0 else 1), 9),
            (44, 32, 8),
        ]
        for i, (x, y, r) in enumerate(base):
            c = "#2a7a38" if i % 2 == 0 else "#3e9a4a"
            disc(d, x, y, r, "#145020")
            disc(d, x, y, r - 1, c)
        fill_ellipse(d, (46, 26, 60, 40), "#4aba58")
        disc(d, 54, 30, 2, "#ffe020")
        disc(d, 55, 30, 1, "#102010")
        tongue = 2 if f % 2 == 0 else 0
        d.line([(58, 34), (62 + tongue, 34)], fill=rgba("#e02020"), width=1)
        out.append(im)
    return out


def frames_slime(n=4) -> list[Image.Image]:
    out = []
    for f in range(n):
        im = new_img()
        d = ImageDraw.Draw(im)
        # 压扁 / 弹起
        if f == 0:
            y0, y1, squash = 24, 54, 0
        elif f == 1:
            y0, y1, squash = 20, 50, -2
        elif f == 2:
            y0, y1, squash = 16, 48, -4
        else:
            y0, y1, squash = 22, 52, -1
        shadow(d, 54 + squash // 2)
        fill_ellipse(d, (14 - squash, y0 + 4, 50 + squash, y1), "#1f5c28")
        fill_ellipse(d, (16 - squash, y0, 48 + squash, y1 - 4), "#3cb04a")
        fill_ellipse(d, (20, y0 - 2, 44, y1 - 12), "#5fd86a")
        fill_ellipse(d, (22, y0, 32, y0 + 10), "#b8ffb0")
        ey = y0 + 16
        disc(d, 26, ey, 4, "#ffffff")
        disc(d, 38, ey, 4, "#ffffff")
        disc(d, 27, ey + 1, 2, "#1a1a1a")
        disc(d, 39, ey + 1, 2, "#1a1a1a")
        fill_ellipse(d, (28, ey + 6, 36, ey + 12), "#1f3a20")
        out.append(im)
    return out


def frames_toad(n=4) -> list[Image.Image]:
    out = []
    for f in range(n):
        im = new_img()
        d = ImageDraw.Draw(im)
        # 蹲 → 跳 → 落地
        if f == 0:
            by, stretch = 4, 4
        elif f == 1:
            by, stretch = -6, -2
        elif f == 2:
            by, stretch = -10, -4
        else:
            by, stretch = 0, 0
        shadow(d, 52 + by // 2)
        fill_ellipse(d, (12, 28 + by, 52, 52 + by + stretch), "#1a5028")
        fill_ellipse(d, (14, 24 + by, 50, 48 + by + stretch), "#2e8a40")
        fill_ellipse(d, (18, 22 + by, 46, 40 + by), "#48b058")
        disc(d, 24, 22 + by, 5, "#c8f0a0")
        disc(d, 40, 22 + by, 5, "#c8f0a0")
        disc(d, 24, 22 + by, 2, "#102010")
        disc(d, 40, 22 + by, 2, "#102010")
        # 后腿蹬
        if f in (1, 2):
            d.line([(18, 44 + by), (10, 56 + by)], fill=rgba("#1a5028"), width=3)
            d.line([(46, 44 + by), (54, 56 + by)], fill=rgba("#1a5028"), width=3)
        else:
            d.line([(18, 46 + by), (14, 54 + by)], fill=rgba("#1a5028"), width=3)
            d.line([(46, 46 + by), (50, 54 + by)], fill=rgba("#1a5028"), width=3)
        out.append(im)
    return out


def frames_bat(n=4) -> list[Image.Image]:
    out = []
    for f in range(n):
        im = new_img()
        d = ImageDraw.Draw(im)
        shadow(d, 48)
        # 翼上/下
        up = f in (0, 1)
        if up:
            d.polygon([(6, 20), (28, 18), (26, 34), (10, 36)], fill=rgba("#3a2850"))
            d.polygon([(58, 20), (36, 18), (38, 34), (54, 36)], fill=rgba("#3a2850"))
        else:
            d.polygon([(8, 34), (28, 24), (26, 38), (10, 44)], fill=rgba("#3a2850"))
            d.polygon([(56, 34), (36, 24), (38, 38), (54, 44)], fill=rgba("#3a2850"))
        fill_ellipse(d, (24, 24, 40, 46), "#2a1a38")
        fill_ellipse(d, (26, 26, 38, 42), "#4a3060")
        d.polygon([(26, 26), (22, 14), (30, 24)], fill=rgba("#4a3060"))
        d.polygon([(38, 26), (42, 14), (34, 24)], fill=rgba("#4a3060"))
        disc(d, 28, 34, 2, "#ff3344")
        disc(d, 36, 34, 2, "#ff3344")
        out.append(im)
    return out


def frames_jelly(n=4) -> list[Image.Image]:
    out = []
    for f in range(n):
        im = new_img()
        d = ImageDraw.Draw(im)
        shadow(d, 54)
        bob = (0, -2, 0, 2)[f]
        fill_ellipse(d, (16, 10 + bob, 48, 36 + bob), (40, 120, 150, 200))
        fill_ellipse(d, (18, 12 + bob, 46, 32 + bob), (100, 200, 220, 180))
        disc(d, 26, 22 + bob, 3, "#ffffff")
        disc(d, 38, 22 + bob, 3, "#ffffff")
        disc(d, 26, 23 + bob, 1, "#204050")
        disc(d, 38, 23 + bob, 1, "#204050")
        for i, x in enumerate((22, 28, 34, 40)):
            sway = (2 if (i + f) % 2 == 0 else -2)
            d.line([(x, 32 + bob), (x + sway, 52)], fill=(60, 160, 180, 180), width=2)
        out.append(im)
    return out


def frames_imp(n=4) -> list[Image.Image]:
    out = []
    for f in range(n):
        im = new_img()
        d = ImageDraw.Draw(im)
        hop = (0, -4, -2, 0)[f]
        shadow(d, 52 + hop // 2)
        d.polygon([(24, 20 + hop), (18, 8 + hop), (28, 18 + hop)], fill=rgba("#e0c060"))
        d.polygon([(40, 20 + hop), (46, 8 + hop), (36, 18 + hop)], fill=rgba("#e0c060"))
        fill_ellipse(d, (22, 24 + hop, 42, 48 + hop), "#6a1820")
        fill_ellipse(d, (24, 22 + hop, 40, 44 + hop), "#c03030")
        fill_ellipse(d, (24, 14 + hop, 40, 30 + hop), "#e04040")
        disc(d, 28, 22 + hop, 2, "#ffe020")
        disc(d, 36, 22 + hop, 2, "#ffe020")
        # 腿交替
        if f % 2 == 0:
            d.line([(26, 46 + hop), (22, 56)], fill=rgba("#6a1820"), width=3)
            d.line([(38, 46 + hop), (42, 54)], fill=rgba("#6a1820"), width=3)
        else:
            d.line([(26, 46 + hop), (22, 54)], fill=rgba("#6a1820"), width=3)
            d.line([(38, 46 + hop), (42, 56)], fill=rgba("#6a1820"), width=3)
        d.line([(42, 30 + hop), (54, 18 + hop)], fill=rgba("#c0a040"), width=2)
        out.append(im)
    return out


def frames_bone(n=4) -> list[Image.Image]:
    out = []
    for f in range(n):
        im = new_img()
        d = ImageDraw.Draw(im)
        shadow(d)
        for y in (28, 34, 40):
            d.arc((22, y - 6, 42, y + 6), 200, 340, fill=rgba("#d8d0c0"), width=2)
        d.line([(32, 24), (32, 46)], fill=rgba("#c8c0b0"), width=2)
        fill_ellipse(d, (22, 10, 42, 30), "#e8e0d0")
        fill_ellipse(d, (26, 16, 32, 24), "#1a1010")
        fill_ellipse(d, (34, 16, 40, 24), "#1a1010")
        disc(d, 29, 20, 1, "#ff3030")
        disc(d, 37, 20, 1, "#ff3030")
        # 腿骨交替
        if f % 2 == 0:
            d.line([(26, 46), (20, 58)], fill=rgba("#d8d0c0"), width=3)
            d.line([(38, 46), (44, 56)], fill=rgba("#d8d0c0"), width=3)
        else:
            d.line([(26, 46), (20, 56)], fill=rgba("#d8d0c0"), width=3)
            d.line([(38, 46), (44, 58)], fill=rgba("#d8d0c0"), width=3)
        out.append(im)
    return out


def frames_shroom(n=2) -> list[Image.Image]:
    out = []
    for f in range(n):
        im = new_img()
        d = ImageDraw.Draw(im)
        lean = -2 if f == 0 else 2
        shadow(d)
        d.rounded_rectangle((26 + lean, 30, 38 + lean, 52), radius=4, fill=rgba("#e8d8b8"))
        fill_ellipse(d, (12 + lean, 12, 52 + lean, 36), "#6a2020")
        fill_ellipse(d, (14 + lean, 10, 50 + lean, 32), "#c04040")
        disc(d, 24 + lean, 18, 3, "#fff5e8")
        disc(d, 36 + lean, 22, 4, "#fff5e8")
        disc(d, 29 + lean, 40, 2, "#201818")
        disc(d, 35 + lean, 40, 2, "#201818")
        out.append(im)
    return out


def frames_archer(n=4) -> list[Image.Image]:
    out = []
    for f in range(n):
        im = new_img()
        d = ImageDraw.Draw(im)
        shadow(d)
        fill_ellipse(d, (24, 28, 40, 48), "#2a5018")
        fill_ellipse(d, (26, 26, 38, 44), "#4a8028")
        fill_ellipse(d, (24, 14, 40, 30), "#3a6820")
        fill_ellipse(d, (26, 16, 38, 28), "#58a030")
        d.polygon([(26, 18), (16, 12), (26, 24)], fill=rgba("#58a030"))
        d.polygon([(38, 18), (48, 12), (38, 24)], fill=rgba("#58a030"))
        disc(d, 28, 22, 2, "#ffe020")
        disc(d, 36, 22, 2, "#ffe020")
        if f % 2 == 0:
            d.line([(28, 46), (24, 58)], fill=rgba("#2a5018"), width=3)
            d.line([(36, 46), (40, 56)], fill=rgba("#2a5018"), width=3)
        else:
            d.line([(28, 46), (24, 56)], fill=rgba("#2a5018"), width=3)
            d.line([(36, 46), (40, 58)], fill=rgba("#2a5018"), width=3)
        d.arc((40, 20, 56, 44), 270, 90, fill=rgba("#6a4020"), width=2)
        out.append(im)
    return out


def frames_dragon(n=4) -> list[Image.Image]:
    out = []
    for f in range(n):
        im = new_img()
        d = ImageDraw.Draw(im)
        shadow(d, 50)
        up = f in (0, 1)
        if up:
            d.polygon([(4, 22), (28, 16), (26, 32)], fill=rgba("#6a2030"))
            d.polygon([(60, 22), (36, 16), (38, 32)], fill=rgba("#6a2030"))
        else:
            d.polygon([(4, 34), (28, 22), (26, 38)], fill=rgba("#6a2030"))
            d.polygon([(60, 34), (36, 22), (38, 38)], fill=rgba("#6a2030"))
        fill_ellipse(d, (18, 24, 46, 46), "#5a1818")
        fill_ellipse(d, (20, 22, 44, 42), "#c03020")
        fill_ellipse(d, (40, 18, 58, 34), "#c03020")
        disc(d, 48, 24, 2, "#ffe060")
        d.line([(20, 36), (8, 44)], fill=rgba("#a02818"), width=3)
        out.append(im)
    return out


GENERATORS = {
    "fast": frames_fast,
    "spider": frames_spider,
    "beetle": frames_beetle,
    "snake": frames_snake,
    "slime": frames_slime,
    "toad": frames_toad,
    "bat": frames_bat,
    "jelly": frames_jelly,
    "imp": frames_imp,
    "bone": frames_bone,
    "shroom": frames_shroom,
    "archer": frames_archer,
    "dragon": frames_dragon,
}


def write_ts(frames: dict[str, list[str]]):
    lines = [
        "/** Auto-generated by tools/pixel-gen/gen_enemies.py — do not hand-edit. */",
        "export const ENEMY_PIXEL_SIZE = 64;",
        "/** kind → base64 RGBA frames（走/扑翼循环；[0] 亦作待机）. */",
        "export const ENEMY_PIXEL_FRAMES: Readonly<Record<string, readonly string[]>> = {",
    ]
    for k in sorted(frames.keys()):
        arr = ", ".join(f"'{b}'" for b in frames[k])
        lines.append(f"    '{k}': [{arr}],")
    lines.append("};")
    lines.append("")
    lines.append("/** 兼容：取第 0 帧. */")
    lines.append("export const ENEMY_PIXEL_RGBA: Readonly<Record<string, string>> = {")
    for k in sorted(frames.keys()):
        lines.append(f"    '{k}': ENEMY_PIXEL_FRAMES['{k}'][0],")
    lines.append("};")
    lines.append("")
    OUT_TS.write_text("\n".join(lines), encoding="utf-8")


def main():
    OUT_PNG.mkdir(parents=True, exist_ok=True)
    OUT_TEX.mkdir(parents=True, exist_ok=True)
    packed: dict[str, list[str]] = {}
    for kind, gen in GENERATORS.items():
        imgs = gen()
        packed[kind] = [b64_rgba(im) for im in imgs]
        imgs[0].save(OUT_PNG / f"{kind}.png")
        imgs[0].save(OUT_TEX / f"{kind}.png")
        # 导出走步预览条
        strip = Image.new("RGBA", (W * len(imgs), H), (0, 0, 0, 0))
        for i, im in enumerate(imgs):
            strip.paste(im, (i * W, 0))
        strip.save(OUT_PNG / f"{kind}_walk.png")
        print(f"  {kind}: {len(imgs)} frames")
    write_ts(packed)
    print(f"TS → {OUT_TS}")


if __name__ == "__main__":
    main()
