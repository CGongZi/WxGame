import { _decorator, Component, Graphics, UITransform, Color, Node, Layers } from 'cc';
import { GameFlow } from '../../core/GameFlow';
import { WorldBridge } from '../dungeon/WorldBridge';
import { DungeonLayout, TILE } from '../dungeon/DungeonLayout';
import { MAP_COLS, MAP_ROWS } from '../dungeon/MapConstants';
import { EnemyRegistry } from '../enemy/EnemyRegistry';

const { ccclass } = _decorator;

/**
 * MiniMapUI —— 左上角探索小地图（#131）
 *
 * - 只画探索过的格（进厅整厅点亮、走廊随脚步渐亮），元气骑士式「去过哪就亮哪」。
 * - 标记：玩家（黄）、已探索区域内存活怪（红）、Boss（紫大点）、传送门（绿闪）、宝藏厅机关板（金）。
 * - 地砖层只在 explored 变化时重画（按行合并同色横条）；标记层 10Hz。
 * - 由 HUDManager 挂到 HUD 下（名 MiniMap），大厅/无布局自动隐藏。
 */
@ccclass('MiniMapUI')
export class MiniMapUI extends Component {
    static readonly W = 200;
    static readonly H = 100;

    private _tilesG: Graphics | null = null;
    private _markG: Graphics | null = null;
    private _drawnLayout: DungeonLayout | null = null;
    private _drawnVersion = -1;
    private _drawnChamber = -2;
    private _revealAcc = 0;
    private _markAcc = 0;
    private _blink = 0;

    onLoad() {
        const ui = this.getComponent(UITransform) ?? this.addComponent(UITransform);
        ui.setContentSize(MiniMapUI.W + 12, MiniMapUI.H + 12);
        this.node.layer = Layers.Enum.UI_2D;

        const tiles = new Node('Tiles');
        tiles.layer = Layers.Enum.UI_2D;
        tiles.setParent(this.node);
        tiles.addComponent(UITransform).setContentSize(MiniMapUI.W, MiniMapUI.H);
        this._tilesG = tiles.addComponent(Graphics);

        const marks = new Node('Marks');
        marks.layer = Layers.Enum.UI_2D;
        marks.setParent(this.node);
        marks.addComponent(UITransform).setContentSize(MiniMapUI.W, MiniMapUI.H);
        this._markG = marks.addComponent(Graphics);
        this._paintFrameOnly();
    }

    update(dt: number) {
        const L = DungeonLayout.current;
        const show = GameFlow.isPlaying && !!L;
        // 不动自身 active（否则 update 停掉就再也醒不来）；只藏子层
        const tiles = this._tilesG?.node;
        const marks = this._markG?.node;
        if (tiles && tiles.active !== show) tiles.active = show;
        if (marks && marks.active !== show) marks.active = show;
        if (!show || !L) {
            this._drawnLayout = null;
            return;
        }

        this._revealAcc += dt;
        if (this._revealAcc >= 0.15) {
            this._revealAcc = 0;
            L.revealAround(WorldBridge.x, WorldBridge.y, 4);
        }
        const chamber = L.chamberIndexAt(WorldBridge.x, WorldBridge.y);
        if (L !== this._drawnLayout || L.exploredVersion !== this._drawnVersion || chamber !== this._drawnChamber) {
            this._drawnLayout = L;
            this._drawnVersion = L.exploredVersion;
            this._drawnChamber = chamber;
            this._paintTiles(L, chamber);
        }

        this._markAcc += dt;
        this._blink += dt;
        if (this._markAcc >= 0.1) {
            this._markAcc = 0;
            this._paintMarks(L);
        }
    }

    // ── 坐标 ──

    private static _sx(c: number): number { return -MiniMapUI.W / 2 + (c / MAP_COLS) * MiniMapUI.W; }
    private static _sy(r: number): number { return -MiniMapUI.H / 2 + (r / MAP_ROWS) * MiniMapUI.H; }
    private static _wx(px: number): number { return MiniMapUI._sx(DungeonLayout.colOf(px) + 0.5); }
    private static _wy(py: number): number { return MiniMapUI._sy(DungeonLayout.rowOf(py) + 0.5); }

    private _paintFrameOnly() {
        const g = this._tilesG;
        if (!g) return;
        g.clear();
        const hw = MiniMapUI.W / 2 + 6;
        const hh = MiniMapUI.H / 2 + 6;
        g.fillColor = new Color(10, 8, 8, 200);
        g.roundRect(-hw, -hh, hw * 2, hh * 2, 8); g.fill();
        g.strokeColor = new Color(180, 130, 60, 150);
        g.lineWidth = 1.5;
        g.roundRect(-hw, -hh, hw * 2, hh * 2, 8); g.stroke();
    }

