import { _decorator, Component, Node, Sprite, Graphics, Color, find } from 'cc';
import { GameManager } from '../../core/GameManager';
import { eventBus, GameEvents } from '../../core/EventBus';
import { GameFlow } from '../../core/GameFlow';
import { EnemyRegistry } from './EnemyRegistry';
import { WorldBridge } from '../dungeon/WorldBridge';
import { DropTables } from '../item/DropTables';
import { CombatVfx } from '../fx/CombatVfx';
import { CombatFace } from '../fx/CombatFace';
import { EnemyMotion } from './EnemyMotion';
import { IdleBreath } from '../fx/IdleBreath';
import { drawEnemySilhouette } from './EnemySilhouette';
import { AudioManager } from '../../core/AudioManager';
import { PlayerController } from '../player/PlayerController';
import { EnemyAggro } from './EnemyAggro';
import { DungeonLayout } from '../dungeon/DungeonLayout';

const { ccclass, property } = _decorator;

/** #144 windup/dash = 甲虫冲锋；leap = 毒蛙扑跳（元气骑士式「有前摇的大动作」） */
type SlimeState = 'idle' | 'chase' | 'attack' | 'stunned' | 'dead' | 'windup' | 'dash' | 'leap';

@ccclass('SlimeEnemy')
export class SlimeEnemy extends Component {

    @property(Node)
    playerNode: Node = null!;

    @property({ min: 10 }) hp:              number = 30;
    @property({ min: 1  }) damage:          number = 8;
    @property({ min: 10 }) speed:           number = 70;
    @property({ min: 10 }) detectionRange:  number = 400;
    @property({ min: 10 }) attackRange:     number = 50;
    @property({ min: 0.1}) attackCooldown:  number = 1.2;
    /** slime / fast / tank，决定挤压和攻击前冲 */
    kind = 'slime';

    private _state: SlimeState = 'idle';
    private _currentHp = 0;
    private _maxHp = 0;
    private _attackTimer = 0;
    private _stunTimer = 0;
    private _sprite: Sprite | null = null;
    private _graphics: Graphics | null = null;

    private readonly C_NORMAL = new Color( 60, 200,  80, 255);
    private readonly C_HIT    = new Color(255,  80,  80, 255);
    private readonly C_DEAD   = new Color( 80,  80,  80, 120);

    onLoad() {
        this._sprite   = this.getComponent(Sprite);
        this._graphics = this.getComponent(Graphics);
        if (this._sprite) this._sprite.color = this.C_NORMAL;

        // 自动查找玩家（Player 留在 Canvas 下，钉在屏幕中心）
        if (!this.playerNode) {
            this.playerNode = find('Canvas/Player') as Node;
        }

        // 注册到全局表
        EnemyRegistry.register(this);
        console.log(`[Slime] 已注册，共 ${EnemyRegistry.count} 只`);
    }

    /** HP 在 addComponent 之后由 DungeonManager 赋值，须在 start 再快照 */
    start() {
        this._currentHp = this.hp;
        this._maxHp     = this.hp;
    }

    onDestroy() {
        EnemyRegistry.unregister(this);
    }

    update(dt: number) {
        if (this._state === 'dead') return;
        // 大厅态冻结 AI（软回大厅若残留节点也不会追击/攻击）
        if (!GameFlow.isPlaying || GameFlow.isCombatFrozen) return;

        if (this._state === 'stunned') {
            this._stunTimer -= dt;
            if (this._stunTimer <= 0) this._state = 'chase';
            const m = this.node.getChildByName('Body')?.getComponent(EnemyMotion);
            if (m) m.moving = false;
            return;
        }

        if (this._attackTimer > 0) this._attackTimer -= dt;

        const dist = this._distToPlayer();
        const motion = this.node.getChildByName('Body')?.getComponent(EnemyMotion);
        const mx = this.node.position.x;
        const my = this.node.position.y;

        if (this._specialCd > 0) this._specialCd -= dt;

        switch (this._state) {
            case 'idle':
                if (motion) motion.moving = false;
                // #129 厅室仇恨：同厅 / 被告警 / 近距有视野 → 立刻冲
                if (EnemyAggro.shouldWake(mx, my, this.detectionRange)) {
                    this._state = 'chase';
                    EnemyAggro.alert(mx, my);
                }
                break;
            case 'chase':
                if (this._trySpecial(dist, motion)) break;
                if (dist < this.attackRange) {
                    this._state = 'attack';
                    if (motion) motion.moving = false;
                } else {
                    if (motion) motion.moving = true;
                    this._moveToward(dt);
                }
                break;
            case 'windup':
                if (motion) motion.moving = false;
                this._specialT -= dt;
                if (this._specialT <= 0) this._startDash(motion);
                break;
            case 'dash':
                this._tickDash(dt, motion);
                break;
            case 'leap':
                // 位移由 tween 驱动，这里只等落地
                break;
            case 'attack':
                if (motion) motion.moving = false;
                if (dist > this.attackRange * 1.5) this._state = 'chase';
                else if (this._attackTimer <= 0)   this._doAttack();
                break;
        }
        // 贴身也掉血（不只等攻击动画帧）
        if (!this.isDead && this._state !== 'idle' && dist < 36 && this._attackTimer <= 0) {
            this._doAttack();
        }
    }

