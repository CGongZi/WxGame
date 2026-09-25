import { _decorator, Component, Node, Graphics, Color, UITransform, Label, find } from 'cc';
import { GameConfig } from '../../core/GameConfig';
import { ConfigStore } from '../../core/ConfigStore';
import { GameManager } from '../../core/GameManager';
import { GameFlow } from '../../core/GameFlow';
import { eventBus, GameEvents } from '../../core/EventBus';
import { EnemyRegistry } from './EnemyRegistry';
import { WorldBridge } from '../dungeon/WorldBridge';
import { SlimeEnemy } from './SlimeEnemy';
import { DropTables } from '../item/DropTables';
import { CombatVfx } from '../fx/CombatVfx';
import { CombatFace } from '../fx/CombatFace';
import { EnemyMotion } from './EnemyMotion';
import { drawEnemySilhouette } from './EnemySilhouette';
import { AudioManager } from '../../core/AudioManager';
import { PlayerController } from '../player/PlayerController';

const { ccclass, property } = _decorator;

type BossPhase = 'chase' | 'warn' | 'charge' | 'recover' | 'dead';

/**
 * BossEnemy —— 三阶段 Boss
 * 1. chase：追击近战
 * 2. HP < 50%：冲刺冲锋
 * 3. HP < 30%：召唤小怪（每阶段一次）
 */
@ccclass('BossEnemy')
export class BossEnemy extends Component {

    @property(Node) playerNode: Node = null!;
    @property hp = 300;
    @property damage = 22;
    @property speed = 55;
    @property attackRange = 90;
    @property detectionRange = 900;

    private _curHp = 0;
    private _maxHp = 0;
    private _enraged = false;
    private _phase: BossPhase = 'chase';
    private _attackCd = 0;
    private _chargeCd = 0;
    private _chargeDirX = 0;
    private _chargeDirY = 0;
    private _chargeLeft = 0;
    private _summoned = false;
    private _hpLabel: Label | null = null;
    private _hpBarG: Graphics | null = null;
    private _hpBarW = 120;
    private _g: Graphics | null = null;

    onLoad() {
        this._g = this.getComponent(Graphics);
        EnemyRegistry.register(this);
    }

    /** HP 在 addComponent 之后由 DungeonManager 赋值，须在 start 再快照 */
    start() {
        this._curHp = this.hp;
        this._maxHp = this.hp;
        this._ensureHpBar();
        console.log(`[Boss] 登场 HP=${this.hp}`);
    }

    onDestroy() {
        EnemyRegistry.unregister(this);
    }

    get isDead() { return this._phase === 'dead'; }
    get collideRadius() { return 42; }
    get isValid() { return this.node?.isValid ?? false; }

    update(dt: number) {
        if (this._phase === 'dead') return;
        if (!GameFlow.isPlaying || GameFlow.isCombatFrozen) return;
        if (this._attackCd > 0) this._attackCd -= dt;
        if (this._chargeCd > 0) this._chargeCd -= dt;

        const dist = this._dist();

        if (this._phase === 'warn') {
            const m = this._bodyMotion();
            if (m) m.moving = false;
            this._tickWarn(dt);
            return;
        }

        if (this._phase === 'charge') {
            const m = this._bodyMotion();
            if (m) m.moving = true;
            this._tickCharge(dt);
            return;
        }

        if (this._phase === 'recover') {
            const m = this._bodyMotion();
            if (m) m.moving = false;
            this._chargeLeft -= dt;
            if (this._chargeLeft <= 0) this._phase = 'chase';
            return;
        }

        // chase
        const motion = this._bodyMotion();
        if (dist < this.detectionRange) {
            if (dist < this.attackRange) {
                if (motion) motion.moving = false;
                this._melee();
            } else {
                if (motion) motion.moving = true;
                this._chase(dt);
            }

            // 半血后周期性冲锋
            if (this._curHp / this._maxHp < 0.5 && this._chargeCd <= 0 && dist > 80) {
                this._startCharge();
            }
        } else if (motion) {
            motion.moving = false;
        }
    }

