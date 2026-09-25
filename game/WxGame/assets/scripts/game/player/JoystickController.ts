import { _decorator, Component, Node, Vec2, Vec3, input, Input, EventTouch,
         UITransform, Graphics, Color, view, Layers } from 'cc';
import { PlayerController } from './PlayerController';
import { WeaponController } from '../weapon/WeaponController';
import { GameFlow, FlowEvents } from '../../core/GameFlow';
import { eventBus } from '../../core/EventBus';

const { ccclass, property } = _decorator;

/**
 * 双轮盘操控（手机）
 * 左：移动摇杆 · 右：攻击键+方向轮盘（长按连发）
 * Lobby 态隐藏；Playing 态常驻底角，触摸跟手后再归位（#166）
 * #196：场景 JoystickBg/Thumb 原先无 Graphics → 真机「能搓屏但看不见轮盘」；运行时补画。
 */
@ccclass('JoystickController')
export class JoystickController extends Component {

    @property(Node) joystickBg: Node = null!;
    @property(Node) joystickThumb: Node = null!;
    @property(PlayerController) player: PlayerController = null!;
    @property({ min: 20, max: 200 }) maxRadius: number = 80;
    /** 移动死区占 maxRadius 比例；内圈忽略，外圈线性拉满速度 */
    @property({ min: 0.05, max: 0.4 }) moveDeadZone = 0.16;
    /** 攻击瞄准死区（像素）；防微抖改向 */
    @property({ min: 4, max: 40 }) aimDeadZone = 12;

    private _weaponCtrl: WeaponController | null = null;
    private _moveTouchId = -1;
    private _attackTouchId = -1;
    private _bgStartPos = new Vec2();
    private _atkStartPos = new Vec2();
    private _screenW = 1334;
    private _screenH = 750;

    /** 右侧攻击轮盘视觉（运行时创建） */
    private _atkBg: Node | null = null;
    private _atkThumb: Node | null = null;

    /** 局内常驻底角（设计坐标，Canvas 中心为 0；略内收避开微信安全区） */
    private static readonly REST_MOVE = new Vec3(-420, -180, 0);
    private static readonly REST_ATK = new Vec3(420, -180, 0);

    onLoad() {
        if (this.player) {
            this._weaponCtrl = this.player.getComponent(WeaponController);
        }
        this._ensureMovePadVisual();
        this._ensureAttackPad();
        if (this.joystickBg) this.joystickBg.active = false;
        if (this._atkBg) this._atkBg.active = false;
    }

    onEnable() {
        input.on(Input.EventType.TOUCH_START,  this._onTouchStart,  this);
        input.on(Input.EventType.TOUCH_MOVE,   this._onTouchMove,   this);
        input.on(Input.EventType.TOUCH_END,    this._onTouchEnd,    this);
        input.on(Input.EventType.TOUCH_CANCEL, this._onTouchEnd,    this);
        eventBus.on(FlowEvents.STATE, this._onFlow, this);

        this._refreshScreenMetrics();
        this._syncPadVisibility();
    }

    onDisable() {
        input.off(Input.EventType.TOUCH_START,  this._onTouchStart,  this);
        input.off(Input.EventType.TOUCH_MOVE,   this._onTouchMove,   this);
        input.off(Input.EventType.TOUCH_END,    this._onTouchEnd,    this);
        input.off(Input.EventType.TOUCH_CANCEL, this._onTouchEnd,    this);
        eventBus.off(FlowEvents.STATE, this._onFlow, this);
        this._resetMove();
        this._resetAttack();
    }

    private _onFlow() { this._syncPadVisibility(); }

    private _refreshScreenMetrics() {
        const size = view.getVisibleSize();
        if (size.width > 1 && size.height > 1) {
            this._screenW = size.width;
            this._screenH = size.height;
        } else {
            const d = view.getDesignResolutionSize();
            this._screenW = d.width;
            this._screenH = d.height;
        }
    }

    private _syncPadVisibility() {
        if (!GameFlow.isPlaying) {
            if (this.joystickBg) this.joystickBg.active = false;
            if (this._atkBg) this._atkBg.active = false;
            this._moveTouchId = -1;
            this._attackTouchId = -1;
            this.player?.setJoystickDir(0, 0);
            this._weaponCtrl?.setJoystickDir(0, 0);
            this._weaponCtrl?.stopHoldAttack();
            return;
        }
        // #166 Playing：双盘常驻底角，真机一眼能看见
        this._parkMovePad();
        this._parkAttackPad();
    }

    private _parkMovePad() {
        if (!this.joystickBg) return;
        this.joystickBg.setPosition(JoystickController.REST_MOVE);
        this.joystickBg.active = true;
        if (this.joystickThumb) this.joystickThumb.setPosition(0, 0, 0);
        this._bringPadsForward();
    }

