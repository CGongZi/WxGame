import {
    Color, Graphics, Node, Sprite, SpriteFrame, Texture2D, UITransform, Rect, Size, Vec2,
} from 'cc';
import { WEAPON_PIXEL_RGBA, WEAPON_PIXEL_SIZE } from './HeroWeaponPixelData';

const cache = new Map<string, SpriteFrame>();

function b64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

function frameFor(id: string): SpriteFrame | null {
    const hit = cache.get(id);
    if (hit) return hit;
    const b64 = WEAPON_PIXEL_RGBA[id];
    if (!b64) return null;
    const n = WEAPON_PIXEL_SIZE;
    const rgba = b64ToBytes(b64);
    if (rgba.length < n * n * 4) return null;
    const tex = new Texture2D();
    tex.reset({ width: n, height: n, format: Texture2D.PixelFormat.RGBA8888 });
    tex.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
    tex.setMipFilter(Texture2D.Filter.NONE);
    tex.uploadData(rgba);
    const sf = new SpriteFrame();
    sf.texture = tex;
    sf.rect = new Rect(0, 0, n, n);
    sf.originalSize = new Size(n, n);
    sf.offset = new Vec2(0, 0);
    cache.set(id, sf);
    return sf;
}

export function hasWeaponPixel(id: string): boolean {
    return Object.prototype.hasOwnProperty.call(WEAPON_PIXEL_RGBA, id);
}

/**
 * 在 parent 上挂/更新 WeaponPixel Sprite；成功则清空 g。
 * 用于局内 WeaponIcon / 商店缩略。
 */
export function mountWeaponPixel(parent: Node, id: string, size: number, g?: Graphics | null): boolean {
    const sf = frameFor(id);
    if (!sf) return false;
    g?.clear();
    let n = parent.getChildByName('WeaponPixel');
    if (!n?.isValid) {
        n = new Node('WeaponPixel');
        n.layer = parent.layer;
        n.setParent(parent);
        n.addComponent(UITransform).setContentSize(size, size);
        n.addComponent(Sprite);
    }
    n.setPosition(0, 0, 0);
    const ut = n.getComponent(UITransform)!;
    ut.setContentSize(size, size);
    const sp = n.getComponent(Sprite)!;
    sp.spriteFrame = sf;
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    sp.color = Color.WHITE;
    return true;
}

/** 无像素时清掉挂件，方便回退 Graphics */
export function clearWeaponPixel(parent: Node) {
    const n = parent.getChildByName('WeaponPixel');
    if (n?.isValid) { n.removeFromParent(); n.destroy(); }
}
