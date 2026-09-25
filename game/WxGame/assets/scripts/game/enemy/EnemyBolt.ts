import { _decorator, Component, find, Color } from 'cc';
import { WorldBridge } from '../dungeon/WorldBridge';
import { GameFlow } from '../../core/GameFlow';
import { PlayerController } from '../player/PlayerController';
import { CombatVfx } from '../fx/CombatVfx';
import { EnemyBoltPool } from './EnemyBoltPool';

const { ccclass } = _decorator;

/** 远程怪弹道：有碰撞半径，撞地形/出界回收，命中玩家体积；可带落地回调（火球留焰） */
@ccclass('EnemyBolt')
export class EnemyBolt extends Component {
    private _dx = 0;
    private _dy = 0;
    private _spd = 300;
    private _dmg = 8;
    private _left = 400;
    private _radius = 8;
    private _player: PlayerController | null = null;
    private _trailAcc = 0;
    private _trailColor = new Color(255, 120, 60, 255);
    private _onImpact: ((x: number, y: number) => void) | null = null;
    private _impacted = false;

    init(
        dx: number, dy: number, dmg: number, spd: number, range: number,
        radius = 8, trail?: Color,
        onImpact?: (x: number, y: number) => void,
    ) {
        this._dx = dx; this._dy = dy; this._dmg = dmg; this._spd = spd; this._left = range;
        this._radius = radius;
        this._trailAcc = 0;
        this._impacted = false;
        this._onImpact = onImpact ?? null;
        if (trail) this._trailColor = trail;
        else this._trailColor = new Color(255, 120, 60, 255);
        const player = find('Canvas/Player');
        this._player = player?.getComponent(PlayerController) ?? null;
    }

    update(dt: number) {
        if (!GameFlow.isPlaying) { this._retire(); return; }
        if (GameFlow.isCombatFrozen) return;

        const step = this._spd * dt;
        const nx = this.node.position.x + this._dx * step;
        const ny = this.node.position.y + this._dy * step;
        this.node.setPosition(nx, ny, 0);
        this._left -= step;
        this._trailAcc += step;
        if (this._trailAcc > 16) {
            this._trailAcc = 0;
            const parent = this.node.parent;
            if (parent) CombatVfx.trailDot(parent, nx, ny, this._trailColor, this._radius > 9 ? 5 : 3);
        }
        if (this._left <= 0) { this._retire(true); return; }

        if (WorldBridge.hitsObstacle(nx, ny, this._radius)) {
            this._retire(true);
            return;
        }
        if (Math.abs(nx) > WorldBridge.boundX || Math.abs(ny) > WorldBridge.boundY) {
            this._retire(true);
            return;
        }

        const hitR = this._radius + WorldBridge.playerRadius;
        if (WorldBridge.distTo(nx, ny) < hitR) {
            this._player?.takeDamage(this._dmg);
            this._retire(true);
        }
    }

    private _retire(withImpact = false) {
        if (withImpact && !this._impacted && this._onImpact) {
            this._impacted = true;
            try {
                this._onImpact(this.node.position.x, this.node.position.y);
            } catch { /* soft */ }
        }
        this._onImpact = null;
        EnemyBoltPool.release(this.node);
    }
}
