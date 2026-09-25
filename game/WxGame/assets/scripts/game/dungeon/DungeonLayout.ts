import { MAP_COLS, MAP_ROWS, MAP_TILE, MAP_HALF_W, MAP_HALF_H } from './MapConstants';

/**
 * DungeonLayout —— 瓦片地牢布局（#125 / #128 / #132）
 *
 * 一房 = 若干「厅室」+ 走廊 + 机关。不再是整张空地。
 *   - 网格 80×40 × 48px，与 MapConstants 一致；世界坐标铁律不变（原点在网格中心）。
 *   - tiles：FLOOR / WALL / PIT / WATER / LAVA。碰撞由 WorldBridge 查本表。
 *   - blocked：木箱 / 主题装饰占格（动态，箱碎即解），寻路视为不可走，避免怪往箱子上顶。
 *   - features：地刺 / 机关板 / 墙弩 / 木箱 / 火把 / 主题装饰，FloorRenderer 负责生成节点。
 *   - 流场：怪物绕墙追人（steer），玩家换格或每 0.35s 以玩家所在格为源做一次 BFS。
 *   - explored：小地图探索位图（进厅整厅点亮 + 玩家周围渐亮）。
 *
 * 通行硬约束：走廊 ≥3 格宽；箱子/装饰互不相邻且不堵走廊口；瓦片碰撞半径由 WorldBridge 钳到 ≤20。
 * 只做数据，不 import 任何 cc 节点。
 */

export const TILE = {
    FLOOR: 0,
    WALL: 1,
    PIT: 2,
    WATER: 3,
    LAVA: 4,
} as const;
export type TileId = (typeof TILE)[keyof typeof TILE];

export type HazardTint = 'lava' | 'poison' | 'void' | 'frost' | 'none';

export type ChamberKind = 'start' | 'normal' | 'boss' | 'treasure' | 'shrine' | 'challenge';
export type ChamberShape = 'rect' | 'round' | 'cross' | 'blob';

/**
 * #142 主题地形原型——同一套瓦片系统，八个主题八种「颠覆性」结构（不再只是换色）：
 *   rooms   遗迹：厅室 + 直走廊（经典地牢）
 *   cavern  洞穴：不规则岩洞 + 蜿蜒隧道，钟乳石成林
 *   marsh   沼泽：一整片开阔泥地，毒沼水洼星罗棋布，树丛为墙
 *   lake    冰原：开阔冰湖（滑）+ 冰裂缝（坑）切割走位
 *   islands 云海：浮岛 + 窄桥，岛外皆虚空（地面怪过不去，飞怪主场）
 *   rivers  火口：厅室地牢被两条熔岩河纵切，只有石桥可渡
 *   maze    裂隙：3 宽迷宫 + 嵌入式小厅，死角有墙弩
 *   crypt   墓园：密集墓室格网，门洞相连，半数空棺半数伏兵
 */
export type Archetype = 'rooms' | 'cavern' | 'marsh' | 'lake' | 'islands' | 'rivers' | 'maze' | 'crypt';

export interface Chamber {
    x0: number; y0: number; x1: number; y1: number;
    cx: number; cy: number;
    kind: ChamberKind;
    shape: ChamberShape;
    /** 刷怪密度乘子（0 = 这厅不刷，墓园空棺 / 开阔地虚拟分区用）；缺省 1 */
    spawnMul?: number;
}

export type FeatureKind = 'spike' | 'plate' | 'trap_plate' | 'turret' | 'crate' | 'torch' | 'prop' | 'shrine';

export interface LayoutFeature {
    kind: FeatureKind;
    c: number;
    r: number;
    /** 墙弩朝向：0 右 1 上 2 左 3 下（射向厅内） */
    dir?: number;
    /** 主题装饰尺寸乘子 */
    sizeMul?: number;
}

export interface LayoutOptions {
    themeId: string;
    obstacleStyle: string;
    roomIndex: number;
    floor: number;
    hasBoss: boolean;
    isFinal: boolean;
}

function mulberry32(seed: number) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const WALKABLE = new Set<number>([TILE.FLOOR, TILE.WATER, TILE.LAVA]);
const CORRIDOR_W = 3;

export class DungeonLayout {
    static current: DungeonLayout | null = null;

    readonly tiles: Uint8Array;
    /** 1 = 被箱子/装饰占住（寻路不可走；玩家/怪碰撞仍走圆障碍） */
    readonly blocked: Uint8Array;
    /** 小地图探索位图 */
    readonly explored: Uint8Array;
    readonly chambers: Chamber[] = [];
    readonly features: LayoutFeature[] = [];
    readonly themeId: string;
    readonly archetype: Archetype;
    readonly hazardTint: HazardTint;
    readonly floor: number;
    readonly hasBoss: boolean;
    /** 未凿开的格子用什么填：墙（默认）/ 虚空（云海） */
    private _voidTile: TileId = TILE.WALL;
    /** 走廊风格：直 / 蜿蜒（洞穴） */
    private _tunnel: 'straight' | 'wiggly' = 'straight';
    /** explored 变化计数，小地图据此判脏 */
    exploredVersion = 0;

    private _rand: () => number;
    private _occupied = new Set<number>();
    /** 走廊格（不放箱子/装饰） */
    private _corridor = new Set<number>();

    // 流场
    private _dist: Int16Array;
    private _flowSrc = -1;
    private _flowAge = 99;
    private _q: Int32Array;

    private constructor(opts: LayoutOptions, seed: number) {
        this.tiles = new Uint8Array(MAP_COLS * MAP_ROWS).fill(TILE.WALL);
        this.blocked = new Uint8Array(MAP_COLS * MAP_ROWS);
        this.explored = new Uint8Array(MAP_COLS * MAP_ROWS);
        this._dist = new Int16Array(MAP_COLS * MAP_ROWS).fill(-1);
        this._q = new Int32Array(MAP_COLS * MAP_ROWS);
        this.themeId = opts.themeId;
        this.archetype = DungeonLayout.archetypeFor(opts.themeId);
        this.floor = opts.floor;
        this.hasBoss = opts.hasBoss;
        this.hazardTint = DungeonLayout.tintFor(opts.themeId, opts.obstacleStyle);
        this._rand = mulberry32(seed);
    }

    static archetypeFor(themeId: string): Archetype {
        switch (themeId) {
            case 'cave': return 'cavern';
            case 'swamp': return 'marsh';
            case 'ice': return 'lake';
            case 'sky': return 'islands';
            case 'volcano': return 'rivers';
            case 'abyss': return 'maze';
            case 'necropolis': return 'crypt';
            default: return 'rooms';
        }
    }

    // ── 构建 ─────────────────────────────────────────────────────

    static build(opts: LayoutOptions): DungeonLayout {
        const seed = (Math.floor(Math.random() * 0x7fffffff) ^ (opts.roomIndex * 7919)) >>> 0;
        const L = new DungeonLayout(opts, seed);
        L._generate(opts);
        DungeonLayout.current = L;
        return L;
    }

    /** 测试 / 压测用：固定种子 */
    static buildSeeded(opts: LayoutOptions, seed: number): DungeonLayout {
        const L = new DungeonLayout(opts, seed >>> 0);
        L._generate(opts);
        return L;
    }

    static clear() {
        DungeonLayout.current = null;
    }

    static tintFor(themeId: string, style: string): HazardTint {
        if (themeId === 'volcano') return 'lava';
        if (themeId === 'swamp' || themeId === 'necropolis') return 'poison';
        if (themeId === 'abyss' || themeId === 'sky' || style === 'cloud') return 'void';
        if (themeId === 'ice' || style === 'crystal') return 'frost';
        return 'none';
    }

    // ── 坐标 ─────────────────────────────────────────────────────

    static colOf(px: number): number { return Math.floor((px + MAP_HALF_W) / MAP_TILE); }
    static rowOf(py: number): number { return Math.floor((py + MAP_HALF_H) / MAP_TILE); }
    static tileX(c: number): number { return -MAP_HALF_W + (c + 0.5) * MAP_TILE; }
    static tileY(r: number): number { return -MAP_HALF_H + (r + 0.5) * MAP_TILE; }

    tile(c: number, r: number): number {
        if (c < 0 || r < 0 || c >= MAP_COLS || r >= MAP_ROWS) return TILE.WALL;
        return this.tiles[r * MAP_COLS + c];
    }

    tileAtWorld(px: number, py: number): number {
        return this.tile(DungeonLayout.colOf(px), DungeonLayout.rowOf(py));
    }

    /** 地面单位可走（含水/熔岩，不含坑/墙/箱子） */
    isWalkable(c: number, r: number): boolean {
        if (c < 0 || r < 0 || c >= MAP_COLS || r >= MAP_ROWS) return false;
        const i = r * MAP_COLS + c;
        return WALKABLE.has(this.tiles[i]) && this.blocked[i] === 0;
    }

    /** 纯地形可走（忽略箱子），用于判玩家所在格 */
    isTerrainWalkable(c: number, r: number): boolean {
        return WALKABLE.has(this.tile(c, r));
    }

    /** 圆形体积是否压到实心格。flying=true 只算墙（可飞越坑） */
    circleHitsSolid(px: number, py: number, radius: number, flying: boolean): boolean {
        const c0 = DungeonLayout.colOf(px - radius);
        const c1 = DungeonLayout.colOf(px + radius);
        const r0 = DungeonLayout.rowOf(py - radius);
        const r1 = DungeonLayout.rowOf(py + radius);
        for (let r = r0; r <= r1; r++) {
            for (let c = c0; c <= c1; c++) {
                const t = this.tile(c, r);
                const solid = t === TILE.WALL || (!flying && t === TILE.PIT);
                if (!solid) continue;
                const x0 = -MAP_HALF_W + c * MAP_TILE;
                const y0 = -MAP_HALF_H + r * MAP_TILE;
                const nx = Math.max(x0, Math.min(px, x0 + MAP_TILE));
                const ny = Math.max(y0, Math.min(py, y0 + MAP_TILE));
                const dx = px - nx;
                const dy = py - ny;
                if (dx * dx + dy * dy < radius * radius) return true;
            }
        }
        return false;
    }

    speedMulAt(px: number, py: number): number {
        const t = this.tileAtWorld(px, py);
        if (t === TILE.WATER) return this.hazardTint === 'frost' ? 1.18 : 0.62;
        if (t === TILE.LAVA) return 0.8;
        return 1;
    }

    isLavaAt(px: number, py: number): boolean {
        return this.tileAtWorld(px, py) === TILE.LAVA;
    }

    // ── 动态占格（箱子 / 装饰）──────────────────────────────────

    blockAt(px: number, py: number) {
        const c = DungeonLayout.colOf(px);
        const r = DungeonLayout.rowOf(py);
        if (c < 0 || r < 0 || c >= MAP_COLS || r >= MAP_ROWS) return;
        this.blocked[r * MAP_COLS + c] = 1;
        this._flowAge = 99; // 下帧重算流场
    }

