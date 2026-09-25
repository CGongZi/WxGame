#!/usr/bin/env python3
"""Generate hero walk frames + weapon glyphs → TS embed."""
from __future__ import annotations

import base64
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT_PNG = ROOT / "tools" / "pixelorama" / "exports" / "heroes"
OUT_TS = ROOT / "game" / "WxGame" / "assets" / "scripts" / "game" / "fx" / "HeroWeaponPixelData.ts"

HW = HH = 48  # hero
WW = WH = 32  # weapon


def rgba(c):
    if isinstance(c, tuple):
        return c if len(c) == 4 else (*c, 255)
    h = str(c).lstrip("#")
    if len(h) == 6:
        return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4)) + (255,)
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4, 6))


def b64(im: Image.Image) -> str:
    return base64.b64encode(im.tobytes("raw", "RGBA")).decode("ascii")


def disc(d, cx, cy, r, c):
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=rgba(c))


# primary colors per skin (Soul-Knight readable)
SKINS = {
    "knight": dict(body="#468ce6", accent="#dcc878", skin="#ebd1aa", hair="#785028", boots="#1e325a"),
    "ranger": dict(body="#309046", accent="#b4a064", skin="#ebd1aa", hair="#5a3c1e", boots="#284623"),
    "mage": dict(body="#7846c8", accent="#dcB4ff", skin="#f0dcff", hair="#c8a0ff", boots="#32145a"),
    "paladin": dict(body="#dcb446", accent="#ffffff", skin="#ebd1aa", hair="#e6c878", boots="#283250"),
    "assassin": dict(body="#281e3c", accent="#b43cdc", skin="#dcc8be", hair="#1e1428", boots="#140a1e"),
    "dragonkin": dict(body="#a03228", accent="#f0c850", skin="#b43c2d", hair="#f0c850", boots="#281414"),
    "berserker": dict(body="#b45a46", accent="#c83c32", skin="#dcaa8c", hair="#c83c32", boots="#281414"),
    "geomancer": dict(body="#786450", accent="#c8aa5a", skin="#d2bea0", hair="#5a5046", boots="#32281e"),
    "stormcaller": dict(body="#50a0d2", accent="#dcfaFF", skin="#c8f0ff", hair="#dcfaFF", boots="#1e3250"),
    "cryomancer": dict(body="#b4e6ff", accent="#ffffff", skin="#dcf0ff", hair="#c8f0ff", boots="#32506e"),
    "warden": dict(body="#5a7896", accent="#c8b464", skin="#ebd1aa", hair="#3c3228", boots="#28323c"),
    "plague": dict(body="#468c50", accent="#78dc64", skin="#b4c8a0", hair="#1e3223", boots="#1e2d1e"),
    "voidwalker": dict(body="#37235a", accent="#a064ff", skin="#9682b4", hair="#281446", boots="#1e142d"),
    "sunpriest": dict(body="#f0be50", accent="#fff0a0", skin="#f0d2aa", hair="#ffdc64", boots="#5a3c1e"),
}


