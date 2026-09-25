import { _decorator, Component } from 'cc';
import { gaitForSkin, strikeForSkin } from './MotionTables';
import { CombatFace } from './CombatFace';

const { ccclass } = _decorator;

/**
 * 挂在视觉 Body 上：待机呼吸 / 真实步伐 / 三阶段出击 / 受击。
 * 不改父节点世界坐标（Player 根仍走 WorldBridge）。
 */
@ccclass('IdleBreath')
export class IdleBreath extends Component {
    /** hero | portrait */
    kind = 'hero';
    skinId = 'knight';
    activeBreath = true;
    baseScale = 1;
    restScale = 1;
    /** 正在移动（走姿） */
    moving = false;
    /** 移动方向（用于前倾），未设则仅上下跳 */
    moveDirX = 0;
    moveDirY = 0;

    private _t = Math.random() * 8;
    private _foot = Math.random() * Math.PI * 2;
    private _hitLeft = 0;
    private _invulnLeft = 0;

    /** 出击阶段：0无 1蓄力 2前冲 3收回 */
    private _atkPhase = 0;
    private _atkT = 0;
    private _atkDur = 0;
    private _atkX = 0;
    private _atkY = 0;
    private _atkScale = 1;

    pause() { this.activeBreath = false; }
    resume() { this.activeBreath = true; }

    setRestScale(s: number) {
        this.restScale = s;
        this.baseScale = s;
    }

    /** 攻击：蓄力 → 前冲 → 收回；intensity 压幅（突刺≈0.2，砍击≈0.55） */
    strike(dirX = 1, dirY = 0, intensity = 1) {
        if (this.kind !== 'hero') return;
        const len = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
        const style = strikeForSkin(this.skinId);
        const face = CombatFace.sign(this.node.parent ?? this.node);
        const mul = Math.max(0, Math.min(1.2, intensity));
        // #160 世界 → Body 本地；#162 mul 收抖
        this._atkX = (dirX / len) * face * style.dist * mul;
        this._atkY = (dirY / len) * style.dist * mul;
        this._atkScale = 1 + (style.scale - 1) * mul;
        this._atkDur = style.dur;
        this._atkPhase = 1;
        this._atkT = style.dur * style.wind;
        this.baseScale = this.restScale * this._atkScale;
    }

    hitFlinch() {
        if (this.kind !== 'hero') return;
        this._atkPhase = 0;
        this._hitLeft = 0.22;
        this.baseScale = this.restScale * 1.2;
        this.scheduleOnce(() => {
            if (this.isValid && this._hitLeft <= 0) this.baseScale = this.restScale;
        }, 0.2);
    }

    setInvuln(sec: number) {
        this._invulnLeft = Math.max(0, sec);
        if (sec <= 0 && this.node.isValid) {
            this.node.setScale(this.baseScale, this.baseScale, 1);
        }
    }