    takeDamage(amount: number) {
        if (this._phase === 'dead') return;
        const dmg = Math.max(1, Math.round(amount));
        this._curHp -= dmg;

        eventBus.emit(GameEvents.DAMAGE_DEALT, {
            amount: dmg,
            position: this.node.position.clone(),
        });

        CombatFace.pulse(this, this.node, 1.2, 0.1);
        CombatVfx.hitFlash(this.node.getChildByName('Body') ?? this.node);
        this._bodyMotion()?.flinch();
        AudioManager.playEnemyHurt('boss');

        this._refreshHpBar();

        // #122 半血狂暴：一次性可读提示 + 世界层红环，玩家知道冲锋阶段开始
        if (!this._enraged && this._curHp / this._maxHp < 0.5) {
            this._enraged = true;
            const parent = this.node.parent;
            if (parent?.isValid) {
                CombatVfx.ringPulse(parent, this.node.position.x, this.node.position.y,
                    new Color(255, 80, 80, 230), 40, 0.6);
                CombatVfx.burst(parent, this.node.position.x, this.node.position.y,
                    new Color(255, 120, 80, 255), 14);
            }
            CombatVfx.shakeWorld(14);
            eventBus.emit('show-tip', { text: '🔥 Boss 半血狂暴 · 开始冲锋，看红线闪避！' });
        }

        if (!this._summoned && this._curHp / this._maxHp < 0.3) {
            this._summoned = true;
            this._summonMinions();
        }

        if (this._curHp <= 0) this._die();
    }

    // ── AI ────────────────────────────────────────────────

