import { _decorator, Component, Vec2, Vec3, RigidBody2D, Animation, Node } from 'cc';
import { GameConfig } from '../../core/GameConfig';
import { GameManager } from '../../core/GameManager';
import { eventBus, GameEvents } from '../../core/EventBus';

const { ccclass, property } = _decorator;

/**
 * 玩家控制器
 * 处理：移动、动画状态、受击
 */
@ccclass('PlayerController')
export class PlayerController extends Component {

    @property(Node)
    spriteNode: Node = null!;   // 角色精灵节点（用于翻转方向）

    @property(Node)
    weaponHolder: Node = null!; // 武器挂点

    // ── 私有状态 ──
    private _rb: RigidBody2D = null!;
    private _anim: Animation = null!;
    private _moveDir: Vec2 = new Vec2(0, 0);
    private _isInvincible: boolean = false;
    private _invincibleTimer: number = 0;
    private _isDead: boolean = false;
    private _speed: number = GameConfig.PLAYER_BASE_SPEED;

    onLoad() {
        this._rb = this.getComponent(RigidBody2D)!;
        this._anim = this.getComponentInChildren(Animation)!;

        // 监听事件
        eventBus.on(GameEvents.PLAYER_REVIVED, this._onRevived, this);
    }

    onDestroy() {
        eventBus.off(GameEvents.PLAYER_REVIVED, this._onRevived, this);
    }

    update(dt: number) {
        if (this._isDead) return;

        // 移动
        if (this._rb && !this._moveDir.equals(Vec2.ZERO)) {
            const vel = new Vec2(
                this._moveDir.x * this._speed,
                this._moveDir.y * this._speed,
            );
            this._rb.linearVelocity = vel;
            this._updateFacing();
            this._playAnim('walk');
        } else if (this._rb) {
            this._rb.linearVelocity = Vec2.ZERO;
            this._playAnim('idle');
        }

        // 无敌帧计时
        if (this._isInvincible) {
            this._invincibleTimer -= dt;
            if (this._invincibleTimer <= 0) {
                this._isInvincible = false;
            }
        }
    }

    /** 由 JoystickController 调用 */
    setMoveDirection(dir: Vec2) {
        this._moveDir.set(dir);
    }

    /** 受到伤害（由碰撞/子弹触发） */
    takeDamage(amount: number) {
        if (this._isInvincible || this._isDead) return;

        const died = GameManager.instance.takeDamage(amount);
        this._startInvincible();

        if (died) {
            this._isDead = true;
            this._playAnim('die');
            this._rb.linearVelocity = Vec2.ZERO;
        } else {
            this._playAnim('hit');
        }
    }

    /** 回血（商店/道具） */
    heal(amount: number) {
        GameManager.instance.heal(amount);
    }

    // ── 私有 ──

    private _startInvincible() {
        this._isInvincible = true;
        this._invincibleTimer = GameConfig.PLAYER_INVINCIBLE_TIME;
    }

    private _updateFacing() {
        if (!this.spriteNode) return;
        const scale = this.spriteNode.scale;
        if (this._moveDir.x < 0) {
            this.spriteNode.setScale(-Math.abs(scale.x), scale.y, scale.z);
        } else if (this._moveDir.x > 0) {
            this.spriteNode.setScale(Math.abs(scale.x), scale.y, scale.z);
        }
    }

    private _playAnim(name: string) {
        if (!this._anim) return;
        const state = this._anim.getState(name);
        if (state && !state.isPlaying) {
            this._anim.play(name);
        }
    }

    private _onRevived() {
        this._isDead = false;
        this._startInvincible();
        this._playAnim('idle');
    }
}
