import { Node, UITransform, Graphics, Color } from 'cc';
import { EnemyBolt } from './EnemyBolt';

export type EnemyBoltStyle = 'archer' | 'mage' | 'fireball';

/**
 * 敌方弹道池 —— 对齐 BulletPool，避免弓/法连射 GC。
 */
export class EnemyBoltPool {
    private static _free: Node[] = [];
    private static _cap = 36;

    static get(parent: Node, style: EnemyBoltStyle): EnemyBolt {
        let n = EnemyBoltPool._free.pop();
        if (!n || !n.isValid) {
            n = new Node('EnemyBolt');
            n.addComponent(UITransform).setContentSize(28, 28);
            n.addComponent(Graphics);
            n.addComponent(EnemyBolt);
        }
        n.name = 'EnemyBolt';
        n.active = true;
        n.setParent(parent);
        n.setScale(1, 1, 1);
        EnemyBoltPool._paint(n, style);
        return n.getComponent(EnemyBolt)!;
    }

    static release(node: Node) {
        if (!node?.isValid) return;
        node.removeFromParent();
        node.active = false;
        if (EnemyBoltPool._free.length < EnemyBoltPool._cap) {
            EnemyBoltPool._free.push(node);
        } else {
            node.destroy();
        }
    }

    static clear() {
        for (const n of EnemyBoltPool._free) {
            if (n?.isValid) n.destroy();
        }
        EnemyBoltPool._free = [];
    }

    private static _paint(n: Node, style: EnemyBoltStyle) {
        const g = n.getComponent(Graphics);
        if (!g) return;
        g.clear();
        if (style === 'mage') {
            n.getComponent(UITransform)?.setContentSize(28, 28);
            g.fillColor = new Color(160, 80, 255, 90);
            g.circle(0, 0, 14); g.fill();
            g.fillColor = new Color(210, 140, 255, 255);
            g.circle(0, 0, 8); g.fill();
            g.fillColor = new Color(255, 240, 255, 220);
            g.circle(-2, 2, 3); g.fill();
        } else if (style === 'fireball') {
            n.getComponent(UITransform)?.setContentSize(32, 32);
            g.fillColor = new Color(255, 80, 20, 100);
            g.circle(0, 0, 14); g.fill();
            g.fillColor = new Color(255, 140, 40, 255);
            g.circle(0, 0, 9); g.fill();
            g.fillColor = new Color(255, 230, 120, 255);
            g.circle(-2, 2, 4); g.fill();
        } else {
            n.getComponent(UITransform)?.setContentSize(16, 16);
            g.fillColor = new Color(255, 120, 60, 255);
            g.circle(0, 0, 6); g.fill();
        }
    }
}
