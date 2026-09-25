import { _decorator, Component, Node, Vec3, Graphics, Color,
         UITransform, tween } from 'cc';
import { EnemyRegistry, type CombatEnemy } from '../enemy/EnemyRegistry';
import { WorldBridge } from '../dungeon/WorldBridge';
import { CombatVfx } from '../fx/CombatVfx';
import { BulletPool } from './BulletPool';
import { GameFlow } from '../../core/GameFlow';
import { knockEnemy, splashAt } from './WeaponModes';

const { ccclass } = _decorator;

export interface BulletConfig {
    damage:    number;
    speed:     number;
    range:     number;
    radius:    number;
    color:     Color;
    size:      number;
    shape:     'ball' | 'arrow' | 'orb';
    piercing:  boolean;     // 穿透：打穿所有敌人
    /** #143 弹墙次数 */
    bounce?:   number;
    /** #143 追踪最近敌人 */
    homing?:   boolean;
    /** #143 命中 / 到射程末端溅射半径（投掷物） */
    splash?:   number;
    /** #143 命中击退 */
    knockback?: number;
    /** #143 命中减速 [mul, sec] */
    slow?:     [number, number] | null;
}

/**
 * Bullet —— 通用子弹（支持穿透、三种外形）
 * 碰撞：自身 radius + 敌人 collideRadius；撞地形障碍销毁
 */
@ccclass('Bullet')
export class Bullet extends Component {

    private _dir     = new Vec3();
    private _cfg!:   BulletConfig;
    private _owner:  Node = null!;
    private _traveled = 0;
    private _hitIds:  Set<string> = new Set();  // 穿透时记录已命中，避免重复伤害
    private _trailAcc = 0;
    private _bounceLeft = 0;

    init(startPos: Vec3, dir: Vec3, cfg: BulletConfig, owner: Node) {
        this.node.setPosition(startPos);
        this._dir.set(dir);
        this._cfg   = cfg;
        this._owner = owner;
        this._traveled = 0;
        this._hitIds.clear();
        this._trailAcc = 0;
        this._bounceLeft = cfg.bounce ?? 0;
        this.node.angle = 0;
        this._draw(dir, cfg);
        // 出生弹出：精致感
        this.node.setScale(0.35, 0.35, 1);
        tween(this.node)
            .to(0.08, { scale: new Vec3(1.15, 1.15, 1) }, { easing: 'backOut' })
            .to(0.06, { scale: new Vec3(1, 1, 1) })
            .start();
    }

    update(dt: number) {
        if (!this._cfg) return;
        // 软回大厅后若有残留弹，立即回收（对齐 EnemyBolt / 战斗门控）
        if (!GameFlow.isPlaying) {
            BulletPool.release(this.node);
            return;
        }
        if (GameFlow.isCombatFrozen) return;
        const spd = this._cfg.speed;
        const cur = this.node.position;

        // #143 追踪：朝最近敌人拐弯（每秒最多 4.5 弧度）
        if (this._cfg.homing) this._steerHoming(cur.x, cur.y, dt);
        // 弹墙弹 / 追踪弹自转，读得出「在飞」
        if (this._bounceLeft > 0 || this._cfg.homing) this.node.angle += dt * 720;

        let nx  = cur.x + this._dir.x * spd * dt;
        let ny  = cur.y + this._dir.y * spd * dt;

        // 撞地形（树/石等）：弹墙弹反射，其余销毁（穿透弹也不穿墙）
        if (WorldBridge.hitsObstacle(nx, ny, this._cfg.radius)) {
            if (this._bounceLeft > 0) {
                this._bounceLeft--;
                const hitX = WorldBridge.hitsObstacle(nx, cur.y, this._cfg.radius);
                const hitY = WorldBridge.hitsObstacle(cur.x, ny, this._cfg.radius);
                if (hitX || (!hitX && !hitY)) this._dir.x = -this._dir.x;
                if (hitY || (!hitX && !hitY)) this._dir.y = -this._dir.y;
                nx = cur.x + this._dir.x * spd * dt;
                ny = cur.y + this._dir.y * spd * dt;
                this._hitIds.clear(); // 反弹后可以再打同一只
                const parent = this.node.parent;
                if (parent?.isValid) CombatVfx.burst(parent, cur.x, cur.y, this._cfg.color, 4);
            } else {
                this._explode(cur.x, cur.y);
                BulletPool.release(this.node);
                return;
            }
        }

        this.node.setPosition(nx, ny, 0);
        this._traveled += spd * dt;
        this._trailAcc += spd * dt;
        if (this._trailAcc > 18) {
            this._trailAcc = 0;
            const parent = this.node.parent;
            if (parent) {
                CombatVfx.trailDot(parent, nx, ny, this._cfg.color,
                    this._cfg.shape === 'orb' ? 5 : 3);
            }
        }

        // 超出射程（投掷物在此落地炸开）
        if (this._traveled >= this._cfg.range) {
            this._explode(nx, ny);
            BulletPool.release(this.node);
            return;
        }

        // 出地图边界
        if (Math.abs(nx) > WorldBridge.boundX || Math.abs(ny) > WorldBridge.boundY) {
            BulletPool.release(this.node);
            return;
        }

        // 命中检测：子弹半径 + 敌人碰撞半径
        const hits = EnemyRegistry.getHitByCircle(nx, ny, this._cfg.radius);
        if (hits.length === 0) return;

        if (this._cfg.piercing) {
            hits.forEach(e => {
                const id = e.node.uuid;
                if (!this._hitIds.has(id)) {
                    this._hitIds.add(id);
                    this._hitOne(e, nx, ny);
                }
            });
        } else {
            // 弹墙弹：同一只怪一次反弹只吃一下
            const target = hits.find(e => !this._hitIds.has(e.node.uuid));
            if (!target) return;
            this._hitOne(target, nx, ny);
            if (this._bounceLeft > 0) { this._hitIds.add(target.node.uuid); return; }
            this._explode(nx, ny, target);
            BulletPool.release(this.node);
        }
    }