    unblockAt(px: number, py: number) {
        const c = DungeonLayout.colOf(px);
        const r = DungeonLayout.rowOf(py);
        if (c < 0 || r < 0 || c >= MAP_COLS || r >= MAP_ROWS) return;
        this.blocked[r * MAP_COLS + c] = 0;
        this._flowAge = 99;
    }

    // ── 厅室查询 ────────────────────────────────────────────────

    /** 所在厅索引；走廊 / 墙返回 -1 */
    chamberIndexAt(px: number, py: number): number {
        const c = DungeonLayout.colOf(px);
        const r = DungeonLayout.rowOf(py);
        for (let i = 0; i < this.chambers.length; i++) {
            const ch = this.chambers[i];
            if (c >= ch.x0 && c <= ch.x1 && r >= ch.y0 && r <= ch.y1) return i;
        }
        return -1;
    }

    chamberArea(ch: Chamber): number {
        let n = 0;
        for (let r = ch.y0; r <= ch.y1; r++) for (let c = ch.x0; c <= ch.x1; c++) {
            if (this.tile(c, r) === TILE.FLOOR) n++;
        }
        return n;
    }

    /** 最近的可站立地板格中心（BFS 环扩），失败返回原点 */
    nearestFloor(px: number, py: number, minDistFromOrigin = 0): { x: number; y: number } {
        const sc = Math.max(0, Math.min(MAP_COLS - 1, DungeonLayout.colOf(px)));
        const sr = Math.max(0, Math.min(MAP_ROWS - 1, DungeonLayout.rowOf(py)));
        for (let ring = 0; ring < 40; ring++) {
            for (let dr = -ring; dr <= ring; dr++) {
                for (let dc = -ring; dc <= ring; dc++) {
                    if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
                    const c = sc + dc;
                    const r = sr + dr;
                    if (this.tile(c, r) !== TILE.FLOOR) continue;
                    const key = r * MAP_COLS + c;
                    if (this._occupied.has(key) || this.blocked[key]) continue;
                    const x = DungeonLayout.tileX(c);
                    const y = DungeonLayout.tileY(r);
                    if (minDistFromOrigin > 0 && Math.hypot(x, y) < minDistFromOrigin) continue;
                    return { x, y };
                }
            }
        }
        return { x: 0, y: 0 };
    }

    /**
     * #164 击杀掉落锚点：贴死位短距找可摆格（水/熔岩也可），允许地刺等 occupied；
     * 不跨厅乱跳、失败绝不回 (0,0)——保留尸体坐标。
     */
    dropAnchor(px: number, py: number, maxRing = 5): { x: number; y: number } {
        const sc = Math.max(0, Math.min(MAP_COLS - 1, DungeonLayout.colOf(px)));
        const sr = Math.max(0, Math.min(MAP_ROWS - 1, DungeonLayout.rowOf(py)));
        const i0 = sr * MAP_COLS + sc;
        if (WALKABLE.has(this.tiles[i0]) && this.blocked[i0] === 0) {
            return { x: DungeonLayout.tileX(sc), y: DungeonLayout.tileY(sr) };
        }
        for (let ring = 1; ring <= maxRing; ring++) {
            for (let dr = -ring; dr <= ring; dr++) {
                for (let dc = -ring; dc <= ring; dc++) {
                    if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
                    const c = sc + dc;
                    const r = sr + dr;
                    if (c < 0 || r < 0 || c >= MAP_COLS || r >= MAP_ROWS) continue;
                    const key = r * MAP_COLS + c;
                    if (!WALKABLE.has(this.tiles[key]) || this.blocked[key]) continue;
                    return { x: DungeonLayout.tileX(c), y: DungeonLayout.tileY(r) };
                }
            }
        }
        return { x: px, y: py };
    }

    /** 某厅内 n 个刷怪点：地板格、非机关格、四邻可走（大体型也站得下）、互不重叠 */
    spawnPointsIn(chIdx: number, n: number): Array<[number, number]> {
        const ch = this.chambers[chIdx];
        const out: Array<[number, number]> = [];
        if (!ch) return out;
        const used = new Set<number>();
        const cands: number[] = [];
        for (let r = ch.y0 + 1; r <= ch.y1 - 1; r++) {
            for (let c = ch.x0 + 1; c <= ch.x1 - 1; c++) {
                const key = r * MAP_COLS + c;
                if (this.tile(c, r) !== TILE.FLOOR) continue;
                if (this._occupied.has(key) || this.blocked[key]) continue;
                if (!this.isWalkable(c + 1, r) || !this.isWalkable(c - 1, r)
                    || !this.isWalkable(c, r + 1) || !this.isWalkable(c, r - 1)) continue;
                if (ch.kind === 'start' && Math.hypot(DungeonLayout.tileX(c), DungeonLayout.tileY(r)) < 300) continue;
                cands.push(key);
            }
        }
        // 洗牌取前 n，并尽量彼此隔 1 格
        for (let i = cands.length - 1; i > 0; i--) {
            const j = Math.floor(this._rand() * (i + 1));
            const t = cands[i]; cands[i] = cands[j]; cands[j] = t;
        }
        for (const key of cands) {
            if (out.length >= n) break;
            const c = key % MAP_COLS;
            const r = (key - c) / MAP_COLS;
            let near = false;
            for (const u of used) {
                const uc = u % MAP_COLS;
                const ur = (u - uc) / MAP_COLS;
                if (Math.abs(uc - c) <= 1 && Math.abs(ur - r) <= 1) { near = true; break; }
            }
            if (near && cands.length > n * 3) continue;
            used.add(key);
            out.push([DungeonLayout.tileX(c), DungeonLayout.tileY(r)]);
        }
        while (out.length < n && cands.length > 0) {
            const key = cands[Math.floor(this._rand() * cands.length)];
            const c = key % MAP_COLS;
            const r = (key - c) / MAP_COLS;
            out.push([DungeonLayout.tileX(c), DungeonLayout.tileY(r)]);
        }
        return out;
    }

    /** 刷怪点：分布在非起始厅（面积加权）；兼容旧调用 */
    spawnPoints(n: number): Array<[number, number]> {
        const idxs = this.chambers
            .map((ch, i) => i)
            .filter(i => {
                const k = this.chambers[i].kind;
                return k !== 'start' && k !== 'treasure' && k !== 'shrine';
            });
        const pool = idxs.length > 0 ? idxs : this.chambers.map((_, i) => i);
        const out: Array<[number, number]> = [];
        const per = new Map<number, number>();
        for (let i = 0; i < n; i++) {
            const idx = this._weightedChamber(pool);
            per.set(idx, (per.get(idx) ?? 0) + 1);
        }
        for (const [idx, cnt] of per) out.push(...this.spawnPointsIn(idx, cnt));
        while (out.length < n) {
            const a = this._rand() * Math.PI * 2;
            const p = this.nearestFloor(Math.cos(a) * 700, Math.sin(a) * 400, 320);
            out.push([p.x, p.y]);
        }
        return out.slice(0, n);
    }

    bossPoint(): { x: number; y: number } {
        const boss = this.chambers.find(ch => ch.kind === 'boss')
            ?? this.chambers.filter(ch => ch.kind !== 'start').sort((a, b) => this._bbox(b) - this._bbox(a))[0];
        if (!boss) return this.nearestFloor(600, 0, 400);
        const x = DungeonLayout.tileX(boss.cx);
        const y = DungeonLayout.tileY(boss.cy);
        if (this.tile(boss.cx, boss.cy) === TILE.FLOOR && !this.blocked[boss.cy * MAP_COLS + boss.cx]) return { x, y };
        return this.nearestFloor(x, y);
    }

    // ── 探索（小地图）───────────────────────────────────────────

    /** 玩家周围 radius 格渐亮；进厅点亮整厅。返回是否有变化 */
    revealAround(px: number, py: number, radius = 5): boolean {
        const c = DungeonLayout.colOf(px);
        const r = DungeonLayout.rowOf(py);
        let changed = false;
        const idx = this.chamberIndexAt(px, py);
        if (idx >= 0) {
            const ch = this.chambers[idx];
            for (let rr = ch.y0 - 1; rr <= ch.y1 + 1; rr++) for (let cc = ch.x0 - 1; cc <= ch.x1 + 1; cc++) {
                if (cc < 0 || rr < 0 || cc >= MAP_COLS || rr >= MAP_ROWS) continue;
                const k = rr * MAP_COLS + cc;
                if (!this.explored[k]) { this.explored[k] = 1; changed = true; }
            }
        }
        for (let dr = -radius; dr <= radius; dr++) for (let dc = -radius; dc <= radius; dc++) {
            if (dc * dc + dr * dr > radius * radius + 1) continue;
            const cc = c + dc;
            const rr = r + dr;
            if (cc < 0 || rr < 0 || cc >= MAP_COLS || rr >= MAP_ROWS) continue;
            const k = rr * MAP_COLS + cc;
            if (!this.explored[k]) { this.explored[k] = 1; changed = true; }
        }
        if (changed) this.exploredVersion++;
        return changed;
    }

    // ── 流场 / 转向 ──────────────────────────────────────────────

    /** 每帧调用一次即可；玩家换格或超时才重算 */
    tickFlow(dt: number, px: number, py: number) {
        this._flowAge += dt;
        const c = DungeonLayout.colOf(px);
        const r = DungeonLayout.rowOf(py);
        const src = r * MAP_COLS + c;
        if (src === this._flowSrc && this._flowAge < 0.35) return;
        if (!this.isTerrainWalkable(c, r)) return;
        this._flowSrc = src;
        this._flowAge = 0;
        this._bfsEnemy(c, r, this._dist);
    }

