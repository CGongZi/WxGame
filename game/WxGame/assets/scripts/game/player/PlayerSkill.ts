import { _decorator, Component, Color, input, Input, EventKeyboard, KeyCode } from 'cc';
import { eventBus } from '../../core/EventBus';
import { GameFlow, FlowEvents } from '../../core/GameFlow';
import { GameManager } from '../../core/GameManager';
import { PlayerStats } from '../../core/PlayerStats';
import { WorldBridge } from '../dungeon/WorldBridge';
import { EnemyRegistry, CombatEnemy } from '../enemy/EnemyRegistry';
import { CombatVfx } from '../fx/CombatVfx';
import { IdleBreath } from '../fx/IdleBreath';
import { AudioManager } from '../../core/AudioManager';
import { Haptic } from '../../core/Haptic';
import { skillFor, SkillDef } from './SkillDefs';
import type { PlayerController } from './PlayerController';
import { WeaponController } from '../weapon/WeaponController';
import { TalentRuntime } from '../item/TalentRuntime';

const { ccclass } = _decorator;

export const SkillEvents = {
    CAST: 'skill-cast',
    READY: 'skill-ready',
} as const;

/**
 * PlayerSkill —— 角色主动技能（#120）
 * 位移只改 WorldBridge 逻辑坐标；特效挂 WorldLayer / Body；不动 Player 节点世界位。
 */
@ccclass('PlayerSkill')
export class PlayerSkill extends Component {
    static I: PlayerSkill | null = null;

    private _def: SkillDef = skillFor(null);
    private _cd = 0;
    private _wasReady = true;

    private _dashLeft = 0;
    private _dashDur = 0;
    private _dashSpeed = 0;
    private _dirX = 1;
    private _dirY = 0;
    private _bashHit = new Set<CombatEnemy>();
    private _trailT = 0;

    get def(): SkillDef { return this._def; }
    /** 0 = 就绪；1 = 刚放完 */
    get cdRatio(): number {
        const full = this._def.cooldown * TalentRuntime.skillCdMul();
        return full > 0 ? Math.max(0, Math.min(1, this._cd / full)) : 0;
    }
    get cdLeft(): number { return Math.max(0, this._cd); }
    get isReady(): boolean { return this._cd <= 0 && GameFlow.isPlaying && !GameFlow.isCombatFrozen; }
    get isDashing(): boolean { return this._dashLeft > 0; }

    onLoad() {
        PlayerSkill.I = this;
        this._refreshDef();
        eventBus.on('character-changed', this._refreshDef, this);
        eventBus.on(FlowEvents.STATE, this._onFlow, this);
    }

    onDestroy() {
        if (PlayerSkill.I === this) PlayerSkill.I = null;
        eventBus.off('character-changed', this._refreshDef, this);
        eventBus.off(FlowEvents.STATE, this._onFlow, this);
    }

    onEnable() { input.on(Input.EventType.KEY_DOWN, this._onKey, this); }
    onDisable() { input.off(Input.EventType.KEY_DOWN, this._onKey, this); }

    private _onKey(e: EventKeyboard) {
        if (e.keyCode === KeyCode.SPACE || e.keyCode === KeyCode.KEY_J || e.keyCode === KeyCode.SHIFT_LEFT) {
            this.tryCast();
        }
    }

    private _onFlow(d: { state: string }) {
        if (d.state === 'playing') {
            this._cd = 0;
            this._dashLeft = 0;
            this._wasReady = true;
            this._refreshDef();
        }
    }

    private _refreshDef() {
        const cid = GameManager.instance?.selectedCharacterId
            ?? GameManager.instance?.save?.selectedCharacter
            ?? null;
        this._def = skillFor(cid);
    }

    update(dt: number) {
        if (!GameFlow.isPlaying || GameFlow.isCombatFrozen) return;
        if (this._cd > 0) {
            this._cd -= dt;
            if (this._cd <= 0) {
                this._cd = 0;
                if (!this._wasReady) {
                    this._wasReady = true;
                    eventBus.emit(SkillEvents.READY, { id: this._def.id });
                }
            }
        }
        if (this._dashLeft > 0) this._stepDash(dt);
    }

