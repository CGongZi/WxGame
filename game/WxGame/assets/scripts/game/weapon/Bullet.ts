import { _decorator, Component, Node, Vec3, Graphics, Color,
         UITransform } from 'cc';
import { EnemyRegistry } from '../enemy/EnemyRegistry';

const { ccclass, property } = _decorator;

export interface BulletConfig {
    damage:   number;
    speed:    number;
    range:    number;   // 最大飞行距离
    radius:   number;   // 碰撞半径
    color:    Color;
    size:     number;   // 视觉尺寸
}

/**
 * Bullet —— 通用子弹
 * 由 WeaponController 动态创建，自动飞行、检测碰撞、到达最大距离后销毁
 */
@ccclass('Bullet')
export class Bullet extends Component {

    private _dir    = new Vec3();
    private _cfg!:  BulletConfig;
    private _traveled = 0;
    private _owner: Node = null!;  // 不打自己

    init(startPos: Vec3, dir: Vec3, cfg: BulletConfig, owner: Node) {
        this.node.setPosition(startPos);
        this._dir.set(dir);
        this._cfg   = cfg;
        this._owner = owner;
        this._draw(cfg);
    }

    update(dt: number) {
        const spd = this._cfg.speed;
        const cur = this.node.position;
        const nx  = cur.x + this._dir.x * spd * dt;
        const ny  = cur.y + this._dir.y * spd * dt;
        this.node.setPosition(nx, ny, 0);
        this._traveled += spd * dt;

        // 超出射程销毁
        if (this._traveled >= this._cfg.range) {
            this.node.destroy();
            return;
        }

        // 命中检测（遍历注册表）
        const hit = EnemyRegistry.getInRange(nx, ny, this._cfg.radius);
        if (hit.length > 0) {
            hit[0].takeDamage(this._cfg.damage);
            this.node.destroy();
        }
    }

    private _draw(cfg: BulletConfig) {
        const ui = this.node.addComponent(UITransform);
        ui.setContentSize(cfg.size, cfg.size);

        const g = this.node.addComponent(Graphics);
        const r = cfg.size / 2;

        // 外光圈
        g.fillColor = new Color(cfg.color.r, cfg.color.g, cfg.color.b, 80);
        g.circle(0, 0, r + 4);
        g.fill();

        // 实心弹体
        g.fillColor = cfg.color;
        g.circle(0, 0, r);
        g.fill();

        // 高光
        g.fillColor = new Color(255, 255, 255, 160);
        g.circle(-r * 0.3, r * 0.3, r * 0.3);
        g.fill();
    }
}
