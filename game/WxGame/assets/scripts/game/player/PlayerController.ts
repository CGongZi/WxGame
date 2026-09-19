import { _decorator, Component, Node, Vec3, input, Input,
         EventKeyboard, KeyCode, UITransform, Sprite, Color,
         Graphics } from 'cc';
import { GameManager } from '../../core/GameManager';
import { eventBus, GameEvents } from '../../core/EventBus';

const { ccclass, property } = _decorator;

@ccclass('PlayerController')
export class PlayerController extends Component {

    @property({ min: 50 })
    moveSpeed: number = 200;

    // 地图边界（像素，对应 RoomBuilder.roomW/H 的一半减去墙厚）
    @property mapBoundX: number = 310;
    @property mapBoundY: number = 490;

    private _dir = new Vec3();
    private _pos = new Vec3();

    // 输入方向
    private _keys  = { up: false, down: false, left: false, right: false };
    private _joyDir = new Vec3();   // 来自摇杆

    private _hp    = 100;
    private _maxHp = 100;
    private _invincibleTimer = 0;   // 受击无敌时间

    onLoad() {
        this._hp    = 100;
        this._maxHp = 100;
        this._drawPlayer();
        this._emitHp();
    }

    onEnable() {
        input.on(Input.EventType.KEY_DOWN, this._onKeyDown, this);
        input.on(Input.EventType.KEY_UP,   this._onKeyUp,   this);
    }

    onDisable() {
        input.off(Input.EventType.KEY_DOWN, this._onKeyDown, this);
        input.off(Input.EventType.KEY_UP,   this._onKeyUp,   this);
    }

    update(dt: number) {
        if (this._invincibleTimer > 0) this._invincibleTimer -= dt;

        // 键盘方向
        const kx = (this._keys.right ? 1 : 0) - (this._keys.left ? 1 : 0);
        const ky = (this._keys.up    ? 1 : 0) - (this._keys.down ? 1 : 0);

        // 合并键盘+摇杆（摇杆优先）
        const jLen = Math.sqrt(this._joyDir.x ** 2 + this._joyDir.y ** 2);
        const useJoy = jLen > 0.1;
        const dx = useJoy ? this._joyDir.x : kx;
        const dy = useJoy ? this._joyDir.y : ky;

        if (dx === 0 && dy === 0) return;

        // 归一化
        const len = Math.sqrt(dx * dx + dy * dy);
        const nx = dx / len, ny = dy / len;

        // 更新位置（带边界限制）
        const cur = this.node.position;
        const nx2 = Math.max(-this.mapBoundX, Math.min(this.mapBoundX, cur.x + nx * this.moveSpeed * dt));
        const ny2 = Math.max(-this.mapBoundY, Math.min(this.mapBoundY, cur.y + ny * this.moveSpeed * dt));
        this.node.setPosition(nx2, ny2, 0);

        // 朝向翻转
        const s = this.node.scale;
        if (dx !== 0) this.node.setScale(dx < 0 ? -Math.abs(s.x) : Math.abs(s.x), s.y, s.z);
    }

    /** 接收摇杆方向 [-1, 1] */
    setJoystickDir(x: number, y: number) {
        this._joyDir.set(x, y, 0);
    }

    /** 被史莱姆攻击调用 */
    takeDamage(amount: number) {
        if (this._invincibleTimer > 0) return;   // 无敌帧
        this._hp = Math.max(0, this._hp - amount);
        this._invincibleTimer = 0.8;
        this._emitHp();
        this._flashDamage();
        console.log(`[Player] 受到伤害 -${amount}，剩余 HP: ${this._hp}`);

        if (this._hp <= 0) {
            try { GameManager.instance.onPlayerDeath(); } catch {}
            eventBus.emit(GameEvents.GAME_OVER, {});
        }
    }

    heal(amount: number) {
        this._hp = Math.min(this._maxHp, this._hp + amount);
        this._emitHp();
    }

    get currentHp() { return this._hp; }
    get maxHp()     { return this._maxHp; }

    // ── 私有 ─────────────────────────────────────────────

    private _onKeyDown(e: EventKeyboard) {
        if (e.keyCode === KeyCode.KEY_W || e.keyCode === KeyCode.ARROW_UP)    this._keys.up    = true;
        if (e.keyCode === KeyCode.KEY_S || e.keyCode === KeyCode.ARROW_DOWN)  this._keys.down  = true;
        if (e.keyCode === KeyCode.KEY_A || e.keyCode === KeyCode.ARROW_LEFT)  this._keys.left  = true;
        if (e.keyCode === KeyCode.KEY_D || e.keyCode === KeyCode.ARROW_RIGHT) this._keys.right = true;
    }

    private _onKeyUp(e: EventKeyboard) {
        if (e.keyCode === KeyCode.KEY_W || e.keyCode === KeyCode.ARROW_UP)    this._keys.up    = false;
        if (e.keyCode === KeyCode.KEY_S || e.keyCode === KeyCode.ARROW_DOWN)  this._keys.down  = false;
        if (e.keyCode === KeyCode.KEY_A || e.keyCode === KeyCode.ARROW_LEFT)  this._keys.left  = false;
        if (e.keyCode === KeyCode.KEY_D || e.keyCode === KeyCode.ARROW_RIGHT) this._keys.right = false;
    }

    private _emitHp() {
        eventBus.emit(GameEvents.PLAYER_HP_CHANGED, { current: this._hp, max: this._maxHp });
    }

    /** 用 Graphics 画玩家（40x40 青色骑士轮廓） */
    private _drawPlayer() {
        // 先清掉旧的 Graphics
        let g = this.getComponent(Graphics);
        if (!g) g = this.addComponent(Graphics);
        g.clear();

        const s = 40;   // 玩家尺寸
        const h = s / 2;

        // 身体
        g.fillColor = new Color(0, 220, 120, 255);
        g.roundRect(-h, -h, s, s, 6);
        g.fill();

        // 盔甲高光
        g.fillColor = new Color(100, 255, 180, 200);
        g.roundRect(-h + 4, h - 10, s - 8, 6, 3);
        g.fill();

        // 头盔（顶部深色）
        g.fillColor = new Color(0, 160, 90, 255);
        g.roundRect(-h + 4, h - 20, s - 8, 12, 4);
        g.fill();

        // 眼缝（白色）
        g.fillColor = new Color(200, 255, 230, 255);
        g.rect(-12, 4, 8, 4);
        g.fill();
        g.rect(4, 4, 8, 4);
        g.fill();

        // UITransform 大小
        const ui = this.getComponent(UITransform) ?? this.addComponent(UITransform);
        ui.setContentSize(s, s);
    }

    private _flashDamage() {
        // 受击变红闪烁
        const g = this.getComponent(Graphics);
        if (!g) return;
        // 简单放大缩小做受击感
        this.node.setScale(1.3, 1.3, 1);
        this.scheduleOnce(() => this.node.setScale(1, 1, 1), 0.1);
    }
}
