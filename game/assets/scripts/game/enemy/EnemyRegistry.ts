import { SlimeEnemy } from './SlimeEnemy';

/**
 * 全局敌人注册表
 * SlimeEnemy 初始化时自动注册，销毁时自动注销
 * AttackController 直接从这里查找敌人，不用遍历节点树
 */
export class EnemyRegistry {
    private static _enemies: SlimeEnemy[] = [];

    static register(enemy: SlimeEnemy) {
        if (!EnemyRegistry._enemies.includes(enemy)) {
            EnemyRegistry._enemies.push(enemy);
        }
    }

    static unregister(enemy: SlimeEnemy) {
        const idx = EnemyRegistry._enemies.indexOf(enemy);
        if (idx >= 0) EnemyRegistry._enemies.splice(idx, 1);
    }

    /** 获取范围内所有存活敌人，按距离排序 */
    static getInRange(cx: number, cy: number, range: number): SlimeEnemy[] {
        return EnemyRegistry._enemies
            .filter(e => !e.isDead)
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
}
