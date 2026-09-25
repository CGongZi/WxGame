import { Color, Graphics, Node, UITransform, Layers } from 'cc';
import { drawEnemySilhouette } from '../enemy/EnemySilhouette';
import { CharacterRig } from '../fx/CharacterRig';
import { clearWeaponPixel } from '../fx/WeaponPixelArt';
import { drawWeaponGlyph } from '../fx/WeaponArt';
import { drawItemGlyph } from '../fx/ItemArt';
import { ConfigStore } from '../../core/ConfigStore';
import type { WeaponType } from '../weapon/WeaponController';

export type ThumbArtKind = 'weapon' | 'enemy' | 'hero' | 'item' | 'none';

/** 图鉴/缩略用：与局内刷怪同色 */
export function enemyThumbTint(id: string): Color {
    const row = ConfigStore.enemy(id);
    if (row?.defaultColor) {
        const [r, g, b] = row.defaultColor;
        return new Color(r, g, b, 255);
    }
    // Boss 等无表项时的兜底色
    if (id === 'boss') return new Color(160, 40, 50, 255);
    return new Color(120, 140, 160, 255);
}

/**
 * #178/#180 图鉴 / 商场缩略：与局内同一套 Rig / 程序剪影。
 * 静态挂载（不跳动）；不再用脚本像素或 emoji 顶替。
 */
export function clearThumbArt(parent: Node) {
    const art = parent.getChildByName('ThumbArt');
    if (art?.isValid) { art.removeFromParent(); art.destroy(); }
    clearWeaponPixel(parent);
}

export function mountThumbArt(
    parent: Node,
    kind: ThumbArtKind,
    id: string,
    size: number,
    unlocked = true,
): boolean {
    clearThumbArt(parent);
    if (kind === 'none' || !id) return false;

    const art = new Node('ThumbArt');
    art.layer = parent.layer || Layers.Enum.UI_2D;
    art.setParent(parent);
    art.setPosition(0, kind === 'weapon' || kind === 'item' ? 6 : 8, 0);
    art.addComponent(UITransform).setContentSize(size, size);
    const g = art.addComponent(Graphics);

    let ok = false;
    if (kind === 'weapon') {
        try {
            drawWeaponGlyph(g, id as WeaponType, size * 0.85);
            ok = true;
        } catch { /* no def */ }
    } else if (kind === 'enemy') {
        // #188 用局内 defaultColor，禁止纯白 tint（会变成黑白剪影）
        const tint = enemyThumbTint(id);
        drawEnemySilhouette(g, id, tint, size, false);
        ok = true;
    } else if (kind === 'hero') {
        CharacterRig.mount(art, id, false);
        const scale = size / 56;
        art.setScale(scale, scale, 1);
        ok = true;
    } else if (kind === 'item') {
        const it = ConfigStore.item(id);
        if (it) {
            drawItemGlyph(g, it, size * 0.7);
            ok = true;
        }
    }

    if (!ok) {
        art.removeFromParent();
        art.destroy();
        return false;
    }

    if (!unlocked) {
        // 未解锁：轻压暗，仍能看清外形（重罩会让人以为没画）
        g.fillColor = new Color(12, 10, 16, 90);
        g.roundRect(-size / 2, -size / 2, size, size, 6); g.fill();
    }
    return true;
}