    private _parkAttackPad() {
        if (!this._atkBg) return;
        this._atkBg.setPosition(JoystickController.REST_ATK);
        this._atkBg.active = true;
        if (this._atkThumb) this._atkThumb.setPosition(0, 0, 0);
        this._bringPadsForward();
    }

    /** 场景里的 JoystickBg/Thumb 只有 UITransform、无贴图 → 补画圆盘（与攻击盘同风格） */
    private _ensureMovePadVisual() {
        const parent = this.node.parent ?? this.node;
        if (!this.joystickBg?.isValid) {
            const bg = new Node('JoystickBg');
            bg.layer = Layers.Enum.UI_2D;
            bg.setParent(parent);
            bg.addComponent(UITransform).setContentSize(160, 160);
            this.joystickBg = bg;
            const thumb = new Node('JoystickThumb');
            thumb.layer = Layers.Enum.UI_2D;
            thumb.setParent(bg);
            thumb.addComponent(UITransform).setContentSize(56, 56);
            this.joystickThumb = thumb;
        }
        this.joystickBg.layer = Layers.Enum.UI_2D;
        const bgUi = this.joystickBg.getComponent(UITransform)
            ?? this.joystickBg.addComponent(UITransform);
        bgUi.setContentSize(160, 160);

        let bgG = this.joystickBg.getComponent(Graphics);
        if (!bgG) bgG = this.joystickBg.addComponent(Graphics);
        bgG.clear();
        bgG.fillColor = new Color(24, 36, 48, 160);
        bgG.circle(0, 0, 72); bgG.fill();
        bgG.strokeColor = new Color(120, 190, 255, 210);
        bgG.lineWidth = 3; bgG.circle(0, 0, 72); bgG.stroke();
        bgG.fillColor = new Color(80, 140, 200, 40);
        bgG.circle(0, 0, 28); bgG.fill();

        if (!this.joystickThumb?.isValid) {
            const thumb = new Node('JoystickThumb');
            thumb.layer = Layers.Enum.UI_2D;
            thumb.setParent(this.joystickBg);
            thumb.addComponent(UITransform).setContentSize(56, 56);
            this.joystickThumb = thumb;
        }
        this.joystickThumb.layer = Layers.Enum.UI_2D;
        if (this.joystickThumb.parent !== this.joystickBg) {
            this.joystickThumb.setParent(this.joystickBg);
            this.joystickThumb.setPosition(0, 0, 0);
        }
        const thUi = this.joystickThumb.getComponent(UITransform)
            ?? this.joystickThumb.addComponent(UITransform);
        thUi.setContentSize(56, 56);
        let thG = this.joystickThumb.getComponent(Graphics);
        if (!thG) thG = this.joystickThumb.addComponent(Graphics);
        thG.clear();
        thG.fillColor = new Color(140, 210, 255, 230);
        thG.circle(0, 0, 24); thG.fill();
        thG.strokeColor = new Color(220, 240, 255, 200);
        thG.lineWidth = 2; thG.circle(0, 0, 24); thG.stroke();

        this.joystickBg.active = false;
    }

    private _ensureAttackPad() {
        if (this._atkBg?.isValid) return;
        const parent = this.joystickBg?.parent ?? this.node.parent ?? this.node;
        const bg = new Node('AttackPadBg');
        bg.layer = Layers.Enum.UI_2D;
        bg.setParent(parent);
        bg.addComponent(UITransform).setContentSize(160, 160);
        const g = bg.addComponent(Graphics);
        g.fillColor = new Color(48, 24, 20, 160);
        g.circle(0, 0, 72); g.fill();
        g.strokeColor = new Color(255, 130, 90, 210);
        g.lineWidth = 3; g.circle(0, 0, 72); g.stroke();
        g.fillColor = new Color(255, 100, 60, 40);
        g.circle(0, 0, 28); g.fill();
        bg.active = false;

        const thumb = new Node('AttackPadThumb');
        thumb.layer = Layers.Enum.UI_2D;
        thumb.setParent(bg);
        thumb.addComponent(UITransform).setContentSize(56, 56);
        const tg = thumb.addComponent(Graphics);
        tg.fillColor = new Color(255, 120, 70, 230);
        tg.circle(0, 0, 24); tg.fill();
        tg.strokeColor = new Color(255, 220, 180, 200);
        tg.lineWidth = 2; tg.circle(0, 0, 24); tg.stroke();

        this._atkBg = bg;
        this._atkThumb = thumb;
    }

    private _bringPadsForward() {
        const parent = this.joystickBg?.parent;
        if (!parent) return;
        if (this.joystickBg?.isValid) this.joystickBg.setSiblingIndex(parent.children.length - 1);
        if (this._atkBg?.isValid) this._atkBg.setSiblingIndex(parent.children.length - 1);
    }

