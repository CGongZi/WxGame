import { _decorator, Component, Vec2, Node, input, Input, EventKeyboard, KeyCode } from 'cc';
import { GameConfig } from '../../core/GameConfig';
import { GameManager } from '../../core/GameManager';
import { eventBus, GameEvents } from '../../core/EventBus';

const { ccclass, property } = _decorator;

/**
 * 玩家控制器
 * - 浏览器：WASD / 方向键 移动
 * - 手机：JoystickController 调用 setMoveDirection()
 */
@ccclass('PlayerController')
export class PlayerController extends Component {

    @property(Node)
    spriteNode: Node = null!;

    @property(Node)
    weaponHolder: Node = null!;

    private _joystickDir: Vec2 = new Vec2(0, 0);   // 摇杆输入
    private _keyboardDir: Vec2 = new Vec2(0, 0);    // 键盘输入
    private _isInvincible: boolean = false;
    private _invincibleTimer: number = 0;
    private _isDead: boolean = false;
    private _speed: number = GameConfig.PLAYER_BASE_SPEED;

    // 记录哪些键被按下
    private _keys: Set<KeyCode> = new Set();

    onLoad() {
        eventBus.on(GameEvents.PLAYER_REVIVED, this._onRevived, this);
    }

    onEnable() {
        input.on(Input.EventType.KEY_DOWN, this._onKeyDown, this);
        input.on(Input.EventType.KEY_UP,   this._onKeyUp,   this);
    }

    onDisable() {
        input.off(Input.EventType.KEY_DOWN, this._onKeyDown, this);
        input.off(Input.EventType.KEY_UP,   this._onKeyUp,   this);
        this._keys.clear();
    }

    onDestroy() {
        eventBus.off(GameEvents.PLAYER_REVIVED, this._onRevived, this);
    }

    update(dt: number) {
        if (this._isDead) return;

        // 合并键盘 + 摇杆输入（摇杆优先）
        this._updateKeyboardDir();
        const moveDir = this._joystickDir.lengthSqr() > 0.01
            ? this._joystickDir
            : this._keyboardDir;

        if (moveDir.lengthSqr() > 0.01) {
            const pos = this.node.position;
            const nx = pos.x + moveDir.x * this._speed * dt;
            const ny = pos.y + moveDir.y * this._speed * dt;

            // 限制在画布范围内
            const halfW = GameConfig.CANVAS_WIDTH  * 0.5 - 20;
            const halfH = GameConfig.CANVAS_HEIGHT * 0.5 - 20;
            this.node.setPosition(
                Math.max(-halfW, Math.min(halfW, nx)),
                Math.max(-halfH, Math.min(halfH, ny)),
                0,
            );
            this._updateFacing(moveDir);
        }

        // 无敌帧计时
        if (this._isInvincible) {
            this._invincibleTimer -= dt;
            if (this._invincibleTimer <= 0) this._isInvincible = false;
        }
    }

    /** JoystickController 调用 */
    setMoveDirection(dir: Vec2) {
        this._joystickDir.set(dir);
    }

    takeDamage(amount: number) {
        if (this._isInvincible || this._isDead) return;
        try {
            const died = GameManager.instance.takeDamage(amount);
            this._startInvincible();
            if (died) this._isDead = true;
        } catch {}
    }

    heal(amount: number) {
        try { GameManager.instance.heal(amount); } catch {}
    }

    // ── 键盘 ──

    private _onKeyDown(e: EventKeyboard) { this._keys.add(e.keyCode); }
    private _onKeyUp(e: EventKeyboard)   { this._keys.delete(e.keyCode); }

    private _updateKeyboardDir() {
        let x = 0, y = 0;
        if (this._keys.has(KeyCode.KEY_A) || this._keys.has(KeyCode.ARROW_LEFT))  x -= 1;
        if (this._keys.has(KeyCode.KEY_D) || this._keys.has(KeyCode.ARROW_RIGHT)) x += 1;
        if (this._keys.has(KeyCode.KEY_S) || this._keys.has(KeyCode.ARROW_DOWN))  y -= 1;
        if (this._keys.has(KeyCode.KEY_W) || this._keys.has(KeyCode.ARROW_UP))    y += 1;

        if (x !== 0 || y !== 0) {
            const len = Math.sqrt(x * x + y * y);
            this._keyboardDir.set(x / len, y / len);
        } else {
            this._keyboardDir.set(0, 0);
        }
    }

    // ── 工具 ──

    private _startInvincible() {
        this._isInvincible = true;
        this._invincibleTimer = GameConfig.PLAYER_INVINCIBLE_TIME;
    }

    private _updateFacing(dir: Vec2) {
        const target = this.spriteNode ?? this.node;
        const scale = target.scale;
        if (dir.x < 0)      target.setScale(-Math.abs(scale.x), scale.y, scale.z);
        else if (dir.x > 0) target.setScale( Math.abs(scale.x), scale.y, scale.z);
    }

    private _onRevived() {
        this._isDead = false;
        this._startInvincible();
    }
}
