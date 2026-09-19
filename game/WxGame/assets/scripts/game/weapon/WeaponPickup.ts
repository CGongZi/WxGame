import { _decorator, Component, Node, Graphics, UITransform,
         Color, Label, tween, Vec3, input, Input, EventTouch } from 'cc';
import { WeaponController, WeaponType, WEAPONS } from './WeaponController';
import { eventBus, GameEvents } from '../../core/EventBus';

const { ccclass, property } = _decorator;

/**
 * WeaponPickup —— 地面武器拾取物
 * 由 WeaponSpawner 动态生成，靠近并按 F / 点击拾取
 */
@ccclass('WeaponPickup')
export class WeaponPickup extends Component {

    private _weaponId: WeaponType  = 'bow';
    private _playerNode: Node      = null!;
    private _weaponCtrl: WeaponController = null!;
    private _pickupRadius           = 80;
    private _floatTimer             = 0;
    private _startY                 = 0;

    init(id: WeaponType, playerNode: Node, weaponCtrl: WeaponController) {
        this._weaponId  = id;
        this._playerNode = playerNode;
        this._weaponCtrl = weaponCtrl;
        this._startY     = this.node.position.y;
        this._draw(id);
        this._floatAnim();
    }

    update(dt: number) {
        // 悬浮动画
        this._floatTimer += dt;
        const y = this._startY + Math.sin(this._floatTimer * 2.5) * 8;
        this.node.setPosition(this.node.position.x, y, 0);

        // 检测玩家靠近
        if (!this._playerNode) return;
        const dx = this._playerNode.position.x - this.node.position.x;
        const dy = this._playerNode.position.y - this.node.position.y;
        if (Math.sqrt(dx * dx + dy * dy) < this._pickupRadius) {
            this._pickup();
        }
    }

    private _pickup() {
        this._weaponCtrl?.equipWeapon(this._weaponId);
        // 拾取特效：向上飞散消失
        tween(this.node)
            .to(0.2, { scale: new Vec3(1.6, 1.6, 1) }, { easing: 'quartOut' })
            .to(0.15, { scale: new Vec3(0, 0, 1) })
            .call(() => this.node.destroy())
            .start();
        console.log(`[Pickup] 拾取了 ${WEAPONS[this._weaponId].name}`);
    }

    private _draw(id: WeaponType) {
        const def = WEAPONS[id];
        const ui  = this.node.addComponent(UITransform);
        ui.setContentSize(44, 44);

        const g = this.node.addComponent(Graphics);

        // 底部光晕
        const glowColor = id === 'wand'   ? new Color(180, 80, 255, 60)
                        : id === 'bow'    ? new Color(255, 220, 60, 60)
                        : id === 'dagger' ? new Color(120, 200, 255, 60)
                        :                   new Color(200, 200, 200, 60);
        g.fillColor = glowColor;
        g.circle(0, 0, 28);
        g.fill();

        // 宝箱底座
        g.fillColor = new Color(80, 50, 20, 230);
        g.roundRect(-20, -22, 40, 20, 4);
        g.fill();

        // 宝箱盖
        g.fillColor = new Color(160, 100, 30, 255);
        g.roundRect(-20, -4, 40, 12, 3);
        g.fill();

        // 宝箱锁扣
        g.fillColor = new Color(220, 180, 60, 255);
        g.circle(0, -14, 5);
        g.fill();

        // 武器图标（用 Label）
        const labelNode = new Node('Icon');
        labelNode.setParent(this.node);
        labelNode.setPosition(0, 12, 0);
        const lbl    = labelNode.addComponent(Label);
        lbl.string   = def.emoji;
        lbl.fontSize = 20;
        labelNode.addComponent(UITransform).setContentSize(44, 30);

        // 武器名称
        const nameNode = new Node('Name');
        nameNode.setParent(this.node);
        nameNode.setPosition(0, -36, 0);
        const nameLbl   = nameNode.addComponent(Label);
        nameLbl.string  = def.name;
        nameLbl.fontSize = 13;
        nameLbl.color   = new Color(255, 230, 120, 255);
        nameNode.addComponent(UITransform).setContentSize(80, 20);
    }

    private _floatAnim() {
        // 生成时弹出
        this.node.setScale(0, 0, 1);
        tween(this.node)
            .to(0.3, { scale: new Vec3(1.2, 1.2, 1) }, { easing: 'backOut' })
            .to(0.1, { scale: new Vec3(1.0, 1.0, 1) })
            .start();
    }
}
