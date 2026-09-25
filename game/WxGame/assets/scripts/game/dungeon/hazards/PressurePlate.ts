import { _decorator, Component, Graphics, UITransform, Color } from 'cc';
import { MAP_TILE } from '../MapConstants';
import { GameFlow } from '../../../core/GameFlow';
import { eventBus } from '../../../core/EventBus';
import { Haptic } from '../../../core/Haptic';
import { CombatVfx } from '../../fx/CombatVfx';
import { DropTables } from '../../item/DropTables';
import { LootDrop } from '../../item/LootDrop';
import { EnemyBoltPool } from '../../enemy/EnemyBoltPool';
import { Hazards } from './HazardUtil';

const { ccclass } = _decorator;

/** 机关板：金 = 宝藏掉落；紫 = 四向弩矢陷阱。踩一次失效 */
@ccclass('PressurePlate')
export class PressurePlate extends Component {
    private _g: Graphics | null = null;
    private _pressed = false;
    private _trap = false;
    private _t = 0;

    init(trap: boolean) {
        this._trap = trap;
        this.node.addComponent(UITransform).setContentSize(MAP_TILE, MAP_TILE);
        this._g = this.node.addComponent(Graphics);
        this._paint(false);
    }

    update(dt: number) {
        if (this._pressed || !GameFlow.isPlaying) return;
        this._t += dt;
        this._paint(Math.floor(this._t * 6) % 2 === 1);
        if (!Hazards.playerNear(this.node.position.x, this.node.position.y, 22)) return;
        this._pressed = true;
        this._paint(false, true);
        this._fire();
    }

    private _fire() {
        const parent = this.node.parent;
        const x = this.node.position.x;
        const y = this.node.position.y;
        if (!parent?.isValid) return;
        Haptic.heavy();
        if (this._trap) {
            CombatVfx.ringPulse(parent, x, y, new Color(200, 90, 255, 220), 18, 0.4);
            CombatVfx.shakeWorld(8);
            eventBus.emit('show-tip', { text: '💜 陷阱机关！四向弩矢' });
            const bp = Hazards.boltParent(parent);
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const b = EnemyBoltPool.get(bp, 'archer');
                b.node.setPosition(x + dx * 30, y + dy * 30, 0);
                b.init(dx, dy, Hazards.floorDmg(6), 340, 520, 7, new Color(200, 120, 255, 255));
            }
            return;
        }
        CombatVfx.burst(parent, x, y, new Color(255, 220, 90, 255), 14);
        CombatVfx.ringPulse(parent, x, y, new Color(255, 230, 120, 230), 20, 0.5);
        eventBus.emit('show-tip', { text: '🎁 机关宝藏！' });
        DropTables.rollOnKill(parent, x, y, 'elite');
        LootDrop.spawn(parent, x + 26, y - 10, 'coin', 4 + Math.floor(Math.random() * 4), 0);
    }

    private _paint(glow: boolean, sunk = false) {
        const g = this._g;
        if (!g) return;
        g.clear();
        const h = MAP_TILE / 2 - 5;
        const base = this._trap ? new Color(70, 40, 100, 255) : new Color(110, 90, 40, 255);
        const top = this._trap
            ? (glow ? new Color(190, 110, 255, 255) : new Color(140, 80, 200, 255))
            : (glow ? new Color(255, 220, 110, 255) : new Color(220, 180, 70, 255));
        g.fillColor = base;
        g.roundRect(-h, -h, h * 2, h * 2, 5); g.fill();
        const inset = sunk ? 6 : 3;
        g.fillColor = sunk ? new Color(60, 50, 40, 255) : top;
        g.roundRect(-h + inset, -h + inset, (h - inset) * 2, (h - inset) * 2, 4); g.fill();
        if (!sunk) {
            g.strokeColor = new Color(255, 255, 255, 110);
            g.lineWidth = 1.5;
            g.circle(0, 0, h * 0.45); g.stroke();
            g.fillColor = new Color(255, 255, 255, 160);
            g.circle(0, 0, 3); g.fill();
        }
    }
}
