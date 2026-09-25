import { _decorator, Component, Graphics, UITransform, Color, tween, Vec3 } from 'cc';
import { WorldBridge } from '../WorldBridge';
import { Haptic } from '../../../core/Haptic';
import { CombatVfx } from '../../fx/CombatVfx';
import { DropTables } from '../../item/DropTables';
import { LootDrop } from '../../item/LootDrop';
import { EnemyRegistry, type CombatEnemy } from '../../enemy/EnemyRegistry';

const { ccclass } = _decorator;

/** 可打碎木箱：中立 CombatEnemy（不计清房），两击碎，掉币 / 心 / 小道具 */
@ccclass('BreakableCrate')
export class BreakableCrate extends Component implements CombatEnemy {
    readonly neutral = true;
    readonly collideRadius = 20;
    private _dead = false;
    private _hp = 2;

    get isDead() { return this._dead; }

    init() {
        this.node.addComponent(UITransform).setContentSize(40, 40);
        const g = this.node.addComponent(Graphics);
        BreakableCrate._paint(g);
        WorldBridge.addObstacle(this.node.position.x, this.node.position.y, 18);
        EnemyRegistry.register(this);
    }

    onDestroy() {
        EnemyRegistry.unregister(this);
        if (!this._dead) WorldBridge.removeObstacleAt(this.node.position.x, this.node.position.y);
    }

    takeDamage(_amount: number) {
        if (this._dead) return;
        this._hp -= 1;
        const parent = this.node.parent;
        const x = this.node.position.x;
        const y = this.node.position.y;
        if (this._hp > 0) {
            tween(this.node).to(0.06, { scale: new Vec3(1.12, 0.9, 1) }).to(0.08, { scale: new Vec3(1, 1, 1) }).start();
            if (parent?.isValid) CombatVfx.burst(parent, x, y, new Color(170, 120, 60, 255), 4);
            return;
        }
        this._dead = true;
        WorldBridge.removeObstacleAt(x, y);
        EnemyRegistry.unregister(this);
        Haptic.light();
        if (parent?.isValid) {
            CombatVfx.burst(parent, x, y, new Color(190, 140, 70, 255), 12);
            const roll = Math.random();
            if (roll < 0.5) LootDrop.spawn(parent, x, y, 'coin', 1 + Math.floor(Math.random() * 3), 0);
            else if (roll < 0.62) LootDrop.spawn(parent, x, y, 'heart', 8, 1);
            else if (roll < 0.7) DropTables.rollOnKill(parent, x, y, 'trash');
        }
        tween(this.node)
            .to(0.12, { scale: new Vec3(1.3, 0.4, 1) })
            .call(() => { if (this.node.isValid) this.node.destroy(); })
            .start();
    }

    private static _paint(g: Graphics) {
        g.fillColor = new Color(0, 0, 0, 60);
        g.ellipse(0, -16, 18, 5); g.fill();
        g.fillColor = new Color(120, 82, 40, 255);
        g.roundRect(-17, -15, 34, 32, 3); g.fill();
        g.fillColor = new Color(160, 112, 58, 255);
        g.roundRect(-14, -12, 28, 26, 2); g.fill();
        g.strokeColor = new Color(90, 60, 30, 255);
        g.lineWidth = 2.5;
        g.moveTo(-14, -12); g.lineTo(14, 14); g.stroke();
        g.moveTo(14, -12); g.lineTo(-14, 14); g.stroke();
        g.fillColor = new Color(70, 48, 26, 255);
        g.rect(-17, -3, 34, 4); g.fill();
        g.fillColor = new Color(200, 160, 90, 120);
        g.rect(-12, 8, 8, 2); g.fill();
    }
}
