import { Node, UITransform } from 'cc';
import { Bullet } from './Bullet';

/**
 * 子弹对象池 —— 复用节点，避免远战频繁 create/destroy。
 */
export class BulletPool {
    private static _free: Node[] = [];
    private static _cap = 48;

    static get(parent: Node): Bullet {
        let n = BulletPool._free.pop();
        if (!n || !n.isValid) {
            n = new Node('Bullet');
            n.addComponent(UITransform).setContentSize(24, 24);
            n.addComponent(Bullet);
        }
        n.active = true;
        n.setParent(parent);
        n.setScale(1, 1, 1);
        return n.getComponent(Bullet)!;
    }

    static release(node: Node) {
        if (!node?.isValid) return;
        node.removeFromParent();
        node.active = false;
        if (BulletPool._free.length < BulletPool._cap) {
            BulletPool._free.push(node);
        } else {
            node.destroy();
        }
    }

    static clear() {
        for (const n of BulletPool._free) {
            if (n?.isValid) n.destroy();
        }
        BulletPool._free = [];
    }
}
