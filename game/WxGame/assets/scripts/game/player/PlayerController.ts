import { _decorator, Component, Vec2, Vec3, Node } from 'cc';
import { GameConfig } from '../../core/GameConfig';
import { GameManager } from '../../core/GameManager';
import { eventBus, GameEvents } from '../../core/EventBus';

const { ccclass, property } = _decorator;

/**
 * 玩家控制器（位置直接移动，兼容 UI Canvas 下的节点）
 */
@ccclass('PlayerController')
export class PlayerController extends Component {

    @property(Node)
    spriteNode: Node = null!;

    @property(Node)
    weaponHolder: Node = null!;

    private _moveDir: Vec2 = new Vec2(0, 0);
    private _isInvincible: boolean = false;
    private _invincibleTimer: number = 0;
    private _isDead: boolean = false;
    private _speed: number = GameConfig.PLAYER_BASE_SPEED;

    onLoad() {
        eventBus.on(GameEvents.PLAYER_REVIVED, this._onRevived, this);
    }

    onDestroy() {
        eventBus.off(GameEvents.PLAYER_REVIVED, this._onRevived, this);
    }

    update(dt: number) {
        if (this._isDead) return;

        // ── 直接移动节点位置 ──
        if (!this._moveDir.equals(Vec2.ZERO)) {
            const pos = this.node.position;
            const nx = pos.x + this._moveDir.x * this._speed * dt;
            const ny = pos.y + this._moveDir.y * this._speed * dt;

            // 限制在画布范围内
            const halfW = GameConfig.CANVAS_WIDTH  * 0.5 - 20;
            const halfH = GameConfig.CANVAS_HEIGHT * 0.5 - 20;
            this.node.setPosition(
                Math.max(-halfW, Math.min(halfW, nx)),
                Math.max(-halfH, Math.min(halfH, ny)),
                0,
            );

            this._updateFacing();
        }

        // 无敌帧计时
        if (this._isInvincible) {
            this._invincibleTimer -= dt;
            if (this._invincibleTimer <= 0) {
                this._isInvincible = false;
            }
        }
    }

    /** 由 JoystickController 调用，传入归一化方向 */
    setMoveDirection(dir: Vec2) {
        this._moveDir.set(dir);
    }

    /** 受到伤害 */
    takeDamage(amount: number) {
        if (this._isInvincible || this._isDead) return;

        // 如果 GameManager 还未初始化（编辑器预览），跳过
        try {
            const died = GameManager.instance.takeDamage(amount);
            this._startInvincible();
            if (died) {
                this._isDead = true;
            }
        } catch (e) {
            console.warn('[PlayerController] GameManager not ready', e);
        }
    }

    heal(amount: number) {
        try {
            GameManager.instance.heal(amount);
        } catch {}
    }

    private _startInvincible() {
        this._isInvincible = true;
        this._invincibleTimer = GameConfig.PLAYER_INVINCIBLE_TIME;
    }

    private _updateFacing() {
        const target = this.spriteNode ?? this.node;
        const scale = target.scale;
        if (this._moveDir.x < 0) {
            target.setScale(-Math.abs(scale.x), scale.y, scale.z);
        } else if (this._moveDir.x > 0) {
            target.setScale(Math.abs(scale.x), scale.y, scale.z);
        }
    }

    private _onRevived() {
        this._isDead = false;
        this._startInvincible();
    }
}