    private _chase(dt: number) {
        const dx = WorldBridge.x - this.node.position.x;
        const dy = WorldBridge.y - this.node.position.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1) return;
        const sp = this.speed * dt;
        const dir = WorldBridge.steerToward(this.node.position.x, this.node.position.y);
        WorldBridge.enemyStep(
            this.node,
            this.node.position.x + dir.x * sp,
            this.node.position.y + dir.y * sp,
            this.collideRadius,
        );
        CombatFace.face(this.node, dx);
    }

    private _melee() {
        if (this._attackCd > 0) return;
        this._attackCd = 1.1;
        AudioManager.playEnemyAttack('boss');
        if (!this.playerNode?.isValid) {
            this.playerNode = find('Canvas/Player') as Node;
        }
        const pc = this.playerNode?.getComponent(PlayerController);
        pc?.takeDamage(this.damage);
        eventBus.emit('show-tip', { text: '💢 Boss 重击！' });
        this._bodyMotion()?.strike();
        const parent = this.node.parent;
        if (parent) {
            CombatVfx.burst(parent, this.node.position.x, this.node.position.y,
                new Color(220, 80, 255, 255), 10);
        }
    }

    private _startCharge() {
        const dx = WorldBridge.x - this.node.position.x;
        const dy = WorldBridge.y - this.node.position.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        this._chargeDirX = dx / len;
        this._chargeDirY = dy / len;
        this._chargeLeft = 0.4; // 预警时长
        this._phase = 'warn';
        this._chargeCd = 3.5;
        eventBus.emit('show-tip', { text: '⚠️ Boss 蓄力！' });
        const parent = this.node.parent;
        if (parent) {
            CombatVfx.chargeWarn(
                parent,
                this.node.position.x, this.node.position.y,
                this._chargeDirX, this._chargeDirY, 240,
            );
        }
    }

    private _tickWarn(dt: number) {
        this._chargeLeft -= dt;
        if (this._chargeLeft > 0) return;
        // 预警结束：锁定方向再冲
        const dx = WorldBridge.x - this.node.position.x;
        const dy = WorldBridge.y - this.node.position.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        this._chargeDirX = dx / len;
        this._chargeDirY = dy / len;
        this._chargeLeft = 0.45;
        this._phase = 'charge';
        eventBus.emit('show-tip', { text: '💢 Boss 冲锋！' });
        CombatFace.face(this.node, this._chargeDirX);
        this._bodyMotion()?.windup(0.12);
        this._bodyMotion()?.strike();
    }

    private _tickCharge(dt: number) {
        const sp = 420 * dt;
        WorldBridge.enemyStep(
            this.node,
            this.node.position.x + this._chargeDirX * sp,
            this.node.position.y + this._chargeDirY * sp,
            this.collideRadius,
        );
        this._chargeLeft -= dt;

        if (this._dist() < this.attackRange + 20) {
            if (!this.playerNode?.isValid) {
                this.playerNode = find('Canvas/Player') as Node;
            }
            const pc = this.playerNode?.getComponent(PlayerController);
            AudioManager.playEnemyAttack('boss');
            pc?.takeDamage(Math.round(this.damage * 1.6));
            this._phase = 'recover';
            this._chargeLeft = 0.6;
            return;
        }
        if (this._chargeLeft <= 0) {
            this._phase = 'recover';
            this._chargeLeft = 0.4;
        }
    }

    private _summonMinions() {
        const parent = this.node.parent;
        if (!parent) return;
        const curve = ConfigStore.dungeon();
        eventBus.emit('show-tip', { text: '👾 Boss 召唤小怪！' });
        for (let i = 0; i < curve.summonCount; i++) {
            const a = (Math.PI * 2 * i) / curve.summonCount;
            const n = new Node(`Minion_${i}`);
            n.setParent(parent);
            n.setPosition(
                this.node.position.x + Math.cos(a) * 100,
                this.node.position.y + Math.sin(a) * 100, 0,
            );
            n.addComponent(UITransform).setContentSize(40, 40);
            const body = new Node('Body');
            body.setParent(n);
            body.addComponent(UITransform).setContentSize(40, 40);
            const g = body.addComponent(Graphics);
            drawEnemySilhouette(g, 'slime', new Color(200, 80, 220, 255), 40);
            const motion = body.addComponent(EnemyMotion);
            motion.kind = 'fast';

            const s = n.addComponent(SlimeEnemy);
            s.hp = curve.summonHp;
            s.speed = curve.summonSpeed;
            s.damage = curve.summonDamage;
            s.attackRange = curve.summonAttackRange;
            s.detectionRange = curve.summonDetectionRange;
            s.playerNode = this.playerNode;
            s.kind = 'fast';
        }
    }

    private _die() {
        this._phase = 'dead';
        this.node.setScale(0.4, 0.4, 1);
        const parent = this.node.parent;
        const coins = DropTables.rollOnKill(parent, this.node.position.x, this.node.position.y, 'boss');
        eventBus.emit(GameEvents.ENEMY_KILLED, { enemyId: 'boss', coins });
        try { GameManager.instance?.onEnemyKilled('boss'); } catch {}

        if (parent) {
            CombatVfx.deathBurst(parent, this.node.position.x, this.node.position.y, 'boss');
        } else if (coins > 0) {
            eventBus.emit(GameEvents.COIN_COLLECTED, { amount: coins });
        }

        eventBus.emit('show-tip', { text: '🏆 Boss 击败！' });
        this.scheduleOnce(() => this.node.destroy(), 0.6);
    }

    private _bodyMotion(): EnemyMotion | null {
        return this.node.getChildByName('Body')?.getComponent(EnemyMotion) ?? null;
    }

    private _dist(): number {
        const dx = WorldBridge.x - this.node.position.x;
        const dy = WorldBridge.y - this.node.position.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    private _ensureHpBar() {
        if (this._hpBarG?.node?.isValid) {
            this._refreshHpBar();
            return;
        }

        const root = new Node('BossHpBar');
        root.setParent(this.node);
        root.setPosition(0, 78, 0);
        root.addComponent(UITransform).setContentSize(this._hpBarW + 20, 28);

        // 底框
        const bgN = new Node('Bg');
        bgN.setParent(root);
        bgN.setPosition(0, 0, 0);
        bgN.addComponent(UITransform).setContentSize(this._hpBarW + 4, 16);
        const bgG = bgN.addComponent(Graphics);
        bgG.fillColor = new Color(40, 10, 50, 230);
        bgG.roundRect(-this._hpBarW / 2 - 2, -8, this._hpBarW + 4, 16, 4);
        bgG.fill();
        bgG.strokeColor = new Color(200, 120, 255, 200);
        bgG.lineWidth = 2;
        bgG.roundRect(-this._hpBarW / 2 - 2, -8, this._hpBarW + 4, 16, 4);
        bgG.stroke();

        // 填充条
        const fillN = new Node('Fill');
        fillN.setParent(root);
        fillN.setPosition(0, 0, 0);
        fillN.addComponent(UITransform).setContentSize(this._hpBarW, 12);
        this._hpBarG = fillN.addComponent(Graphics);

        // 数字叠在条上
        const lblN = new Node('Num');
        lblN.setParent(root);
        lblN.setPosition(0, 0, 0);
        lblN.addComponent(UITransform).setContentSize(this._hpBarW, 18);
        const lbl = lblN.addComponent(Label);
        lbl.fontSize = 14;
        lbl.color = new Color(255, 230, 255, 255);
        lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
        lbl.verticalAlign = Label.VerticalAlign.CENTER;
        this._hpLabel = lbl;

        this._refreshHpBar();
    }

    private _refreshHpBar() {
        const ratio = this._maxHp > 0
            ? Math.max(0, Math.min(1, this._curHp / this._maxHp))
            : 0;

        if (this._hpBarG) {
            const w = this._hpBarW * ratio;
            // 半血以下偏红，满血偏紫
            const r = ratio > 0.5 ? 200 : 255;
            const g = ratio > 0.5 ? 80 : 50;
            const b = ratio > 0.5 ? 255 : 80;
            this._hpBarG.clear();
            if (w > 0.5) {
                this._hpBarG.fillColor = new Color(r, g, b, 255);
                this._hpBarG.roundRect(-this._hpBarW / 2, -6, w, 12, 3);
                this._hpBarG.fill();
            }
        }

        if (this._hpLabel) {
            this._hpLabel.string = `👑 ${Math.max(0, Math.round(this._curHp))}/${this._maxHp}`;
        }
    }
}
