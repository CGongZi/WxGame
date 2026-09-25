import { _decorator, Component, Node, Graphics, Color, UITransform, find } from 'cc';
import { WorldBridge } from '../dungeon/WorldBridge';
import { GameFlow } from '../../core/GameFlow';
import { PlayerController } from '../player/PlayerController';
import { CombatVfx } from '../fx/CombatVfx';

const { ccclass } = _decorator;

/**
 * 地面持续火焰 —— 火球落地后留灼烧区，周期性伤玩家。
 * 挂在敌层；上限控制避免刷屏。
 */
@ccclass('GroundFlame')
export class GroundFlame extends Component {
    private static _alive = 0;
    private static readonly CAP = 10;

    private _ttl = 2.8;
    private _tick = 0;
    private _dmg = 4;
    private _radius = 48;
    private _player: PlayerController | null = null;
    private _pulse = 0;

    static spawn(parent: Node, x: number, y: number, dmg = 4, ttl = 2.8) {
        if (GroundFlame._alive >= GroundFlame.CAP) return;
        const n = new Node('GroundFlame');
        n.setParent(parent);
        n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(96, 96);
        const g = n.addComponent(Graphics);
        const flame = n.addComponent(GroundFlame);
        flame._dmg = dmg;
        flame._ttl = ttl;
        flame._paint(g, 1);
        GroundFlame._alive++;
    }

    onLoad() {
        const p = find('Canvas/Player');
        this._player = p?.getComponent(PlayerController) ?? null;
    }

    onDestroy() {
        GroundFlame._alive = Math.max(0, GroundFlame._alive - 1);
    }

    update(dt: number) {
        if (!GameFlow.isPlaying || GameFlow.isCombatFrozen) return;
        this._ttl -= dt;
        this._tick -= dt;
        this._pulse += dt * 6;
        const g = this.getComponent(Graphics);
        if (g) this._paint(g, 0.75 + Math.sin(this._pulse) * 0.2);

        if (this._tick <= 0) {
            this._tick = 0.35;
            if (WorldBridge.distTo(this.node.position.x, this.node.position.y) < this._radius + WorldBridge.playerRadius) {
                this._player?.takeDamage(this._dmg, { hazard: true });
                CombatVfx.burst(
                    this.node.parent!,
                    this.node.position.x,
                    this.node.position.y + 8,
                    new Color(255, 140, 40, 255),
                    3,
                );
            }
        }
        if (this._ttl <= 0) this.node.destroy();
    }

    private _paint(g: Graphics, a: number) {
        g.clear();
        const alpha = Math.floor(Math.max(40, Math.min(255, a * 200)));
        g.fillColor = new Color(255, 80, 20, Math.floor(alpha * 0.35));
        g.circle(0, -4, 36); g.fill();
        g.fillColor = new Color(255, 160, 40, alpha);
        g.ellipse(0, 0, 22, 14); g.fill();
        g.fillColor = new Color(255, 230, 120, alpha);
        g.ellipse(-4, 6, 10, 16); g.fill();
        g.ellipse(6, 4, 8, 12); g.fill();
        g.fillColor = new Color(255, 255, 220, Math.floor(alpha * 0.8));
        g.ellipse(0, 10, 5, 8); g.fill();
    }

    static clearAll(parent?: Node | null) {
        if (parent?.isValid) {
            for (const c of [...parent.children]) {
                if (c.getComponent(GroundFlame)) c.destroy();
            }
        }
        GroundFlame._alive = 0;
    }
}
