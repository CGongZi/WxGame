import { _decorator, Component, Node, Vec3, input, Input,
         EventKeyboard, KeyCode, UITransform, Graphics, Color, Label, find } from 'cc';
import { eventBus, GameEvents } from '../../core/EventBus';
import { RoomController } from '../dungeon/RoomController';

const { ccclass, property } = _decorator;

@ccclass('PlayerController')
export class PlayerController extends Component {

    @property({ min: 50 })
    moveSpeed: number = 200;

    // 房间边界：roomW=1150 半宽575-玩家半身28=547；roomH=600 半高300-28=272
    @property mapBoundX: number = 547;
    @property mapBoundY: number = 272;

    /** 门洞半宽：开着时允许从门洞走出 */
    @property doorGapHalf: number = 38;

    private _keys = { up: false, down: false, left: false, right: false };
    private _joyDir = new Vec3();

    private _hp    = 100;
    private _maxHp = 100;
    private _invincibleTimer = 0;
    private _weaponEmoji = '🗡️';
    private _weaponIconLabel: Label | null = null;
    private _doorsOpen = false;

    onLoad() {
        this.node.setPosition(0, 0, 0);
        console.log('[Player] worldPos =', this.node.worldPosition);
        this._drawKnight();
        this._emitHp();
        eventBus.on(GameEvents.WEAPON_CHANGED, this._onWeaponChanged, this);
        eventBus.on(GameEvents.ROOM_CLEARED,   this._onRoomCleared, this);
    }

    onDestroy() {
        eventBus.off(GameEvents.WEAPON_CHANGED, this._onWeaponChanged, this);
        eventBus.off(GameEvents.ROOM_CLEARED,   this._onRoomCleared, this);
    }

    start() {
        // 同步已有 Room 状态（防事件早于监听）
        const rc = find('Game/Canvas/Room')?.getComponent(RoomController)
                ?? find('Canvas/Room')?.getComponent(RoomController);
        if (rc?.isCleared) this._doorsOpen = true;
    }

    private _onRoomCleared() {
        this._doorsOpen = true;
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

        // Canvas 原点在中心，边界 = ±roomHalf
        // 门开后：在门洞 X 范围内可走出南北边界（为下一关穿门做准备）
        const cur  = this.node.position;
        const minX = -this.mapBoundX,  maxX = this.mapBoundX;
        let   minY = -this.mapBoundY,  maxY = this.mapBoundY;

        const inDoorX = Math.abs(cur.x) <= this.doorGapHalf;
        if (this._doorsOpen && inDoorX) {
            minY = -this.mapBoundY - 80;
            maxY =  this.mapBoundY + 80;
        }

        const nx2  = Math.max(minX, Math.min(maxX, cur.x + nx * this.moveSpeed * dt));
        const ny2  = Math.max(minY, Math.min(maxY, cur.y + ny * this.moveSpeed * dt));
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

        const ui = this.getComponent(UITransform) ?? this.addComponent(UITransform);
        ui.setContentSize(56, 56);

        const S = 56, H = S / 2;  // 56×56，比史莱姆(64)略小但颜色完全不同

        // ① 身体 —— 亮蓝色（和绿色史莱姆完全不同）
        g.fillColor = new Color(40, 160, 255, 255);
        g.roundRect(-H, -H, S, S, 10);
        g.fill();

        // ② 胸甲横纹
        g.fillColor = new Color(20, 90, 200, 255);
        g.rect(-H + 6, -6, S - 12, 8);
        g.fill();

        // ③ 头盔（顶部）
        g.fillColor = new Color(10, 50, 140, 255);
        g.roundRect(-H + 6, H - 20, S - 12, 16, 5);
        g.fill();

        // ④ 眼缝 —— 亮白色，醒目
        g.fillColor = new Color(230, 245, 255, 255);
        g.roundRect(-16, H - 17, 12, 5, 2);
        g.fill();
        g.roundRect(4,   H - 17, 12, 5, 2);
        g.fill();

        // ⑤ 红色盾牌（右侧）
        g.fillColor = new Color(220, 50, 50, 255);
        g.roundRect(H - 16, -H + 8, 12, 18, 3);
        g.fill();
        // 盾牌十字纹
        g.fillColor = new Color(255, 180, 180, 200);
        g.rect(H - 11, -H + 10, 2, 14);
        g.fill();
        g.rect(H - 15, -H + 16, 10, 2);
        g.fill();

        // ⑥ 银色长剑（左侧）
        g.fillColor = new Color(200, 210, 220, 255);
        g.rect(-H + 2, -H + 4, 5, 28);   // 剑身
        g.fill();
        g.fillColor = new Color(180, 140, 60, 255);
        g.rect(-H,     -H + 18, 9, 4);   // 护手
        g.fill();

        // ⑦ 武器 Emoji 图标（悬浮在头顶右上角）
        // 找或创建武器图标节点
        let iconNode = this.node.getChildByName('WeaponIcon');
        if (!iconNode) {
            iconNode = new Node('WeaponIcon');
            iconNode.setParent(this.node);
            iconNode.addComponent(UITransform).setContentSize(30, 30);
        }
        iconNode.setPosition(H - 2, H + 4, 0);   // 右上角
        let lbl = iconNode.getComponent(Label);
        if (!lbl) lbl = iconNode.addComponent(Label);
        lbl.string   = this._weaponEmoji;
        lbl.fontSize = 18;
        this._weaponIconLabel = lbl;
    }

    private _emitHp() {
        eventBus.emit(GameEvents.PLAYER_HP_CHANGED,
                      { current: this._hp, max: this._maxHp });
    }

    private _onWeaponChanged(data: { emoji: string; name: string; type: string }) {
        this._weaponEmoji = data.emoji;
        if (this._weaponIconLabel) {
            this._weaponIconLabel.string = data.emoji;
        }
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