    /** 施放；返回是否成功 */
    tryCast(): boolean {
        if (!GameFlow.isPlaying || GameFlow.isCombatFrozen) return false;
        const pc = this.node.getComponent('PlayerController') as PlayerController | null;
        if (!pc || pc.isDead) return false;
        if (this._cd > 0) {
            eventBus.emit('show-tip', { text: `${this._def.emoji} 冷却中 ${this._cd.toFixed(1)}s` });
            return false;
        }
        const d = this._def;
        this._cd = d.cooldown * TalentRuntime.skillCdMul();
        this._wasReady = false;

        const dir = this._pickDir(pc);
        this._dirX = dir.x;
        this._dirY = dir.y;

        pc.grantInvuln(d.invuln);
        const col = new Color(d.color[0], d.color[1], d.color[2], 230);
        const parent = WorldBridge.worldLayer;
        const body = this.node.getChildByName('Body');
        body?.getComponent(IdleBreath)?.strike(dir.x, dir.y);
        if (parent?.isValid) CombatVfx.skillCast(parent, WorldBridge.x, WorldBridge.y, col, d.kind);

        switch (d.kind) {
            case 'dash':
            case 'bash':
            case 'blink': {
                const dist = d.dist ?? 170;
                this._dashDur = d.kind === 'blink' ? 0.08 : 0.17;
                this._dashLeft = this._dashDur;
                this._dashSpeed = dist / this._dashDur;
                this._bashHit.clear();
                this._trailT = 0;
                break;
            }
            case 'nova':
            case 'spin': {
                const radius = d.radius ?? 160;
                const { dmg } = PlayerStats.I.calcOutgoing(PlayerStats.I.get('atk') * (d.dmgMul ?? 1.4));
                const hits = EnemyRegistry.getInRange(WorldBridge.x, WorldBridge.y, radius);
                hits.forEach(e => {
                    e.takeDamage(dmg);
                    if (d.slow) e.applySlow?.(d.slow[0], d.slow[1]);
                });
                if (parent?.isValid) {
                    CombatVfx.ringPulse(parent, WorldBridge.x, WorldBridge.y, col, 24, 0.42);
                    CombatVfx.ringPulse(parent, WorldBridge.x, WorldBridge.y,
                        new Color(255, 255, 255, 160), radius * 0.55, 0.3);
                    CombatVfx.burst(parent, WorldBridge.x, WorldBridge.y, col, 14);
                }
                CombatVfx.shakeWorld(d.kind === 'spin' ? 10 : 14);
                if (hits.length > 0) Haptic.heavy();
                if (d.kind === 'spin' && d.heal && hits.length > 0) pc.heal(d.heal * Math.min(hits.length, 4));
                break;
            }
            case 'cone': {
                // #133 朝面向的扇形喷吐：半角 coneDeg，射程 radius；沿途留焰点
                const range = d.radius ?? 220;
                const half = ((d.coneDeg ?? 40) * Math.PI) / 180;
                const { dmg } = PlayerStats.I.calcOutgoing(PlayerStats.I.get('atk') * (d.dmgMul ?? 1.8));
                const hits = EnemyRegistry.getInRange(WorldBridge.x, WorldBridge.y, range + 30).filter(e => {
                    const ex = e.node.position.x - WorldBridge.x;
                    const ey = e.node.position.y - WorldBridge.y;
                    const len = Math.hypot(ex, ey) || 1;
                    const cos = (ex * dir.x + ey * dir.y) / len;
                    return cos >= Math.cos(half) || len < 40;
                });
                hits.forEach(e => {
                    e.takeDamage(dmg);
                    if (d.slow) e.applySlow?.(d.slow[0], d.slow[1]);
                });
                if (parent?.isValid) {
                    const steps = 6;
                    for (let i = 1; i <= steps; i++) {
                        const t = i / steps;
                        const spread = Math.tan(half) * range * t;
                        for (let s = -1; s <= 1; s++) {
                            const ox = WorldBridge.x + dir.x * range * t + (-dir.y) * spread * s * 0.7;
                            const oy = WorldBridge.y + dir.y * range * t + dir.x * spread * s * 0.7;
                            CombatVfx.trailDot(parent, ox, oy, col, 6 + t * 8);
                        }
                    }
                    CombatVfx.burst(parent, WorldBridge.x + dir.x * 40, WorldBridge.y + dir.y * 40, col, 12);
                }
                CombatVfx.shakeWorld(8);
                if (hits.length > 0) Haptic.heavy();
                break;
            }
            case 'ward': {
                // #133 结界：护盾 + 周围减速 + 小伤 + 视觉双环
                const radius = d.radius ?? 170;
                if (d.shield) PlayerStats.I.addShield(d.shield);
                const { dmg } = PlayerStats.I.calcOutgoing(PlayerStats.I.get('atk') * (d.dmgMul ?? 0.6));
                const hits = EnemyRegistry.getInRange(WorldBridge.x, WorldBridge.y, radius);
                hits.forEach(e => {
                    e.takeDamage(dmg);
                    if (d.slow) e.applySlow?.(d.slow[0], d.slow[1]);
                });
                if (parent?.isValid) {
                    CombatVfx.ringPulse(parent, WorldBridge.x, WorldBridge.y, col, 30, 0.5);
                    CombatVfx.ringPulse(parent, WorldBridge.x, WorldBridge.y,
                        new Color(255, 255, 255, 140), radius * 0.6, 0.36);
                    CombatVfx.burst(parent, WorldBridge.x, WorldBridge.y, col, 10);
                }
                CombatVfx.shakeWorld(6);
                Haptic.heavy();
                break;
            }
            case 'volley': {
                const wc = this.node.getComponent(WeaponController);
                const n = wc?.castVolley(d.volleyCount ?? 5, d.volleySpread ?? 45, d.dmgMul ?? 0.8, dir.x, dir.y) ?? 0;
                if (parent?.isValid) {
                    CombatVfx.ringPulse(parent, WorldBridge.x, WorldBridge.y, col, 16, 0.3);
                }
                if (n === 0) {
                    // 近战武器时退化为旋斩
                    const { dmg } = PlayerStats.I.calcOutgoing(PlayerStats.I.get('atk') * 1.3);
                    EnemyRegistry.getInRange(WorldBridge.x, WorldBridge.y, 140).forEach(e => e.takeDamage(dmg));
                }
                break;
            }
        }

        if (d.heal && d.kind !== 'spin') pc.heal(d.heal);
        if (d.haste && d.hasteSec) {
            PlayerStats.I.addTimedBonus({ moveSpeed: d.haste }, d.hasteSec, this);
        }

        AudioManager.playItem('buff');
        Haptic.light();
        eventBus.emit(SkillEvents.CAST, { id: d.id, name: d.name });
        return true;
    }

