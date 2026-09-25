import { _decorator, Component, Node, Graphics, UITransform, Color, tween, Vec3 } from 'cc';
import { eventBus, GameEvents } from '../../core/EventBus';
import { GameManager } from '../../core/GameManager';
import { WorldBridge } from '../dungeon/WorldBridge';
import { DungeonLayout } from '../dungeon/DungeonLayout';
import { GameFlow } from '../../core/GameFlow';
import { CombatVfx } from '../fx/CombatVfx';
import { LootMagnet } from './LootMagnet';

const { ccclass } = _decorator;

export type LootKind = 'coin' | 'heart' | 'chest';

/**
 * LootDrop —— 地面掉落（金币/心/宝箱）
 * 走进自动吸，带稀有度光圈；贴近加速吸拢 + 拾取闪光
 */
@ccclass('LootDrop')
export class LootDrop extends Component {

    private _kind: LootKind = 'coin';
    private _amount = 1;
    private _rarity = 0;
    private _picked = false;
    private _magnet = 320;
    private _pickup = 56;
    private _bob = Math.random() * Math.PI * 2;
    /** #149/#164 落地宽限期：期间只弹跳/浮起，不磁吸，玩家能看见掉在尸体旁 */
    private _grace = 0.55;
    private _vx = 0;
    private _vy = 0;

    static spawn(parent: Node, x: number, y: number, kind: LootKind, amount: number, rarity = 0) {
        // #164 贴尸体短距锚定；禁止 nearestFloor→远处/(0,0)
        const L = DungeonLayout.current;
        if (L) {
            const p = L.dropAnchor(x, y);
            x = p.x; y = p.y;
        }
        const n = new Node(`Loot_${kind}`);
        n.setParent(parent);
        n.setPosition(x, y, 0);
        const drop = n.addComponent(LootDrop);
        drop._kind = kind;
        drop._amount = amount;
        drop._rarity = rarity;
        // 小爆散：尸体旁轻弹几像素
        const ang = Math.random() * Math.PI * 2;
        const push = 22 + Math.random() * 28;
        drop._vx = Math.cos(ang) * push;
        drop._vy = Math.sin(ang) * push;
        drop._draw();
        n.setScale(0, 0, 1);
        tween(n)
            .to(0.25, { scale: new Vec3(1.15, 1.15, 1) }, { easing: 'backOut' })
            .to(0.1, { scale: new Vec3(1, 1, 1) })
            .start();
        return drop;
    }

    update(dt: number) {
        if (this._picked) return;
        if (!GameFlow.isPlaying) return;
        this._bob += dt * 3.2;

        // 落地弹射 + 宽限期：只在尸体附近蹦，不进磁吸
        if (this._grace > 0) {
            this._grace -= dt;
            this._vx *= Math.max(0, 1 - 6 * dt);
            this._vy *= Math.max(0, 1 - 6 * dt);
            let nx = this.node.position.x + this._vx * dt;
            let ny = this.node.position.y + this._vy * dt + Math.sin(this._bob) * 4 * dt;
            const L = DungeonLayout.current;
            if (L && !L.isWalkable(DungeonLayout.colOf(nx), DungeonLayout.rowOf(ny))) {
                const p = L.dropAnchor(nx, ny, 3);
                nx = p.x; ny = p.y;
                this._vx = 0; this._vy = 0;
            }
            this.node.setPosition(nx, ny, 0);
            return;
        }

        const dx = WorldBridge.x - this.node.position.x;
        const dy = WorldBridge.y - this.node.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const magnet = LootMagnet.range(this._magnet);

        // 待机轻浮
        if (dist >= magnet) {
            this.node.setPosition(
                this.node.position.x,
                this.node.position.y + Math.sin(this._bob) * 6 * dt,
                0,
            );
        }

        if (dist < magnet && dist > 1) {
            // 越近吸得越快；卷轴激活时全程高速
            const t = LootMagnet.active ? 1 : 1 - dist / magnet;
            const sp = (320 + t * 480) * dt;
            this.node.setPosition(
                this.node.position.x + (dx / dist) * sp,
                this.node.position.y + (dy / dist) * sp, 0,
            );
            const s = 1 + t * 0.15;
            this.node.setScale(s, s, 1);
        }
        if (dist < this._pickup) this._collect();
    }

    private _collect() {
        if (this._picked) return;
        this._picked = true;

        const px = this.node.position.x;
        const py = this.node.position.y;
        const parent = this.node.parent;

        if (this._kind === 'coin' || this._kind === 'chest') {
            const gm = GameManager.instance;
            if (gm) gm.addCoins(this._amount);
            else eventBus.emit(GameEvents.COIN_COLLECTED, { amount: this._amount });
            eventBus.emit(GameEvents.ITEM_PICKED, { kind: this._kind, amount: this._amount });
            eventBus.emit('show-tip', { text: `金币 +${this._amount}` });
        } else if (this._kind === 'heart') {
            eventBus.emit('loot-heart', { amount: this._amount });
            eventBus.emit(GameEvents.ITEM_PICKED, { kind: this._kind, amount: this._amount });
        }

        if (parent?.isValid) {
            const col = this._kind === 'heart'
                ? new Color(255, 90, 120, 255)
                : new Color(255, 210, 60, 255);
            CombatVfx.burst(parent, px, py, col, 6);
            CombatVfx.ringPulse(parent, px, py, col, 12, 0.18);
        }

        tween(this.node)
            .to(0.1, {
                position: new Vec3(WorldBridge.x, WorldBridge.y, 0),
                scale: new Vec3(1.5, 1.5, 1),
            })
            .to(0.1, { scale: new Vec3(0, 0, 1) })
            .call(() => this.node.destroy())
            .start();
    }

    private _draw() {
        this.node.addComponent(UITransform).setContentSize(36, 36);
        const g = this.node.addComponent(Graphics);

        const ring = this._rarity === 2 ? new Color(200, 80, 255, 90)
                   : this._rarity === 1 ? new Color(80, 160, 255, 80)
                   :                      new Color(255, 200, 60, 50);
        g.fillColor = ring;
        g.circle(0, 0, 20); g.fill();

        if (this._kind === 'coin') {
            g.fillColor = new Color(255, 200, 40, 255);
            g.circle(0, 0, 12); g.fill();
            g.fillColor = new Color(255, 240, 140, 255);
            g.circle(-3, 3, 4); g.fill();
        } else if (this._kind === 'heart') {
            g.fillColor = new Color(255, 60, 90, 255);
            g.circle(-5, 2, 7); g.fill();
            g.circle(5, 2, 7); g.fill();
            g.moveTo(-12, 0); g.lineTo(0, -12); g.lineTo(12, 0); g.close(); g.fill();
        } else {
            g.fillColor = new Color(140, 90, 30, 255);
            g.roundRect(-14, -10, 28, 18, 3); g.fill();
            g.fillColor = new Color(200, 140, 40, 255);
            g.roundRect(-14, 0, 28, 10, 3); g.fill();
            g.fillColor = new Color(255, 220, 80, 255);
            g.circle(0, -2, 4); g.fill();
        }
    }
}