    /** 直线可达用直线；否则沿流场走下坡。返回单位向量 */
    steer(fromX: number, fromY: number, toX: number, toY: number): { x: number; y: number } {
        const dx = toX - fromX;
        const dy = toY - fromY;
        const len = Math.hypot(dx, dy) || 1;
        if (this.lineOfSight(fromX, fromY, toX, toY)) return { x: dx / len, y: dy / len };

        const c = DungeonLayout.colOf(fromX);
        const r = DungeonLayout.rowOf(fromY);
        const here = this._dist[r * MAP_COLS + c];
        if (here < 0 || this._flowSrc < 0) {
            // 站在不可走格（被箩筐挤到 / 箱子格）：往最近可走格挪
            const nf = this._nearestWalkable(c, r);
            if (nf) {
                const tx = DungeonLayout.tileX(nf.c) - fromX;
                const ty = DungeonLayout.tileY(nf.r) - fromY;
                const tl = Math.hypot(tx, ty) || 1;
                return { x: tx / tl, y: ty / tl };
            }
            return { x: dx / len, y: dy / len };
        }

        let best = here;
        let bc = c;
        let br = r;
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dc === 0 && dr === 0) continue;
                const nc = c + dc;
                const nr = r + dr;
                if (!this.isWalkable(nc, nr)) continue;
                if (dc !== 0 && dr !== 0 && (!this.isWalkable(c + dc, r) || !this.isWalkable(c, r + dr))) continue;
                const d = this._dist[nr * MAP_COLS + nc];
                if (d >= 0 && d < best) { best = d; bc = nc; br = nr; }
            }
        }
        if (bc === c && br === r) return { x: dx / len, y: dy / len };
        const tx = DungeonLayout.tileX(bc) - fromX;
        const ty = DungeonLayout.tileY(br) - fromY;
        const tl = Math.hypot(tx, ty) || 1;
        return { x: tx / tl, y: ty / tl };
    }

    /** 直线视野：沿线每半格采样，遇墙/坑/箱子即挡 */
    lineOfSight(x0: number, y0: number, x1: number, y1: number): boolean {
        const dx = x1 - x0;
        const dy = y1 - y0;
        const len = Math.hypot(dx, dy);
        const steps = Math.max(1, Math.ceil(len / (MAP_TILE * 0.45)));
        for (let i = 1; i < steps; i++) {
            const t = i / steps;
            if (!this.isWalkable(DungeonLayout.colOf(x0 + dx * t), DungeonLayout.rowOf(y0 + dy * t))) return false;
        }
        return true;
    }

    /** 到玩家的流场步数（-1 不可达）；用于仇恨/远近判断 */
    flowDistAt(px: number, py: number): number {
        if (this._flowSrc < 0) return -1;
        const c = DungeonLayout.colOf(px);
        const r = DungeonLayout.rowOf(py);
        if (c < 0 || r < 0 || c >= MAP_COLS || r >= MAP_ROWS) return -1;
        return this._dist[r * MAP_COLS + c];
    }

    private _nearestWalkable(c: number, r: number): { c: number; r: number } | null {
        for (let ring = 1; ring <= 3; ring++) {
            for (let dr = -ring; dr <= ring; dr++) for (let dc = -ring; dc <= ring; dc++) {
                if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
                if (this.isWalkable(c + dc, r + dr) && this._dist[(r + dr) * MAP_COLS + c + dc] >= 0) {
                    return { c: c + dc, r: r + dr };
                }
            }
        }
        return null;
    }

    private _bfs(sc: number, sr: number, out: Int16Array) {
        out.fill(-1);
        const q = this._q;
        let head = 0;
        let tail = 0;
        q[tail++] = sr * MAP_COLS + sc;
        out[sr * MAP_COLS + sc] = 0;
        while (head < tail) {
            const cur = q[head++];
            const c = cur % MAP_COLS;
            const r = (cur - c) / MAP_COLS;
            const d = out[cur] + 1;
            // 4 邻
            if (this.isWalkable(c + 1, r) && out[cur + 1] < 0) { out[cur + 1] = d; q[tail++] = cur + 1; }
            if (this.isWalkable(c - 1, r) && out[cur - 1] < 0) { out[cur - 1] = d; q[tail++] = cur - 1; }
            if (this.isWalkable(c, r + 1) && out[cur + MAP_COLS] < 0) { out[cur + MAP_COLS] = d; q[tail++] = cur + MAP_COLS; }
            if (this.isWalkable(c, r - 1) && out[cur - MAP_COLS] < 0) { out[cur - MAP_COLS] = d; q[tail++] = cur - MAP_COLS; }
        }
    }

    /**
     * #141 怪物流场：熔岩 / 毒沼视为高代价（+6 步），怪绕着走而不是横穿被烫死；
     * 只有玩家站在里面、或没别的路时才会踏进去。两轮 BFS：先算不含危险格的距离，
     * 再让危险格从相邻可达格「借」距离。
     */
    private _bfsEnemy(sc: number, sr: number, out: Int16Array) {
        out.fill(-1);
        const q = this._q;
        let head = 0;
        let tail = 0;
        const start = sr * MAP_COLS + sc;
        q[tail++] = start;
        out[start] = 0;
        const safe = (i: number) => this.tiles[i] !== TILE.LAVA || i === start;
        const step = (cur: number, nc: number, nr: number, ni: number, d: number) => {
            if (!this.isWalkable(nc, nr) || out[ni] >= 0 || !safe(ni)) return;
            out[ni] = d; q[tail++] = ni;
        };
        while (head < tail) {
            const cur = q[head++];
            const c = cur % MAP_COLS;
            const r = (cur - c) / MAP_COLS;
            const d = out[cur] + 1;
            step(cur, c + 1, r, cur + 1, d);
            step(cur, c - 1, r, cur - 1, d);
            step(cur, c, r + 1, cur + MAP_COLS, d);
            step(cur, c, r - 1, cur - MAP_COLS, d);
        }
        // 第二轮：危险格 = 最近安全邻格 + 6（多轮松弛直到稳定，池子最多几格宽）
        for (let pass = 0; pass < 6; pass++) {
            let changed = false;
            for (let i = 0; i < this.tiles.length; i++) {
                if (this.tiles[i] !== TILE.LAVA || this.blocked[i] || i === start) continue;
                const c = i % MAP_COLS;
                const r = (i - c) / MAP_COLS;
                let best = -1;
                for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const nc = c + dc, nr = r + dr;
                    if (nc < 0 || nr < 0 || nc >= MAP_COLS || nr >= MAP_ROWS) continue;
                    const nd = out[nr * MAP_COLS + nc];
                    if (nd < 0) continue;
                    const cost = nd + (this.tiles[nr * MAP_COLS + nc] === TILE.LAVA ? 1 : 6);
                    if (best < 0 || cost < best) best = cost;
                }
                if (best >= 0 && (out[i] < 0 || best < out[i])) { out[i] = best; changed = true; }
            }
            if (!changed) break;
        }
    }

    // ── 生成 ─────────────────────────────────────────────────────

    private _generate(opts: LayoutOptions) {
        const cc = Math.floor(MAP_COLS / 2);
        const cr = Math.floor(MAP_ROWS / 2);

        let start: Chamber;
        switch (this.archetype) {
            case 'cavern': start = this._genCavern(opts); break;
            case 'marsh': start = this._genOpen(opts, 'marsh'); break;
            case 'lake': start = this._genOpen(opts, 'lake'); break;
            case 'islands': start = this._genIslands(opts); break;
            case 'rivers': start = this._genRooms(opts); this._lavaRivers(start); break;
            case 'maze': start = this._genMaze(opts); break;
            case 'crypt': start = this._genCrypt(opts); break;
            default: start = this._genRooms(opts);
        }

        // 起始点周围保证干净
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            const k = (cr + dr) * MAP_COLS + cc + dc;
            this.tiles[k] = TILE.FLOOR;
            this.blocked[k] = 0;
        }

        // 连通性兜底：任一厅中心不可达 → 直接凿通
        this._ensureConnected(start);
        // 封死到不了的小口袋（否则怪刷在里面永远清不了房）
        this._sealPockets(start);
        // 厅中心必须是地板（开阔地 / 洞穴的虚拟厅中心可能落在水 / 石上）
        for (const ch of this.chambers) this._fixCenter(ch);
    }

    /** 厅中心若不是地板，就近挪到厅内地板格（bossPoint / 清厅喷币 / 小地图都用它） */
    private _fixCenter(ch: Chamber) {
        if (this.tile(ch.cx, ch.cy) === TILE.FLOOR && !this.blocked[ch.cy * MAP_COLS + ch.cx]) return;
        for (let ring = 1; ring < 12; ring++) {
            for (let dr = -ring; dr <= ring; dr++) for (let dc = -ring; dc <= ring; dc++) {
                if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
                const c = ch.cx + dc, r = ch.cy + dr;
                if (c < ch.x0 || c > ch.x1 || r < ch.y0 || r > ch.y1) continue;
                if (this.tile(c, r) === TILE.FLOOR && !this.blocked[r * MAP_COLS + c]) { ch.cx = c; ch.cy = r; return; }
            }
        }
    }

    // ── 原型 A：厅室 + 走廊（遗迹 / 火口底图）────────────────────

    private _genRooms(opts: LayoutOptions): Chamber {
        const R = this._rand;
        const cc = Math.floor(MAP_COLS / 2);
        const cr = Math.floor(MAP_ROWS / 2);

        // 起始厅：包住原点
        const start = this._makeChamber(cc - 6, cr - 4, cc + 6, cr + 4, 'start', 'rect');
        this._carveChamber(start);

        const wantNormal = (opts.hasBoss ? 4 : 5) + (opts.floor >= 3 ? 1 : 0);
        let placed = 0;
        let attempts = 0;
        while (placed < wantNormal && attempts < 320) {
            attempts++;
            const w = 9 + Math.floor(R() * 9);   // 9..17
            const h = 7 + Math.floor(R() * 5);   // 7..11
            const roll = R();
            const shape: ChamberShape = roll < 0.55 ? 'rect' : roll < 0.8 ? 'round' : 'cross';
            if (this._tryAttach(w, h, 'normal', shape)) placed++;
        }

        if (opts.hasBoss) {
            let ok = false;
            for (let i = 0; i < 200 && !ok; i++) ok = this._tryAttach(20, 13, 'boss', 'rect');
            if (!ok) {
                const big = this.chambers.filter(c => c.kind === 'normal').sort((a, b) => this._bbox(b) - this._bbox(a))[0];
                if (big) big.kind = 'boss';
            }
        }

        if (R() < 0.5) {
            for (let i = 0; i < 80; i++) if (this._tryAttach(7, 6, 'treasure', 'rect')) break;
        }
        this._attachSpecials('rect');

        // 厅内地貌 / 机关
        for (const ch of this.chambers) this._decorate(ch, opts);
        return start;
    }

    // ── 原型 B：洞穴（不规则岩洞 + 蜿蜒隧道）───────────────────────

    private _genCavern(opts: LayoutOptions): Chamber {
        const R = this._rand;
        const cc = Math.floor(MAP_COLS / 2);
        const cr = Math.floor(MAP_ROWS / 2);
        this._tunnel = 'wiggly';

        const start = this._makeChamber(cc - 7, cr - 5, cc + 7, cr + 5, 'start', 'blob');
        this._carveChamber(start);

        const wantNormal = (opts.hasBoss ? 5 : 6) + (opts.floor >= 3 ? 1 : 0);
        let placed = 0;
        let attempts = 0;
        while (placed < wantNormal && attempts < 360) {
            attempts++;
            const w = 10 + Math.floor(R() * 9);  // 10..18
            const h = 8 + Math.floor(R() * 5);   // 8..12
            if (this._tryAttach(w, h, 'normal', 'blob')) placed++;
        }
        if (opts.hasBoss) {
            let ok = false;
            for (let i = 0; i < 200 && !ok; i++) ok = this._tryAttach(21, 14, 'boss', 'blob');
            if (!ok) {
                const big = this.chambers.filter(c => c.kind === 'normal').sort((a, b) => this._bbox(b) - this._bbox(a))[0];
                if (big) big.kind = 'boss';
            }
        }
        if (R() < 0.4) for (let i = 0; i < 80; i++) if (this._tryAttach(7, 6, 'treasure', 'blob')) break;
        this._attachSpecials('blob');

        // 洞穴地貌：钟乳石成林（多装饰）+ 地下水洼 + 少量箱子；不放墙弩 / 机关板阵
        for (const ch of this.chambers) {
            this._torches(ch, 6);
            if (ch.kind === 'start') continue;
            if (ch.kind === 'treasure') { this._addFeature('plate', ch.cx, ch.cy); this._scatter(ch, 'crate', 3); continue; }
            if (ch.kind === 'shrine') { this._addFeature('shrine', ch.cx, ch.cy); continue; }
            if (ch.kind === 'challenge') {
                ch.spawnMul = 1.9;
                this._scatter(ch, 'prop', 2, 1.1);
                for (let k = 0; k < 2; k++) this._addFeature('spike', ch.cx - 2 + k * 4, ch.cy);
                continue;
            }
            if (ch.kind === 'boss') { this._scatter(ch, 'prop', 4, 1.2); this._scatter(ch, 'crate', 3); continue; }
            const w = ch.x1 - ch.x0 + 1, h = ch.y1 - ch.y0 + 1;
            // 石笋群：3~6 根，成簇
            this._scatter(ch, 'prop', 3 + Math.floor(R() * 4), 1.1);
            // 地下水洼（减速）
            if (w >= 11 && h >= 8 && R() < 0.55) this._blobTile(ch.cx + Math.floor(R() * 5) - 2, ch.cy + Math.floor(R() * 3) - 1, 2 + R() * 1.5, TILE.WATER, ch);
            // 岩柱（墙块 2×2）把洞穴切出回旋余地
            if (w >= 12 && h >= 9 && R() < 0.6) {
                const c = ch.x0 + 3 + Math.floor(R() * (w - 6));
                const r = ch.y0 + 3 + Math.floor(R() * (h - 6));
                for (let dr = 0; dr < 2; dr++) for (let dc = 0; dc < 2; dc++) this._setTile(c + dc, r + dr, TILE.WALL);
            }
            this._scatter(ch, 'crate', 1 + Math.floor(R() * 2));
            if (R() < 0.35) this._addFeature(R() < 0.6 ? 'plate' : 'trap_plate', ch.x0 + 2 + Math.floor(R() * (w - 4)), ch.y0 + 2 + Math.floor(R() * (h - 4)));
        }
        return start;
    }

    // ── 原型 C/D：开阔地（沼泽 / 冰湖）——一整片地，虚拟分区当厅 ────────

    private _genOpen(opts: LayoutOptions, flavor: 'marsh' | 'lake'): Chamber {
        const R = this._rand;
        const cc = Math.floor(MAP_COLS / 2);
        const cr = Math.floor(MAP_ROWS / 2);
        const HW = 30, HH = 15;           // 半宽 / 半高（格）
        const x0 = cc - HW, x1 = cc + HW, y0 = cr - HH, y1 = cr + HH;

        // 超椭圆 + 噪声的大片地面
        const ph1 = R() * 6.28, ph2 = R() * 6.28;
        for (let r = y0; r <= y1; r++) for (let c = x0; c <= x1; c++) {
            const nx = (c - cc) / HW, ny = (r - cr) / HH;
            const a = Math.atan2(ny, nx);
            const noise = 1 + 0.08 * Math.sin(a * 4 + ph1) + 0.06 * Math.sin(a * 7 + ph2);
            const d = Math.pow(Math.abs(nx), 3) + Math.pow(Math.abs(ny), 3);
            if (d <= noise) this.tiles[r * MAP_COLS + c] = TILE.FLOOR;
        }

        // 3×3 虚拟分区：中间一格是起始区
        const colsEdge = [x0, cc - 10, cc + 10, x1];
        const rowsEdge = [y0, cr - 5, cr + 5, y1];
        let start: Chamber | null = null;
        const cells: Chamber[] = [];
        for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
            const kind: ChamberKind = i === 1 && j === 1 ? 'start' : 'normal';
            const ch = this._makeChamber(colsEdge[i] + (i > 0 ? 1 : 0), rowsEdge[j] + (j > 0 ? 1 : 0), colsEdge[i + 1], rowsEdge[j + 1], kind, 'rect');
            ch.spawnMul = kind === 'start' ? 0 : 0.65;
            if (kind === 'start') start = ch; else cells.push(ch);
        }
        if (opts.hasBoss) {
            // 最远的角落分区当 Boss 区
            const corner = cells.filter(c => (c.x0 === x0 || c.x1 === x1) && (c.y0 === y0 || c.y1 === y1));
            const boss = corner[Math.floor(R() * corner.length)];
            boss.kind = 'boss';
            boss.spawnMul = 1;
        }
        // #167 开阔地也塞神龛/挑战分区
        const normals = cells.filter(c => c.kind === 'normal');
        if (normals.length > 0 && R() < 0.6) {
            const s = normals[Math.floor(R() * normals.length)];
            s.kind = 'shrine';
            s.spawnMul = 0;
            this._addFeature('shrine', s.cx, s.cy);
        }
        const left = cells.filter(c => c.kind === 'normal');
        if (left.length > 0 && R() < 0.5) {
            const c = left[Math.floor(R() * left.length)];
            c.kind = 'challenge';
            c.spawnMul = 1.9;
        }

        const keepClear = (c: number, r: number) => Math.abs(c - cc) <= 5 && Math.abs(r - cr) <= 3;

        if (flavor === 'marsh') {
            // 毒沼水洼星罗棋布（LAVA=毒沼，可走但掉血 & 减速）
            for (let i = 0; i < 12; i++) {
                const c = x0 + 3 + Math.floor(R() * (x1 - x0 - 6));
                const r = y0 + 2 + Math.floor(R() * (y1 - y0 - 4));
                if (keepClear(c, r)) continue;
                this._blobTile(c, r, 1.4 + R() * 1.6, TILE.LAVA);
            }
            // 树丛 = 墙块（1~3 格）当掩体，别堵成死路（后面 sealPockets 兜底）
            for (let i = 0; i < 26; i++) {
                const c = x0 + 2 + Math.floor(R() * (x1 - x0 - 4));
                const r = y0 + 2 + Math.floor(R() * (y1 - y0 - 4));
                if (keepClear(c, r)) continue;
                const n = 1 + Math.floor(R() * 3);
                for (let k = 0; k < n; k++) this._setTile(c + (k % 2), r + Math.floor(k / 2), TILE.WALL);
            }
            // 泥沼小水洼（减速）
            for (let i = 0; i < 6; i++) {
                const c = x0 + 3 + Math.floor(R() * (x1 - x0 - 6));
                const r = y0 + 2 + Math.floor(R() * (y1 - y0 - 4));
                if (keepClear(c, r)) continue;
                this._blobTile(c, r, 1.2 + R() * 1.2, TILE.WATER);
            }
            for (const ch of this.chambers) {
                if (ch.kind === 'start') continue;
                this._scatter(ch, 'prop', 2 + Math.floor(R() * 3), 1.0);
                if (R() < 0.5) this._scatter(ch, 'crate', 1);
                if (R() < 0.3) this._addFeature('trap_plate', ch.x0 + 3 + Math.floor(R() * (ch.x1 - ch.x0 - 6)), ch.y0 + 2 + Math.floor(R() * (ch.y1 - ch.y0 - 4)));
            }
        } else {
            // 冰湖：两片大冰面（WATER + frost → 更滑 / 更快）
            this._blobTile(cc + 15, cr + 2, 7 + R() * 2, TILE.WATER);
            this._blobTile(cc - 16, cr - 4, 5 + R() * 2, TILE.WATER);
            // 冰裂缝：1 格宽的坑线（像薄墙，逼着绕）
            for (let i = 0; i < 7; i++) {
                let c = x0 + 4 + Math.floor(R() * (x1 - x0 - 8));
                let r = y0 + 3 + Math.floor(R() * (y1 - y0 - 6));
                const horizontal = R() < 0.5;
                const len = 5 + Math.floor(R() * 8);
                for (let k = 0; k < len; k++) {
                    if (!keepClear(c, r) && this.tile(c, r) === TILE.FLOOR) this._setTile(c, r, TILE.PIT);
                    if (horizontal) c += 1; else r += 1;
                    if (R() < 0.25) { if (horizontal) r += R() < 0.5 ? 1 : -1; else c += R() < 0.5 ? 1 : -1; }
                }
            }
            // 冰晶柱（装饰 + 掩体）
            for (const ch of this.chambers) {
                if (ch.kind === 'start') continue;
                this._scatter(ch, 'prop', 2 + Math.floor(R() * 2), 1.15);
                if (R() < 0.4) this._scatter(ch, 'crate', 1);
                if (R() < 0.4) {
                    for (let k = 0; k < 3; k++) this._addFeature('spike', ch.cx - 2 + k * 2, ch.cy + (R() < 0.5 ? 2 : -2));
                }
            }
        }
        return start!;
    }

    // ── 原型 E：云海浮岛（岛外皆虚空）──────────────────────────────

    private _genIslands(opts: LayoutOptions): Chamber {
        const R = this._rand;
        const cc = Math.floor(MAP_COLS / 2);
        const cr = Math.floor(MAP_ROWS / 2);
        this._voidTile = TILE.PIT;

        const start = this._makeChamber(cc - 6, cr - 4, cc + 6, cr + 4, 'start', 'round');
        this._carveChamber(start);
        const wantNormal = (opts.hasBoss ? 5 : 6);
        let placed = 0;
        let attempts = 0;
        while (placed < wantNormal && attempts < 360) {
            attempts++;
            const w = 9 + Math.floor(R() * 7);   // 9..15
            const h = 7 + Math.floor(R() * 5);   // 7..11
            if (this._tryAttach(w, h, 'normal', R() < 0.75 ? 'round' : 'rect')) placed++;
        }
        if (opts.hasBoss) {
            let ok = false;
            for (let i = 0; i < 200 && !ok; i++) ok = this._tryAttach(19, 13, 'boss', 'round');
            if (!ok) {
                const big = this.chambers.filter(c => c.kind === 'normal').sort((a, b) => this._bbox(b) - this._bbox(a))[0];
                if (big) big.kind = 'boss';
            }
        }
        if (R() < 0.6) for (let i = 0; i < 80; i++) if (this._tryAttach(6, 5, 'treasure', 'round')) break;
        this._attachSpecials('round');

        // 岛外全部改为虚空（先改再装饰：火把 / 墙弩 / 凹室都依赖墙，云海一律没有）
        for (let i = 0; i < this.tiles.length; i++) if (this.tiles[i] === TILE.WALL) this.tiles[i] = TILE.PIT;

        for (const ch of this.chambers) {
            if (ch.kind === 'start') continue;
            if (ch.kind === 'treasure') { this._addFeature('plate', ch.cx, ch.cy); this._scatter(ch, 'crate', 2); continue; }
            if (ch.kind === 'shrine') { this._addFeature('shrine', ch.cx, ch.cy); continue; }
            if (ch.kind === 'challenge') { ch.spawnMul = 1.9; this._scatter(ch, 'crate', 1); continue; }
            const w = ch.x1 - ch.x0 + 1, h = ch.y1 - ch.y0 + 1;
            // 云柱（墙块）当掩体
            if (w >= 11 && h >= 8) {
                this._setTile(ch.cx - 3, ch.cy, TILE.WALL);
                this._setTile(ch.cx + 3, ch.cy, TILE.WALL);
            }
            // 岛心风洞（坑）
            if (ch.kind !== 'boss' && w >= 12 && h >= 9 && R() < 0.5) this._blobTile(ch.cx, ch.cy, 1.4, TILE.PIT, ch);
            this._scatter(ch, 'prop', 1 + Math.floor(R() * 2), 0.9);
            this._scatter(ch, 'crate', 1 + Math.floor(R() * 2));
            if (R() < 0.45) this._addFeature(R() < 0.6 ? 'plate' : 'trap_plate', ch.x0 + 2 + Math.floor(R() * (w - 4)), ch.y0 + 2 + Math.floor(R() * (h - 4)));
        }
        return start;
    }

    // ── 原型 F：熔岩河（在厅室地牢上纵切两条河，只留石桥）──────────────

    private _lavaRivers(start: Chamber) {
        const R = this._rand;
        const cc = Math.floor(MAP_COLS / 2);
        const bands = [cc - 16 - Math.floor(R() * 4), cc + 13 + Math.floor(R() * 4)];
        for (const band of bands) {
            const phase = R() * 6.28;
            const amp = 2 + R() * 2;
            for (let r = 1; r < MAP_ROWS - 1; r++) {
                const center = band + Math.round(Math.sin(r * 0.22 + phase) * amp);
                for (let dc = -1; dc <= 1; dc++) {
                    const c = center + dc;
                    if (c < 1 || c >= MAP_COLS - 1) continue;
                    const k = r * MAP_COLS + c;
                    if (this.tiles[k] !== TILE.FLOOR || this._corridor.has(k) || this.blocked[k]) continue;
                    if (c >= start.x0 - 1 && c <= start.x1 + 1 && r >= start.y0 - 1 && r <= start.y1 + 1) continue;
                    // 厅内：中心行留 3 宽石桥
                    const ch = this.chambers.find(x => c >= x.x0 && c <= x.x1 && r >= x.y0 && r <= x.y1);
                    if (ch && Math.abs(r - ch.cy) <= 1) continue;
                    if (ch && ch.kind === 'boss') continue;
                    this.tiles[k] = TILE.LAVA;
                    this._occupied.add(k);
                }
            }
        }
        this._pruneFeatures();
    }

    // ── 原型 G：裂隙迷宫（3 宽迷宫 + 嵌入式小厅 + 墙弩）─────────────────

    private _genMaze(opts: LayoutOptions): Chamber {
        const R = this._rand;
        const CS = 4;                                   // 3 地板 + 1 墙
        const gc = Math.floor((MAP_COLS - 2) / CS);     // 19
        const gr = Math.floor((MAP_ROWS - 2) / CS);     // 9
        const cc = Math.floor(MAP_COLS / 2);
        const cr = Math.floor(MAP_ROWS / 2);
        const oc = Math.floor((cc - 1) / CS);
        const orow = Math.floor((cr - 1) / CS);
        const cellX = (i: number) => 1 + i * CS;
        const cellY = (j: number) => 1 + j * CS;
        const carveCell = (i: number, j: number) => {
            for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) this._setCorridor(cellX(i) + c, cellY(j) + r);
        };
        const openBetween = (i0: number, j0: number, i1: number, j1: number) => {
            if (i0 !== i1) {
                const wc = Math.max(cellX(i0), cellX(i1)) - 1;
                for (let r = 0; r < 3; r++) this._setCorridor(wc, cellY(j0) + r);
            } else {
                const wr = Math.max(cellY(j0), cellY(j1)) - 1;
                for (let c = 0; c < 3; c++) this._setCorridor(cellX(i0) + c, wr);
            }
        };
        // 迭代回溯：完美迷宫
        const visited = new Uint8Array(gc * gr);
        const stack: Array<[number, number]> = [[oc, orow]];
        visited[orow * gc + oc] = 1;
        carveCell(oc, orow);
        while (stack.length > 0) {
            const [i, j] = stack[stack.length - 1];
            const nbrs: Array<[number, number]> = [];
            for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const ni = i + di, nj = j + dj;
                if (ni < 0 || nj < 0 || ni >= gc || nj >= gr || visited[nj * gc + ni]) continue;
                nbrs.push([ni, nj]);
            }
            if (nbrs.length === 0) { stack.pop(); continue; }
            const [ni, nj] = nbrs[Math.floor(R() * nbrs.length)];
            visited[nj * gc + ni] = 1;
            carveCell(ni, nj);
            openBetween(i, j, ni, nj);
            stack.push([ni, nj]);
        }
        // 额外打通 18% 的墙 → 有环，能绕
        for (let j = 0; j < gr; j++) for (let i = 0; i < gc; i++) {
            if (i + 1 < gc && R() < 0.18) openBetween(i, j, i + 1, j);
            if (j + 1 < gr && R() < 0.18) openBetween(i, j, i, j + 1);
        }

        // 起始厅：原点周围 3×3 格 → 11×11
        const start = this._makeChamber(cellX(oc - 1), cellY(orow - 1), cellX(oc + 1) + 2, cellY(orow + 1) + 2, 'start', 'rect');
        this._carveRect(start.x0, start.y0, start.x1, start.y1);

        // 嵌入式小厅：2×2 格（7×7），彼此 ≥5 格远；Boss 3×2 格（11×7）放最远角
        const taken: Array<[number, number]> = [[oc, orow]];
        const farEnough = (i: number, j: number, d: number) => taken.every(([ti, tj]) => Math.abs(ti - i) + Math.abs(tj - j) >= d);
        const wantNormal = 4 + (opts.floor >= 3 ? 1 : 0);
        let placed = 0;
        for (let t = 0; t < 400 && placed < wantNormal; t++) {
            const i = Math.floor(R() * (gc - 1));
            const j = Math.floor(R() * (gr - 1));
            if (!farEnough(i, j, 4)) continue;
            const ch = this._makeChamber(cellX(i), cellY(j), cellX(i + 1) + 2, cellY(j + 1) + 2, 'normal', 'rect');
            this._carveRect(ch.x0, ch.y0, ch.x1, ch.y1);
            taken.push([i, j]);
            placed++;
        }
        if (opts.hasBoss) {
            const corners: Array<[number, number]> = [[0, 0], [gc - 3, 0], [0, gr - 2], [gc - 3, gr - 2]];
            corners.sort((a, b) => (Math.abs(b[0] - oc) + Math.abs(b[1] - orow)) - (Math.abs(a[0] - oc) + Math.abs(a[1] - orow)));
            const [i, j] = corners[0];
            const ch = this._makeChamber(cellX(i), cellY(j), cellX(i + 2) + 2, cellY(j + 1) + 2, 'boss', 'rect');
            this._carveRect(ch.x0, ch.y0, ch.x1, ch.y1);
        }
        // 走廊格标记只用于「不放箱子」；厅内要能放 → 从走廊集合里摘掉
        for (const ch of this.chambers) {
            for (let r = ch.y0; r <= ch.y1; r++) for (let c = ch.x0; c <= ch.x1; c++) this._corridor.delete(r * MAP_COLS + c);
        }

        for (const ch of this.chambers) {
            this._torches(ch, 4);
            if (ch.kind === 'start') continue;
            const w = ch.x1 - ch.x0 + 1, h = ch.y1 - ch.y0 + 1;
            if (ch.kind === 'boss') { this._pillars(ch, 1); this._scatter(ch, 'crate', 3); continue; }
            // 小厅：中央虚空坑 or 四角刺 or 机关板
            const roll = R();
            if (roll < 0.35 && w >= 7) { this._setTile(ch.cx, ch.cy, TILE.PIT); this._setTile(ch.cx + 1, ch.cy, TILE.PIT); }
            else if (roll < 0.65) { for (const [dc, dr] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) this._addFeature('spike', ch.cx + dc, ch.cy + dr); }
            else this._addFeature(R() < 0.5 ? 'plate' : 'trap_plate', ch.cx, ch.cy);
            this._scatter(ch, 'crate', 1 + Math.floor(R() * 2));
            this._scatter(ch, 'prop', 1, 0.9);
        }
        // 死角墙弩：迷宫走廊里 6~9 个，从墙里射向走廊
        let turrets = 0;
        for (let t = 0; t < 600 && turrets < 6 + Math.floor(R() * 4); t++) {
            const c = 2 + Math.floor(R() * (MAP_COLS - 4));
            const r = 2 + Math.floor(R() * (MAP_ROWS - 4));
            if (this.tile(c, r) !== TILE.WALL) continue;
            if (Math.abs(c - cc) < 8 && Math.abs(r - cr) < 8) continue;
            const dirs = [[1, 0, 0], [0, 1, 1], [-1, 0, 2], [0, -1, 3]];
            const open = dirs.filter(([dc, dr]) => this.tile(c + dc, r + dr) === TILE.FLOOR && this.tile(c + dc * 2, r + dr * 2) === TILE.FLOOR && this.tile(c + dc * 3, r + dr * 3) === TILE.FLOOR);
            if (open.length !== 1) continue;
            this.features.push({ kind: 'turret', c, r, dir: open[0][2] });
            turrets++;
        }
        return start;
    }

    // ── 原型 H：墓园墓室格网（门洞相连，半数空棺半数伏兵）─────────────

    private _genCrypt(opts: LayoutOptions): Chamber {
        const R = this._rand;
        const CW = 6, CH = 5;                 // 墓室内径
        const NC = 8, NR = 4;                 // 8×4 间
        const cc = Math.floor(MAP_COLS / 2);
        const cr = Math.floor(MAP_ROWS / 2);
        const x0 = cc - 25, y0 = cr - 9;      // 原点落在 (3,1) 间内
        const cx0 = (i: number) => x0 + 1 + i * (CW + 1);
        const cy0 = (j: number) => y0 + 1 + j * (CH + 1);
        for (let j = 0; j < NR; j++) for (let i = 0; i < NC; i++) {
            this._carveRect(cx0(i), cy0(j), cx0(i) + CW - 1, cy0(j) + CH - 1);
        }
        const si = 3, sj = 1;
        // 起始大厅 = (3,1)+(4,1) 合并；Boss 大厅 = 离起点最远的 2×2
        const openWall = (i0: number, j0: number, i1: number, j1: number, full: boolean) => {
            if (i0 !== i1) {
                const wc = cx0(Math.max(i0, i1)) - 1;
                const mid = cy0(j0) + Math.floor(CH / 2);
                for (let r = cy0(j0); r < cy0(j0) + CH; r++) if (full || Math.abs(r - mid) <= 1) this._setCorridor(wc, r);
            } else {
                const wr = cy0(Math.max(j0, j1)) - 1;
                const mid = cx0(i0) + Math.floor(CW / 2);
                for (let c = cx0(i0); c < cx0(i0) + CW; c++) if (full || Math.abs(c - mid) <= 1) this._setCorridor(c, wr);
            }
        };
        openWall(si, sj, si + 1, sj, true);
        const bi = si <= NC / 2 ? NC - 2 : 0;
        const bj = sj < NR / 2 ? NR - 2 : 0;
        openWall(bi, bj, bi + 1, bj, true);
        openWall(bi, bj + 1, bi + 1, bj + 1, true);
        openWall(bi, bj, bi, bj + 1, true);
        openWall(bi + 1, bj, bi + 1, bj + 1, true);
        const merged = new Set<number>([si * 100 + sj, (si + 1) * 100 + sj, bi * 100 + bj, (bi + 1) * 100 + bj, bi * 100 + bj + 1, (bi + 1) * 100 + bj + 1]);

        // 随机 DFS 生成门洞（保证连通）+ 28% 额外门（有环）
        const visited = new Uint8Array(NC * NR);
        const stack: Array<[number, number]> = [[si, sj]];
        visited[sj * NC + si] = 1;
        while (stack.length > 0) {
            const [i, j] = stack[stack.length - 1];
            const nbrs: Array<[number, number]> = [];
            for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const ni = i + di, nj = j + dj;
                if (ni < 0 || nj < 0 || ni >= NC || nj >= NR || visited[nj * NC + ni]) continue;
                nbrs.push([ni, nj]);
            }
            if (nbrs.length === 0) { stack.pop(); continue; }
            const [ni, nj] = nbrs[Math.floor(R() * nbrs.length)];
            visited[nj * NC + ni] = 1;
            openWall(i, j, ni, nj, false);
            stack.push([ni, nj]);
        }
        for (let j = 0; j < NR; j++) for (let i = 0; i < NC; i++) {
            if (i + 1 < NC && R() < 0.28) openWall(i, j, i + 1, j, false);
            if (j + 1 < NR && R() < 0.28) openWall(i, j, i, j + 1, false);
        }

        // 厅：起始 / Boss 合并厅 + 普通墓室（55% 有伏兵，其余空棺）
        const start = this._makeChamber(cx0(si), cy0(sj), cx0(si + 1) + CW - 1, cy0(sj) + CH - 1, 'start', 'rect');
        const boss = this._makeChamber(cx0(bi), cy0(bj), cx0(bi + 1) + CW - 1, cy0(bj + 1) + CH - 1, opts.hasBoss ? 'boss' : 'normal', 'rect');
        boss.spawnMul = opts.hasBoss ? 1 : 1.2;
        for (let j = 0; j < NR; j++) for (let i = 0; i < NC; i++) {
            if (merged.has(i * 100 + j)) continue;
            const ch = this._makeChamber(cx0(i), cy0(j), cx0(i) + CW - 1, cy0(j) + CH - 1, 'normal', 'rect');
            ch.spawnMul = R() < 0.45 ? 1 : 0;
        }
        // 门洞已由 _setCorridor 标记；墓室内部也被 carveRect 标了 → 摘掉厅内格
        for (const ch of this.chambers) {
            for (let r = ch.y0; r <= ch.y1; r++) for (let c = ch.x0; c <= ch.x1; c++) this._corridor.delete(r * MAP_COLS + c);
        }
        for (const ch of this.chambers) {
            this._torches(ch, 3);
            if (ch.kind === 'start') continue;
            if (ch.kind === 'boss' || ch === boss) { this._pillars(ch, 1); this._scatter(ch, 'crate', 3); continue; }
            // 棺椁（装饰）+ 空棺里更多箱子（奖励探索）
            this._scatter(ch, 'prop', 1, 0.85);
            this._scatter(ch, 'crate', (ch.spawnMul ?? 1) > 0 ? 1 : 2);
            // 伏兵墓室 30% 有磷雾（毒沼小块）
            if ((ch.spawnMul ?? 1) > 0 && R() < 0.3) this._setTile(ch.x0 + 1 + Math.floor(R() * (CW - 2)), ch.y0 + 1 + Math.floor(R() * (CH - 2)), TILE.LAVA);
            if (R() < 0.15) this._addFeature('trap_plate', ch.cx, ch.cy);
        }
        // 外圈墙弩：第 2 层起 4~6 个
        if (opts.floor >= 2) {
            for (let t = 0, n = 0; t < 300 && n < 4 + Math.floor(R() * 3); t++) {
                const i = Math.floor(R() * NC), j = Math.floor(R() * NR);
                if (merged.has(i * 100 + j)) continue;
                const left = R() < 0.5;
                const c = left ? cx0(i) - 1 : cx0(i) + CW;
                const r = cy0(j) + 1 + Math.floor(R() * (CH - 2));
                if (this.tile(c, r) !== TILE.WALL) continue;
                this.features.push({ kind: 'turret', c, r, dir: left ? 0 : 2 });
                n++;
            }
        }
        return start;
    }

    // ── 生成小工具 ─────────────────────────────────────────────────

    private _carveRect(x0: number, y0: number, x1: number, y1: number) {
        for (let r = y0; r <= y1; r++) for (let c = x0; c <= x1; c++) {
            if (c < 1 || r < 1 || c >= MAP_COLS - 1 || r >= MAP_ROWS - 1) continue;
            this.tiles[r * MAP_COLS + c] = TILE.FLOOR;
        }
    }

    /** 圆形一团地形（水洼 / 毒沼 / 坑），可限制在某厅 bbox 内；不覆盖走廊格 */
    private _blobTile(cc: number, cr: number, radius: number, t: TileId, within?: Chamber) {
        const rr = Math.ceil(radius);
        for (let dr = -rr; dr <= rr; dr++) for (let dc = -rr; dc <= rr; dc++) {
            const jitter = 0.75 + this._rand() * 0.5;
            if (dc * dc + dr * dr > radius * radius * jitter) continue;
            const c = cc + dc, r = cr + dr;
            if (within && (c < within.x0 + 1 || c > within.x1 - 1 || r < within.y0 + 1 || r > within.y1 - 1)) continue;
            if (this.tile(c, r) !== TILE.FLOOR) continue;
            this._setTile(c, r, t);
        }
    }

    /** 厅内随机撒 n 个箱子 / 装饰（各自遵守放置规则） */
    private _scatter(ch: Chamber, kind: 'crate' | 'prop', n: number, sizeMul = 1) {
        const w = ch.x1 - ch.x0 + 1, h = ch.y1 - ch.y0 + 1;
        for (let i = 0, tries = 0; i < n && tries < n * 6; tries++) {
            const c = ch.x0 + 1 + Math.floor(this._rand() * (w - 2));
            const r = ch.y0 + 1 + Math.floor(this._rand() * (h - 2));
            const before = this.features.length;
            this._addFeature(kind, c, r, kind === 'prop' ? { sizeMul: sizeMul * (0.85 + this._rand() * 0.3) } : undefined);
            if (this.features.length > before) i++;
        }
    }

    /** 上沿墙每 step 格一支火把 */
    private _torches(ch: Chamber, step: number) {
        for (let c = ch.x0 + 1; c <= ch.x1 - 1; c += step) {
            if (this.tile(c, ch.y1 + 1) === TILE.WALL && this.tile(c, ch.y1) === TILE.FLOOR) {
                this.features.push({ kind: 'torch', c, r: ch.y1 + 1 });
            }
        }
    }

    private _sealPockets(start: Chamber) {
        const dist = new Int16Array(MAP_COLS * MAP_ROWS);
        this._bfs(start.cx, start.cy, dist);
        let sealed = 0;
        for (let i = 0; i < this.tiles.length; i++) {
            if (!WALKABLE.has(this.tiles[i]) || this.blocked[i]) continue;
            if (dist[i] >= 0) continue;
            this.tiles[i] = this._voidTile;
            sealed++;
        }
        if (sealed > 0) this._pruneFeatures();
    }

    private _pruneFeatures() {
        for (let i = this.features.length - 1; i >= 0; i--) {
            const f = this.features[i];
            if (f.kind === 'torch' || f.kind === 'turret') continue;
            if (this.tile(f.c, f.r) !== TILE.FLOOR) {
                this.blocked[f.r * MAP_COLS + f.c] = 0;
                this.features.splice(i, 1);
                continue;
            }
            if ((f.kind === 'crate' || f.kind === 'prop') && !this.blocked[f.r * MAP_COLS + f.c]) this.features.splice(i, 1);
        }
    }

    private _makeChamber(x0: number, y0: number, x1: number, y1: number, kind: ChamberKind, shape: ChamberShape): Chamber {
        const ch: Chamber = {
            x0, y0, x1, y1,
            cx: Math.floor((x0 + x1) / 2), cy: Math.floor((y0 + y1) / 2),
            kind, shape,
        };
        this.chambers.push(ch);
        return ch;
    }

    private _carveChamber(ch: Chamber) {
        const w = ch.x1 - ch.x0 + 1;
        const h = ch.y1 - ch.y0 + 1;
        for (let r = ch.y0; r <= ch.y1; r++) {
            for (let c = ch.x0; c <= ch.x1; c++) {
                let inside = true;
                if (ch.shape === 'round') {
                    const nx = (c - ch.cx) / (w / 2 + 0.2);
                    const ny = (r - ch.cy) / (h / 2 + 0.2);
                    inside = nx * nx + ny * ny <= 1;
                } else if (ch.shape === 'blob') {
                    // 岩洞：椭圆半径按角度做两级噪声（相位取自厅坐标，稳定可复现）
                    const nx = (c - ch.cx) / (w / 2 + 0.3);
                    const ny = (r - ch.cy) / (h / 2 + 0.3);
                    const a = Math.atan2(ny, nx);
                    const p1 = (ch.cx * 0.7 + ch.cy * 1.3) % 6.28;
                    const p2 = (ch.cx * 1.9 + ch.cy * 0.4) % 6.28;
                    const rad = 1 + 0.2 * Math.sin(a * 3 + p1) + 0.12 * Math.sin(a * 5 + p2);
                    inside = nx * nx + ny * ny <= rad * rad * 0.92;
                } else if (ch.shape === 'cross') {
                    const armW = Math.max(2, Math.floor(w / 4));
                    const armH = Math.max(2, Math.floor(h / 4));
                    inside = Math.abs(c - ch.cx) <= armW || Math.abs(r - ch.cy) <= armH;
                }
                if (inside) this.tiles[r * MAP_COLS + c] = TILE.FLOOR;
            }
        }
    }

    private _bbox(ch: Chamber): number {
        return (ch.x1 - ch.x0 + 1) * (ch.y1 - ch.y0 + 1);
    }

    private _weightedChamber(idxs: number[]): number {
        const total = idxs.reduce((s, i) => s + this._bbox(this.chambers[i]), 0);
        let r = this._rand() * total;
        for (const i of idxs) { r -= this._bbox(this.chambers[i]); if (r <= 0) return i; }
        return idxs[idxs.length - 1];
    }

    private _overlaps(x0: number, y0: number, x1: number, y1: number, pad: number): boolean {
        for (const ch of this.chambers) {
            if (x0 - pad <= ch.x1 && x1 + pad >= ch.x0 && y0 - pad <= ch.y1 && y1 + pad >= ch.y0) return true;
        }
        return false;
    }

    /**
     * #167 神龛 / 挑战厅：与宝藏厅同级附加，提升探索惊喜。
     * shape 跟当前原型主厅形状。
     */
    private _attachSpecials(shape: ChamberShape) {
        const R = this._rand;
        if (R() < 0.55) {
            for (let i = 0; i < 80; i++) if (this._tryAttach(6, 5, 'shrine', shape)) break;
        }
        if (R() < 0.48) {
            for (let i = 0; i < 80; i++) if (this._tryAttach(8, 7, 'challenge', shape === 'blob' ? 'blob' : 'rect')) break;
        }
    }

    /** 从已有厅向某方向长出新厅并凿走廊 */
    private _tryAttach(w: number, h: number, kind: ChamberKind, shape: ChamberShape): boolean {
        const R = this._rand;
        const src = this.chambers[Math.floor(R() * this.chambers.length)];
        const dir = Math.floor(R() * 4);
        const gap = 3 + Math.floor(R() * 5); // 3..7
        let x0: number, y0: number;
        if (dir === 0) {        // 右
            x0 = src.x1 + 1 + gap;
            y0 = src.cy - Math.floor(h / 2) + Math.floor(R() * 7) - 3;
        } else if (dir === 2) { // 左
            x0 = src.x0 - gap - w;
            y0 = src.cy - Math.floor(h / 2) + Math.floor(R() * 7) - 3;
        } else if (dir === 1) { // 上
            y0 = src.y1 + 1 + gap;
            x0 = src.cx - Math.floor(w / 2) + Math.floor(R() * 9) - 4;
        } else {                // 下
            y0 = src.y0 - gap - h;
            x0 = src.cx - Math.floor(w / 2) + Math.floor(R() * 9) - 4;
        }
        const x1 = x0 + w - 1;
        const y1 = y0 + h - 1;
        if (x0 < 2 || y0 < 2 || x1 > MAP_COLS - 3 || y1 > MAP_ROWS - 3) return false;
        if (this._overlaps(x0, y0, x1, y1, 2)) return false;

        const ch = this._makeChamber(x0, y0, x1, y1, kind, shape);
        this._carveChamber(ch);
        this._carveCorridor(src, ch, dir);
        return true;
    }

    private _setCorridor(c: number, r: number) {
        if (c < 1 || r < 1 || c >= MAP_COLS - 1 || r >= MAP_ROWS - 1) return;
        const k = r * MAP_COLS + c;
        this.tiles[k] = TILE.FLOOR;
        this._corridor.add(k);
    }

    /** 洞穴隧道：从 a 中心蜿蜒走到 b 中心，3 宽，带随机侧偏 */
    private _carveTunnel(a: Chamber, b: Chamber) {
        const R = this._rand;
        let c = a.cx, r = a.cy;
        let guard = 0;
        let side = 0;
        while ((c !== b.cx || r !== b.cy) && guard++ < 400) {
            for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) this._setCorridor(c + dc, r + dr);
            const dx = b.cx - c, dy = b.cy - r;
            // 每 3~6 步换一次侧偏，让隧道弯
            if (guard % (3 + (guard % 4)) === 0) side = R() < 0.5 ? -1 : 1;
            if (Math.abs(dx) > Math.abs(dy)) {
                c += Math.sign(dx);
                if (R() < 0.35 && Math.abs(dy) < 6) r += side;
            } else {
                r += Math.sign(dy);
                if (R() < 0.35 && Math.abs(dx) < 6) c += side;
            }
            c = Math.max(2, Math.min(MAP_COLS - 3, c));
            r = Math.max(2, Math.min(MAP_ROWS - 3, r));
        }
    }

    /** 走廊：优先直走（两厅投影有重叠），否则 L 形；长直廊 30% 变 5 宽中柱廊 */
    private _carveCorridor(a: Chamber, b: Chamber, dir: number) {
        if (this._tunnel === 'wiggly') { this._carveTunnel(a, b); return; }
        const half = Math.floor(CORRIDOR_W / 2);
        if (dir === 0 || dir === 2) {
            const lo = Math.max(a.y0 + 1, b.y0 + 1);
            const hi = Math.min(a.y1 - 1, b.y1 - 1);
            const left = dir === 0 ? a : b;
            const right = dir === 0 ? b : a;
            if (lo <= hi) {
                const row = lo + Math.floor(this._rand() * (hi - lo + 1));
                const from = left.x1 + 1;
                const to = right.x0 - 1;
                const wide = to - from >= 8 && this._rand() < 0.3;
                const hw = wide ? 2 : half;
                for (let c = from; c <= to; c++) for (let k = -hw; k <= hw; k++) this._setCorridor(c, row + k);
                if (wide) {
                    for (let c = from + 2; c <= to - 2; c += 3) this.tiles[row * MAP_COLS + c] = TILE.WALL;
                } else {
                    this._spikeCorridor(from, to, row, true);
                }
                // 凿进非矩形厅直到碰到地板
                this._punch(right.x0, row, 1, 0, right, hw);
                this._punch(left.x1, row, -1, 0, left, hw);
                return;
            }
            for (let c = Math.min(a.cx, b.cx); c <= Math.max(a.cx, b.cx); c++) for (let k = -half; k <= half; k++) this._setCorridor(c, a.cy + k);
            for (let r = Math.min(a.cy, b.cy); r <= Math.max(a.cy, b.cy); r++) for (let k = -half; k <= half; k++) this._setCorridor(b.cx + k, r);
            return;
        }
        const lo = Math.max(a.x0 + 1, b.x0 + 1);
        const hi = Math.min(a.x1 - 1, b.x1 - 1);
        const bottom = dir === 1 ? a : b;
        const top = dir === 1 ? b : a;
        if (lo <= hi) {
            const col = lo + Math.floor(this._rand() * (hi - lo + 1));
            const from = bottom.y1 + 1;
            const to = top.y0 - 1;
            const wide = to - from >= 8 && this._rand() < 0.3;
            const hw = wide ? 2 : half;
            for (let r = from; r <= to; r++) for (let k = -hw; k <= hw; k++) this._setCorridor(col + k, r);
            if (wide) {
                for (let r = from + 2; r <= to - 2; r += 3) this.tiles[r * MAP_COLS + col] = TILE.WALL;
            } else {
                this._spikeCorridor(from, to, col, false);
            }
            this._punch(col, top.y0, 0, 1, top, hw);
            this._punch(col, bottom.y1, 0, -1, bottom, hw);
            return;
        }
        for (let r = Math.min(a.cy, b.cy); r <= Math.max(a.cy, b.cy); r++) for (let k = -half; k <= half; k++) this._setCorridor(a.cx + k, r);
        for (let c = Math.min(a.cx, b.cx); c <= Math.max(a.cx, b.cx); c++) for (let k = -half; k <= half; k++) this._setCorridor(c, b.cy + k);
    }

    /** 从厅 bbox 边缘沿 (dc,dr) 向内凿 hw 半宽走廊，直到遇见地板（圆厅 / 十字厅入口） */
    private _punch(c: number, r: number, dc: number, dr: number, ch: Chamber, hw: number) {
        if (ch.shape === 'rect') return;
        let guard = 0;
        while (guard++ < 12 && this.tile(c, r) !== TILE.FLOOR) {
            for (let k = -hw; k <= hw; k++) {
                const cc = dc !== 0 ? c : c + k;
                const rr = dc !== 0 ? r + k : r;
                if (cc < ch.x0 || cc > ch.x1 || rr < ch.y0 || rr > ch.y1) continue;
                this.tiles[rr * MAP_COLS + cc] = TILE.FLOOR;
            }
            c += dc;
            r += dr;
            if (c < ch.x0 || c > ch.x1 || r < ch.y0 || r > ch.y1) break;
        }
    }

    /** 长走廊 35% 概率中段铺一排地刺 */
    private _spikeCorridor(from: number, to: number, line: number, horizontal: boolean) {
        if (to - from < 4 || this._rand() > 0.35) return;
        const mid = Math.floor((from + to) / 2);
        for (let k = -1; k <= 1; k++) {
            const c = horizontal ? mid : line + k;
            const r = horizontal ? line + k : mid;
            this._addFeature('spike', c, r);
        }
    }

    /** 箱子 / 装饰是否可放：地板、未占、非走廊、八邻无其他箱子/装饰、不是 1 格宽的窄口 */
    private _canPlaceBlocker(c: number, r: number): boolean {
        const key = r * MAP_COLS + c;
        if (this.tile(c, r) !== TILE.FLOOR) return false;
        if (this._occupied.has(key) || this._corridor.has(key)) return false;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            if (dc === 0 && dr === 0) continue;
            const k = (r + dr) * MAP_COLS + c + dc;
            if (this.blocked[k]) return false;
        }
        // 左右都墙或上下都墙 → 窄口，不能堵
        const wl = this.tile(c - 1, r) === TILE.WALL, wr = this.tile(c + 1, r) === TILE.WALL;
        const wu = this.tile(c, r + 1) === TILE.WALL, wd = this.tile(c, r - 1) === TILE.WALL;
        if ((wl && wr) || (wu && wd)) return false;
        // 斜角三面墙的死角也不放（玩家钻不进去拿）
        return true;
    }

    private _addFeature(kind: FeatureKind, c: number, r: number, extra?: Partial<LayoutFeature>) {
        const key = r * MAP_COLS + c;
        if (kind === 'crate' || kind === 'prop') {
            if (!this._canPlaceBlocker(c, r)) return;
            this._occupied.add(key);
            this.blocked[key] = 1;
        } else if (kind !== 'torch' && kind !== 'turret') {
            if (this._occupied.has(key)) return;
            if (this.tile(c, r) !== TILE.FLOOR) return;
            this._occupied.add(key);
        }
        this.features.push({ kind, c, r, ...extra });
    }

    private _setTile(c: number, r: number, t: TileId) {
        if (c < 1 || r < 1 || c >= MAP_COLS - 1 || r >= MAP_ROWS - 1) return;
        const k = r * MAP_COLS + c;
        if (this._corridor.has(k)) return; // 不改走廊格
        this.tiles[k] = t;
        this._occupied.add(k);
    }

    // ── 厅内地貌 ─────────────────────────────────────────────────

    private _decorate(ch: Chamber, opts: LayoutOptions) {
        const R = this._rand;
        // 火把：上沿墙每 5 格
        this._torches(ch, 5);
        if (ch.kind === 'start') return;

        const w = ch.x1 - ch.x0 + 1;
        const h = ch.y1 - ch.y0 + 1;
        const ix0 = ch.x0 + 2, ix1 = ch.x1 - 2, iy0 = ch.y0 + 2, iy1 = ch.y1 - 2;
        const hazardTile: TileId = this.hazardTint === 'lava' || this.hazardTint === 'poison'
            ? TILE.LAVA
            : this.hazardTint === 'void' ? TILE.PIT
            : TILE.WATER;

        if (ch.kind === 'treasure') {
            this._addFeature('plate', ch.cx, ch.cy);
            for (let i = 0; i < 4; i++) this._addFeature('crate', ch.x0 + 1 + Math.floor(R() * (w - 2)), ch.y0 + 1 + Math.floor(R() * (h - 2)));
            return;
        }

        // #167 神龛厅：中央神龛，无战斗
        if (ch.kind === 'shrine') {
            this._addFeature('shrine', ch.cx, ch.cy);
            return;
        }

        // #167 挑战厅：更密刷怪 + 少量刺阵压力
        if (ch.kind === 'challenge') {
            ch.spawnMul = 1.9;
            this._pillars(ch, 1);
            for (let k = 0; k < 2 + Math.floor(R() * 2); k++) {
                this._addFeature('spike', ch.x0 + 2 + Math.floor(R() * (w - 4)), ch.y0 + 2 + Math.floor(R() * (h - 4)));
            }
            this._scatter(ch, 'crate', 1);
            return;
        }

        if (ch.kind === 'boss') {
            // 四柱 + 角落木箱，无坑无毒（打 Boss 要公平）
            this._pillars(ch, 2);
            for (const [c, r] of [[ch.x0 + 1, ch.y0 + 1], [ch.x1 - 1, ch.y0 + 1], [ch.x0 + 1, ch.y1 - 1], [ch.x1 - 1, ch.y1 - 1]]) {
                this._addFeature('crate', c, r);
            }
            for (const c of [ch.x0 + 3, ch.x1 - 3]) {
                if (this.tile(c, ch.y0 - 1) === TILE.WALL) this.features.push({ kind: 'torch', c, r: ch.y0 - 1 });
            }
            return;
        }

        // 普通厅：按形状抽 1~2 个地貌模板
        const patterns = ch.shape === 'rect'
            ? ['pillars', 'pool', 'spikes', 'lanes', 'islands', 'ring', 'checker', 'crosswall', 'alcoves']
            : ch.shape === 'round'
                ? ['pool', 'spikes', 'islands', 'ring', 'pillars']
                : ['spikes', 'checker', 'pool'];
        const pickN = 1 + (w * h > 90 && R() < 0.6 ? 1 : 0);
        const chosen = new Set<string>();
        let guard = 0;
        while (chosen.size < pickN && guard++ < 20) chosen.add(patterns[Math.floor(R() * patterns.length)]);

        if (chosen.has('pillars') && w >= 9 && h >= 7) this._pillars(ch, w >= 13 && h >= 9 ? 2 : 1);
        if (chosen.has('pool') && w >= 10 && h >= 7) {
            const rw = Math.max(1, Math.floor((ix1 - ix0) / 4));
            const rh = Math.max(1, Math.floor((iy1 - iy0) / 3));
            for (let r = iy0; r <= iy1; r++) for (let c = ix0; c <= ix1; c++) {
                const nx = (c - ch.cx) / (rw + 0.5);
                const ny = (r - ch.cy) / (rh + 0.5);
                if (nx * nx + ny * ny <= 1) this._setTile(c, r, hazardTile);
            }
        }
        if (chosen.has('spikes')) {
            for (let c = ix0; c <= ix1; c += 2) if (c !== ch.cx) this._addFeature('spike', c, ch.cy);
        }
        if (chosen.has('lanes') && h >= 8) {
            const rows = [ch.y0 + Math.floor(h / 3), ch.y0 + Math.floor((h * 2) / 3)];
            rows.forEach((r, i) => {
                const gapAt = i === 0 ? ix0 + 1 : ix1 - 1;
                for (let c = ix0; c <= ix1; c++) if (Math.abs(c - gapAt) > 1) this._setTile(c, r, TILE.WALL);
            });
        }
        if (chosen.has('islands') && w >= 11 && h >= 7) {
            for (const [fx, fy] of [[0.28, 0.3], [0.72, 0.3], [0.28, 0.7], [0.72, 0.7]]) {
                const c = ch.x0 + Math.round(fx * (w - 1));
                const r = ch.y0 + Math.round(fy * (h - 1));
                for (let dr = 0; dr <= 1; dr++) for (let dc = 0; dc <= 1; dc++) {
                    if (c + dc >= ix0 && c + dc <= ix1 && r + dr >= iy0 && r + dr <= iy1) this._setTile(c + dc, r + dr, hazardTile);
                }
            }
        }
        if (chosen.has('ring') && w >= 11 && h >= 8) {
            // 环沟：中央岛 + 一圈危险地形，留 2 座桥（上下 / 左右）
            const rx = Math.max(2, Math.floor((ix1 - ix0) / 2) - 1);
            const ry = Math.max(2, Math.floor((iy1 - iy0) / 2) - 1);
            const bridgeH = R() < 0.5;
            for (let r = iy0; r <= iy1; r++) for (let c = ix0; c <= ix1; c++) {
                const dx = Math.abs(c - ch.cx);
                const dy = Math.abs(r - ch.cy);
                const onRing = (dx === rx && dy <= ry) || (dy === ry && dx <= rx);
                if (!onRing) continue;
                const isBridge = bridgeH ? (dy === 0 && dx === rx) : (dx === 0 && dy === ry);
                if (isBridge) continue;
                this._setTile(c, r, hazardTile);
            }
            this._addFeature(R() < 0.7 ? 'plate' : 'trap_plate', ch.cx, ch.cy);
        }
        if (chosen.has('checker') && w >= 9 && h >= 7) {
            // 棋盘柱：每 3 格一根单柱
            for (let r = iy0; r <= iy1; r += 3) for (let c = ix0; c <= ix1; c += 3) {
                if (Math.abs(c - ch.cx) <= 1 && Math.abs(r - ch.cy) <= 1) continue;
                this._setTile(c, r, TILE.WALL);
            }
        }
        if (chosen.has('crosswall') && w >= 11 && h >= 9) {
            // 十字墙：中心留 3×3 通口，四象限相通
            for (let c = ix0 + 1; c <= ix1 - 1; c++) if (Math.abs(c - ch.cx) > 1) this._setTile(c, ch.cy, TILE.WALL);
            for (let r = iy0 + 1; r <= iy1 - 1; r++) if (Math.abs(r - ch.cy) > 1) this._setTile(ch.cx, r, TILE.WALL);
        }
        if (chosen.has('alcoves')) {
            // 凹室：上墙挖 2 个 2 宽小龛，里面放箱子
            for (const fc of [0.3, 0.7]) {
                const c = ch.x0 + Math.round(fc * (w - 1));
                const r = ch.y1 + 1;
                if (this.tile(c, r) !== TILE.WALL || this.tile(c + 1, r) !== TILE.WALL) continue;
                if (this.tile(c, r + 1) !== TILE.WALL || this.tile(c + 1, r + 1) !== TILE.WALL) continue;
                if (r >= MAP_ROWS - 2) continue;
                this.tiles[r * MAP_COLS + c] = TILE.FLOOR;
                this.tiles[r * MAP_COLS + c + 1] = TILE.FLOOR;
                this._addFeature('crate', R() < 0.5 ? c : c + 1, r);
            }
        }

        // 木箱：贴内墙 2~4 个（互不相邻）
        const crates = 2 + Math.floor(R() * 3);
        for (let i = 0; i < crates; i++) {
            const alongTop = R() < 0.5;
            const c = ch.x0 + 1 + Math.floor(R() * (w - 2));
            const r = alongTop ? ch.y1 - 1 : ch.y0 + 1;
            this._addFeature('crate', c, r);
        }

        // 机关板：金=宝，紫=陷阱
        if (!chosen.has('ring') && R() < 0.55) {
            const c = ix0 + Math.floor(R() * (ix1 - ix0 + 1));
            const r = iy0 + Math.floor(R() * (iy1 - iy0 + 1));
            this._addFeature(R() < 0.65 ? 'plate' : 'trap_plate', c, r);
        }

        // 墙弩：第 2 层起，左右墙各 ≤1（只贴矩形厅外墙）
        if (ch.shape === 'rect' && opts.floor >= 2 && R() < 0.6) {
            const r = ch.y0 + 1 + Math.floor(R() * (h - 2));
            if (R() < 0.5) {
                if (this.tile(ch.x0 - 1, r) === TILE.WALL) this.features.push({ kind: 'turret', c: ch.x0 - 1, r, dir: 0 });
            } else if (this.tile(ch.x1 + 1, r) === TILE.WALL) {
                this.features.push({ kind: 'turret', c: ch.x1 + 1, r, dir: 2 });
            }
        }

        // 主题装饰（占格 + WorldBridge 圆障碍）
        const props = 1 + Math.floor(R() * 2);
        for (let i = 0; i < props; i++) {
            const c = ix0 + Math.floor(R() * (ix1 - ix0 + 1));
            const r = iy0 + Math.floor(R() * (iy1 - iy0 + 1));
            this._addFeature('prop', c, r, { sizeMul: 0.8 + R() * 0.4 });
        }
    }

    /** 对称石柱：n=1 中央两根；n=2 四角各 2×2 */
    private _pillars(ch: Chamber, n: number) {
        if (n === 1) {
            this._setTile(ch.cx - 2, ch.cy, TILE.WALL);
            this._setTile(ch.cx + 2, ch.cy, TILE.WALL);
            return;
        }
        const qx = Math.max(2, Math.floor((ch.x1 - ch.x0) / 4));
        const qy = Math.max(2, Math.floor((ch.y1 - ch.y0) / 4));
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            const c = ch.cx + sx * qx;
            const r = ch.cy + sy * qy;
            this._setTile(c, r, TILE.WALL);
            this._setTile(c + (sx > 0 ? -1 : 1), r, TILE.WALL);
            this._setTile(c, r + (sy > 0 ? -1 : 1), TILE.WALL);
            this._setTile(c + (sx > 0 ? -1 : 1), r + (sy > 0 ? -1 : 1), TILE.WALL);
        }
    }

    private _ensureConnected(start: Chamber) {
        const dist = new Int16Array(MAP_COLS * MAP_ROWS);
        this._bfs(start.cx, start.cy, dist);
        for (const ch of this.chambers) {
            if (ch === start) continue;
            if (dist[ch.cy * MAP_COLS + ch.cx] >= 0) continue;
            // 硬凿 L 形 3 宽走廊
            for (let c = Math.min(start.cx, ch.cx); c <= Math.max(start.cx, ch.cx); c++) {
                for (let k = -1; k <= 1; k++) {
                    const key = (start.cy + k) * MAP_COLS + c;
                    this.tiles[key] = TILE.FLOOR;
                    this.blocked[key] = 0;
                }
            }
            for (let r = Math.min(start.cy, ch.cy); r <= Math.max(start.cy, ch.cy); r++) {
                for (let k = -1; k <= 1; k++) {
                    const key = r * MAP_COLS + ch.cx + k;
                    this.tiles[key] = TILE.FLOOR;
                    this.blocked[key] = 0;
                }
            }
            this._bfs(start.cx, start.cy, dist);
        }
        // 凿通后可能有 feature 落在被改的格上（箱子格被清 blocked）→ 剔除对应 feature
        this._pruneFeatures();
    }
}
