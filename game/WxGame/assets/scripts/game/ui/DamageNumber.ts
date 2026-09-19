import { _decorator, Component, Label, Color, tween, Vec3, Node } from 'cc';
import { eventBus, GameEvents } from '../../core/EventBus';

const { ccclass, property } = _decorator;

/**
 * 伤害飘字管理器
 * 挂到 Canvas 下任意节点，自动监听 DAMAGE_DEALT 事件并生成飘字
 */
@ccclass('DamageNumber')
export class DamageNumber extends Component {

    onLoad() {
        eventBus.on(GameEvents.DAMAGE_DEALT, this._onDamageDealt, this);
    }

    onDestroy() {
        eventBus.off(GameEvents.DAMAGE_DEALT, this._onDamageDealt, this);
    }

    private _onDamageDealt(data: { amount: number; position: Vec3 }) {
        this._spawnNumber(data.amount, data.position);
    }

    private _spawnNumber(amount: number, worldPos: Vec3) {
        // 创建飘字节点
        const node = new Node('DmgNum');
        node.setParent(this.node);
        node.setPosition(worldPos.x, worldPos.y, 0);

        const label = node.addComponent(Label);
        label.string = `-${amount}`;
        label.fontSize = amount > 30 ? 28 : 22;   // 暴击更大
        label.color = amount > 30
            ? new Color(255, 220, 50, 255)   // 暴击：金色
            : new Color(255, 80,  80, 255);  // 普通：红色

        // 飘上去然后消失
        tween(node)
            .by(0.6, { position: new Vec3(0, 60, 0) }, { easing: 'quartOut' })
            .call(() => node.destroy())
            .start();
    }
}