    private _hitOne(e: CombatEnemy, x: number, y: number) {
        e.takeDamage(this._cfg.damage);
        if (this._cfg.slow) e.applySlow?.(this._cfg.slow[0], this._cfg.slow[1]);
        if (this._cfg.knockback) knockEnemy(e, this._dir.x, this._dir.y, this._cfg.knockback);
        this._spawnHitFx(x, y);
    }

    /** 投掷物落地 / 命中：溅射一圈 */
    private _explode(x: number, y: number, direct?: CombatEnemy) {
        const r = this._cfg.splash ?? 0;
        if (r <= 0) return;
        splashAt(x, y, r, Math.max(1, Math.round(this._cfg.damage * 0.7)), this._cfg.slow ?? null, direct);
        const parent = this.node.parent;
        if (parent?.isValid) {
            CombatVfx.ringPulse(parent, x, y, this._cfg.color, r * 0.45, 0.26);
            CombatVfx.burst(parent, x, y, this._cfg.color, 10);
        }
        CombatVfx.shakeWorld(5);
    }

    private _steerHoming(x: number, y: number, dt: number) {
        const list = EnemyRegistry.getInRange(x, y, 320, false);
        const target = list.find(e => !this._hitIds.has(e.node.uuid));
        if (!target) return;
        const tx = target.node.position.x - x;
        const ty = target.node.position.y - y;
        const want = Math.atan2(ty, tx);
        const cur = Math.atan2(this._dir.y, this._dir.x);
        let diff = want - cur;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const maxTurn = 4.5 * dt;
        const a = cur + Math.max(-maxTurn, Math.min(maxTurn, diff));
        this._dir.set(Math.cos(a), Math.sin(a), 0);
    }

    private _gfx(w: number, h: number): Graphics {
        const ui = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
        ui.setContentSize(w, h);
        let g = this.node.getComponent(Graphics);
        if (!g) g = this.node.addComponent(Graphics);
        g.clear();
        return g;
    }

    // ── 绘制不同外形 ─────────────────────────────────────────

    private _draw(dir: Vec3, cfg: BulletConfig) {
        switch (cfg.shape) {
            case 'arrow': this._drawArrow(dir, cfg); break;
            case 'orb':   this._drawOrb(cfg);        break;
            default:      this._drawBall(cfg);       break;
        }
    }

