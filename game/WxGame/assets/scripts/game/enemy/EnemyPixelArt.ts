import {
    _decorator, Color, Component, Graphics, Node, Sprite, SpriteFrame,
    Texture2D, UITransform, Rect, Size, Vec2,
} from 'cc';
import { ENEMY_PIXEL_FRAMES, ENEMY_PIXEL_SIZE } from './EnemyPixelData';
import { EnemyMotion } from './EnemyMotion';

const { ccclass } = _decorator;

/**
 * #172/#173 运行时像素贴图：多帧走/扑翼，追击时切帧，不再只靠整身摇晃。
 */

const frameCache = new Map<string, SpriteFrame[]>();

function b64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

function makeFrame(rgba: Uint8Array): SpriteFrame {
    const n = ENEMY_PIXEL_SIZE;
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

function framesFor(kind: string): SpriteFrame[] | null {
    const hit = frameCache.get(kind);
    if (hit) return hit;
    const list = ENEMY_PIXEL_FRAMES[kind];
    if (!list || list.length < 1) return null;
    const n = ENEMY_PIXEL_SIZE;
    const out: SpriteFrame[] = [];
    for (const b64 of list) {
        const rgba = b64ToBytes(b64);
        if (rgba.length < n * n * 4) return null;
        out.push(makeFrame(rgba));
    }
    frameCache.set(kind, out);
    return out;
}

export function hasEnemyPixel(kind: string): boolean {
    return Object.prototype.hasOwnProperty.call(ENEMY_PIXEL_FRAMES, kind);
}

@ccclass('EnemyPixelAnimator')
export class EnemyPixelAnimator extends Component {
    kind = 'slime';
    private _frames: SpriteFrame[] = [];
    private _sprite: Sprite | null = null;
    private _idleT = Math.random() * 4;

    setup(kind: string, frames: SpriteFrame[], sprite: Sprite) {
        this.kind = kind;
        this._frames = frames;
        this._sprite = sprite;
        sprite.spriteFrame = frames[0];
    }

    update(dt: number) {
        if (!this._sprite || this._frames.length < 2) return;
        const motion = this.node.parent?.getComponent(EnemyMotion);
        const moving = motion?.moving ?? false;
        if (!moving) {
            this._idleT += dt;
            // 待机：慢切 0↔1，像轻呼吸，不乱摇
            const i = Math.floor(this._idleT * 2) % Math.min(2, this._frames.length);
            this._sprite.spriteFrame = this._frames[i];
            return;
        }
        const phase = motion?.runPhase ?? 0;
        const n = this._frames.length;
        // 每半圈切一帧 → 奔跑步清晰
        const idx = Math.floor(((phase % (Math.PI * 2)) / (Math.PI * 2)) * n) % n;
        this._sprite.spriteFrame = this._frames[idx];
    }
}

/** 在 Body 挂 Pixel Sprite + 走步动画器；清 Rig/Graphics。有数据返回 true。 */
export function mountEnemyPixel(body: Node, kind: string, tint: Color, size: number): boolean {
    const frames = framesFor(kind);
    if (!frames || frames.length < 1) return false;

    const oldRig = body.getChildByName('Rig');
    if (oldRig?.isValid) { oldRig.removeFromParent(); oldRig.destroy(); }
    const oldPx = body.getChildByName('Pixel');
    if (oldPx?.isValid) { oldPx.removeFromParent(); oldPx.destroy(); }
    body.getComponent(Graphics)?.clear();

    const n = new Node('Pixel');
    n.layer = body.layer;
    n.setParent(body);
    n.setSiblingIndex(0);
    n.addComponent(UITransform).setContentSize(size, size);
    const sp = n.addComponent(Sprite);
    sp.spriteFrame = frames[0];
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    sp.type = Sprite.Type.SIMPLE;
    sp.color = new Color(
        Math.min(255, Math.round(200 + tint.r * 0.22)),
        Math.min(255, Math.round(200 + tint.g * 0.22)),
        Math.min(255, Math.round(200 + tint.b * 0.22)),
        255,
    );
    const anim = n.addComponent(EnemyPixelAnimator);
    anim.setup(kind, frames, sp);
    return true;
}
