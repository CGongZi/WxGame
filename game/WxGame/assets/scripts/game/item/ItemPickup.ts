import { _decorator, Component, Node, Graphics, UITransform, Color, Label, tween, Vec3 } from 'cc';
import { ConfigStore } from '../../core/ConfigStore';
import type { ConfigItem } from '../../core/ConfigSchema';
import { WorldBridge } from '../dungeon/WorldBridge';
import { DungeonLayout } from '../dungeon/DungeonLayout';
import { GameFlow } from '../../core/GameFlow';
import { CombatVfx } from '../fx/CombatVfx';
import { eventBus } from '../../core/EventBus';
import { drawItemGlyph } from '../fx/ItemArt';
import { RunBag } from './RunBag';
import { LootMagnet } from './LootMagnet';

export { applyItem } from './ItemEffects';

const { ccclass } = _decorator;

/**
 * 局内道具拾取：走近吸入背包（不再自动用完）。
 * 使用走 RunBag / HUD 快捷栏。
 */
@ccclass('ItemPickup')
export class ItemPickup extends Component {
    private _item: ConfigItem | null = null;
    private _picked = false;
    private _radius = 58;
    private _magnet = 280;
    private _glow: Node | null = null;
    private _t = Math.random() * 6;
    /** #164 落地宽限：先停在尸体旁，再磁吸 */
    private _grace = 0.5;
    private _vx = 0;
    private _vy = 0;

    /** 「背包已满」提示全局限频，避免站在道具堆上每帧刷屏 */
    private static _fullTipAt = 0;
    /** 背包满被弹开后的冷却（秒，按 _t 计） */
    private _restUntil = 0;

    static spawn(parent: Node, x: number, y: number, itemId: string) {
        const def = ConfigStore.item(itemId);
        if (!def) return null;
        // #164 贴死位短距锚定，禁止跳到远处/(0,0)
        const L = DungeonLayout.current;
        if (L) {
            const a = L.dropAnchor(x, y);
            x = a.x; y = a.y;
        }
        const n = new Node(`Item_${itemId}`);
        n.setParent(parent);
        n.setPosition(x, y, 0);
        const p = n.addComponent(ItemPickup);
        p._item = def;
        const ang = Math.random() * Math.PI * 2;
        const push = 20 + Math.random() * 24;
        p._vx = Math.cos(ang) * push;
        p._vy = Math.sin(ang) * push;
        p._draw(def);
        n.setScale(0, 0, 1);
        tween(n)
            .to(0.22, { scale: new Vec3(1.1, 1.1, 1) }, { easing: 'backOut' })
            .to(0.08, { scale: new Vec3(1, 1, 1) })
            .start();
        return p;
    }

    update(dt: number) {
        if (this._picked || !this._item) return;
        this._t += dt;
        if (this._glow?.isValid) {
            const pulse = 1 + Math.sin(this._t * 4.2) * 0.12;
            this._glow.setScale(pulse, pulse, 1);
        }
        if (!GameFlow.isPlaying || GameFlow.isCombatFrozen) return;
        if (this._t < this._restUntil) return;

        if (this._grace > 0) {
            this._grace -= dt;
            this._vx *= Math.max(0, 1 - 6 * dt);
            this._vy *= Math.max(0, 1 - 6 * dt);
            let nx = this.node.position.x + this._vx * dt;
            let ny = this.node.position.y + this._vy * dt;
            const L = DungeonLayout.current;
            if (L && !L.isWalkable(DungeonLayout.colOf(nx), DungeonLayout.rowOf(ny))) {
                const a = L.dropAnchor(nx, ny, 3);
                nx = a.x; ny = a.y;
                this._vx = 0; this._vy = 0;
            }
            this.node.setPosition(nx, ny, 0);
            return;
        }

        const dx = WorldBridge.x - this.node.position.x;
        const dy = WorldBridge.y - this.node.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // 背包装不下：不磁吸（否则一堆道具被拉到脚下叠成一团）；踩到只限频提示并弹开
        if (!RunBag.canAdd(this._item.id, 1)) {
            if (dist < this._radius) this._bounceAway(dx, dy, dist);
            return;
        }
        const magnet = LootMagnet.range(this._magnet);
        if (dist < magnet && dist > 1) {
            const t = LootMagnet.active ? 1 : 1 - dist / magnet;
            const sp = (260 + t * 400) * dt;
            this.node.setPosition(
                this.node.position.x + (dx / dist) * sp,
                this.node.position.y + (dy / dist) * sp,
                0,
            );
            const s = 1 + t * 0.12;
            this.node.setScale(s, s, 1);
        }
        if (dist < this._radius) this._pick();
    }

