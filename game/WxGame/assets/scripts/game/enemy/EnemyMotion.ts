import { _decorator, Component } from 'cc';
import { enemyBobRate, enemyRunRate, enemyStrikeDur } from '../fx/MotionTables';

const { ccclass } = _decorator;

/**
 * 挂在怪 Body：静止轻呼吸；追击才出步伐/翼扑；攻击蓄力→出击。
 * 不改怪根节点碰撞坐标。
 */
@ccclass('EnemyMotion')
export class EnemyMotion extends Component {
    kind = 'slime';
    /** AI 追击/位移时置 true，否则只做轻待机 */
    moving = false;

    private _t = Math.random() * 6;
    private _strike = 0;
    private _windup = 0;
    private _flinch = 0;
    private _runPhase = Math.random() * Math.PI * 2;
    private _strikeDur = 0.22;

    /** 出击进度 0~1（EnemyRig 前臂挥击用） */
    get punch(): number { return this._strike > 0 ? this._strike / this._strikeDur : 0; }
    /** 蓄力 0~1 */
    get wind(): number { return this._windup > 0 ? Math.min(1, this._windup / 0.25) : 0; }
    /** 受击 0~1 */
    get flinching(): number { return this._flinch > 0 ? this._flinch / 0.2 : 0; }
    /** 跑步相位（像素走步帧用） */
    get runPhase(): number { return this._runPhase; }

    /** #173 有 Pixel 贴图时少摇整身，步伐交给切帧 */
    private _pixelBody(): boolean {
        return !!this.node.getChildByName('Pixel');
    }

    windup(sec = 0.22) {
        this._windup = sec;
    }

    strike() {
        this._windup = 0;
        this._strikeDur = enemyStrikeDur(this.kind);
        this._strike = this._strikeDur;
    }

    flinch() {
        this._flinch = 0.2;
    }

