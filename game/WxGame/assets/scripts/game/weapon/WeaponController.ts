import { _decorator, Component, Node, Vec3, input, Input,
         EventKeyboard, KeyCode, EventMouse, Graphics, UITransform,
         Color, tween, find } from 'cc';
import { EnemyRegistry } from '../enemy/EnemyRegistry';
import { Bullet, BulletConfig } from './Bullet';
import { eventBus, GameEvents } from '../../core/EventBus';

const { ccclass, property } = _decorator;

// ── 武器定义 ────────────────────────────────────────────────

export type WeaponType = 'sword' | 'bow' | 'wand' | 'dagger';

export interface WeaponDef {
    id:         WeaponType;
    name:       string;
    emoji:      string;
    type:       'melee' | 'ranged';
    damage:     number;
    cooldown:   number;
    range:      number;       // 近战=打击半径, 远程=子弹射程
    bulletSpeed?: number;
    bulletSize?:  number;
    bulletColor?: Color;
    description: string;
}

export const WEAPONS: Record<WeaponType, WeaponDef> = {
    sword: {
        id: 'sword', name: '铁剑', emoji: '🗡️', type: 'melee',
        damage: 20, cooldown: 0.45, range: 110,
        description: '近战标准剑，攻速快，伤害稳定',
    },
    dagger: {
        id: 'dagger', name: '双刃匕首', emoji: '⚔️', type: 'melee',
        damage: 12, cooldown: 0.20, range: 80,
        description: '超快攻速，适合近距离爆发',
    },
    bow: {
        id: 'bow', name: '木弓', emoji: '🏹', type: 'ranged',
        damage: 18, cooldown: 0.70, range: 500,
        bulletSpeed: 420, bulletSize: 10,
        bulletColor: new Color(255, 220, 60, 255),
        description: '中远程弓箭，安全距离输出',
    },
    wand: {
        id: 'wand', name: '魔法杖', emoji: '🪄', type: 'ranged',
        damage: 30, cooldown: 1.10, range: 380,
        bulletSpeed: 300, bulletSize: 16,
        bulletColor: new Color(180, 80, 255, 255),
        description: '魔法弹，伤害高但攻速慢',
    },
};

// ── WeaponController ────────────────────────────────────────

@ccclass('WeaponController')
export class WeaponController extends Component {

    @property(Node)
    bulletLayer: Node = null!;   // 子弹放的层（Canvas 直接子节点）

    private _weapon: WeaponDef = WEAPONS['sword'];
    private _cd = 0;

    // 鼠标方向（用于远程武器瞄准）
    private _mouseDir = new Vec3(1, 0, 0);

    onLoad() {
        if (!this.bulletLayer) {
            this.bulletLayer = find('Game/Canvas/BulletLayer') as Node
                            ?? find('Canvas/BulletLayer') as Node
                            ?? this.node.parent!;
        }
        this._refreshWeaponHUD();
    }

    onEnable() {
        input.on(Input.EventType.KEY_DOWN,   this._onKey,       this);
        input.on(Input.EventType.MOUSE_DOWN, this._onMouseDown, this);
        input.on(Input.EventType.MOUSE_MOVE, this._onMouseMove, this);
    }

    onDisable() {
        input.off(Input.EventType.KEY_DOWN,   this._onKey,       this);
        input.off(Input.EventType.MOUSE_DOWN, this._onMouseDown, this);
        input.off(Input.EventType.MOUSE_MOVE, this._onMouseMove, this);
    }

    update(dt: number) {
        if (this._cd > 0) this._cd -= dt;
    }

    /** 切换武器（拾取时调用） */
    equipWeapon(id: WeaponType) {
        this._weapon = WEAPONS[id];
        this._cd     = 0;
        this._refreshWeaponHUD();
        console.log(`[Weapon] 装备：${this._weapon.name}`);
    }

    get currentWeapon() { return this._weapon; }

    // ── 输入 ─────────────────────────────────────────────────

    private _onKey(e: EventKeyboard) {
        if (e.keyCode === KeyCode.SPACE || e.keyCode === KeyCode.KEY_J) {
            this._tryAttack();
        }
        // 数字键快速切武器（调试用）
        if (e.keyCode === KeyCode.DIGIT_1) this.equipWeapon('sword');
        if (e.keyCode === KeyCode.DIGIT_2) this.equipWeapon('dagger');
        if (e.keyCode === KeyCode.DIGIT_3) this.equipWeapon('bow');
        if (e.keyCode === KeyCode.DIGIT_4) this.equipWeapon('wand');
    }

    private _onMouseDown(e: EventMouse) {
        if (e.getButton() === 0) this._tryAttack();
    }

