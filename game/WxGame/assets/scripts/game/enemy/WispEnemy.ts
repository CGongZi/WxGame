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
import { PlayerController } from '../player/PlayerController';
import { AudioManager } from '../../core/AudioManager';
import { EnemyAggro } from './EnemyAggro';

const { ccclass, property } = _decorator;

type FlyerPhase = 'fly' | 'landing' | 'ground' | 'takeoff';

/**
 * 飞行怪（幽魂 / 蝙蝠 / 飞蛾）
 * 盘旋飞 → 周期性落地可近战 → 再起飞。位移走 WorldBridge；动效挂 Body。
 */
@ccclass('WispEnemy')
export class WispEnemy extends Component {

    @property(Node) playerNode: Node = null!;
    @property hp = 18;
    @property damage = 7;
    @property speed = 95;
    @property attackRange = 48;
    @property attackCd = 0.85;

    bodyColor: Color | null = null;
    /** wisp | bat | moth | raven | mosquito —— 体态与剪影 */
    motionKind = 'wisp';

    private _curHp = 0;
    private _cd = 0;
    private _dead = false;
    private _drawn = false;
    private _orbit = Math.random() * Math.PI * 2;
    private _player: PlayerController | null = null;
    private _awake = false;
    private _phase: FlyerPhase = 'fly';
    private _phaseT = 2.4 + Math.random() * 1.6;

    onLoad() {
        if (!this.playerNode) this.playerNode = find('Canvas/Player') as Node;
        this._player = this.playerNode?.getComponent(PlayerController) ?? null;
        EnemyRegistry.register(this);
    }

    start() {
        this._curHp = this.hp;
        if (!this._drawn) this._draw();
        // 错开落地节奏，避免同房齐落
        this._phaseT = this._flyDuration() * (0.55 + Math.random() * 0.7);
    }

    onDestroy() { EnemyRegistry.unregister(this); }
    get isDead() { return this._dead; }
    get collideRadius() {
        return this._phase === 'ground' || this._phase === 'landing' ? 22 : 18;
    }
    get isValid() { return this.node?.isValid ?? false; }
    get airborne() {
        return this._phase === 'fly' || this._phase === 'takeoff';
    }

    update(dt: number) {
        if (this._dead) return;
        if (!GameFlow.isPlaying || GameFlow.isCombatFrozen) return;
        if (this._cd > 0) this._cd -= dt;
        // #129 厅室仇恨：没醒就原地悬停
        if (!this._awake) {
            if (!EnemyAggro.shouldWake(this.node.position.x, this.node.position.y, 560)) {
                const mIdle = this.node.getChildByName('Body')?.getComponent(EnemyMotion);
                if (mIdle) mIdle.moving = false;
                return;
            }
            this._awake = true;
            EnemyAggro.alert(this.node.position.x, this.node.position.y);
        }
        this._orbit += dt * (this.motionKind === 'bat' || this.motionKind === 'mosquito' ? 3.0
            : this.motionKind === 'moth' ? 1.6
            : this.motionKind === 'raven' ? 2.0
            : this.motionKind === 'specter' ? 1.8
            : 2.2);
        this._phaseT -= dt;
        this._tickPhase();
        this._move(dt);
        this._tryBite();
        const motion = this.node.getChildByName('Body')?.getComponent(EnemyMotion);
        if (motion) {
            motion.moving = this._phase === 'fly' || this._phase === 'ground' || this._phase === 'takeoff';
        }
    }

    private _flyDuration() {
        if (this.motionKind === 'bat' || this.motionKind === 'mosquito') return 2.2;
        if (this.motionKind === 'moth') return 3.6;
        if (this.motionKind === 'raven') return 2.6;
        if (this.motionKind === 'specter') return 3.0;
        if (this.motionKind === 'spark') return 2.0;
        if (this.motionKind === 'jelly') return 2.8;
        return 2.8;
    }

    private _groundDuration() {
        if (this.motionKind === 'mosquito') return 1.15;
        if (this.motionKind === 'bat') return 1.5;
        if (this.motionKind === 'moth') return 2.0;
        if (this.motionKind === 'raven') return 1.7;
        if (this.motionKind === 'specter') return 1.6;
        return 1.8;
    }

    private _silhouetteKind(): string {
        return this.motionKind === 'bat' || this.motionKind === 'moth'
            || this.motionKind === 'raven' || this.motionKind === 'mosquito'
            || this.motionKind === 'specter' || this.motionKind === 'spark'
            || this.motionKind === 'jelly'
            ? this.motionKind : 'wisp';
    }

    private _tickPhase() {
        if (this._phaseT > 0) return;
        const body = this.node.getChildByName('Body');
        const motion = body?.getComponent(EnemyMotion);
        if (this._phase === 'fly') {
            this._phase = 'landing';
            this._phaseT = 0.4;
        } else if (this._phase === 'landing') {
            this._phase = 'ground';
            this._phaseT = this._groundDuration() + Math.random() * 0.5;
            if (motion) motion.kind = `${this.motionKind}_ground`;
        } else if (this._phase === 'ground') {
            this._phase = 'takeoff';
            this._phaseT = 0.35;
            if (motion) motion.kind = this.motionKind;
        } else {
            this._phase = 'fly';
            this._phaseT = this._flyDuration() + Math.random() * 1.2;
            if (motion) motion.kind = this.motionKind;
        }
    }

    private _slowMul = 1;
    private _slowUntil = 0;

    applySlow(mul: number, sec: number) {
        this._slowMul = Math.max(0.2, Math.min(1, mul));
        this._slowUntil = Date.now() / 1000 + Math.max(0.1, sec);
    }