    update(dt: number) {
        this._t += dt;
        if (this.moving) this._runPhase += dt * this._runRate();
        if (this._strike > 0) this._strike -= dt;
        if (this._windup > 0) this._windup -= dt;
        if (this._flinch > 0) this._flinch -= dt;

        const punch = this._strike > 0 ? this._strike / this._strikeDur : 0;
        const wind = this._windup > 0 ? Math.min(1, this._windup / 0.25) : 0;
        const fl = this._flinch > 0 ? this._flinch / 0.2 : 0;
        const idleBob = Math.sin(this._t * this._rate());

        // Boss：沉重抬踏 / 蓄力抖（#151 倾角减半，步伐靠抬踏）
        if (this.kind === 'boss') {
            if (this.moving) {
                const step = Math.sin(this._runPhase);
                const hop = Math.max(0, step);
                const plant = Math.max(0, -step);
                this.node.setScale(
                    1 + plant * 0.1 + hop * 0.03 + wind * 0.08 - fl * 0.12,
                    1 - plant * 0.12 + hop * 0.08 - wind * 0.05 + fl * 0.1,
                    1,
                );
                this.node.angle = step * 3.5 - punch * 14 - wind * 8 + fl * 10;
                this.node.setPosition(-fl * 6, hop * 4 - plant * 1.5 + punch * 4, 0);
            } else {
                this.node.setScale(1 + idleBob * 0.02 + wind * 0.08 - fl * 0.1, 1 - idleBob * 0.025 - wind * 0.04 + fl * 0.08, 1);
                this.node.angle = idleBob * 1.5 - punch * 12 - wind * 8 + fl * 8;
                this.node.setPosition(-fl * 4, idleBob * 1.0 + punch * 3, 0);
            }
            return;
        }

        let sx = 1;
        let sy = 1;
        let ang = 0;
        let y = 0;
        let x = 0;

        if (!this.moving && this._strike <= 0 && this._windup <= 0) {
            // 静止轻呼吸
            this._poseIdle(idleBob, punch, wind, fl);
            return;
        }

        switch (this.kind) {
            case 'slime': {
                const step = Math.sin(this._runPhase);
                const hop = Math.max(0, step);
                const plant = Math.max(0, -step);
                // 圆团怪：步伐读在压扁/弹起，几乎不转角
                sx = 1 + plant * 0.2 + hop * 0.06 + punch * 0.4 - wind * 0.12;
                sy = 1 - plant * 0.24 + hop * 0.16 - punch * 0.2 + wind * 0.14;
                y = hop * 7 - plant * 2 + punch * 6;
                ang = wind * -6 + hop * 1.5;
                x = punch * 8;
                break;
            }
            case 'fast': {
                const p = Math.sin(this._runPhase);
                const hop = Math.abs(p);
                // #173 像素走步时少转角，靠切帧表现腿动
                sx = 1.04 + hop * 0.04 + punch * 0.3 - wind * 0.06;
                sy = 0.97 + hop * 0.1;
                ang = this._pixelBody() ? p * 1.5 : p * 8;
                y = hop * (this._pixelBody() ? 2.5 : 4.5);
                x = punch * 10;
                break;
            }
            case 'beetle': {
                const p = Math.sin(this._runPhase);
                sx = 1.06 + p * 0.04 + punch * 0.22;
                sy = 0.82 + Math.abs(Math.sin(this._runPhase * 2)) * 0.1 + wind * 0.08;
                ang = p * 5;
                y = Math.abs(Math.sin(this._runPhase * 2)) * 2;
                x = punch * 8;
                break;
            }
            case 'toad': {
                const hop = Math.max(0, Math.sin(this._runPhase));
                const crouch = Math.max(0, -Math.sin(this._runPhase));
                sx = 1.1 + crouch * 0.22 + punch * 0.18 - wind * 0.1;
                sy = 0.82 + hop * 0.32 - crouch * 0.16 + wind * 0.08;
                y = hop * 14 + punch * 4;
                ang = (hop - crouch) * 6;
                x = punch * 6;
                break;
            }
            case 'crystal': {
                const p = Math.sin(this._runPhase);
                sx = 1 + p * 0.03 + punch * 0.16;
                sy = 1.03 + wind * 0.08;
                ang = p * 2.5 - punch * 8;
                y = Math.abs(p) * 1.8;
                x = punch * 5;
                break;
            }
            case 'golem': {
                const step = Math.sin(this._runPhase);
                const hop = Math.max(0, step);
                const plant = Math.max(0, -step);
                sx = 1.05 + plant * 0.08 + punch * 0.18;
                sy = 1 + hop * 0.09 + wind * 0.08 - plant * 0.06;
                ang = step * 2.5 - punch * 9;
                y = hop * 4.5 - plant * 1.5;
                x = punch * 6;
                break;
            }
            case 'tank': {
                const step = Math.sin(this._runPhase);
                const hop = Math.max(0, step);
                sx = 1 + hop * 0.04 + punch * 0.25;
                sy = 1 + hop * 0.07 + punch * 0.08 + wind * 0.1;
                y = hop * 3.5;
                ang = wind * -4 - punch * 7;
                x = punch * 5;
                break;
            }
            case 'wisp':
                sx = 1 + idleBob * 0.06;
                sy = 1 - idleBob * 0.07;
                y = 8 + Math.sin(this._runPhase) * 5;
                ang = Math.sin(this._runPhase) * 5;
                x = Math.sin(this._t * 2.4) * 2;
                break;
            case 'wisp_ground': {
                const p = Math.sin(this._runPhase);
                sx = 1.04 + punch * 0.22;
                sy = 0.92 + wind * 0.08;
                y = Math.abs(p) * 2.5 + punch * 3;
                ang = p * 4 - punch * 10;
                x = punch * 6;
                break;
            }
            case 'bat':
                sx = 1.1 + Math.sin(this._runPhase) * 0.12;
                sy = 0.9 + Math.abs(Math.cos(this._runPhase)) * 0.16;
                y = 8 + Math.sin(this._runPhase * 2) * 6;
                ang = Math.sin(this._runPhase) * 10;
                x = Math.cos(this._runPhase * 0.7) * 2.5;
                break;
            case 'bat_ground': {
                const p = Math.sin(this._runPhase);
                sx = 1.08 + punch * 0.28;
                sy = 0.9 + wind * 0.08;
                y = Math.abs(p) * 2;
                ang = p * 5 - punch * 12;
                x = punch * 8;
                break;
            }
            case 'moth':
                sx = 1.06 + Math.sin(this._runPhase * 0.6) * 0.08;
                sy = 0.94 + Math.abs(Math.sin(this._runPhase)) * 0.1;
                y = 10 + idleBob * 3.5;
                ang = Math.sin(this._t * 3.8) * 7;
                x = Math.sin(this._t * 1.9) * 3;
                break;
            case 'moth_ground': {
                const p = Math.sin(this._runPhase);
                sx = 1.04 + punch * 0.18;
                sy = 0.94 + wind * 0.08;
                y = Math.abs(p) * 1.8 + punch * 2;
                ang = p * 4 - punch * 8;
                x = punch * 4;
                break;
            }
            case 'raven':
                sx = 1.08 + Math.sin(this._runPhase) * 0.1;
                sy = 0.92 + Math.abs(Math.cos(this._runPhase)) * 0.12;
                y = 9 + Math.sin(this._runPhase * 1.4) * 5;
                ang = Math.sin(this._runPhase) * 7;
                x = Math.cos(this._t * 1.5) * 3;
                break;
            case 'raven_ground': {
                const p = Math.sin(this._runPhase);
                sx = 1.06 + punch * 0.22;
                sy = 0.92 + wind * 0.08;
                y = Math.abs(p) * 2 + punch * 3;
                ang = p * 4 - punch * 10;
                x = punch * 7;
                break;
            }
            case 'mosquito':
                sx = 1.12 + Math.sin(this._runPhase * 1.5) * 0.12;
                sy = 0.88 + Math.abs(Math.cos(this._runPhase * 1.5)) * 0.16;
                y = 8 + Math.sin(this._runPhase * 2.6) * 6;
                ang = Math.sin(this._runPhase * 1.7) * 10;
                x = Math.cos(this._runPhase) * 2.5;
                break;
            case 'mosquito_ground': {
                const p = Math.sin(this._runPhase);
                sx = 1.08 + punch * 0.25;
                sy = 0.9 + wind * 0.06;
                y = Math.abs(p) * 1.8;
                ang = p * 6 - punch * 12;
                x = punch * 9;
                break;
            }
            case 'specter':
                sx = 1.05 + idleBob * 0.07;
                sy = 0.95 - idleBob * 0.06;
                y = 11 + Math.sin(this._runPhase) * 5;
                ang = idleBob * 5;
                x = Math.sin(this._t * 1.7) * 3;
                break;
            case 'specter_ground': {
                const p = Math.sin(this._runPhase);
                sx = 1.04 + punch * 0.18;
                sy = 0.92 + wind * 0.08;
                y = Math.abs(p) * 2 + punch * 3;
                ang = p * 4 - punch * 10;
                x = punch * 6;
                break;
            }
            case 'bone': {
                const step = Math.sin(this._runPhase);
                const hop = Math.max(0, step);
                sx = 1.02 + punch * 0.16;
                sy = 1 + hop * 0.1 + wind * 0.07;
                ang = step * 4 - punch * 10;
                y = hop * 4.5;
                x = punch * 5;
                break;
            }
            case 'mage': {
                if (this.moving) {
                    const p = Math.sin(this._runPhase);
                    ang = p * 2.5 - punch * 16 - wind * 8;
                    sx = 1 + Math.abs(p) * 0.03 + punch * 0.2 + wind * 0.08;
                    sy = 1 + Math.abs(p) * 0.06;
                    y = Math.abs(p) * 3 + wind * 3;
                    x = punch * 4;
                } else {
                    ang = idleBob * 2 - punch * 14 - wind * 8;
                    sx = 1 + punch * 0.18 + wind * 0.08;
                    sy = 1 + idleBob * 0.03;
                    y = idleBob * 1.2 + wind * 3;
                }
                break;
            }
            case 'dragon':
                sx = 1.1 + Math.sin(this._runPhase) * 0.1 + punch * 0.16;
                sy = 0.94 + Math.abs(Math.cos(this._runPhase)) * 0.1;
                y = 12 + Math.sin(this._runPhase) * 5 + punch * 4;
                ang = Math.sin(this._runPhase) * 5 - punch * 12 - wind * 7;
                x = Math.sin(this._t * 1.6) * 2 + punch * 9;
                break;
            case 'dragon_ground': {
                const p = Math.sin(this._runPhase);
                sx = 1.06 + punch * 0.22;
                sy = 0.95 + wind * 0.08;
                y = Math.abs(p) * 2.5 + punch * 4;
                ang = p * 3.5 - punch * 12 - wind * 6;
                x = punch * 8;
                break;
            }
            case 'archer': {
                const p = Math.sin(this._runPhase);
                ang = p * 2.5 - punch * 10 - wind * 7;
                sx = 1 + punch * 0.22;
                sy = 1 + Math.abs(p) * 0.07 + wind * 0.05;
                y = Math.abs(p) * 3.5;
                x = punch * 4;
                break;
            }
            case 'spider': {
                const p = Math.sin(this._runPhase);
                sx = 1.06 + Math.abs(p) * 0.06;
                sy = 0.94 + Math.abs(p) * 0.08;
                y = Math.abs(p) * 2.5;
                x = p * 2 + punch * 5;
                ang = p * 4 - punch * 8;
                break;
            }
            case 'snake': {
                const p = Math.sin(this._runPhase);
                sx = 1.08 + p * 0.08;
                sy = 0.94;
                x = Math.sin(this._runPhase * 0.5) * 4 + punch * 6;
                y = Math.abs(Math.sin(this._runPhase * 0.5)) * 2;
                ang = p * 8 - punch * 6;
                break;
            }
            case 'shroom': {
                const p = Math.sin(this._runPhase);
                sx = 1.05 + Math.abs(p) * 0.04 + punch * 0.15;
                sy = 0.95 - Math.abs(p) * 0.05;
                y = Math.abs(p) * 1.5 + punch * 3;
                ang = p * 2 - punch * 10;
                break;
            }
            case 'imp': {
                const p = Math.sin(this._runPhase);
                const hop = Math.max(0, p);
                ang = hop * 4 - punch * 12;
                sx = 1 + hop * 0.06;
                sy = 1 - Math.max(0, -p) * 0.1 + hop * 0.08;
                y = hop * 6;
                x = punch * 5;
                break;
            }
            case 'jelly':
                sx = 1.08 + Math.sin(this._runPhase) * 0.08;
                sy = 0.94 + Math.abs(Math.cos(this._runPhase)) * 0.1;
                y = 10 + Math.sin(this._runPhase) * 4;
                ang = Math.sin(this._runPhase) * 5;
                x = Math.sin(this._t * 1.4) * 2;
                break;
            case 'jelly_ground': {
                const p = Math.sin(this._runPhase);
                sx = 1.05 + punch * 0.15;
                sy = 0.96;
                y = Math.abs(p) * 2 + punch * 3;
                ang = p * 3;
                break;
            }
            default: {
                const step = Math.sin(this._runPhase);
                const hop = Math.max(0, step);
                const plant = Math.max(0, -step);
                ang = hop * 2.5 - punch * 14;
                sx = 1 + plant * 0.1 + hop * 0.04;
                sy = 1 - plant * 0.12 + hop * 0.08;
                y = hop * 4.5;
                x = punch * 6;
                break;
            }
        }

        // 攻击覆盖：蓄力蹲 / 出击前冲
        if (wind > 0) {
            sx *= 1 + wind * 0.06;
            sy *= 1 - wind * 0.12;
            y -= wind * 4;
        }
        if (punch > 0) {
            const pk = Math.sin(Math.min(1, punch) * Math.PI);
            x += pk * 6;
            y += pk * 3;
        }

        // #173 像素体贴图：步伐在切帧里，整身只做轻微起伏
        if (this._pixelBody()) {
            ang *= 0.2;
            sx = 1 + (sx - 1) * 0.45;
            sy = 1 + (sy - 1) * 0.45;
        }

        this.node.setScale(sx * (1 - fl * 0.14), sy * (1 + fl * 0.1), 1);
        this.node.angle = ang + fl * 10;
        this.node.setPosition(x - fl * 5, y, 0);
    }