    /** UI 触摸点 → 轮盘父节点本地（Canvas 中心为 0） */
    private _toPadLocal(uiX: number, uiY: number): { x: number; y: number } {
        const parent = this.joystickBg?.parent ?? this.node;
        const ui = parent.getComponent(UITransform);
        if (ui) {
            const p = ui.convertToNodeSpaceAR(new Vec3(uiX, uiY, 0));
            return { x: p.x, y: p.y };
        }
        return { x: uiX - this._screenW * 0.5, y: uiY - this._screenH * 0.5 };
    }

    private _onTouchStart(event: EventTouch) {
        if (!GameFlow.isPlaying) return;
        this._refreshScreenMetrics();

        const loc = event.getUILocation();
        if (this._hitsCombatHud(loc.x, loc.y)) return;

        const id = event.getID();
        const local = this._toPadLocal(loc.x, loc.y);

        // 右半屏 → 攻击轮盘（跟手出现，松手归位）
        if (local.x > 0) {
            if (this._attackTouchId !== -1) return;
            this._attackTouchId = id;
            this._atkStartPos.set(loc.x, loc.y);

            if (this._atkBg) {
                this._atkBg.setPosition(local.x, local.y, 0);
                this._atkBg.active = true;
            }
            if (this._atkThumb) this._atkThumb.setPosition(0, 0, 0);

            this._weaponCtrl?.startHoldAttack();
            return;
        }

        // 左半屏 → 移动
        if (this._moveTouchId !== -1) return;
        this._moveTouchId = id;
        if (this.joystickBg) {
            this.joystickBg.setPosition(local.x, local.y, 0);
            this.joystickBg.active = true;
        }
        if (this.joystickThumb) this.joystickThumb.setPosition(0, 0, 0);
        this._bgStartPos.set(loc.x, loc.y);
    }

    /** HUD 底栏（快捷栏+背包）命中：设计坐标 Hotbar≈(0,-318) 520×56 */
    private _hitsCombatHud(uiX: number, uiY: number): boolean {
        const local = this._toPadLocal(uiX, uiY);
        const nx = local.x;
        const ny = local.y;
        const sdx = nx - 340;
        const sdy = ny - (-120);
        if (sdx * sdx + sdy * sdy <= 60 * 60) return true;
        if (ny > -230 || ny < -370) return false;
        if (Math.abs(nx) > 280) return false;
        return true;
    }

    private _onTouchMove(event: EventTouch) {
        if (!GameFlow.isPlaying) return;
        const id = event.getID();
        const loc = event.getUILocation();

        if (id === this._attackTouchId) {
            const dx = loc.x - this._atkStartPos.x;
            const dy = loc.y - this._atkStartPos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            let nx = dx, ny = dy;
            if (dist > this.maxRadius) {
                nx = (dx / dist) * this.maxRadius;
                ny = (dy / dist) * this.maxRadius;
            }
            if (this._atkThumb) this._atkThumb.setPosition(nx, ny, 0);
            if (dist > this.aimDeadZone) {
                const len = Math.sqrt(nx * nx + ny * ny) || 1;
                this._weaponCtrl?.setAimDir(nx / len, ny / len);
            }
            return;
        }

        if (id !== this._moveTouchId) return;
        const dx = loc.x - this._bgStartPos.x;
        const dy = loc.y - this._bgStartPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        let nx = dx, ny = dy;
        if (dist > this.maxRadius) {
            nx = (dx / dist) * this.maxRadius;
            ny = (dy / dist) * this.maxRadius;
        }
        if (this.joystickThumb) this.joystickThumb.setPosition(nx, ny, 0);

        const dead = this.maxRadius * this.moveDeadZone;
        if (dist <= dead) {
            this.player?.setJoystickDir(0, 0);
            if (this._attackTouchId === -1) {
                this._weaponCtrl?.setJoystickDir(0, 0);
            }
            return;
        }
        const depth = Math.min(1, (Math.min(dist, this.maxRadius) - dead) / (this.maxRadius - dead));
        const len = Math.sqrt(nx * nx + ny * ny) || 1;
        const ux = (nx / len) * depth;
        const uy = (ny / len) * depth;
        this.player?.setJoystickDir(ux, uy);
        if (this._attackTouchId === -1) {
            this._weaponCtrl?.setJoystickDir(nx / len, ny / len);
        }
    }

    private _onTouchEnd(event: EventTouch) {
        const id = event.getID();
        if (id === this._attackTouchId) {
            this._resetAttack();
            return;
        }
        if (id === this._moveTouchId) this._resetMove();
    }

    private _resetMove() {
        this._moveTouchId = -1;
        this.player?.setJoystickDir(0, 0);
        if (this._attackTouchId === -1) {
            this._weaponCtrl?.setJoystickDir(0, 0);
        }
        if (GameFlow.isPlaying) this._parkMovePad();
        else if (this.joystickBg) this.joystickBg.active = false;
    }

    private _resetAttack() {
        this._attackTouchId = -1;
        this._weaponCtrl?.stopHoldAttack();
        if (GameFlow.isPlaying) this._parkAttackPad();
        else if (this._atkBg) this._atkBg.active = false;
    }
}