    private _paintTiles(L: DungeonLayout, curChamber: number) {
        const g = this._tilesG;
        if (!g) return;
        this._paintFrameOnly();
        const tw = MiniMapUI.W / MAP_COLS;
        const th = MiniMapUI.H / MAP_ROWS;
        const tint = L.hazardTint;
        const colFloor = new Color(150, 130, 105, 235);
        const colFloorCur = new Color(200, 178, 140, 255);
        const colWall = new Color(60, 50, 48, 255);
        const colWater = tint === 'frost' ? new Color(160, 210, 240, 240) : new Color(70, 120, 200, 240);
        const colLava = tint === 'poison' ? new Color(90, 190, 80, 240) : new Color(220, 90, 40, 240);
        const colPit = new Color(18, 16, 24, 255);

        const ch = curChamber >= 0 ? L.chambers[curChamber] : null;
        const colorOf = (c: number, r: number): Color | null => {
            const k = r * MAP_COLS + c;
            if (!L.explored[k]) return null;
            const t = L.tiles[k];
            if (t === TILE.WALL) return colWall;
            if (t === TILE.WATER) return colWater;
            if (t === TILE.LAVA) return colLava;
            if (t === TILE.PIT) return colPit;
            if (ch && c >= ch.x0 && c <= ch.x1 && r >= ch.y0 && r <= ch.y1) return colFloorCur;
            return colFloor;
        };

        for (let r = 0; r < MAP_ROWS; r++) {
            let c = 0;
            while (c < MAP_COLS) {
                const col = colorOf(c, r);
                if (!col) { c++; continue; }
                let c2 = c + 1;
                while (c2 < MAP_COLS) {
                    const n = colorOf(c2, r);
                    if (!n || n.r !== col.r || n.g !== col.g || n.b !== col.b || n.a !== col.a) break;
                    c2++;
                }
                g.fillColor = col;
                g.rect(MiniMapUI._sx(c), MiniMapUI._sy(r), (c2 - c) * tw, th);
                g.fill();
                c = c2;
            }
        }
    }

    private _paintMarks(L: DungeonLayout) {
        const g = this._markG;
        if (!g) return;
        g.clear();

        // 宝藏厅机关板 / 神龛（已探索）
        for (const f of L.features) {
            if (f.kind !== 'plate' && f.kind !== 'shrine') continue;
            if (!L.explored[f.r * MAP_COLS + f.c]) continue;
            g.fillColor = f.kind === 'shrine'
                ? new Color(180, 120, 255, 230)
                : new Color(255, 215, 90, 230);
            g.rect(MiniMapUI._sx(f.c) - 0.5, MiniMapUI._sy(f.r) - 0.5, 3.5, 3.5);
            g.fill();
        }

        // 传送门（绿闪）
        const portal = WorldBridge.worldLayer?.getChildByName('Portal');
        if (portal?.isValid) {
            const pulse = 0.6 + Math.sin(this._blink * 6) * 0.4;
            g.fillColor = new Color(90, 255, 140, Math.floor(150 + 100 * pulse));
            g.circle(MiniMapUI._wx(portal.position.x), MiniMapUI._wy(portal.position.y), 3 + pulse);
            g.fill();
        }

        // 存活怪（只显示已探索区域）
        for (const e of EnemyRegistry.getAlive()) {
            if (!e.node?.isValid || e.isDead) continue;
            const x = e.node.position.x;
            const y = e.node.position.y;
            const c = DungeonLayout.colOf(x);
            const r = DungeonLayout.rowOf(y);
            if (c < 0 || r < 0 || c >= MAP_COLS || r >= MAP_ROWS) continue;
            if (!L.explored[r * MAP_COLS + c]) continue;
            const isBoss = !!e.node.getComponent('BossEnemy');
            g.fillColor = isBoss ? new Color(220, 90, 255, 255) : new Color(255, 70, 60, 255);
            g.circle(MiniMapUI._wx(x), MiniMapUI._wy(y), isBoss ? 3.6 : 1.9);
            g.fill();
        }

        // 玩家
        const px = MiniMapUI._wx(WorldBridge.x);
        const py = MiniMapUI._wy(WorldBridge.y);
        g.fillColor = new Color(0, 0, 0, 160);
        g.circle(px, py, 3.6); g.fill();
        g.fillColor = new Color(255, 235, 120, 255);
        g.circle(px, py, 2.6); g.fill();
    }
}