    /** 受到伤害 */
    takeDamage(amount: number) {
        if (this._state === 'dead') return;
        // 伤害已在 PlayerStats.calcOutgoing 结算（含暴击），这里不再二次暴击
        const dmg = Math.max(1, Math.round(amount));
        this._currentHp -= dmg;

        eventBus.emit(GameEvents.DAMAGE_DEALT, {
            amount: dmg,
            position: this.node.position.clone(),
        });

        if (this._sprite) {
            this._sprite.color = this.C_HIT;
            this.scheduleOnce(() => {
                if (this._sprite && this._state !== 'dead')
                    this._sprite.color = this.C_NORMAL;
            }, 0.12);
        } else if (this._graphics) {
            CombatFace.pulse(this, this.node, 1.15, 0.12);
        }
        CombatVfx.hitFlash(this.node.getChildByName('Body'));
        this.node.getChildByName('Body')?.getComponent(EnemyMotion)?.flinch();
        AudioManager.playEnemyHurt(this.kind || 'slime');

        // 空中扑跳不被打断（落地才算）；冲锋 / 蓄力被打会被顶停
        if (this._state !== 'leap') {
            this._state = 'stunned';
            this._stunTimer = 0.25;
        }
        // 被打 → 全厅告警
        EnemyAggro.alert(this.node.position.x, this.node.position.y);
        if (this._currentHp <= 0) this._die();
    }

    get isDead() { return this._state === 'dead'; }
    get collideRadius() { return 24; }
    get isValid() { return this.node?.isValid ?? false; }

    // ── 私有 ──

    private _slowMul = 1;
    private _slowUntil = 0;

    applySlow(mul: number, sec: number) {
        this._slowMul = Math.max(0.2, Math.min(1, mul));
        this._slowUntil = Date.now() / 1000 + Math.max(0.1, sec);
        const body = this.node.getChildByName('Body');
        if (body?.isValid) CombatVfx.hitFlash(body);
    }

    private _speedMul(): number {
        if (this._slowUntil > 0 && Date.now() / 1000 >= this._slowUntil) {
            this._slowUntil = 0;
            this._slowMul = 1;
        }
        return this._slowMul;
    }