    private _onMouseMove(e: EventMouse) {
        // 记录鼠标相对玩家的方向（用于远程射击）
        const loc  = e.getUILocation();
        const ppos = this.node.position;
        // Canvas 原点在中心：鼠标画布坐标 = loc - 屏幕中心，再减玩家位置得方向
        const dx   = (loc.x - 667) - ppos.x;
        const dy   = (loc.y - 375) - ppos.y;
        const len  = Math.sqrt(dx * dx + dy * dy);
        if (len > 5) this._mouseDir.set(dx / len, dy / len, 0);
    }

    // ── 攻击逻辑 ─────────────────────────────────────────────

    private _tryAttack() {
        if (this._cd > 0) return;
        this._cd = this._weapon.cooldown;

        if (this._weapon.type === 'melee') {
            this._doMelee();
        } else {
            this._doRanged();
        }
    }

    private _doMelee() {
        const pos = this.node.position;

        // 获取攻击方向（鼠标方向优先，否则朝右）
        const aimDir = this._mouseDir.clone();
        if (aimDir.length() < 0.1) aimDir.set(1, 0, 0);

        // 扇形检测：范围内 + 方向夹角 < 110°
        const allInRange = EnemyRegistry.getInRange(pos.x, pos.y, this._weapon.range);
        const hits = allInRange.filter(enemy => {
            const ex = enemy.node.position.x - pos.x;
            const ey = enemy.node.position.y - pos.y;
            const len = Math.sqrt(ex * ex + ey * ey);
            if (len < 1) return true;
            const dot = (ex / len) * aimDir.x + (ey / len) * aimDir.y;
            return dot > Math.cos(Math.PI * 0.6);  // 120° 扇形
        });

        console.log(`[${this._weapon.name}] 近战 方向(${aimDir.x.toFixed(1)},${aimDir.y.toFixed(1)}) 命中: ${hits.length}`);
        hits.slice(0, 3).forEach(e => e.takeDamage(this._weapon.damage));

        this._swingEffect(aimDir.x, aimDir.y);
    }

    private _doRanged() {
        const pos = this.node.position.clone();
        const dir = this._mouseDir.clone();

        // 没鼠标方向就朝右
        if (dir.length() < 0.1) dir.set(1, 0, 0);

        const bulletNode = new Node('Bullet');
        bulletNode.setParent(this.bulletLayer);

        const bullet = bulletNode.addComponent(Bullet);
        bullet.init(pos, dir, {
            damage:      this._weapon.damage,
            speed:       this._weapon.bulletSpeed ?? 400,
            range:       this._weapon.range,
            radius:      (this._weapon.bulletSize ?? 12) + 8,
            color:       this._weapon.bulletColor ?? new Color(255, 200, 50, 255),
            size:        this._weapon.bulletSize ?? 12,
        }, this.node);

        console.log(`[${this._weapon.name}] 发射子弹`);
        this._shootEffect();
    }

    // ── 视觉特效 ──────────────────────────────────────────────

    private _swingEffect(dirX = 1, dirY = 0) {
        tween(this.node)
            .to(0.07, { scale: new Vec3(1.3, 1.3, 1) })
            .to(0.10, { scale: new Vec3(1.0, 1.0, 1) })
            .start();

        // 在攻击方向画剑气弧线
        const arc = new Node('SwingArc');
        arc.setParent(this.bulletLayer);
        arc.setPosition(this.node.position);
        arc.addComponent(UITransform).setContentSize(160, 160);

        const g = arc.addComponent(Graphics);
        // 根据方向旋转弧线角度
        const baseAngle = Math.atan2(dirY, dirX);
        g.lineWidth   = 7;
        g.strokeColor = new Color(200, 230, 255, 220);
        g.arc(0, 0, 72, baseAngle - 0.9, baseAngle + 0.9);
        g.stroke();

        // 剑气白色内层
        g.lineWidth   = 3;
        g.strokeColor = new Color(255, 255, 255, 160);
        g.arc(0, 0, 56, baseAngle - 0.7, baseAngle + 0.7);
        g.stroke();

        this.scheduleOnce(() => { if (arc.isValid) arc.destroy(); }, 0.15);
    }

    private _shootEffect() {
        tween(this.node)
            .to(0.05, { scale: new Vec3(0.85, 0.85, 1) })
            .to(0.10, { scale: new Vec3(1.00, 1.00, 1) })
            .start();
    }

    private _refreshWeaponHUD() {
        eventBus.emit(GameEvents.WEAPON_CHANGED, {
            name:  this._weapon.name,
            emoji: this._weapon.emoji,
            type:  this._weapon.type,
        });
    }
}