    private _pickDir(pc: PlayerController): { x: number; y: number } {
        const m = pc.moveDir;
        if (m.x * m.x + m.y * m.y > 0.01) {
            const l = Math.sqrt(m.x * m.x + m.y * m.y);
            return { x: m.x / l, y: m.y / l };
        }
        const wc = this.node.getComponent(WeaponController);
        if (wc) {
            const a = wc.getAimDir();
            const l = Math.sqrt(a.x * a.x + a.y * a.y) || 1;
            return { x: a.x / l, y: a.y / l };
        }
        return { x: pc.facing, y: 0 };
    }

    private _stepDash(dt: number) {
        const step = Math.min(dt, this._dashLeft);
        this._dashLeft -= step;
        const before = { x: WorldBridge.x, y: WorldBridge.y };
        WorldBridge.tryMove(
            WorldBridge.x + this._dirX * this._dashSpeed * step,
            WorldBridge.y + this._dirY * this._dashSpeed * step,
        );
        WorldBridge.syncPlayerNode(this.node);

        const parent = WorldBridge.worldLayer;
        const d = this._def;
        const col = new Color(d.color[0], d.color[1], d.color[2], 180);
        this._trailT += step;
        if (parent?.isValid && this._trailT > 0.03) {
            this._trailT = 0;
            CombatVfx.trailDot(parent, before.x, before.y, col, 7);
        }

        if (d.kind === 'bash') {
            const r = d.radius ?? 64;
            const { dmg } = PlayerStats.I.calcOutgoing(PlayerStats.I.get('atk') * (d.dmgMul ?? 1.2));
            for (const e of EnemyRegistry.getInRange(WorldBridge.x, WorldBridge.y, r)) {
                if (this._bashHit.has(e)) continue;
                this._bashHit.add(e);
                e.takeDamage(dmg);
                if (parent?.isValid) {
                    CombatVfx.burst(parent, e.node.position.x, e.node.position.y, col, 6);
                }
                Haptic.light();
            }
        }

        if (this._dashLeft <= 0 && parent?.isValid) {
            CombatVfx.ringPulse(parent, WorldBridge.x, WorldBridge.y, col, 14, 0.22);
            if (d.kind === 'bash' && this._bashHit.size > 0) CombatVfx.shakeWorld(9);
        }
    }
}