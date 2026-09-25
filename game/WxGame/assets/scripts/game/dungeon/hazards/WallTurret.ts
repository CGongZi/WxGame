import { _decorator, Component, Graphics, UITransform, Color } from 'cc';
import { MAP_TILE } from '../MapConstants';
import { WorldBridge } from '../WorldBridge';
import { GameFlow } from '../../../core/GameFlow';
import { EnemyBoltPool } from '../../enemy/EnemyBoltPool';
import { Hazards } from './HazardUtil';

const { ccclass } = _decorator;

/** 墙弩：玩家进入射道（沿朝向 40~560，横向 <110）→ 充能 0.45s → 射一支弩矢，冷却 2.6s */
@ccclass('WallTurret')
export class WallTurret extends Component {
    private _g: Graphics | null = null;
    private _dx = 1;
    private _dy = 0;
    private _cd = 1.2 + Math.random();
    private _charge = 0;

    init(dir: number) {
        this._dx = dir === 0 ? 1 : dir === 2 ? -1 : 0;
        this._dy = dir === 1 ? 1 : dir === 3 ? -1 : 0;
        this.node.addComponent(UITransform).setContentSize(MAP_TILE, MAP_TILE);
        this._g = this.node.addComponent(Graphics);
        this._paint(0);
    }

    update(dt: number) {
        if (!GameFlow.isPlaying || GameFlow.isCombatFrozen) return;
        const x = this.node.position.x;
        const y = this.node.position.y;
        const px = WorldBridge.x - x;
        const py = WorldBridge.y - y;
        const along = px * this._dx + py * this._dy;
        const perp = Math.abs(px * this._dy - py * this._dx);
        const inLane = along > 40 && along < 560 && perp < 110;

        if (this._charge > 0) {
            this._charge -= dt;
            this._paint(1 - this._charge / 0.45);
            if (this._charge <= 0) this._fire();
            return;
        }
        this._cd -= dt;
        if (this._cd <= 0 && inLane) {
            this._cd = 2.6;
            this._charge = 0.45;
        }
    }

    private _fire() {
        const parent = this.node.parent;
        if (!parent?.isValid) return;
        const b = EnemyBoltPool.get(Hazards.boltParent(parent), 'archer');
        b.node.setPosition(this.node.position.x + this._dx * 26, this.node.position.y + this._dy * 26, 0);
        b.init(this._dx, this._dy, Hazards.floorDmg(6), 360, 620, 7, new Color(255, 200, 120, 255));
        this._paint(0);
    }

    private _paint(charge: number) {
        const g = this._g;
        if (!g) return;
        g.clear();
        const h = MAP_TILE / 2;
        g.fillColor = new Color(52, 46, 60, 255);
        g.rect(-h, -h, h * 2, h * 2); g.fill();
        g.fillColor = new Color(80, 72, 92, 255);
        g.roundRect(-h + 4, -h + 4, h * 2 - 8, h * 2 - 8, 3); g.fill();
        const ox = this._dx * 8;
        const oy = this._dy * 8;
        g.fillColor = new Color(15, 12, 20, 255);
        g.circle(ox, oy, 9); g.fill();
        if (charge > 0) {
            g.fillColor = new Color(255, 150 + Math.floor(100 * charge), 60, Math.floor(120 + 135 * charge));
            g.circle(ox, oy, 3 + charge * 5); g.fill();
        }
        g.fillColor = new Color(160, 150, 130, 255);
        g.moveTo(ox - this._dy * 6, oy + this._dx * 6);
        g.lineTo(ox + this._dx * 14, oy + this._dy * 14);
        g.lineTo(ox + this._dy * 6, oy - this._dx * 6);
        g.close(); g.fill();
    }
}
