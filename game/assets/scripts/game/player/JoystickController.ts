import { _decorator, Component, Node, Vec2, Vec3, Touch, EventTouch, UITransform, input, Input } from 'cc';
import { PlayerController } from './PlayerController';

const { ccclass, property } = _decorator;

/**
 * 虚拟摇杆控制器
 * 左半屏控制移动，右半屏点击/滑动控制攻击方向
 */
@ccclass('JoystickController')
export class JoystickController extends Component {

    @property(Node)
    joystickBg: Node = null!;       // 摇杆底盘节点

    @property(Node)
    joystickThumb: Node = null!;    // 摇杆拇指节点

    @property(PlayerController)
    player: PlayerController = null!;

    @property({ min: 10, max: 200 })
    maxRadius: number = 80;         // 摇杆最大位移（像素）

    // ── 私有 ──
    private _moveTouch: Touch | null = null;
    private _originPos: Vec3 = new Vec3();
    private _isActive: boolean = false;
    private _canvasWidth: number = 750;

    onLoad() {
        this._originPos.set(this.joystickBg.position);
        this._hideBg();
    }

    onEnable() {
        this.node.on(Input.EventType.TOUCH_START, this._onTouchStart, this);
        this.node.on(Input.EventType.TOUCH_MOVE, this._onTouchMove, this);
        this.node.on(Input.EventType.TOUCH_END, this._onTouchEnd, this);
        this.node.on(Input.EventType.TOUCH_CANCEL, this._onTouchEnd, this);
    }

    onDisable() {
        this.node.off(Input.EventType.TOUCH_START, this._onTouchStart, this);
        this.node.off(Input.EventType.TOUCH_MOVE, this._onTouchMove, this);
        this.node.off(Input.EventType.TOUCH_END, this._onTouchEnd, this);
        this.node.off(Input.EventType.TOUCH_CANCEL, this._onTouchEnd, this);
    }

    private _onTouchStart(event: EventTouch) {
        const touch = event.touch!;
        const loc = touch.getUILocation();

        // 只响应屏幕左半部分
        if (loc.x > this._canvasWidth / 2) return;
        if (this._moveTouch) return;

        this._moveTouch = touch;
        this._isActive = true;
        // 摇杆底盘跟随手指位置
        this.joystickBg.setPosition(loc.x - this._canvasWidth / 2, loc.y - 667);
        this._showBg();
    }

    private _onTouchMove(event: EventTouch) {
        if (!this._moveTouch || event.touch?.getID() !== this._moveTouch.getID()) return;

        const touch = event.touch!;
        const loc = touch.getUILocation();
        const bgPos = this.joystickBg.position;

        const dx = loc.x - (bgPos.x + this._canvasWidth / 2);
        const dy = loc.y - (bgPos.y + 667);
        const dist = Math.sqrt(dx * dx + dy * dy);

        let nx = dx, ny = dy;
        if (dist > this.maxRadius) {
            nx = (dx / dist) * this.maxRadius;
            ny = (dy / dist) * this.maxRadius;
        }

        this.joystickThumb.setPosition(nx, ny, 0);

        // 归一化方向传给玩家
        const mag = Math.sqrt(nx * nx + ny * ny);
        if (mag > 5) {
            this.player?.setMoveDirection(new Vec2(nx / mag, ny / mag));
        } else {
            this.player?.setMoveDirection(Vec2.ZERO);
        }
    }

    private _onTouchEnd(event: EventTouch) {
        if (!this._moveTouch || event.touch?.getID() !== this._moveTouch.getID()) return;
        this._moveTouch = null;
        this._isActive = false;
        this.joystickThumb.setPosition(0, 0, 0);
        this.player?.setMoveDirection(Vec2.ZERO);
        this._hideBg();
    }

    private _showBg() {
        this.joystickBg.active = true;
    }

    private _hideBg() {
        this.joystickBg.active = false;
    }
}
