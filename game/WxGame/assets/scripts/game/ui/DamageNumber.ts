import { _decorator, Component, Label, Color, tween, Vec3, Node, UITransform } from 'cc';
import { eventBus, GameEvents } from '../../core/EventBus';
import { PlayerStats } from '../../core/PlayerStats';

const { ccclass } = _decorator;

/**
 * 伤害飘字 —— 挂到 DamageNumbers 节点（WorldLayer 下）；节点池复用。
 */
@ccclass('DamageNumber')
export class DamageNumber extends Component {
    private static _free: Node[] = [];
    private static _cap = 24;

    onLoad() {
        eventBus.on(GameEvents.DAMAGE_DEALT, this._onDamageDealt, this);
    }

    onDestroy() {
        eventBus.off(GameEvents.DAMAGE_DEALT, this._onDamageDealt, this);
        for (const n of DamageNumber._free) {
            if (n?.isValid) n.destroy();
        }
        DamageNumber._free = [];
    }

    private _onDamageDealt(data: { amount: number; position: Vec3; crit?: boolean }) {
        // #124 暴击以 PlayerStats 真实掷骰为准，不再按数值阈值猜
        const crit = data.crit ?? PlayerStats.I.lastOutgoingCrit;
        this._spawnNumber(data.amount, data.position, crit);
    }

    private _spawnNumber(amount: number, worldPos: Vec3, crit: boolean) {
        const node = DamageNumber._acquire(this.node);
        node.setPosition(worldPos.x + (Math.random() - 0.5) * 16, worldPos.y + 20, 0);
        node.setScale(0.4, 0.4, 1);

        const label = node.getComponent(Label)!;
        label.string = crit ? `暴击 ${amount}` : `${amount}`;
        // 数值越大字越大，一眼读出「这下重」
        const big = Math.min(8, Math.floor(amount / 25));
        label.fontSize = (crit ? 28 : 20) + big;
        label.color = crit
            ? new Color(255, 225, 70, 255)
            : new Color(255, 240, 230, 255);
        label.enableOutline = true;
        label.outlineColor = crit ? new Color(120, 60, 0, 220) : new Color(60, 20, 20, 200);
        label.outlineWidth = 2;

        const peak = crit ? 1.35 : 1.1;
        tween(node)
            .to(0.1, { scale: new Vec3(peak, peak, 1) }, { easing: 'backOut' })
            .to(0.08, { scale: new Vec3(1, 1, 1) })
            .by(0.5, { position: new Vec3((Math.random() - 0.5) * 40, crit ? 84 : 66, 0) }, { easing: 'quadOut' })
            .to(0.14, { scale: new Vec3(0.2, 0.2, 1) })
            .call(() => DamageNumber._release(node))
            .start();
    }

    private static _acquire(parent: Node): Node {
        let node = DamageNumber._free.pop();
        if (!node || !node.isValid) {
            node = new Node('DmgNum');
            node.addComponent(UITransform).setContentSize(120, 40);
            const label = node.addComponent(Label);
            label.horizontalAlign = 1;
        }
        node.active = true;
        node.setParent(parent);
        return node;
    }

    private static _release(node: Node) {
        if (!node?.isValid) return;
        tween(node).stop();
        node.removeFromParent();
        node.active = false;
        if (DamageNumber._free.length < DamageNumber._cap) {
            DamageNumber._free.push(node);
        } else {
            node.destroy();
        }
    }
}
