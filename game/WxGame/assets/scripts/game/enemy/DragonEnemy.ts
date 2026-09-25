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
import { GroundFlame } from '../fx/GroundFlame';
import { PlayerController } from '../player/PlayerController';
import { AudioManager } from '../../core/AudioManager';
import { EnemyAggro } from './EnemyAggro';

const { ccclass, property } = _decorator;

type DragonPhase = 'fly' | 'landing' | 'ground' | 'takeoff';

/**
 * 火龙 —— 飞行盘旋喷火球；周期性落地可打；火球落地留焰。
 * Body 动效挂子节点，世界位移走 WorldBridge（飞：enemyFlyStep / 地：enemyStep）。
 */
@ccclass('DragonEnemy')
export class DragonEnemy extends Component {

    @property(Node) playerNode: Node = null!;
    @property hp = 95;
    @property damage = 16;
    @property speed = 72;
    @property shootRange = 480;
    @property shootCd = 1.65;

    bodyColor: Color | null = null;

    private _curHp = 0;
    private _cd = 0;
    private _dead = false;
    private _drawn = false;
    private _phase: DragonPhase = 'fly';
    private _phaseT = 3.2 + Math.random() * 1.2;
    private _orbit = Math.random() * Math.PI * 2;
    private _player: PlayerController | null = null;
    private _awake = false;

    onLoad() {
        if (!this.playerNode) this.playerNode = find('Canvas/Player') as Node;
        this._player = this.playerNode?.getComponent(PlayerController) ?? null;
        EnemyRegistry.register(this);
    }

    start() {
        this._curHp = this.hp;
        if (!this._drawn) this._draw();
    }

    onDestroy() { EnemyRegistry.unregister(this); }
    get isDead() { return this._dead; }
    get collideRadius() { return this._phase === 'fly' || this._phase === 'takeoff' ? 28 : 34; }
    get isValid() { return this.node?.isValid ?? false; }
    /** 飞行态受击略减（鼓励等落地） */
    get airborne() { return this._phase === 'fly' || this._phase === 'takeoff' || this._phase === 'landing'; }

    update(dt: number) {
        if (this._dead) return;
        if (!GameFlow.isPlaying || GameFlow.isCombatFrozen) return;
        if (this._cd > 0) this._cd -= dt;
        // #129 厅室仇恨：没醒就盘旋原地
        if (!this._awake) {
            if (!EnemyAggro.shouldWake(this.node.position.x, this.node.position.y, this.shootRange + 100)) {
                const mIdle = this.node.getChildByName('Body')?.getComponent(EnemyMotion);
                if (mIdle) mIdle.moving = false;
                return;
            }
            this._awake = true;
            EnemyAggro.alert(this.node.position.x, this.node.position.y);
        }
        this._phaseT -= dt;
        this._orbit += dt * (this._phase === 'fly' ? 1.6 : 2.4);

        this._tickPhase();
        this._move(dt);
        this._trySpit();
        const m = this.node.getChildByName('Body')?.getComponent(EnemyMotion);
        if (m) m.moving = this._phase === 'fly' || this._phase === 'ground' || this._phase === 'takeoff';
    }

    private _tickPhase() {
        if (this._phaseT > 0) return;
        if (this._phase === 'fly') {
            this._phase = 'landing';
            this._phaseT = 0.55;
            eventBus.emit('show-tip', { text: '🐉 火龙俯冲落地！' });
        } else if (this._phase === 'landing') {
            this._phase = 'ground';
            this._phaseT = 2.4 + Math.random() * 0.8;
            const body = this.node.getChildByName('Body');
            body?.getComponent(EnemyMotion) && (body.getComponent(EnemyMotion)!.kind = 'dragon_ground');
        } else if (this._phase === 'ground') {
            this._phase = 'takeoff';
            this._phaseT = 0.5;
            eventBus.emit('show-tip', { text: '🐉 火龙振翼起飞' });
        } else {
            this._phase = 'fly';
            this._phaseT = 3.4 + Math.random() * 1.6;
            const body = this.node.getChildByName('Body');
            const m = body?.getComponent(EnemyMotion);
            if (m) m.kind = 'dragon';
        }
    }

