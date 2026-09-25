import { _decorator, Component, Node, Graphics, Color, UITransform, find } from 'cc';
import { WorldBridge } from '../dungeon/WorldBridge';
import { EnemyRegistry } from './EnemyRegistry';
import { eventBus, GameEvents } from '../../core/EventBus';
import { GameFlow } from '../../core/GameFlow';
import { GameManager } from '../../core/GameManager';
import { DropTables } from '../item/DropTables';
import { CombatVfx } from '../fx/CombatVfx';
import { CombatFace } from '../fx/CombatFace';
import { EnemyMotion } from './EnemyMotion';
import { drawEnemySilhouette } from './EnemySilhouette';
import { EnemyBoltPool } from './EnemyBoltPool';
import { AudioManager } from '../../core/AudioManager';
import { EnemyAggro } from './EnemyAggro';

const { ccclass, property } = _decorator;

/**
 * 法师 —— 远程法球：保持距离，慢而厚的穿透感弹道（视觉更大更慢）。
 */
@ccclass('MageEnemy')
export class MageEnemy extends Component {

    @property(Node) playerNode: Node = null!;
    @property hp = 32;
    @property damage = 14;
    @property speed = 55;
    @property preferDist = 300;
    @property shootRange = 460;
    @property shootCd = 2.1;

    bodyColor: Color | null = null;

    private _curHp = 0;
    private _cd = 0;
    private _dead = false;
    private _drawn = false;
    private _awake = false;

    onLoad() {
        if (!this.playerNode) this.playerNode = find('Canvas/Player') as Node;
        EnemyRegistry.register(this);
    }

    start() {
        this._curHp = this.hp;
        if (!this._drawn) this._draw();
    }

    onDestroy() { EnemyRegistry.unregister(this); }
    get isDead() { return this._dead; }
    get collideRadius() { return 22; }
    get isValid() { return this.node?.isValid ?? false; }

    update(dt: number) {
        if (this._dead) return;
        if (!GameFlow.isPlaying || GameFlow.isCombatFrozen) return;
        if (this._cd > 0) this._cd -= dt;

        const dx = WorldBridge.x - this.node.position.x;
        const dy = WorldBridge.y - this.node.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const sp = this.speed * dt;
        const mx = this.node.position.x;
        const my = this.node.position.y;
        const motion = this.node.getChildByName('Body')?.getComponent(EnemyMotion);
        let relocating = false;

        // #129 厅室仇恨
        if (!this._awake) {
            if (!EnemyAggro.shouldWake(mx, my, this.shootRange + 120)) {
                if (motion) motion.moving = false;
                return;
            }
            this._awake = true;
            EnemyAggro.alert(mx, my);
        }
        const los = WorldBridge.lineOfSight(mx, my, WorldBridge.x, WorldBridge.y);

        if (los && dist < this.preferDist - 50) {
            relocating = true;
            WorldBridge.enemyStep(
                this.node,
                mx - (dx / dist) * sp,
                my - (dy / dist) * sp,
                this.collideRadius,
            );
        } else if (!los || dist > this.preferDist + 70) {
            relocating = true;
            const dir = WorldBridge.steerToward(mx, my);
            WorldBridge.enemyStep(
                this.node,
                mx + dir.x * sp,
                my + dir.y * sp,
                this.collideRadius,
            );
        } else {
            const p = WorldBridge.separateFromEnemies(mx, my, this.collideRadius, this.node, true);
            if (p.x !== mx || p.y !== my) {
                relocating = true;
                this.node.setPosition(p.x, p.y, 0);
            }
        }
        if (motion) motion.moving = relocating;
        CombatFace.face(this.node, dx);

        if (los && dist < this.shootRange && this._cd <= 0) {
            motion?.windup(0.28);
            this._cd = this.shootCd;
            const nx = dx / dist;
            const ny = dy / dist;
            const parent = this.node.parent;
            if (parent) {
                CombatVfx.ringPulse(parent, this.node.position.x, this.node.position.y,
                    new Color(180, 100, 255, 200), 22, 0.28);
            }
            this.scheduleOnce(() => {
                if (this._dead || !this.node?.isValid) return;
                motion?.strike();
                this._cast(nx, ny);
            }, 0.28);
        }
    }

    takeDamage(amount: number) {
        if (this._dead) return;
        const dmg = Math.max(1, Math.round(amount));
        this._curHp -= dmg;
        this._awake = true;
        EnemyAggro.alert(this.node.position.x, this.node.position.y);
        eventBus.emit(GameEvents.DAMAGE_DEALT, {
            amount: dmg,
            position: this.node.position.clone(),
        });
        CombatVfx.hitFlash(this.node.getChildByName('Body'));
        this.node.getChildByName('Body')?.getComponent(EnemyMotion)?.flinch();
        AudioManager.playEnemyHurt('mage');
        if (this._curHp <= 0) this._die();
    }

    private _cast(nx: number, ny: number) {
        const parent = this.node.parent;
        if (!parent) return;
        AudioManager.playEnemyAttack('mage');
        CombatVfx.burst(parent, this.node.position.x, this.node.position.y,
            new Color(180, 100, 255, 255), 6);
        const proj = EnemyBoltPool.get(parent, 'mage');
        proj.node.setPosition(this.node.position.x, this.node.position.y, 0);
        // 慢、远、碰撞半径大
        proj.init(nx, ny, this.damage, 210, 560, 12, new Color(180, 100, 255, 255));
    }

    private _die() {
        this._dead = true;
        const parent = this.node.parent;
        const coins = DropTables.rollOnKill(parent, this.node.position.x, this.node.position.y, 'trash');
        eventBus.emit(GameEvents.ENEMY_KILLED, { enemyId: 'mage', coins });
        try { GameManager.instance?.onEnemyKilled('mage'); } catch {}
        if (parent) {
            CombatVfx.deathBurst(parent, this.node.position.x, this.node.position.y, 'mage');
        } else if (coins > 0) {
            eventBus.emit(GameEvents.COIN_COLLECTED, { amount: coins });
        }
        this.scheduleOnce(() => this.node.destroy(), 0.3);
    }

    private _draw() {
        this._drawn = true;
        this.node.addComponent(UITransform).setContentSize(56, 56);
        const body = new Node('Body');
        body.setParent(this.node);
        body.addComponent(UITransform).setContentSize(56, 56);
        const g = body.addComponent(Graphics);
        drawEnemySilhouette(g, 'mage', this.bodyColor ?? new Color(150, 90, 210, 255), 56);
        const motion = body.addComponent(EnemyMotion);
        motion.kind = 'mage';
    }
}