    private _moveToward(dt: number) {
        const mx = this.node.position.x, my = this.node.position.y;
        const px = WorldBridge.x, py = WorldBridge.y;
        const dx = px - mx, dy = py - my;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1) return;
        const sp = this.speed * dt * this._speedMul();
        // #125 绕墙：有视野直追，无视野沿流场
        const dir = WorldBridge.steerToward(mx, my);
        WorldBridge.enemyStep(
            this.node,
            mx + dir.x * sp,
            my + dir.y * sp,
            this.collideRadius,
        );
        CombatFace.face(this.node, dx);
    }

    // ── #144 大动作：甲虫冲锋 / 毒蛙扑跳 ─────────────────────────

    private _specialCd = 1.2 + Math.random() * 1.5;
    private _specialT = 0;
    private _dashDir = { x: 1, y: 0 };
    private _dashHit = false;

    /** 追击中满足距离 + 视野 + 冷却 → 起手大动作 */
    private _trySpecial(dist: number, motion: EnemyMotion | null | undefined): boolean {
        if (this._specialCd > 0) return false;
        const mx = this.node.position.x, my = this.node.position.y;
        if (this.kind === 'beetle') {
            if (dist < 130 || dist > 340) return false;
            if (!WorldBridge.lineOfSight(mx, my, WorldBridge.x, WorldBridge.y)) return false;
            const dx = WorldBridge.x - mx, dy = WorldBridge.y - my;
            const len = Math.hypot(dx, dy) || 1;
            this._dashDir = { x: dx / len, y: dy / len };
            this._state = 'windup';
            this._specialT = 0.55;
            this._dashHit = false;
            motion?.windup(0.55);
            const parent = this.node.parent;
            if (parent) CombatVfx.chargeWarn(parent, mx, my, this._dashDir.x, this._dashDir.y, Math.min(300, dist + 60));
            AudioManager.playEnemyAttack('beetle');
            return true;
        }
        if (this.kind === 'toad') {
            if (dist < 110 || dist > 280) return false;
            this._state = 'windup';
            this._specialT = 0.38;
            motion?.windup(0.38);
            return true;
        }
        return false;
    }

    private _startDash(motion: EnemyMotion | null | undefined) {
        if (this.kind === 'toad') { this._startLeap(motion); return; }
        this._state = 'dash';
        this._specialT = 0.4;
        motion?.strike();
        if (motion) motion.moving = true;
        CombatFace.face(this.node, this._dashDir.x);
    }

    private _tickDash(dt: number, motion: EnemyMotion | null | undefined) {
        this._specialT -= dt;
        const from = this.node.position;
        const sp = this.speed * 4.2 * dt;
        const p = WorldBridge.enemyStep(this.node, from.x + this._dashDir.x * sp, from.y + this._dashDir.y * sp, this.collideRadius);
        const moved = Math.hypot(p.x - from.x, p.y - from.y);
        const parent = this.node.parent;
        if (parent && Math.random() < 0.5) CombatVfx.trailDot(parent, p.x, p.y - 8, new Color(160, 120, 60, 200), 4);
        // 撞到人：一次 1.4 倍伤 + 顶开
        if (!this._dashHit && this._distToPlayer() < this.collideRadius + 30) {
            this._dashHit = true;
            const pc = (this.playerNode?.isValid ? this.playerNode : find('Canvas/Player'))?.getComponent(PlayerController);
            pc?.takeDamage(Math.round(this.damage * 1.4));
            if (parent) CombatVfx.ringPulse(parent, p.x, p.y, new Color(200, 150, 80, 220), 18, 0.22);
            CombatVfx.shakeWorld(8);
            this._endDash(motion, 0.5);
            return;
        }
        // 撞墙：自己晕 0.8s（玩家侧身躲开就是惩罚窗口）
        if (moved < sp * 0.3) {
            if (parent) CombatVfx.burst(parent, p.x, p.y, new Color(200, 190, 170, 255), 6);
            CombatVfx.shakeWorld(5);
            this._endDash(motion, 0.8);
            return;
        }
        if (this._specialT <= 0) this._endDash(motion, 0.3);
    }

    private _endDash(motion: EnemyMotion | null | undefined, stun: number) {
        this._state = 'stunned';
        this._stunTimer = stun;
        this._specialCd = 3.2 + Math.random();
        if (motion) motion.moving = false;
    }

    /** 毒蛙：跳到玩家起跳时的位置（吸到地板），落地一圈震伤 */
    private _startLeap(motion: EnemyMotion | null | undefined) {
        const L = DungeonLayout.current;
        const tx0 = WorldBridge.x, ty0 = WorldBridge.y;
        const target = L ? L.nearestFloor(tx0, ty0) : { x: tx0, y: ty0 };
        this._state = 'leap';
        motion?.strike();
        const from = this.node.position.clone();
        const dur = 0.45;
        const sign = target.x < from.x ? -1 : 1;
        let t = 0;
        // Body 的本地位移每帧被 EnemyMotion 覆盖，腾空感用根节点整体放大（朝镜头跳起）
        this.schedule(() => {
            if (this._state !== 'leap' || !this.node?.isValid) return;
            t = Math.min(1, t + 1 / 60 / dur);
            const arc = Math.sin(t * Math.PI);
            this.node.setPosition(from.x + (target.x - from.x) * t, from.y + (target.y - from.y) * t, 0);
            const s = 1 + arc * 0.35;
            this.node.setScale(sign * s, s, 1);
            if (t >= 1) this._landLeap(motion);
        }, 1 / 60, Math.ceil(dur * 60) + 2);
        this.scheduleOnce(() => { if (this._state === 'leap') this._landLeap(motion); }, dur + 0.1);
    }

    private _landLeap(motion: EnemyMotion | null | undefined) {
        if (this._state !== 'leap') return;
        this.unscheduleAllCallbacks();
        const sx = this.node.scale.x < 0 ? -1 : 1;
        this.node.setScale(sx, 1, 1);
        const p = this.node.position;
        const parent = this.node.parent;
        if (parent) {
            CombatVfx.ringPulse(parent, p.x, p.y, new Color(90, 220, 110, 220), 24, 0.3);
            CombatVfx.burst(parent, p.x, p.y, new Color(70, 200, 90, 255), 8);
        }
        CombatVfx.shakeWorld(6);
        if (this._distToPlayer() < 74) {
            const pc = (this.playerNode?.isValid ? this.playerNode : find('Canvas/Player'))?.getComponent(PlayerController);
            pc?.takeDamage(Math.round(this.damage * 1.2));
        }
        // 与其他怪 / 墙分离一次
        WorldBridge.enemyStep(this.node, p.x, p.y, this.collideRadius);
        this._state = 'stunned';
        this._stunTimer = 0.4;
        this._specialCd = 2.8 + Math.random();
        if (motion) motion.moving = false;
    }

    private _doAttack() {
        this._attackTimer = this.attackCooldown;
        const motion = this.node.getChildByName('Body')?.getComponent(EnemyMotion);
        motion?.windup(this.kind === 'tank' || this.kind === 'beetle' || this.kind === 'crystal' || this.kind === 'golem' ? 0.28 : 0.14);
        this.scheduleOnce(() => {
            if (this._state === 'dead' || !this.node?.isValid) return;
            motion?.strike();
            AudioManager.playEnemyAttack(this.kind || 'slime');
            if (this._distToPlayer() < this.attackRange) {
                if (!this.playerNode?.isValid) {
                    this.playerNode = find('Canvas/Player') as Node;
                }
                const pc = this.playerNode?.getComponent(PlayerController);
                pc?.takeDamage(this.damage);
                const parent = this.node.parent;
                if (parent) {
                    const color = this.kind === 'tank'
                        ? new Color(180, 40, 40, 255)
                        : this.kind === 'fast'
                            ? new Color(80, 220, 255, 255)
                            : this.kind === 'beetle'
                                ? new Color(160, 120, 60, 255)
                                : this.kind === 'toad'
                                    ? new Color(70, 200, 90, 255)
                                    : this.kind === 'crystal'
                                        ? new Color(160, 220, 255, 255)
                                        : this.kind === 'golem'
                                            ? new Color(160, 150, 170, 255)
                                            : new Color(90, 200, 80, 255);
                    CombatVfx.burst(parent, this.node.position.x, this.node.position.y,
                        color, this.kind === 'tank' || this.kind === 'crystal' || this.kind === 'golem' ? 8 : 5);
                    if (this.kind === 'tank' || this.kind === 'beetle' || this.kind === 'crystal' || this.kind === 'golem') {
                        CombatVfx.ringPulse(parent, this.node.position.x, this.node.position.y,
                            color, 16, 0.2);
                    }
                }
            }
        }, this.kind === 'tank' || this.kind === 'beetle' || this.kind === 'crystal' || this.kind === 'golem' ? 0.28 : 0.14);
    }

    private _die() {
        this._state = 'dead';
        if (this._sprite)   this._sprite.color = this.C_DEAD;
        if (this._graphics) this.node.setScale(0.5, 0.5, 1);

        const id = this.kind || 'slime';
        const parent = this.node.parent;
        const coins = DropTables.rollOnKill(parent, this.node.position.x, this.node.position.y, 'trash');
        eventBus.emit(GameEvents.ENEMY_KILLED,  { enemyId: id, coins });
        try { GameManager.instance?.onEnemyKilled(id); } catch {}

        if (parent) {
            CombatVfx.deathBurst(parent, this.node.position.x, this.node.position.y, id);
        } else if (coins > 0) {
            eventBus.emit(GameEvents.COIN_COLLECTED, { amount: coins });
        }

        this.scheduleOnce(() => this.node.destroy(), 0.35);
    }

    private _distToPlayer(): number {
        const dx = WorldBridge.x - this.node.position.x;
        const dy = WorldBridge.y - this.node.position.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
}