    private _poseIdle(bob: number, punch: number, wind: number, fl: number) {
        let sx = 1 + bob * 0.02;
        let sy = 1 - bob * 0.022;
        let ang = bob * 1.0;
        let y = bob * 1.1;
        let x = 0;

        if (this.kind === 'wisp' || this.kind === 'specter') {
            y = 6 + bob * 2.5;
            ang = bob * 3;
            x = Math.sin(this._t * 1.2) * 1.2;
        } else if (this.kind === 'bat' || this.kind === 'mosquito' || this.kind === 'raven' || this.kind === 'moth' || this.kind === 'dragon' || this.kind === 'jelly') {
            // 飞怪待机仍轻扑翼，但幅度远小于追击
            const flap = Math.sin(this._t * (this.kind === 'mosquito' ? 10 : this.kind === 'jelly' ? 4 : 6));
            sx = 1.04 + flap * 0.05;
            sy = 0.96 + Math.abs(flap) * 0.05;
            y = 6 + Math.abs(flap) * 2;
            ang = flap * 3.5;
        }

        if (wind > 0) {
            sx *= 1 + wind * 0.08;
            sy *= 1 - wind * 0.12;
            y -= wind * 3.5;
            ang -= wind * 6;
        }
        if (punch > 0) {
            const pk = Math.sin(Math.min(1, punch) * Math.PI);
            x += pk * 9;
            ang -= pk * 12;
            sx *= 1 + pk * 0.12;
        }

        if (this._pixelBody()) {
            ang *= 0.25;
            sx = 1 + (sx - 1) * 0.5;
            sy = 1 + (sy - 1) * 0.5;
        }

        this.node.setScale(sx * (1 - fl * 0.14), sy * (1 + fl * 0.1), 1);
        this.node.angle = ang + fl * 10;
        this.node.setPosition(x - fl * 5, y, 0);
    }

    private _rate(): number {
        return enemyBobRate(this.kind);
    }

    private _runRate(): number {
        return enemyRunRate(this.kind);
    }
}
