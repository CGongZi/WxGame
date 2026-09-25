import { _decorator, Component, Graphics, UITransform, Color } from 'cc';
import { MAP_TILE } from '../MapConstants';
import { GameFlow } from '../../../core/GameFlow';
import { Haptic } from '../../../core/Haptic';
import { Hazards } from './HazardUtil';
import { EnemyRegistry } from '../../enemy/EnemyRegistry';
import { eventBus } from '../../../core/EventBus';

const { ccclass } = _decorator;

/** 周期地刺：升起 0.95s / 周期 2.4s，升起前 0.3s 刺尖冒头预警；#140 对怪同样生效 */
@ccclass('SpikeTrap')
export class SpikeTrap extends Component {
    private _g: Graphics | null = null;
    private _t = Math.random() * 2.4;
    private _up = false;
    private _hitCd = 0;
    private _enemyCd = 0;
    private static readonly PERIOD = 2.4;
    private static readonly UP = 0.95;

    init(phase: number) {
        this._t = phase;
        this.node.addComponent(UITransform).setContentSize(MAP_TILE, MAP_TILE);
        this._g = this.node.addComponent(Graphics);
        this._paint(0);
    }

    update(dt: number) {
        if (!GameFlow.isPlaying) return;
        this._t += dt;
        if (this._hitCd > 0) this._hitCd -= dt;
        const ph = this._t % SpikeTrap.PERIOD;
        const up = ph < SpikeTrap.UP;
        const warn = !up && ph > SpikeTrap.PERIOD - 0.3;
        const k = up ? Math.min(1, ph / 0.08) : warn ? 0.25 : 0;
        if (up !== this._up || up || warn) this._paint(k);
        this._up = up;
        // #140/#141 机关对「醒着的」地面怪生效（每怪 1s 一跳，睡怪免疫，见 Hazards.canHurtEnemy）
        if (up && this._enemyCd <= 0) {
            this._enemyCd = 0.25;
            const now = this._t;
            const victims = EnemyRegistry.getInRange(this.node.position.x, this.node.position.y, 26, false)
                .filter(e => Hazards.canHurtEnemy(e, now));
            if (victims.length > 0) {
                const dmg = Math.round(Hazards.floorDmg(5) * 1.5);
                for (const e of victims) e.takeDamage(dmg);
                if (!Hazards.tipped('spike_enemy')) {
                    eventBus.emit('show-tip', { text: '⚙ 机关不认主：追你的怪踩地刺也会受伤' });
                }
            }
        }
        if (this._enemyCd > 0) this._enemyCd -= dt;
        if (up && this._hitCd <= 0 && Hazards.playerNear(this.node.position.x, this.node.position.y, 26)) {
            this._hitCd = 0.9;
            Hazards.hurt(Hazards.floorDmg(5), 'spike', '⚠ 地刺有节奏，落下时再过');
            Haptic.light();
        }
    }

    private _paint(k: number) {
        const g = this._g;
        if (!g) return;
        g.clear();
        const h = MAP_TILE / 2 - 3;
        g.fillColor = new Color(40, 36, 48, 255);
        g.roundRect(-h, -h, h * 2, h * 2, 4); g.fill();
        g.fillColor = new Color(70, 64, 80, 255);
        g.roundRect(-h + 3, -h + 3, h * 2 - 6, h * 2 - 6, 3); g.fill();
        g.fillColor = new Color(18, 16, 24, 255);
        for (const [x, y] of [[-10, -10], [10, -10], [-10, 10], [10, 10]]) {
            g.circle(x, y, 3.2); g.fill();
        }
        if (k <= 0) return;
        const len = 16 * k;
        g.fillColor = k >= 1 ? new Color(220, 220, 235, 255) : new Color(160, 160, 180, 255);
        for (const [x, y] of [[-10, -10], [10, -10], [-10, 10], [10, 10]]) {
            g.moveTo(x - 4, y); g.lineTo(x, y + len); g.lineTo(x + 4, y); g.close(); g.fill();
        }
        if (k >= 1) {
            g.fillColor = new Color(255, 90, 90, 120);
            for (const [x, y] of [[-10, -10], [10, -10], [-10, 10], [10, 10]]) {
                g.circle(x, y + len, 2); g.fill();
            }
        }
    }
}
