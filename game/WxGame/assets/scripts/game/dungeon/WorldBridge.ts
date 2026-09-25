import { Node } from 'cc';
import { MAP_HALF_W, MAP_HALF_H } from './MapConstants';
import { EnemyRegistry } from '../enemy/EnemyRegistry';
import { DungeonLayout } from './DungeonLayout';

export interface ObstacleInfo {
    x: number;
    y: number;
    radius: number;
}

/**
 * WorldBridge —— 开放世界坐标的唯一真相源
 *
 * 碰撞：
 *   - 地形障碍 `_obstacles`
 *   - 实体半径 `tryEntityMove`（怪/可扩展）
 *   - 怪↔怪 / 玩家↔怪 软推开 `separateFromEnemies`
 */
export class WorldBridge {
    static worldLayer: Node | null = null;

    static x = 0;
    static y = 0;
    static camX = 0;
    static camY = 0;

    /** 默认对齐 ViewZoom.LOBBY_ORTHO（235）× 1334/750，避免 setup 前贴边钳制用旧值 */
    static viewHalfW = 235 * (1334 / 750);
    static viewHalfH = 235;

    static readonly boundX = MAP_HALF_W - 30;
    static readonly boundY = MAP_HALF_H - 30;

    /** 玩家碰撞半径 */
    static readonly playerRadius = 26;
    /** 瓦片碰撞用半径上限：3 宽走廊(144px)/2 格缝(96px)都能过，怪贴墙格中心不卡（#128） */
    static readonly TILE_RADIUS_CAP = 20;

    private static _obstacles: ObstacleInfo[] = [];

    static get screenX() { return WorldBridge.x - WorldBridge.camX; }
    static get screenY() { return WorldBridge.y - WorldBridge.camY; }

    /** 视角拉高/拉近时更新视野半宽，并重算 cam 钳制 */
    static setViewHalf(halfW: number, halfH: number) {
        WorldBridge.viewHalfW = halfW;
        WorldBridge.viewHalfH = halfH;
        WorldBridge._apply();
    }

    static reset(x = 0, y = 0) {
        WorldBridge.x = x;
        WorldBridge.y = y;
        WorldBridge._apply();
    }

    static clearObstacles() {
        WorldBridge._obstacles = [];
    }

    static addObstacle(x: number, y: number, radius: number) {
        WorldBridge._obstacles.push({ x, y, radius });
    }

    /** 移除某点的圆障碍（木箱打碎等） */
    static removeObstacleAt(x: number, y: number) {
        WorldBridge._obstacles = WorldBridge._obstacles.filter(o => Math.abs(o.x - x) > 0.5 || Math.abs(o.y - y) > 0.5);
        DungeonLayout.current?.unblockAt(x, y);
    }

    /** 每帧一次：刷新瓦片流场（怪绕墙追人） */
    static tick(dt: number) {
        DungeonLayout.current?.tickFlow(dt, WorldBridge.x, WorldBridge.y);
    }

    /** 怪追人方向：有直线视野直走，否则沿流场绕墙。返回单位向量 */
    static steerToward(fromX: number, fromY: number): { x: number; y: number } {
        const L = DungeonLayout.current;
        if (L) return L.steer(fromX, fromY, WorldBridge.x, WorldBridge.y);
        const dx = WorldBridge.x - fromX;
        const dy = WorldBridge.y - fromY;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        return { x: dx / len, y: dy / len };
    }

    /** 地面地形移速倍率（水洼慢 / 冰面快） */
    static terrainSpeedMul(x: number, y: number): number {
        return DungeonLayout.current?.speedMulAt(x, y) ?? 1;
    }

    /** 玩家所在厅索引（无布局 / 走廊 = -1） */
    static playerChamber(): number {
        return DungeonLayout.current?.chamberIndexAt(WorldBridge.x, WorldBridge.y) ?? -1;
    }

    /** 某点所在厅索引 */
    static chamberAt(x: number, y: number): number {
        return DungeonLayout.current?.chamberIndexAt(x, y) ?? -1;
    }

    /** 直线视野（无布局恒 true） */
    static lineOfSight(x0: number, y0: number, x1: number, y1: number): boolean {
        return DungeonLayout.current?.lineOfSight(x0, y0, x1, y1) ?? true;
    }

