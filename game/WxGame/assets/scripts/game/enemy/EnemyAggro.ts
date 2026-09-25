import { WorldBridge } from '../dungeon/WorldBridge';
import { DungeonLayout } from '../dungeon/DungeonLayout';

/**
 * EnemyAggro —— 厅室仇恨（#129）
 *
 * 元气骑士式：进厅即开打。怪醒来的条件（任一）：
 *   1. 与玩家同厅；
 *   2. 所在厅已被告警（同厅任一怪被打 / 任一怪醒来）；
 *   3. 很近（range×0.55，走廊里迎面）；
 *   4. 在 range 内且有直线视野。
 * 醒了不再睡（各 AI 自己持有 awake 标志）。无布局（大厅 / 旧模式）退化为纯距离。
 */
export class EnemyAggro {
    private static _alerted = new Set<number>();

    static reset() { EnemyAggro._alerted.clear(); }

    /** 叫醒某点所在厅的所有怪（被打 / 有怪先醒） */
    static alert(x: number, y: number) {
        const idx = WorldBridge.chamberAt(x, y);
        if (idx >= 0) EnemyAggro._alerted.add(idx);
    }

    static isAlerted(x: number, y: number): boolean {
        const idx = WorldBridge.chamberAt(x, y);
        return idx >= 0 && EnemyAggro._alerted.has(idx);
    }

    static shouldWake(x: number, y: number, range: number): boolean {
        const d = WorldBridge.distTo(x, y);
        const L = DungeonLayout.current;
        if (!L) return d < range;
        const mine = L.chamberIndexAt(x, y);
        if (mine >= 0) {
            if (EnemyAggro._alerted.has(mine)) return true;
            if (mine === L.chamberIndexAt(WorldBridge.x, WorldBridge.y)) {
                EnemyAggro._alerted.add(mine);
                return true;
            }
        }
        if (d < range * 0.55) return true;
        if (d < range && L.lineOfSight(x, y, WorldBridge.x, WorldBridge.y)) return true;
        return false;
    }
}
