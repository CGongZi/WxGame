import { _decorator, Component, Node, Vec2, input, Input, EventTouch, UITransform, view } from 'cc';
import { PlayerController } from './PlayerController';

const { ccclass, property } = _decorator;

/**
 * 虚拟摇杆控制器
 * 使用全局 input 监听，不依赖节点大小
 * 左半屏按住拖动 = 移动
 */
@ccclass('JoystickController')
export class JoystickController extends Component {

    @property(Node)
    joystickBg: Node = null!;

    @property(Node)
    joystickThumb: Node = null!;

    @property(PlayerController)
    player: PlayerController = null!;

    @property({ min: 20, max: 200 })
    maxRadius: number = 80;

    // ── 私有状态 ──
    private _activeTouchId: number = -1;
    private _bgStartPos: Vec2 = new Vec2();   // 摇杆底盘的起始位置（UI坐标）
    private _screenW: number = 750;
    private _screenH: number = 1334;

    onLoad() {
        // 隐藏摇杆底盘，等触摸时才显示
        if (this.joystickBg) this.joystickBg.active = false;
    }

    onEnable() {
        // 全局触摸监听，不限制节点大小
        input.on(Input.EventType.TOUCH_START,  this._onTouchStart,  this);
        input.on(Input.EventType.TOUCH_MOVE,   this._onTouchMove,   this);
        input.on(Input.EventType.TOUCH_END,    this._onTouchEnd,    this);
        input.on(Input.EventType.TOUCH_CANCEL, this._onTouchEnd,    this);

        // 获取实际画布尺寸
        const size = view.getDesignResolutionSize();
        this._screenW = size.width;
        this._screenH = size.height;
    }

    onDisable() {
        input.off(Input.EventType.TOUCH_START,  this._onTouchStart,  this);
        input.off(Input.EventType.TOUCH_MOVE,   this._onTouchMove,   this);
        input.off(Input.EventType.TOUCH_END,    this._onTouchEnd,    this);
        input.off(Input.EventType.TOUCH_CANCEL, this._onTouchEnd,    this);
        this._reset();
    }

    // ── 触摸处理 ──

    private _onTouchStart(event: EventTouch) {
        // 已有活跃触点就忽略
        if (this._activeTouchId !== -1) return;

        const loc = event.getUILocation();   // UI 坐标（左下角为原点）

        // 只响应左半屏
        if (loc.x > this._screenW * 0.5) return;

        this._activeTouchId = event.getID();

        // 把 UI 坐标转换成以画布中心为原点的节点坐标
        const nodeX = loc.x - this._screenW * 0.5;
        const nodeY = loc.y - this._screenH * 0.5;

        // 摇杆底盘跟随手指
        if (this.joystickBg) {
            this.joystickBg.setPosition(nodeX, nodeY, 0);
            this.joystickBg.active = true;
        }
        if (this.joystickThumb) {
            this.joystickThumb.setPosition(0, 0, 0);
        }

        this._bgStartPos.set(loc.x, loc.y);
    }

    private _onTouchMove(event: EventTouch) {
        if (event.getID() !== this._activeTouchId) return;

        const loc = event.getUILocation();
        const dx = loc.x - this._bgStartPos.x;
        const dy = loc.y - this._bgStartPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // 限制摇杆拇指在底盘范围内
        let nx = dx;
        let ny = dy;
        if (dist > this.maxRadius) {
            nx = (dx / dist) * this.maxRadius;
            ny = (dy / dist) * this.maxRadius;
        }

        if (this.joystickThumb) {
            this.joystickThumb.setPosition(nx, ny, 0);
        }

        // 计算归一化方向，传给玩家
        const mag = Math.sqrt(nx * nx + ny * ny);
        if (mag > 5) {
            this.player?.setMoveDirection(new Vec2(nx / mag, ny / mag));
        } else {
            this.player?.setMoveDirection(Vec2.ZERO);
        }
    }

    private _onTouchEnd(event: EventTouch) {
        if (event.getID() !== this._activeTouchId) return;
        this._reset();
    }

    private _reset() {
        this._activeTouchId = -1;
        if (this.joystickThumb) this.joystickThumb.setPosition(0, 0, 0);
        if (this.joystickBg)    this.joystickBg.active = false;
        this.player?.setMoveDirection(Vec2.ZERO);
    }
}