    /** 刷怪站位读取。返回副本，调用方改数组不会改碰撞表。 */
    static obstacles(): ObstacleInfo[] {
        return WorldBridge._obstacles.map(o => ({ x: o.x, y: o.y, radius: o.radius }));
    }

    /**
     * 玩家移动：地图边界 + 地形 + 怪物体积
     */
    static tryMove(nx: number, ny: number): { x: number; y: number } {
        const r = WorldBridge.playerRadius;
        let p = WorldBridge.tryEntityMove(WorldBridge.x, WorldBridge.y, nx, ny, r);
        p = WorldBridge.separateFromEnemies(p.x, p.y, r, null);
        WorldBridge.x = p.x;
        WorldBridge.y = p.y;
        WorldBridge._apply();
        return p;
    }

    /**
     * 通用实体移动（怪物用）：边界钳制 + 地形滑行碰撞
     */
    static tryEntityMove(
        fromX: number, fromY: number,
        toX: number, toY: number,
        radius: number,
    ): { x: number; y: number } {
        toX = Math.max(-WorldBridge.boundX, Math.min(WorldBridge.boundX, toX));
        toY = Math.max(-WorldBridge.boundY, Math.min(WorldBridge.boundY, toY));

        let fx = toX;
        let fy = fromY;
        if (WorldBridge._hitsRadius(fx, fy, radius)) fx = fromX;

        fy = toY;
        if (WorldBridge._hitsRadius(fx, fy, radius)) fy = fromY;

        return { x: fx, y: fy };
    }

    /**
     * 与其他存活怪软推开（不重叠体积）
     * @param selfNode 自身节点，排除；玩家传 null
     * @param avoidPlayer 是否与玩家体积互斥（怪移动时 true）
     */
    static separateFromEnemies(
        x: number, y: number, radius: number, selfNode: Node | null,
        avoidPlayer = false,
    ): { x: number; y: number } {
        let ox = x;
        let oy = y;

        if (avoidPlayer) {
            const pr = WorldBridge.playerRadius;
            const dx = ox - WorldBridge.x;
            const dy = oy - WorldBridge.y;
            const minDist = radius + pr;
            const d2 = dx * dx + dy * dy;
            if (d2 > 0.0001 && d2 < minDist * minDist) {
                const d = Math.sqrt(d2);
                const push = (minDist - d) * 0.55;
                ox += (dx / d) * push;
                oy += (dy / d) * push;
            } else if (d2 < 0.0001) {
                const a = Math.random() * Math.PI * 2;
                ox += Math.cos(a) * minDist * 0.5;
                oy += Math.sin(a) * minDist * 0.5;
            }
        }

        const list = EnemyRegistry.getAlive();
        for (const e of list) {
            if (!e.node?.isValid) continue;
            if (selfNode && e.node === selfNode) continue;
            if (e.isDead) continue;
            const er = e.collideRadius ?? 22;
            const ex = e.node.position.x;
            const ey = e.node.position.y;
            const dx = ox - ex;
            const dy = oy - ey;
            const minDist = radius + er;
            const d2 = dx * dx + dy * dy;
            if (d2 >= minDist * minDist || d2 < 0.0001) {
                if (d2 < 0.0001) {
                    const a = Math.random() * Math.PI * 2;
                    ox += Math.cos(a) * minDist * 0.5;
                    oy += Math.sin(a) * minDist * 0.5;
                }
                continue;
            }
            const d = Math.sqrt(d2);
            const push = (minDist - d) * 0.55;
            ox += (dx / d) * push;
            oy += (dy / d) * push;
        }
        ox = Math.max(-WorldBridge.boundX, Math.min(WorldBridge.boundX, ox));
        oy = Math.max(-WorldBridge.boundY, Math.min(WorldBridge.boundY, oy));
        if (WorldBridge._hitsRadius(ox, oy, radius)) {
            return { x, y };
        }
        return { x: ox, y: oy };
    }

