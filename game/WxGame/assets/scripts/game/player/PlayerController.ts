import { _decorator, Component, Node, Vec3, input, Input,
         EventKeyboard, KeyCode, UITransform, Graphics, Color } from 'cc';
import { eventBus, GameEvents } from '../../core/EventBus';

const { ccclass, property } = _decorator;

@ccclass('PlayerController')
export class PlayerController extends Component {

    @property({ min: 50 })
    moveSpeed: number = 200;

    // 房间边界（和 RoomBuilder.roomW/H 一致，减掉墙厚 48）
    @property mapBoundX: number = 310;
    @property mapBoundY: number = 490;

    private _keys = { up: false, down: false, left: false, right: false };
    private _joyDir = new Vec3();

    private _hp    = 100;
    private _maxHp = 100;
    private _invincibleTimer = 0;

    onLoad() {
        // 先移除旧 Sprite（如果有）
        const { Sprite } = require('cc');
        const sp = this.getComponent(Sprite);
        if (sp) sp.destroy();

        this._drawKnight();
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
        const kx = (this._keys.right ? 1 : 0) - (this._keys.left  ? 1 : 0);
        const ky = (this._keys.up    ? 1 : 0) - (this._keys.down  ? 1 : 0);

        const jLen = this._joyDir.x ** 2 + this._joyDir.y ** 2;
        const useJoy = jLen > 0.01;
        const dx = useJoy ? this._joyDir.x : kx;
        const dy = useJoy ? this._joyDir.y : ky;

        if (dx === 0 && dy === 0) return;

        const len = Math.sqrt(dx * dx + dy * dy);
        const nx = dx / len, ny = dy / len;

        const cur = this.node.position;
        const nx2 = Math.max(-this.mapBoundX, Math.min(this.mapBoundX,
                             cur.x + nx * this.moveSpeed * dt));
        const ny2 = Math.max(-this.mapBoundY, Math.min(this.mapBoundY,
                             cur.y + ny * this.moveSpeed * dt));
        this.node.setPosition(nx2, ny2, 0);

        // 水平翻转朝向
        if (dx !== 0) {
            const s = this.node.scale;
            this.node.setScale(dx < 0 ? -Math.abs(s.x) : Math.abs(s.x), s.y, s.z);
        }
    }

    setJoystickDir(x: number, y: number) {
        this._joyDir.set(x, y, 0);
    }

    takeDamage(amount: number) {
        if (this._invincibleTimer > 0) return;
        this._hp = Math.max(0, this._hp - amount);
        this._invincibleTimer = 0.8;
        this._emitHp();
        // 受击：闪白+缩放
        this.node.setScale(1.3, 1.3, 1);
        this.scheduleOnce(() => this.node.setScale(1, 1, 1), 0.1);
        console.log(`[Player] 受伤 -${amount}  剩余HP: ${this._hp}`);
        if (this._hp <= 0) eventBus.emit(GameEvents.GAME_OVER, {});
    }

    heal(amount: number) {
        this._hp = Math.min(this._maxHp, this._hp + amount);
        this._emitHp();
    }

    get currentHp() { return this._hp; }
    get maxHp()     { return this._maxHp; }

    // ─── 绘制蓝色骑士 ───────────────────────────────────

    private _drawKnight() {
        let g = this.getComponent(Graphics);
        if (!g) g = this.addComponent(Graphics);
        g.clear();

        // UITransform 设置为 48x48
        const ui = this.getComponent(UITransform) ?? this.addComponent(UITransform);
        ui.setContentSize(48, 48);

        const S = 48, H = S / 2;

        // ① 身体（蓝色盔甲）
        g.fillColor = new Color(60, 140, 255, 255);
        g.roundRect(-H, -H, S, S, 8);
        g.fill();

        // ② 盔甲纹路（深蓝横条）
        g.fillColor = new Color(30, 80, 200, 255);
        g.rect(-H + 4, -4, S - 8, 6);
        g.fill();

        // ③ 头盔（顶部深色）
        g.fillColor = new Color(20, 60, 160, 255);
        g.roundRect(-H + 4, H - 18, S - 8, 14, 4);
        g.fill();

        // ④ 眼缝（白色发光）
        g.fillColor = new Color(200, 230, 255, 255);
        g.rect(-14, H - 14, 10, 4);
        g.fill();
        g.rect(4,   H - 14, 10, 4);
        g.fill();

        // ⑤ 盾牌（右下角小方块）
        g.fillColor = new Color(180, 60, 60, 255);
        g.roundRect(H - 14, -H + 4, 10, 14, 2);
        g.fill();

        // ⑥ 剑（左上角细线）
        g.fillColor = new Color(220, 220, 180, 255);
        g.rect(-H + 2, -2, 4, 20);
        g.fill();
    }

    private _emitHp() {
        eventBus.emit(GameEvents.PLAYER_HP_CHANGED,
                      { current: this._hp, max: this._maxHp });
    }

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
}