    private _move(dt: number) {
        if (this._slowUntil > 0 && Date.now() / 1000 >= this._slowUntil) {
            this._slowUntil = 0;
            this._slowMul = 1;
        }
        const dx = WorldBridge.x - this.node.position.x;
        const dy = WorldBridge.y - this.node.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const sp = this.speed * dt * (this._phase === 'ground' ? 0.65 : 1) * this._slowMul;
        const mx = this.node.position.x;
        const my = this.node.position.y;
        const side = Math.sin(this._orbit) * 0.35;
        const px = -dy / dist;
        const py = dx / dist;

        if (this._phase === 'fly' || this._phase === 'takeoff') {
            if (dist > this.attackRange + 10) {
                // 有视野直飞 + 侧摆；无视野沿流场绕墙
                const dir = WorldBridge.steerToward(mx, my);
                WorldBridge.enemyFlyStep(
                    this.node,
                    mx + dir.x * sp + px * sp * side,
                    my + dir.y * sp + py * sp * side,
                    this.collideRadius,
                );
            } else {
                WorldBridge.enemyFlyStep(
                    this.node,
                    mx + Math.cos(this._orbit) * sp * 0.45,
                    my + Math.sin(this._orbit) * sp * 0.45,
                    this.collideRadius,
                );
            }
            return;
        }

        if (this._phase === 'landing') {
            WorldBridge.enemyStep(
                this.node,
                mx + (dx / dist) * sp * 0.4,
                my + (dy / dist) * sp * 0.4,
                this.collideRadius,
            );
            return;
        }

        // ground：贴地追击（绕墙）
        if (dist > this.attackRange) {
            const dir = WorldBridge.steerToward(mx, my);
            WorldBridge.enemyStep(
                this.node,
                mx + dir.x * sp,
                my + dir.y * sp,
                this.collideRadius,
            );
        } else {
            const p = WorldBridge.separateFromEnemies(mx, my, this.collideRadius, this.node, true);
            if (p.x !== mx || p.y !== my) this.node.setPosition(p.x, p.y, 0);
        }
        CombatFace.face(this.node, dx);
    }

    private _tryBite() {
        if (this._cd > 0) return;
        if (WorldBridge.distTo(this.node.position.x, this.node.position.y) >= this.attackRange) return;

        const body = this.node.getChildByName('Body');
        const motion = body?.getComponent(EnemyMotion);
        motion?.windup(0.12);
        this.scheduleOnce(() => {
            if (this._dead || !this.node?.isValid) return;
            motion?.strike();
            AudioManager.playEnemyAttack(this._silhouetteKind());
            this._player?.takeDamage(this.damage);
            const parent = this.node.parent;
            if (parent) {
                const col = this.motionKind === 'bat'
                    ? new Color(160, 100, 200, 255)
                    : this.motionKind === 'moth'
                        ? new Color(220, 180, 100, 255)
                        : this.motionKind === 'raven'
                            ? new Color(80, 80, 100, 255)
                            : this.motionKind === 'mosquito'
                                ? new Color(100, 180, 70, 255)
                                : this.motionKind === 'specter'
                                    ? new Color(200, 220, 240, 255)
                                    : new Color(160, 220, 255, 255);
                CombatVfx.burst(parent, this.node.position.x, this.node.position.y, col, 5);
            }
        }, 0.12);
        this._cd = this.attackCd * (this._phase === 'ground' ? 0.85 : 1);
    }

    takeDamage(amount: number) {
        if (this._dead) return;
        let dmg = Math.max(1, Math.round(amount));
        this._awake = true;
        EnemyAggro.alert(this.node.position.x, this.node.position.y);
        // 飞行态略抗打，鼓励等落地窗口
        if (this.airborne) dmg = Math.max(1, Math.round(dmg * 0.78));
        this._curHp -= dmg;
        eventBus.emit(GameEvents.DAMAGE_DEALT, {
            amount: dmg,
            position: this.node.position.clone(),
        });
        CombatVfx.hitFlash(this.node.getChildByName('Body'));
        this.node.getChildByName('Body')?.getComponent(EnemyMotion)?.flinch();
        AudioManager.playEnemyHurt(this.motionKind || 'wisp');
        if (this._curHp <= 0) this._die();
    }

    private _die() {
        this._dead = true;
        const id = this._silhouetteKind();
        const parent = this.node.parent;
        const coins = DropTables.rollOnKill(parent, this.node.position.x, this.node.position.y, 'trash');
        eventBus.emit(GameEvents.ENEMY_KILLED, { enemyId: id, coins });
        try { GameManager.instance?.onEnemyKilled(id); } catch {}
        if (parent) {
            CombatVfx.deathBurst(parent, this.node.position.x, this.node.position.y, id);
        } else if (coins > 0) {
            eventBus.emit(GameEvents.COIN_COLLECTED, { amount: coins });
        }
        this.scheduleOnce(() => this.node.destroy(), 0.25);
    }

    private _draw() {
        this._drawn = true;
        const size = this.motionKind === 'bat' ? 44
            : this.motionKind === 'moth' ? 46
            : this.motionKind === 'raven' ? 50
            : this.motionKind === 'mosquito' ? 40
            : this.motionKind === 'specter' ? 52
            : 48;
        this.node.addComponent(UITransform).setContentSize(size, size);
        const body = new Node('Body');
        body.setParent(this.node);
        body.addComponent(UITransform).setContentSize(size, size);
        const g = body.addComponent(Graphics);
        drawEnemySilhouette(
            g,
            this._silhouetteKind(),
            this.bodyColor ?? new Color(140, 200, 255, 255),
            size,
        );
        const motion = body.addComponent(EnemyMotion);
        motion.kind = this.motionKind;
    }
}
