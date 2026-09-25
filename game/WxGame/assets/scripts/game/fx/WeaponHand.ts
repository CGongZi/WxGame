import { _decorator, Component, Node } from 'cc';
import { swingForWeapon, type WeaponSwingDef } from './MotionTables';
import { CombatFace } from './CombatFace';

const { ccclass } = _decorator;

/**
 * 武器挂点动作：闲置携带晃动 + 挥砍/突刺/拉弓/挥杖。
 * 挂在 Body 上，驱动同层 `WeaponIcon` 子节点（或外部绑的 mount）。
 * 只改本地 transform，不碰 Player 世界坐标。
 *
 * #160 瞄准方向必须转成 Body 本地：Player 根节点 scale.x 翻面后，
 * 若仍用世界 dx，朝左挥会被再翻一次，视觉上左右刀光永远朝同一边。
 */
@ccclass('WeaponHand')
export class WeaponHand extends Component {
    weaponId = 'sword';
    /** 大厅可放大；局内 1 */
    carryScale = 1;

    private _mount: Node | null = null;
    private _t = 0;
    private _playLeft = 0;
    private _playDur = 0.22;
    private _aimAng = 0;
    private _def: WeaponSwingDef = swingForWeapon('sword');
    /** 握点：前肩 (13,8) 斜下前方，让 Rig 前臂自然搭上 */
    private _restX = 21;
    private _restY = -2;

    /** 绑定武器图标节点（通常是 Body/WeaponIcon） */
    bind(mount: Node | null) {
        this._mount = mount;
        if (mount) this._applyRest(1);
    }

    setWeapon(id: string) {
        this.weaponId = id;
        this._def = swingForWeapon(id);
        if (this._playLeft <= 0) this._applyRest(1);
    }

    setCarryScale(s: number) {
        this.carryScale = s;
        if (this._playLeft <= 0) this._applyRest(1);
    }

    /** 近战 / 远程出击（dir = 世界瞄准；内部转本地） */
    play(dirX: number, dirY: number) {
        const len = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
        const face = CombatFace.sign(this.node.parent ?? this.node);
        // 世界 → Body 本地：翻面后本地 +X 仍是「角色前方」
        const lx = (dirX / len) * face;
        const ly = dirY / len;
        this._aimAng = Math.atan2(ly, lx) * 180 / Math.PI;
        this._def = swingForWeapon(this.weaponId);
        this._playDur = this._def.dur;
        this._playLeft = this._def.dur;
    }

    update(dt: number) {
        if (!this._mount?.isValid) return;
        this._t += dt;

        if (this._playLeft > 0) {
            this._playLeft -= dt;
            const u = 1 - Math.max(0, this._playLeft) / this._playDur;
            this._applySwing(Math.min(1, Math.max(0, u)));
            if (this._playLeft <= 0) this._applyRest(1);
            return;
        }

        this._applyRest(1);
    }

    private _applyRest(pulse: number) {
        if (!this._mount?.isValid) return;
        const bob = Math.sin(this._t * 3.2) * 2.2 * pulse;
        const sway = Math.sin(this._t * 2.1) * 1.5;
        const s = this.carryScale;
        this._mount.setPosition(this._restX * s + sway, this._restY * s + bob, 0);
        this._mount.angle = this._def.rest + Math.sin(this._t * 2.6) * 4;
        this._mount.setScale(s, s, 1);
    }

    private _applySwing(u: number) {
        if (!this._mount?.isValid) return;
        const d = this._def;
        const s = this.carryScale;
        // ease-out 前半加速出击
        const ease = u < 0.55
            ? (u / 0.55) * (u / 0.55)
            : 1 - ((u - 0.55) / 0.45) * 0.35;

        if (d.kind === 'thrust' || d.kind === 'stab') {
            // #162 smoothstep 伸出再收回，少拉伸，避免枪身+身体双重抽搐
            let t = u < 0.42 ? u / 0.42 : 1 - (u - 0.42) / 0.58;
            t = Math.max(0, Math.min(1, t));
            t = t * t * (3 - 2 * t);
            const reach = d.reach * t;
            const rad = this._aimAng * Math.PI / 180;
            this._mount.setPosition(
                this._restX * s + Math.cos(rad) * reach,
                this._restY * s + Math.sin(rad) * reach,
                0,
            );
            this._mount.angle = this._aimAng - 90 + (d.kind === 'stab' ? Math.sin(u * Math.PI) * 5 : 0);
            const stretch = 1 + Math.abs(reach) / 90;
            this._mount.setScale(s * stretch, s * (1 + (stretch - 1) * 0.25), 1);
            return;
        }

        if (d.kind === 'bow') {
            // 拉弦后撤 → 回弹
            const draw = u < 0.5 ? (u / 0.5) : (1 - (u - 0.5) / 0.5);
            const rad = this._aimAng * Math.PI / 180;
            const back = d.reach * draw; // reach 为负
            this._mount.setPosition(
                this._restX * s + Math.cos(rad) * back,
                this._restY * s + Math.sin(rad) * back,
                0,
            );
            this._mount.angle = this._aimAng - 90 + d.rest * 0.3;
            this._mount.setScale(s * (1 - draw * 0.08), s * (1 + draw * 0.12), 1);
            return;
        }

        // slash / heavy / staff：弧线挥砍
        const ang = this._aimAng + d.from + (d.to - d.from) * ease;
        const rad = ang * Math.PI / 180;
        const reach = d.reach + (d.kind === 'heavy' ? 6 : 0) * Math.sin(u * Math.PI);
        this._mount.setPosition(
            this._restX * s * 0.4 + Math.cos(rad) * (14 + reach),
            this._restY * s * 0.4 + Math.sin(rad) * (14 + reach),
            0,
        );
        this._mount.angle = ang - 90;
        const punch = Math.sin(u * Math.PI);
        this._mount.setScale(s * (1 + punch * 0.25), s * (1 + punch * 0.1), 1);
    }
}
