import {
    _decorator, Color, Component, Graphics, Node, Sprite, SpriteFrame,
    Texture2D, UITransform, Rect, Size, Vec2,
} from 'cc';
import { HERO_PIXEL_FRAMES, HERO_PIXEL_SIZE } from './HeroWeaponPixelData';
import { IdleBreath } from './IdleBreath';

const { ccclass } = _decorator;

const cache = new Map<string, SpriteFrame[]>();

function b64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

function makeFrame(rgba: Uint8Array, n: number): SpriteFrame {
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
    return sf;
}

function framesFor(skinId: string): SpriteFrame[] | null {
    const hit = cache.get(skinId);
    if (hit) return hit;
    const list = HERO_PIXEL_FRAMES[skinId];
    if (!list?.length) return null;
    const n = HERO_PIXEL_SIZE;
    const out: SpriteFrame[] = [];
    for (const b64 of list) {
        const rgba = b64ToBytes(b64);
        if (rgba.length < n * n * 4) return null;
        out.push(makeFrame(rgba, n));
    }
    cache.set(skinId, out);
    return out;
}

export function hasHeroPixel(skinId: string): boolean {
    return Object.prototype.hasOwnProperty.call(HERO_PIXEL_FRAMES, skinId);
}

@ccclass('HeroPixelAnimator')
export class HeroPixelAnimator extends Component {
    private _frames: SpriteFrame[] = [];
    private _sprite: Sprite | null = null;
    private _phase = Math.random() * 10;
    private _idleT = 0;

    setup(frames: SpriteFrame[], sprite: Sprite) {
        this._frames = frames;
        this._sprite = sprite;
        sprite.spriteFrame = frames[0];
    }

    update(dt: number) {
        if (!this._sprite || this._frames.length < 2) return;
        const breath = this.node.parent?.getComponent(IdleBreath);
        const moving = breath?.moving ?? false;
        if (!moving) {
            this._idleT += dt;
            const i = Math.floor(this._idleT * 1.6) % Math.min(2, this._frames.length);
            this._sprite.spriteFrame = this._frames[i];
            return;
        }
        this._phase += dt * 10;
        const idx = Math.floor(this._phase) % this._frames.length;
        this._sprite.spriteFrame = this._frames[idx];
    }
}

/**
 * #176 在 Body 上挂像素主角（走步切帧）。成功则清掉旧 Rig。
 * 返回 true 表示已用像素。
 */
export function mountHeroPixel(body: Node, skinId: string, size = 56): boolean {
    const frames = framesFor(skinId);
    if (!frames) return false;

    const oldRig = body.getChildByName('Rig');
    if (oldRig?.isValid) { oldRig.removeFromParent(); oldRig.destroy(); }
    const oldPx = body.getChildByName('HeroPixel');
    if (oldPx?.isValid) { oldPx.removeFromParent(); oldPx.destroy(); }
    body.getComponent(Graphics)?.clear();

    const n = new Node('HeroPixel');
    n.layer = body.layer;
    n.setParent(body);
    n.setSiblingIndex(0);
    n.addComponent(UITransform).setContentSize(size, size);
    const sp = n.addComponent(Sprite);
    sp.spriteFrame = frames[0];
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    sp.color = Color.WHITE;
    const anim = n.addComponent(HeroPixelAnimator);
    anim.setup(frames, sp);
    return true;
}
