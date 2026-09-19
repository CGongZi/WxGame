import { Node, Prefab, instantiate } from 'cc';

/**
 * 通用对象池
 * 用于子弹、伤害数字等频繁创建销毁的对象
 *
 * 用法：
 *   const pool = new ObjectPool(bulletPrefab, 20);
 *   const node = pool.get();
 *   // 用完后归还
 *   pool.put(node);
 */
export class ObjectPool {
    private _pool: Node[] = [];
    private _prefab: Prefab;
    private _maxSize: number;

    constructor(prefab: Prefab, maxSize: number = 30) {
        this._prefab = prefab;
        this._maxSize = maxSize;
    }

    /** 从池中取出一个节点（自动激活） */
    get(): Node {
        let node: Node;
        if (this._pool.length > 0) {
            node = this._pool.pop()!;
        } else {
            node = instantiate(this._prefab);
        }
        node.active = true;
        return node;
    }

    /** 归还节点到池中（自动禁用） */
    put(node: Node) {
        if (this._pool.length >= this._maxSize) {
            node.destroy();
            return;
        }
        node.active = false;
        this._pool.push(node);
    }

    /** 预热：提前创建 count 个对象放入池 */
    warmUp(count: number, parent: Node) {
        for (let i = 0; i < count; i++) {
            const node = instantiate(this._prefab);
            node.active = false;
            node.setParent(parent);
            this._pool.push(node);
        }
    }

    clear() {
        this._pool.forEach(n => n.destroy());
        this._pool = [];
    }

    get size(): number { return this._pool.length; }
}