def paint_hero(skin: str, frame: int) -> Image.Image:
    p = SKINS[skin]
    im = Image.new("RGBA", (HW, HH), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # shadow
    d.ellipse((14, 40, 34, 46), fill=(0, 0, 0, 70))
    hop = (0, -2, 0, -1)[frame % 4]
    # legs alternate
    if frame % 2 == 0:
        d.line([(20, 34 + hop), (16, 44)], fill=rgba(p["boots"]), width=3)
        d.line([(28, 34 + hop), (32, 42)], fill=rgba(p["boots"]), width=3)
    else:
        d.line([(20, 34 + hop), (16, 42)], fill=rgba(p["boots"]), width=3)
        d.line([(28, 34 + hop), (32, 44)], fill=rgba(p["boots"]), width=3)
    # torso
    d.rounded_rectangle((17, 18 + hop, 31, 36 + hop), radius=3, fill=rgba(p["body"]))
    # arms
    arm_y = 22 + hop
    if frame % 2 == 0:
        d.line([(17, arm_y), (10, arm_y + 8)], fill=rgba(p["skin"]), width=2)
        d.line([(31, arm_y), (38, arm_y + 4)], fill=rgba(p["skin"]), width=2)
    else:
        d.line([(17, arm_y), (10, arm_y + 4)], fill=rgba(p["skin"]), width=2)
        d.line([(31, arm_y), (38, arm_y + 8)], fill=rgba(p["skin"]), width=2)
    # head
    disc(d, 24, 14 + hop, 7, p["skin"])
    # hair / helm bar
    d.ellipse((17, 6 + hop, 31, 14 + hop), fill=rgba(p["hair"]))
    # eyes
    disc(d, 21, 14 + hop, 1, "#201810")
    disc(d, 27, 14 + hop, 1, "#201810")
    # accent (belt / gem)
    d.rectangle((19, 28 + hop, 29, 30 + hop), fill=rgba(p["accent"]))
    # assassin mask
    if skin == "assassin":
        d.rectangle((18, 12 + hop, 30, 16 + hop), fill=rgba("#1e1428"))
        disc(d, 21, 14 + hop, 1, p["accent"])
        disc(d, 27, 14 + hop, 1, p["accent"])
    return im


def paint_weapon(wid: str) -> Image.Image:
    im = Image.new("RGBA", (WW, WH), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    cx, cy = 16, 16
    if wid in ("bow", "crossbow", "venom_bow", "starfall_bow"):
        d.arc((4, 4, 28, 28), 200, 340, fill=rgba("#6a4020"), width=3)
        d.line([(16, 6), (16, 26)], fill=rgba("#d8d0b0"), width=1)
        d.line([(8, 16), (24, 16)], fill=rgba("#c8b090"), width=1)
    elif wid in ("wand", "frost", "dragon_fang", "earth_staff", "storm_rod", "glacier_orb", "venom_vials", "solar_scepter"):
        d.rectangle((14, 6, 18, 26), fill=rgba("#6a4030"))
        disc(d, 16, 8, 4, "#ff7832" if wid != "frost" else "#a0e0ff")
        disc(d, 16, 8, 2, "#ffffff")
    elif wid in ("holy_blade", "sunblade", "sword"):
        d.polygon([(16, 4), (20, 20), (16, 18), (12, 20)], fill=rgba("#d0d8e8"))
        d.rectangle((14, 18, 18, 26), fill=rgba("#8a6030"))
        d.rectangle((10, 18, 22, 20), fill=rgba("#c8a050"))
    elif wid in ("shadow_daggers", "void_edge", "dagger", "shuriken"):
        d.polygon([(10, 8), (14, 20), (10, 18)], fill=rgba("#c8c8d8"))
        d.polygon([(22, 8), (18, 20), (22, 18)], fill=rgba("#a078c8"))
        d.rectangle((9, 18, 15, 24), fill=rgba("#403050"))
        d.rectangle((17, 18, 23, 24), fill=rgba("#403050"))
    elif wid in ("axe", "hammer", "blood_cleaver"):
        d.rectangle((14, 10, 18, 26), fill=rgba("#6a4030"))
        d.ellipse((6, 4, 26, 16), fill=rgba("#9098a8"))
        d.ellipse((10, 6, 22, 14), fill=rgba("#b0b8c8"))
    elif wid in ("spear", "ward_glaive", "thunder_lance"):
        d.line([(16, 4), (16, 28)], fill=rgba("#8a6030"), width=2)
        d.polygon([(16, 4), (20, 12), (16, 10), (12, 12)], fill=rgba("#c8d0e0"))
    elif wid == "scatter_gun":
        d.rounded_rectangle((6, 12, 26, 20), radius=2, fill=rgba("#606870"))
        d.rounded_rectangle((4, 14, 12, 22), radius=2, fill=rgba("#785028"))
    elif wid == "saw_disc":
        disc(d, 16, 16, 10, "#c0c8d0")
        disc(d, 16, 16, 4, "#404850")
        for i in range(8):
            import math
            a = i * math.pi / 4
            d.line([(16 + math.cos(a) * 6, 16 + math.sin(a) * 6),
                    (16 + math.cos(a) * 12, 16 + math.sin(a) * 12)], fill=rgba("#e0e8f0"), width=2)
    else:
        # default sword
        d.polygon([(16, 4), (20, 20), (16, 18), (12, 20)], fill=rgba("#d0d8e8"))
        d.rectangle((14, 18, 18, 26), fill=rgba("#8a6030"))
    # soft glow
    glow = Image.new("RGBA", (WW, WH), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((6, 6, 26, 26), fill=(255, 220, 120, 40))
    return Image.alpha_composite(glow, im)


WEAPONS = [
    "sword", "bow", "wand", "dagger", "axe", "hammer", "spear", "frost",
    "crossbow", "holy_blade", "shadow_daggers", "blood_cleaver", "dragon_fang",
    "earth_staff", "storm_rod", "glacier_orb", "venom_bow", "venom_vials",
    "sunblade", "void_edge", "ward_glaive", "solar_scepter", "starfall_bow",
    "shuriken", "scatter_gun", "saw_disc", "thunder_lance",
]


def write_ts(heroes: dict[str, list[str]], weapons: dict[str, str]):
    lines = [
        "/** Auto-generated by tools/pixel-gen/gen_heroes_weapons.py — do not hand-edit. */",
        "export const HERO_PIXEL_SIZE = 48;",
        "export const WEAPON_PIXEL_SIZE = 32;",
        "export const HERO_PIXEL_FRAMES: Readonly<Record<string, readonly string[]>> = {",
    ]
    for k in sorted(heroes.keys()):
        arr = ", ".join(f"'{b}'" for b in heroes[k])
        lines.append(f"    '{k}': [{arr}],")
    lines.append("};")
    lines.append("export const WEAPON_PIXEL_RGBA: Readonly<Record<string, string>> = {")
    for k in sorted(weapons.keys()):
        lines.append(f"    '{k}': '{weapons[k]}',")
    lines.append("};")
    lines.append("")
    OUT_TS.write_text("\n".join(lines), encoding="utf-8")


def main():
    OUT_PNG.mkdir(parents=True, exist_ok=True)
    heroes: dict[str, list[str]] = {}
    for skin in SKINS:
        frames = [paint_hero(skin, f) for f in range(4)]
        heroes[skin] = [b64(im) for im in frames]
        frames[0].save(OUT_PNG / f"{skin}.png")
        strip = Image.new("RGBA", (HW * 4, HH), (0, 0, 0, 0))
        for i, im in enumerate(frames):
            strip.paste(im, (i * HW, 0))
        strip.save(OUT_PNG / f"{skin}_walk.png")
        print(f"  hero {skin}")
    weapons: dict[str, str] = {}
    wdir = OUT_PNG.parent / "weapons"
    wdir.mkdir(parents=True, exist_ok=True)
    for wid in WEAPONS:
        im = paint_weapon(wid)
        weapons[wid] = b64(im)
        im.save(wdir / f"{wid}.png")
    write_ts(heroes, weapons)
    print(f"TS → {OUT_TS}  heroes={len(heroes)} weapons={len(weapons)}")


if __name__ == "__main__":
    main()
