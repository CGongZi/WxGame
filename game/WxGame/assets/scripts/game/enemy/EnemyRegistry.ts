import { Node } from 'cc';

/** 可被武器/子弹命中的敌人最小接口 */
export interface CombatEnemy {
    node: Node;
    readonly isDead: boolean;
    readonly isValid: boolean;
    /** 碰撞半径（世界单位），缺省 22 */
    readonly collideRadius?: number;
    takeDamage(amount: number): void;
    /** 可选：减速（mul 0~1，持续 sec 秒）；未实现的怪忽略 */
    applySlow?(mul: number, sec: number): void;
    /** 中立可打物（木箱等）：可被命中，但不计入清房 / 雷达 / 分离 */
    readonly neutral?: boolean;
}

/**
 * 全局敌人注册表
 */
export class EnemyRegistry {
    private static _enemies: CombatEnemy[] = [];

    static register(enemy: CombatEnemy) {
        if (EnemyRegistry._enemies.indexOf(enemy) < 0) {
            EnemyRegistry._enemies.push(enemy);
        }
    }

    static unregister(enemy: CombatEnemy) {
        const idx = EnemyRegistry._enemies.indexOf(enemy);
        if (idx >= 0) EnemyRegistry._enemies.splice(idx, 1);
    }

    static getInRange(cx: number, cy: number, range: number, includeNeutral = true): CombatEnemy[] {
        return EnemyRegistry._enemies
            .filter(e => e?.isValid && !e.isDead && (includeNeutral || !e.neutral))
            .map(e => {
                const dx = e.node.position.x - cx;
                const dy = e.node.position.y - cy;
                return { e, dist: Math.sqrt(dx * dx + dy * dy) };
            })
            .filter(({ dist }) => dist <= range)
            .sort((a, b) => a.dist - b.dist)
            .map(({ e }) => e);
    }

    static get count() { return EnemyRegistry._enemies.length; }

    static get aliveCount(): number {
        return EnemyRegistry._enemies.filter(e => e?.isValid && !e.isDead && !e.neutral).length;
    }

    static getAlive(): CombatEnemy[] {
        return EnemyRegistry._enemies.filter(e => e?.isValid && !e.isDead && !e.neutral);
    }

    /** 圆 vs 敌人碰撞体积命中（子弹用） */
    static getHitByCircle(cx: number, cy: number, radius: number): CombatEnemy[] {
        return EnemyRegistry._enemies
            .filter(e => e?.isValid && !e.isDead)
            .map(e => {
                const er = e.collideRadius ?? 22;
                const dx = e.node.position.x - cx;
                const dy = e.node.position.y - cy;
                const min = radius + er;
                return { e, d2: dx * dx + dy * dy, min2: min * min };
            })
            .filter(({ d2, min2 }) => d2 <= min2)
            .sort((a, b) => a.d2 - b.d2)
            .map(({ e }) => e);
    }

    /** 清怪（换房）。中立物（木箱）由地形层自己管理生命周期，仍保留可打 */
    static clear() {
        EnemyRegistry._enemies = EnemyRegistry._enemies.filter(e => e?.neutral && e.isValid && !e.isDead);
    }
}