    private _move(dt: number) {
        const dx = WorldBridge.x - this.node.position.x;
        const dy = WorldBridge.y - this.node.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const sp = this.speed * dt * (this._phase === 'ground' ? 0.7 : 1);
        const mx = this.node.position.x;
        const my = this.node.position.y;
        const side = Math.sin(this._orbit) * 0.4;
        const px = -dy / dist;
        const py = dx / dist;

        if (this._phase === 'fly' || this._phase === 'takeoff') {
            const prefer = 220;
            let tx = mx;
            let ty = my;
            if (dist > prefer + 40) {
                const dir = WorldBridge.steerToward(mx, my);
                tx += dir.x * sp + px * sp * side;
                ty += dir.y * sp + py * sp * side;
            } else if (dist < prefer - 50) {
                tx -= (dx / dist) * sp * 0.85;
                ty -= (dy / dist) * sp * 0.85;
            } else {
                tx += px * sp * 1.1;
                ty += py * sp * 1.1;
            }
            WorldBridge.enemyFlyStep(this.node, tx, ty, this.collideRadius);
        } else if (this._phase === 'landing') {
            // 缓慢下压靠近玩家
            WorldBridge.enemyStep(
                this.node,
                mx + (dx / dist) * sp * 0.5,
                my + (dy / dist) * sp * 0.5,
                this.collideRadius,
            );
        } else {
            // 地面追击 / 近战撕咬窗口
            if (dist > 70) {
                const dir = WorldBridge.steerToward(mx, my);
                WorldBridge.enemyStep(
                    this.node,
                    mx + dir.x * sp,
                    my + dir.y * sp,
                    this.collideRadius,
                );
            } else if (this._cd <= 0) {
                const body = this.node.getChildByName('Body');
                const motion = body?.getComponent(EnemyMotion);
                motion?.windup(0.14);
                this.scheduleOnce(() => {
                    if (this._dead || !this.node?.isValid) return;
                    motion?.strike();
                    AudioManager.playEnemyAttack('dragon');
                    this._player?.takeDamage(Math.round(this.damage * 1.15));
                    CombatVfx.burst(
                        this.node.parent!,
                        this.node.position.x,
                        this.node.position.y,
                        new Color(255, 100, 40, 255),
                        6,
                    );
                }, 0.14);
                this._cd = 1.1;
            }
        }
        CombatFace.face(this.node, dx);
    }

    private _trySpit() {
        if (this._cd > 0) return;
        if (this._phase !== 'fly' && this._phase !== 'ground') return;
        const dist = WorldBridge.distTo(this.node.position.x, this.node.position.y);
        if (dist > this.shootRange || dist < 40) return;

        const body = this.node.getChildByName('Body');
        const motion = body?.getComponent(EnemyMotion);
        motion?.windup(0.2);
        this._cd = this.shootCd * (this._phase === 'ground' ? 0.85 : 1);

        this.scheduleOnce(() => {
            if (this._dead || !this.node?.isValid) return;
            motion?.strike();
            this._fireball();
        }, 0.2);
    }

    private _fireball() {
        const parent = this.node.parent;
        if (!parent) return;
        AudioManager.playEnemyAttack('dragon');
        const dx = WorldBridge.x - this.node.position.x;
        const dy = WorldBridge.y - this.node.position.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const bolt = EnemyBoltPool.get(parent, 'fireball');
        bolt.node.setPosition(this.node.position.x, this.node.position.y, 0);
        bolt.init(
            dx / len, dy / len,
            this.damage,
            280,
            Math.min(this.shootRange, 520),
            12,
            new Color(255, 120, 40, 255),
            (x, y) => {
                GroundFlame.spawn(parent, x, y, Math.max(8, Math.round(this.damage * 0.45)), 2.6);
                CombatVfx.burst(parent, x, y, new Color(255, 160, 40, 255), 8);
            },
        );
    }

    takeDamage(amount: number) {
        if (this._dead) return;
        let dmg = Math.max(1, Math.round(amount));
        this._awake = true;
        EnemyAggro.alert(this.node.position.x, this.node.position.y);
        if (this.airborne) dmg = Math.max(1, Math.round(dmg * 0.72));
        this._curHp -= dmg;
        eventBus.emit(GameEvents.DAMAGE_DEALT, {
            amount: dmg,
            position: this.node.position.clone(),
        });
        CombatVfx.hitFlash(this.node.getChildByName('Body'));
        this.node.getChildByName('Body')?.getComponent(EnemyMotion)?.flinch();
        AudioManager.playEnemyHurt('dragon');
        if (this._curHp <= 0) this._die();
    }

    private _die() {
        this._dead = true;
        const parent = this.node.parent;
        const coins = DropTables.rollOnKill(parent, this.node.position.x, this.node.position.y, 'trash');
        eventBus.emit(GameEvents.ENEMY_KILLED, { enemyId: 'dragon', coins });
        try { GameManager.instance?.onEnemyKilled('dragon'); } catch {}
        if (parent) {
            CombatVfx.deathBurst(parent, this.node.position.x, this.node.position.y, 'dragon');
            GroundFlame.spawn(parent, this.node.position.x, this.node.position.y, 12, 1.6);
        }
        this.scheduleOnce(() => this.node.destroy(), 0.28);
    }

    private _draw() {
        this._drawn = true;
        const size = 96;
        this.node.addComponent(UITransform).setContentSize(size, size);
        const body = new Node('Body');
        body.setParent(this.node);
        body.addComponent(UITransform).setContentSize(size, size);
        const g = body.addComponent(Graphics);
        const tint = this.bodyColor ?? new Color(200, 70, 40, 255);
        drawEnemySilhouette(g, 'dragon', tint, size);
        const motion = body.addComponent(EnemyMotion);
        motion.kind = 'dragon';
    }
}