    /** 箭矢：细长椭圆 + 箭头 */
    private _drawArrow(dir: Vec3, cfg: BulletConfig) {
        const angle = Math.atan2(dir.y, dir.x);
        const W = cfg.size * 2.8;   // 箭杆长度
        const H = cfg.size * 0.5;   // 箭杆宽度

        const g = this._gfx(W + 10, W + 10);
        g.fillColor = cfg.color;

        // 旋转坐标辅助
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const rot = (x: number, y: number) => ({ x: x * cos - y * sin, y: x * sin + y * cos });

        // 箭杆（矩形，沿方向）
        const hw = W / 2;
        const hh = H / 2;
        const corners = [rot(-hw, -hh), rot(hw, -hh), rot(hw, hh), rot(-hw, hh)];
        g.moveTo(corners[0].x, corners[0].y);
        corners.forEach(c => g.lineTo(c.x, c.y));
        g.close();
        g.fill();

        // 箭头（三角形）
        const tip  = rot(hw + cfg.size * 0.8, 0);
        const left = rot(hw - cfg.size * 0.2, -cfg.size * 0.55);
        const right= rot(hw - cfg.size * 0.2,  cfg.size * 0.55);
        g.fillColor = new Color(
            Math.min(255, cfg.color.r + 40),
            Math.min(255, cfg.color.g + 40),
            Math.min(255, cfg.color.b),
            255
        );
        g.moveTo(tip.x, tip.y);
        g.lineTo(left.x, left.y);
        g.lineTo(right.x, right.y);
        g.close();
        g.fill();

        // 尾羽（小三角）
        const tail  = rot(-hw - cfg.size * 0.4, 0);
        const tl    = rot(-hw + cfg.size * 0.1, -cfg.size * 0.5);
        const tr    = rot(-hw + cfg.size * 0.1,  cfg.size * 0.5);
        g.fillColor = new Color(255, 255, 255, 180);
        g.moveTo(tail.x, tail.y);
        g.lineTo(tl.x, tl.y);
        g.lineTo(tr.x, tr.y);
        g.close();
        g.fill();
    }

    /** 魔法球：发光紫球 + 旋转粒子环 */
    private _drawOrb(cfg: BulletConfig) {
        const g = this._gfx(cfg.size * 3, cfg.size * 3);
        const r = cfg.size / 2;

        // 外光晕（3层渐变感）
        const glow = [
            { r: r * 2.2, a: 30 },
            { r: r * 1.7, a: 60 },
            { r: r * 1.3, a: 100 },
        ];
        for (const lv of glow) {
            g.fillColor = new Color(cfg.color.r, cfg.color.g, cfg.color.b, lv.a);
            g.circle(0, 0, lv.r);
            g.fill();
        }

        // 主球体
        g.fillColor = cfg.color;
        g.circle(0, 0, r);
        g.fill();

        // 内核亮点
        g.fillColor = new Color(220, 180, 255, 220);
        g.circle(-r * 0.3, r * 0.3, r * 0.4);
        g.fill();

        // 环绕小粒子（装饰用，静态画在四方）
        const dots = [{ x: r * 1.4, y: 0 }, { x: 0, y: r * 1.4 },
                      { x: -r * 1.4, y: 0 }, { x: 0, y: -r * 1.4 }];
        g.fillColor = new Color(cfg.color.r, cfg.color.g, cfg.color.b, 180);
        for (const d of dots) {
            g.circle(d.x, d.y, r * 0.25);
            g.fill();
        }
    }

    /** 普通球（默认 / 剑气风格） */
    private _drawBall(cfg: BulletConfig) {
        const g = this._gfx(cfg.size * 2.4, cfg.size * 2.4);
        const r = cfg.size / 2;

        // 外光圈
        g.fillColor = new Color(cfg.color.r, cfg.color.g, cfg.color.b, 70);
        g.circle(0, 0, r + 5);
        g.fill();

        // 实心弹体
        g.fillColor = cfg.color;
        g.circle(0, 0, r);
        g.fill();

        // 高光
        g.fillColor = new Color(255, 255, 255, 180);
        g.circle(-r * 0.3, r * 0.3, r * 0.35);
        g.fill();
    }

    /** 命中火花（挂 WorldLayer / 子弹父层） */
    private _spawnHitFx(x: number, y: number) {
        const parent = this.node.parent;
        if (parent?.isValid) {
            CombatVfx.burst(parent, x, y, this._cfg.color, 7);
            CombatVfx.ringPulse(parent, x, y, this._cfg.color, 10, 0.16);
        }
        if (this._cfg.piercing && this.node.isValid) {
            const s = this.node.scale.x;
            this.node.setScale(s * 1.35, s * 1.35, 1);
            this.scheduleOnce(() => {
                if (this.node.isValid) this.node.setScale(s, s, 1);
            }, 0.06);
        }
    }
}