    /** 一步：移动 + 与其他怪/玩家分离（怪物 AI 用）；水洼等地形按倍率减步 */
    static enemyStep(
        node: Node, toX: number, toY: number, radius: number,
    ): { x: number; y: number } {
        const from = node.position;
        const mul = WorldBridge.terrainSpeedMul(from.x, from.y);
        if (mul !== 1) {
            toX = from.x + (toX - from.x) * mul;
            toY = from.y + (toY - from.y) * mul;
        }
        let p = WorldBridge.tryEntityMove(from.x, from.y, toX, toY, radius);
        // #128 卡角：两轴都被挡 → 试沿垂直方向滑一步（绕柱/绕箱），再不行原地
        const dxWant = toX - from.x;
        const dyWant = toY - from.y;
        const want2 = dxWant * dxWant + dyWant * dyWant;
        if (want2 > 0.25 && Math.abs(p.x - from.x) < 0.01 && Math.abs(p.y - from.y) < 0.01) {
            const px = -dyWant;
            const py = dxWant;
            const a = WorldBridge.tryEntityMove(from.x, from.y, from.x + px, from.y + py, radius);
            if (Math.abs(a.x - from.x) > 0.01 || Math.abs(a.y - from.y) > 0.01) p = a;
            else {
                const b = WorldBridge.tryEntityMove(from.x, from.y, from.x - px, from.y - py, radius);
                if (Math.abs(b.x - from.x) > 0.01 || Math.abs(b.y - from.y) > 0.01) p = b;
            }
        }
        p = WorldBridge.separateFromEnemies(p.x, p.y, radius, node, true);
        node.setPosition(p.x, p.y, 0);
        return p;
    }

    /** 飞行怪：不撞圆障碍、可飞越坑，但不穿墙；钳地图边界 + 与其他怪分离 */
    static enemyFlyStep(
        node: Node, toX: number, toY: number, radius: number,
    ): { x: number; y: number } {
        const maxX = WorldBridge.boundX - radius;
        const maxY = WorldBridge.boundY - radius;
        let x = Math.max(-maxX, Math.min(maxX, toX));
        let y = Math.max(-maxY, Math.min(maxY, toY));
        const L = DungeonLayout.current;
        if (L) {
            const from = node.position;
            const tr = Math.min(radius, WorldBridge.TILE_RADIUS_CAP);
            if (L.circleHitsSolid(x, from.y, tr, true)) x = from.x;
            if (L.circleHitsSolid(x, y, tr, true)) y = from.y;
        }
        const p = WorldBridge.separateFromEnemies(x, y, radius, node, true);
        node.setPosition(p.x, p.y, 0);
        return p;
    }

    static distTo(wx: number, wy: number): number {
        const dx = wx - WorldBridge.x;
        const dy = wy - WorldBridge.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    static syncPlayerNode(player: Node | null | undefined) {
        if (!player?.isValid) return;
        const sx = WorldBridge.screenX;
        const sy = WorldBridge.screenY;
        const p = player.position;
        if (p.x !== sx || p.y !== sy) player.setPosition(sx, sy, 0);
    }

    private static _hitsRadius(px: number, py: number, radius: number): boolean {
        const tr = Math.min(radius, WorldBridge.TILE_RADIUS_CAP);
        if (DungeonLayout.current?.circleHitsSolid(px, py, tr, false)) return true;
        return WorldBridge._hitsCircles(px, py, radius);
    }

    private static _hitsCircles(px: number, py: number, radius: number): boolean {
        for (const o of WorldBridge._obstacles) {
            const dx = px - o.x;
            const dy = py - o.y;
            const r = radius + o.radius;
            if (dx * dx + dy * dy < r * r) return true;
        }
        return false;
    }

    /** 子弹/投射物：撞墙或圆障碍（可飞越坑/水） */
    static hitsObstacle(px: number, py: number, radius: number): boolean {
        if (DungeonLayout.current?.circleHitsSolid(px, py, radius, true)) return true;
        return WorldBridge._hitsCircles(px, py, radius);
    }

    private static _apply() {
        const maxCamX = Math.max(0, MAP_HALF_W - WorldBridge.viewHalfW);
        const maxCamY = Math.max(0, MAP_HALF_H - WorldBridge.viewHalfH);
        WorldBridge.camX = Math.max(-maxCamX, Math.min(maxCamX, WorldBridge.x));
        WorldBridge.camY = Math.max(-maxCamY, Math.min(maxCamY, WorldBridge.y));

        if (WorldBridge.worldLayer?.isValid) {
            WorldBridge.worldLayer.setPosition(-WorldBridge.camX, -WorldBridge.camY, 0);
        }
    }
}