    update(dt: number) {
        if (!this.activeBreath) return;
        this._t += dt;
        if (this._invulnLeft > 0) this._invulnLeft -= dt;
        if (this._hitLeft > 0) this._hitLeft -= dt;

        if (this._atkPhase > 0) {
            this._tickAttack(dt);
            return;
        }

        if (this._hitLeft > 0) {
            const k = this._hitLeft / 0.22;
            const b = this.baseScale;
            this.node.setPosition(-12 * k, 6 * k, 0);
            this.node.setScale(b * (1 + 0.14 * k), b * (1 - 0.16 * k), 1);
            this.node.angle = 18 * k;
            return;
        }

        const gait = gaitForSkin(this.skinId);
        const b = this.baseScale;
        const blink = this._invulnLeft > 0 && Math.floor(this._t * 14) % 2 === 0 ? 0.55 : 1;

        if (this.kind === 'portrait') {
            const bob = Math.sin(this._t * 2.4);
            this.node.setScale(b * (1 + bob * 0.025), b * (1 - bob * 0.03), 1);
            this.node.angle = bob * 1.0;
            this.node.setPosition(0, bob * 1.5, 0);
            return;
        }

        if (this.moving) {
            this._foot += dt * gait.foot;
            const foot = Math.sin(this._foot);
            const hop = Math.max(0, foot);
            const plant = Math.max(0, -foot);
            const leanX = this.moveDirX !== 0 || this.moveDirY !== 0
                ? this.moveDirX
                : 0;
            const leanY = this.moveDirX !== 0 || this.moveDirY !== 0
                ? this.moveDirY
                : 0;
            const leanLen = Math.sqrt(leanX * leanX + leanY * leanY) || 1;

            // 落地压扁 + 腾空抬脚：步伐读在挤压上；身体几乎不晃（四肢在 Rig 里摆）
            const sx = b * (1 + plant * gait.plant + hop * gait.sx * 0.55) * blink;
            const sy = b * (1 - plant * (gait.plant + 0.05) + hop * gait.sy * 0.45) * blink;
            this.node.setScale(sx, sy, 1);
            this.node.setPosition(
                foot * gait.sway + (leanX / leanLen) * hop * 1.2,
                hop * gait.bobY - plant * 2.2 + (leanY / leanLen) * hop * 0.6,
                0,
            );
            this.node.angle = foot * gait.tilt + (leanX / leanLen) * hop * 1.2;
            return;
        }

        // 静止：轻呼吸，和走姿对比鲜明
        const bob = Math.sin(this._t * gait.idle);
        this.node.angle = bob * 0.7;
        this.node.setScale(b * (1 + bob * 0.018) * blink, b * (1 - bob * 0.022) * blink, 1);
        this.node.setPosition(0, bob * 1.1, 0);
    }

    private _tickAttack(dt: number) {
        const style = strikeForSkin(this.skinId);
        this._atkT -= dt;
        const b = this.restScale * this._atkScale;
        const windDur = style.dur * style.wind;
        const lungeDur = style.dur * style.lunge;
        const recDur = Math.max(0.04, style.dur - windDur - lungeDur);

        if (this._atkPhase === 1) {
            // 蓄力：轻后撤（少蹲少转，避免抖）
            const k = windDur > 0 ? 1 - Math.max(0, this._atkT) / windDur : 1;
            const ease = k * k;
            this.node.setPosition(-this._atkX * 0.25 * ease, -this._atkY * 0.25 * ease - 1.2 * ease, 0);
            this.node.setScale(b * (1 + 0.04 * ease), b * (1 - 0.06 * ease), 1);
            this.node.angle = -3 * ease;
            if (this._atkT <= 0) {
                this._atkPhase = 2;
                this._atkT = lungeDur;
            }
            return;
        }

        if (this._atkPhase === 2) {
            // 前冲：顶出（sin 半波，幅度已由 _atkX 收过）
            const k = lungeDur > 0 ? 1 - Math.max(0, this._atkT) / lungeDur : 1;
            const punch = Math.sin(Math.min(1, k) * Math.PI);
            this.node.setPosition(this._atkX * punch, this._atkY * punch + 1 * punch, 0);
            this.node.setScale(b * (1 + 0.03 * punch), b * (1 - 0.02 * punch), 1);
            this.node.angle = 2.5 * punch;
            if (this._atkT <= 0) {
                this._atkPhase = 3;
                this._atkT = recDur;
            }
            return;
        }

        // 收回
        const k = recDur > 0 ? Math.max(0, this._atkT) / recDur : 0;
        this.node.setPosition(this._atkX * 0.12 * k, this._atkY * 0.12 * k, 0);
        this.node.setScale(this.restScale * (1 + (this._atkScale - 1) * k), this.restScale * (1 + (this._atkScale - 1) * k * 0.5), 1);
        this.node.angle = 1.5 * k;
        if (this._atkT <= 0) {
            this._atkPhase = 0;
            this.baseScale = this.restScale;
            this.node.setPosition(0, 0, 0);
            this.node.angle = 0;
            this.node.setScale(this.restScale, this.restScale, 1);
        }
    }
}