    /** 背包满时被玩家踩到：弹到 90px 外最近的地板上，1.2s 内不再靠近 */
    private _bounceAway(dx: number, dy: number, dist: number) {
        const now = Date.now() / 1000;
        if (now - ItemPickup._fullTipAt > 1.5) {
            ItemPickup._fullTipAt = now;
            eventBus.emit('show-tip', { text: '🎒 背包已满 · 用掉一件再拾取' });
        }
        // 远离玩家方向（重叠时随机一个方向）
        let ax = -dx, ay = -dy;
        if (dist < 1) { const a = Math.random() * Math.PI * 2; ax = Math.cos(a); ay = Math.sin(a); }
        else { ax /= dist; ay /= dist; }
        let tx = WorldBridge.x + ax * 90;
        let ty = WorldBridge.y + ay * 90;
        const L = DungeonLayout.current;
        if (L) {
            const a = L.dropAnchor(tx, ty, 4);
            tx = a.x; ty = a.y;
        }
        this._restUntil = this._t + 1.2;
        tween(this.node)
            .to(0.22, { position: new Vec3(tx, ty, 0), scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' })
            .start();
    }

    private _pick() {
        if (this._picked || !this._item) return;
        const it = this._item;
        if (!RunBag.tryAdd(it.id, 1)) {
            const dx = WorldBridge.x - this.node.position.x;
            const dy = WorldBridge.y - this.node.position.y;
            this._bounceAway(dx, dy, Math.hypot(dx, dy));
            return;
        }
        this._picked = true;
        const px = this.node.position.x;
        const py = this.node.position.y;
        const parent = this.node.parent;
        const rare = it.rarity === 'epic' ? '史诗' : it.rarity === 'rare' ? '稀有' : '';
        eventBus.emit('show-tip', {
            text: rare ? `📦 ${it.emoji} ${it.name}·${rare} 入包` : `📦 ${it.emoji} ${it.name} 入包`,
        });
        if (parent?.isValid) {
            const col = ItemPickup._rarityColor(it.rarity);
            CombatVfx.burst(parent, px, py, col, it.rarity === 'epic' ? 10 : 6);
            CombatVfx.ringPulse(parent, px, py, col, it.rarity === 'epic' ? 18 : 12, 0.28);
        }
        tween(this.node)
            .to(0.1, {
                position: new Vec3(WorldBridge.x, WorldBridge.y, 0),
                scale: new Vec3(1.3, 1.3, 1),
            })
            .to(0.1, { scale: new Vec3(0, 0, 1) })
            .call(() => { if (this.node.isValid) this.node.destroy(); })
            .start();
    }

    private _draw(it: ConfigItem) {
        this.node.addComponent(UITransform).setContentSize(56, 64);

        // 稀有度呼吸光圈（挂子节点，不改世界坐标）
        const glow = new Node('Glow');
        glow.setParent(this.node);
        glow.setPosition(0, 4, 0);
        glow.addComponent(UITransform).setContentSize(64, 64);
        const gg = glow.addComponent(Graphics);
        const col = ItemPickup._rarityColor(it.rarity);
        gg.fillColor = new Color(col.r, col.g, col.b, it.rarity === 'epic' ? 70 : it.rarity === 'rare' ? 55 : 35);
        gg.circle(0, 0, it.rarity === 'epic' ? 26 : 22); gg.fill();
        gg.strokeColor = new Color(col.r, col.g, col.b, 160);
        gg.lineWidth = it.rarity === 'epic' ? 3 : 2;
        gg.circle(0, 0, it.rarity === 'epic' ? 26 : 22); gg.stroke();
        this._glow = glow;

        const body = new Node('Glyph');
        body.setParent(this.node);
        body.setPosition(0, 4, 0);
        body.addComponent(UITransform).setContentSize(48, 48);
        drawItemGlyph(body.addComponent(Graphics), it, 40);

        const name = new Node('N');
        name.setParent(this.node);
        name.setPosition(0, -28, 0);
        name.addComponent(UITransform).setContentSize(110, 16);
        const nl = name.addComponent(Label);
        nl.string = it.name;
        nl.fontSize = 11;
        nl.color = col;
    }

    private static _rarityColor(r?: string): Color {
        if (r === 'epic') return new Color(220, 130, 255, 255);
        if (r === 'rare') return new Color(100, 180, 255, 255);
        return new Color(230, 215, 180, 255);
    }
}
