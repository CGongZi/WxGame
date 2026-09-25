import { _decorator, Component, Node, Graphics, Color, UITransform,
         Camera, Widget, Canvas } from 'cc';
import { CameraFollow } from '../camera/CameraFollow';
import { ViewZoom } from '../camera/ViewZoom';
import { WorldBridge } from './WorldBridge';
import { LobbyBootstrap } from '../ui/LobbyBootstrap';
import { MAP_COLS, MAP_ROWS, MAP_TILE, MAP_W, MAP_H, MAP_HALF_W, MAP_HALF_H }
    from './MapConstants';
import { MapThemeDef, ThemeRuntime } from './MapThemes';
import { ThemeAmbient } from '../fx/ThemeAmbient';
import { DungeonLayout, TILE } from './DungeonLayout';
import { spawnHazards, Hazards } from './Hazards';
import { eventBus } from '../../core/EventBus';
import { FlowEvents, GameFlow } from '../../core/GameFlow';
import { ChamberClear } from './ChamberClear';

export { MAP_COLS, MAP_ROWS, MAP_TILE, MAP_W, MAP_H, MAP_HALF_W, MAP_HALF_H };

const { ccclass } = _decorator;

/**
 * FloorRenderer —— 大地图 + WorldLayer
 *
 * ★ 坐标铁律：
 *   WorldBridge.x/y = 玩家世界坐标
 *   cam 钳在地图内 → WorldLayer = (-camX,-camY)
 *   Player 本地 = (x-camX, y-camY)；中央居中，贴边移向屏幕边缘
 *   Camera 钉在 Canvas (0,0)；orthoHeight 由 ViewZoom 管理（大厅近 / 开战远）
 *   障碍物只挂 WorldLayer，经 WorldBridge.addObstacle 注册碰撞
 */
@ccclass('FloorRenderer')
export class FloorRenderer extends Component {

    /** DungeonManager 换房时调用 applyTheme */
    static I: FloorRenderer | null = null;

    private _cam:     Camera | null = null;
    private _canvas:  Canvas | null = null;
    private _camNode: Node   | null = null;
    private _appliedThemeId: string | null = null;

    onLoad() {
        const canvasNode = this.node.parent;
        // 无父节点时不登记 I，避免 DungeonManager 调到半初始化实例
        if (!canvasNode) return;
        FloorRenderer.I = this;

        this._setupViewport(canvasNode);

        const worldLayer = this._buildWorldLayer(canvasNode);
        WorldBridge.worldLayer = worldLayer;
        WorldBridge.clearObstacles();
        WorldBridge.reset(0, 0);

        // 只把世界内容挪进 WorldLayer —— Player / HUD / Joystick 留在 Canvas
        const moveIn = (name: string) => {
            const n = canvasNode.getChildByName(name);
            if (n) {
                n.setParent(worldLayer);
                // Floor/Room/EnemyLayer 自身原点对齐世界原点
                if (name !== 'Player') n.setPosition(0, 0, 0);
            }
        };
        this.node.setParent(worldLayer);
        this.node.setPosition(0, 0, 0);
        moveIn('Room');
        moveIn('EnemyLayer');
        moveIn('DamageNumbers');
        moveIn('BulletLayer');
        moveIn('WeaponLayer');
        // ★ 绝不 moveIn('Player')

        // 确保 Player 在 Canvas 下且在 (0,0)
        const player = canvasNode.getChildByName('Player');
        if (player) {
            player.setParent(canvasNode);
            player.setPosition(0, 0, 0);
            // Player 渲染在 WorldLayer 之上、HUD 之下
            const hud = canvasNode.getChildByName('HUD');
            if (hud) player.setSiblingIndex(Math.max(0, hud.getSiblingIndex() - 1));
        }

        const ui = this.getComponent(UITransform) ?? this.addComponent(UITransform);
        ui.setContentSize(MAP_W, MAP_H);
        const g = this.getComponent(Graphics) ?? this.addComponent(Graphics);

        // 默认主题占位；DungeonManager._loadRoom 会 applyTheme 重画
        const theme = ThemeRuntime.currentTheme;
        this._drawFloor(g, theme);
        this._drawTerrain(worldLayer, theme);
        ThemeAmbient.attach(worldLayer, theme.id);
        this._appliedThemeId = theme.id;

        // 主界面兜底：不依赖 HUDManager（Missing Script 时仍能进 Lobby）
        if (!canvasNode.getComponent(LobbyBootstrap)) {
            canvasNode.addComponent(LobbyBootstrap);
        }

        // 回大厅：丢掉瓦片布局，恢复开阔大厅地面
        eventBus.on(FlowEvents.STATE, this._onFlowState, this);

        console.log('[FloorRenderer] 就绪（边界钳制滚动） theme=', theme.id);
    }

    onDestroy() {
        eventBus.off(FlowEvents.STATE, this._onFlowState, this);
        if (FloorRenderer.I === this) FloorRenderer.I = null;
    }

    private _onFlowState(d: { state: string }) {
        if (d?.state !== 'lobby' || !DungeonLayout.current) return;
        DungeonLayout.clear();
        Hazards.resetTips();
        this.applyTheme(ThemeRuntime.currentTheme.id, true);
    }

    /**
     * 换主题 / 换房：清旧障碍节点 + 碰撞表，按主题（和当前 DungeonLayout）重画地板与地形。
     * 有瓦片布局时每房必重建（布局不同）；无布局时同主题 id 不重复重建；force 强制。
     * @returns true 表示主题 id 发生了变化（调用方据此弹主题提示）
     */
    applyTheme(themeId: string, force = false): boolean {
        const theme = ThemeRuntime.getTheme(themeId);
        ThemeRuntime.currentTheme = theme;
        const changed = this._appliedThemeId !== theme.id;
        if (!force && !changed && !DungeonLayout.current) {
            return false;
        }

        const worldLayer = WorldBridge.worldLayer;
        if (worldLayer?.isValid) {
            this._clearTerrainNodes(worldLayer);
            ThemeAmbient.clear(worldLayer);
        }
        WorldBridge.clearObstacles();

        const g = this.getComponent(Graphics);
        if (g) {
            g.clear();
            this._drawFloor(g, theme);
        }
        if (worldLayer?.isValid) {
            this._drawTerrain(worldLayer, theme);
            ThemeAmbient.attach(worldLayer, theme.id);
        }

        this._appliedThemeId = theme.id;
        console.log(`[FloorRenderer] applyTheme → ${theme.emoji} ${theme.name} (${theme.id})` +
                    (force ? ' [force]' : '') + (DungeonLayout.current ? ' [tiles]' : ''));
        return changed;
    }

    /** 当前已应用主题 id（供 HUD / 调试） */
    get appliedThemeId(): string | null {
        return this._appliedThemeId;
    }

    lateUpdate(dt: number) {
        WorldBridge.tick(dt);
        if (GameFlow.isPlaying) ChamberClear.tick(dt);
        // 每帧钉死 Camera 位置；ortho 只跟 ViewZoom.target（开战可拉高）
        if (this._camNode) {
            const p = this._camNode.position;
            if (p.x !== 0 || p.y !== 0) this._camNode.setPosition(0, 0, p.z);
        }
        // 漂移纠正必须走 ViewZoom.applyOrtho（同步 WorldBridge.setViewHalf），禁止只改 cam
        const want = ViewZoom.targetOrtho;
        if (this._cam && !ViewZoom.isTweening && Math.abs(this._cam.orthoHeight - want) > 0.05) {
            ViewZoom.applyOrtho(want);
        }
        if (this._canvas) this._canvas.alignCanvasWithScreen = false;

        // Player：中央时 (0,0)；贴边时移向屏幕边缘（由 WorldBridge 计算）
        const canvas = this._canvas?.node;
        const player = canvas?.getChildByName('Player');
        WorldBridge.syncPlayerNode(player);

        // WorldLayer 跟摄像机焦点（已在 tryMove/_apply 里更新；此处兜底）
        if (WorldBridge.worldLayer?.isValid) {
            const wl = WorldBridge.worldLayer.position;
            if (wl.x !== -WorldBridge.camX || wl.y !== -WorldBridge.camY) {
                WorldBridge.worldLayer.setPosition(-WorldBridge.camX, -WorldBridge.camY, 0);
            }
        }
    }

    private _setupViewport(canvasNode: Node) {
        const widget = canvasNode.getComponent(Widget);
        if (widget) widget.enabled = false;

        this._canvas = canvasNode.getComponent(Canvas);
        if (this._canvas) this._canvas.alignCanvasWithScreen = false;

        this._camNode = canvasNode.getChildByName('Camera');
        this._cam = this._camNode?.getComponent(Camera) ?? null;

        if (this._camNode) {
            // 彻底拆掉旧跟随组件
            this._camNode.getComponents(CameraFollow).forEach(c => {
                c.enabled = false;
                c.destroy();
            });
            this._camNode.setPosition(0, 0, this._camNode.position.z || 1000);
        }
        // 唯一 ortho 入口：无相机时 applyOrtho 仍同步 WorldBridge.viewHalf
        ViewZoom.snapLobby();
    }

    private _buildWorldLayer(canvasNode: Node): Node {
        let wl = canvasNode.getChildByName('WorldLayer');
        if (wl) return wl;

        wl = new Node('WorldLayer');
        wl.setParent(canvasNode);
        wl.setPosition(0, 0, 0);
        wl.addComponent(UITransform).setContentSize(MAP_W, MAP_H);
        wl.setSiblingIndex(0); // 最底层
        return wl;
    }

    private _clearTerrainNodes(worldLayer: Node) {
        const doomed: Node[] = [];
        for (const child of worldLayer.children) {
            const n = child.name;
            if (n.startsWith('Obstacle_')
                || n.startsWith('Cluster_')
                || n.startsWith('CornerRock')
                || n.startsWith('Hazard_')
                || n.startsWith('Prop_')
                || n.startsWith('Ring_') || n.startsWith('Root_') || n.startsWith('Crystal_')
                || n.startsWith('Isle_') || n.startsWith('Rock_') || n.startsWith('Corner_')
                || n === 'ThemeAmbient') {
                doomed.push(child);
            }
        }
        // 先摘掉再 destroy：避免同帧重建时旧节点仍挂在 WorldLayer 下
        for (const n of doomed) {
            if (!n.isValid) continue;
            n.removeFromParent();
            n.destroy();
        }
    }

    private _drawFloor(g: Graphics, theme: MapThemeDef) {
        const L = DungeonLayout.current;
        if (L) {
            this._drawTiles(g, theme, L);
            return;
        }
        const ox = -MAP_HALF_W;
        const oy = -MAP_HALF_H;
        for (let r = 0; r < MAP_ROWS; r++) {
            for (let c = 0; c < MAP_COLS; c++) {
                const x = ox + c * MAP_TILE;
                const y = oy + r * MAP_TILE;
                g.fillColor = theme.floorEdge;
                g.rect(x, y, MAP_TILE, MAP_TILE); g.fill();
                g.fillColor = (r + c) % 2 === 0 ? theme.floorDark : theme.floorLight;
                g.rect(x + 1, y + 1, MAP_TILE - 2, MAP_TILE - 2); g.fill();
                g.fillColor = theme.floorShine;
                g.rect(x + 1, y + MAP_TILE - 4, MAP_TILE - 2, 3); g.fill();
            }
        }
        g.strokeColor = theme.borderColor;
        g.lineWidth = 8;
        g.rect(-MAP_HALF_W, -MAP_HALF_H, MAP_W, MAP_H); g.stroke();
        this._paintDressing(g, theme);
    }

    /** 画在地板上的主题装饰，不占碰撞。 */
    private _paintDressing(g: Graphics, theme: MapThemeDef) {
        const rng = (a: number, b: number) => a + Math.random() * (b - a);
        // 主题 id 优先：同 obstacleStyle 的火山/虚空要能一眼区分
        if (theme.id === 'volcano') {
            g.fillColor = new Color(200, 50, 20, 55);
            for (let i = 0; i < 12; i++) {
                const x = rng(-MAP_HALF_W + 120, MAP_HALF_W - 120);
                const y = rng(-MAP_HALF_H + 120, MAP_HALF_H - 120);
                g.ellipse(x, y, 26 + Math.random() * 40, 16 + Math.random() * 22); g.fill();
            }
            g.strokeColor = new Color(255, 140, 40, 70);
            g.lineWidth = 2;
            for (let i = 0; i < 10; i++) {
                const x = rng(-MAP_HALF_W + 100, MAP_HALF_W - 100);
                const y = rng(-MAP_HALF_H + 100, MAP_HALF_H - 100);
                g.moveTo(x, y);
                g.lineTo(x + rng(-50, 50), y + rng(-20, 20));
                g.lineTo(x + rng(-30, 40), y + rng(-35, 10));
                g.stroke();
            }
            return;
        }
        if (theme.id === 'abyss') {
            g.strokeColor = new Color(140, 90, 220, 70);
            g.lineWidth = 2.5;
            for (let i = 0; i < 4; i++) {
                const rad = 200 + i * 160;
                g.arc(0, 0, rad, 0.2, 1.8, false); g.stroke();
                g.arc(0, 0, rad, 3.2, 5.0, false); g.stroke();
            }
            g.fillColor = new Color(40, 20, 70, 50);
            for (let i = 0; i < 10; i++) {
                const x = rng(-MAP_HALF_W + 100, MAP_HALF_W - 100);
                const y = rng(-MAP_HALF_H + 100, MAP_HALF_H - 100);
                g.circle(x, y, 18 + Math.random() * 28); g.fill();
            }
            return;
        }
        if (theme.id === 'necropolis') {
            g.fillColor = new Color(40, 42, 38, 70);
            for (let i = 0; i < 8; i++) {
                const x = rng(-MAP_HALF_W + 120, MAP_HALF_W - 120);
                const y = rng(-MAP_HALF_H + 120, MAP_HALF_H - 120);
                g.roundRect(x - 10, y - 18, 20, 36, 3); g.fill();
            }
            g.fillColor = new Color(140, 180, 120, 45);
            for (let i = 0; i < 12; i++) {
                const x = rng(-MAP_HALF_W + 100, MAP_HALF_W - 100);
                const y = rng(-MAP_HALF_H + 100, MAP_HALF_H - 100);
                g.ellipse(x, y, 22 + Math.random() * 30, 14 + Math.random() * 18); g.fill();
            }
            return;
        }
        if (theme.obstacleStyle === 'root') {
            g.fillColor = new Color(20, 60, 40, 90);
            for (let i = 0; i < 14; i++) {
                const x = rng(-MAP_HALF_W + 120, MAP_HALF_W - 120);
                const y = rng(-MAP_HALF_H + 120, MAP_HALF_H - 120);
                g.circle(x, y, 28 + Math.random() * 36); g.fill();
            }
            // 深绿涟漪圈，配合 ThemeAmbient 冒泡
            g.strokeColor = new Color(50, 140, 80, 70);
            g.lineWidth = 2;
            for (let i = 0; i < 8; i++) {
                const x = rng(-MAP_HALF_W + 140, MAP_HALF_W - 140);
                const y = rng(-MAP_HALF_H + 140, MAP_HALF_H - 140);
                g.circle(x, y, 20 + Math.random() * 30); g.stroke();
            }
            return;
        }
        if (theme.obstacleStyle === 'pillar') {
            g.strokeColor = new Color(theme.obstacleLight.r, theme.obstacleLight.g, theme.obstacleLight.b, 80);
            g.lineWidth = 3;
            for (let i = 0; i < 3; i++) {
                const rad = 220 + i * 180;
                g.arc(0, 0, rad, 0.4, 2.2, false); g.stroke();
                g.arc(0, 0, rad, 3.4, 5.4, false); g.stroke();
            }
            return;
        }
        if (theme.obstacleStyle === 'crystal') {
            g.fillColor = new Color(180, 220, 255, 35);
            for (let i = 0; i < 12; i++) {
                const x = rng(-MAP_HALF_W + 100, MAP_HALF_W - 100);
                const y = rng(-MAP_HALF_H + 100, MAP_HALF_H - 100);
                g.moveTo(x, y + 18); g.lineTo(x + 8, y); g.lineTo(x, y - 10); g.lineTo(x - 8, y);
                g.close(); g.fill();
            }
            g.strokeColor = new Color(200, 240, 255, 50);
            g.lineWidth = 1.5;
            for (let i = 0; i < 8; i++) {
                const x = rng(-MAP_HALF_W + 80, MAP_HALF_W - 80);
                const y = rng(-MAP_HALF_H + 80, MAP_HALF_H - 80);
                g.moveTo(x - 30, y); g.lineTo(x + 30, y + rng(-6, 6)); g.stroke();
            }
            return;
        }
        if (theme.obstacleStyle === 'cloud') {
            g.fillColor = new Color(255, 255, 255, 28);
            for (let i = 0; i < 16; i++) {
                const x = rng(-MAP_HALF_W + 80, MAP_HALF_W - 80);
                const y = rng(-MAP_HALF_H + 80, MAP_HALF_H - 80);
                g.ellipse(x, y, 40 + Math.random() * 50, 18 + Math.random() * 16); g.fill();
            }
            return;
        }
        if (theme.id === 'clockwork' || theme.obstacleStyle === 'gear') {
            g.fillColor = new Color(40, 28, 16, 70);
            for (let i = 0; i < 10; i++) {
                const x = rng(-MAP_HALF_W + 100, MAP_HALF_W - 100);
                const y = rng(-MAP_HALF_H + 100, MAP_HALF_H - 100);
                g.ellipse(x, y, 28 + Math.random() * 36, 10 + Math.random() * 14); g.fill();
            }
            g.strokeColor = new Color(255, 170, 60, 55);
            g.lineWidth = 2;
            for (let i = 0; i < 8; i++) {
                const x = rng(-MAP_HALF_W + 120, MAP_HALF_W - 120);
                const y = rng(-MAP_HALF_H + 120, MAP_HALF_H - 120);
                g.circle(x, y, 18 + Math.random() * 22); g.stroke();
            }
            g.fillColor = new Color(180, 120, 40, 40);
            for (let i = 0; i < 14; i++) {
                const x = rng(-MAP_HALF_W + 80, MAP_HALF_W - 80);
                const y = rng(-MAP_HALF_H + 80, MAP_HALF_H - 80);
                g.circle(x, y, 3); g.fill();
            }
            return;
        }
        g.strokeColor = new Color(theme.obstacleDark.r, theme.obstacleDark.g, theme.obstacleDark.b, 140);
        g.lineWidth = 2;
        for (let i = 0; i < 14; i++) {
            const x = rng(-MAP_HALF_W + 80, MAP_HALF_W - 80);
            const y = rng(-MAP_HALF_H + 80, MAP_HALF_H - 80);
            g.moveTo(x, y);
            g.lineTo(x + rng(-40, 40), y + rng(-18, 18));
            g.lineTo(x + rng(-20, 50), y + rng(-30, 10));
            g.stroke();
        }
    }

    /**
     * #125 瓦片地牢：墙 / 坑 / 水 / 熔岩按邻接关系画立面与边沿，
     * 一眼分清「能走 / 不能走 / 会掉 / 会疼」。
     */
    private _drawTiles(g: Graphics, theme: MapThemeDef, L: DungeonLayout) {
        const ox = -MAP_HALF_W;
        const oy = -MAP_HALF_H;
        const T = MAP_TILE;
        const dark = theme.obstacleDark;
        const mid = theme.obstacleMid;
        const light = theme.obstacleLight;
        const deep = new Color(Math.round(dark.r * 0.45), Math.round(dark.g * 0.45), Math.round(dark.b * 0.5), 255);
        const tint = L.hazardTint;
        const hazA = tint === 'poison' ? new Color(50, 120, 50, 255) : new Color(190, 60, 20, 255);
        const hazB = tint === 'poison' ? new Color(120, 220, 90, 255) : new Color(255, 150, 50, 255);
        const waterA = tint === 'frost' ? new Color(150, 200, 235, 255) : new Color(40, 80, 140, 255);
        const waterB = tint === 'frost' ? new Color(220, 245, 255, 255) : new Color(90, 150, 210, 255);

        // 云海：先整张铺一层虚空底色（深处坑格不再逐格画）
        if (L.archetype === 'islands') {
            g.fillColor = new Color(10, 8, 20, 255);
            g.rect(ox, oy, MAP_W, MAP_H); g.fill();
        }

        // 第一遍：地板 / 危险地形
        for (let r = 0; r < MAP_ROWS; r++) {
            for (let c = 0; c < MAP_COLS; c++) {
                const t = L.tile(c, r);
                const x = ox + c * T;
                const y = oy + r * T;
                if (t === TILE.WALL) continue;
                if (t === TILE.FLOOR) {
                    g.fillColor = theme.floorEdge;
                    g.rect(x, y, T, T); g.fill();
                    g.fillColor = (r + c) % 2 === 0 ? theme.floorDark : theme.floorLight;
                    g.rect(x + 1, y + 1, T - 2, T - 2); g.fill();
                    g.fillColor = theme.floorShine;
                    g.rect(x + 1, y + T - 4, T - 2, 3); g.fill();
                    continue;
                }
                if (t === TILE.PIT) {
                    // 云海：岛外整片虚空，四邻都是坑的格只留星点，不逐格铺矩形
                    const deepVoid = L.archetype === 'islands'
                        && L.tile(c + 1, r) === TILE.PIT && L.tile(c - 1, r) === TILE.PIT
                        && L.tile(c, r + 1) === TILE.PIT && L.tile(c, r - 1) === TILE.PIT;
                    if (deepVoid) {
                        if ((c * 7 + r * 13) % 6 === 0) {
                            g.fillColor = new Color(200, 210, 255, 90);
                            g.circle(x + 10 + (c % 4) * 9, y + 8 + (r % 4) * 9, 1.4); g.fill();
                        }
                        continue;
                    }
                    g.fillColor = new Color(8, 6, 14, 255);
                    g.rect(x, y, T, T); g.fill();
                    // 上沿投影（北侧是地板 → 深度感）
                    if (L.tile(c, r + 1) !== TILE.PIT) {
                        g.fillColor = new Color(30, 22, 44, 255);
                        g.rect(x, y + T - 10, T, 10); g.fill();
                    }
                    if (tint === 'void' && (c * 7 + r * 13) % 5 === 0) {
                        g.fillColor = new Color(160, 120, 255, 120);
                        g.circle(x + 12 + (c % 3) * 10, y + 10 + (r % 3) * 9, 1.6); g.fill();
                    }
                    continue;
                }
                if (t === TILE.WATER) {
                    g.fillColor = waterA;
                    g.rect(x, y, T, T); g.fill();
                    g.fillColor = waterB;
                    g.rect(x + 6, y + 8 + ((c + r) % 3) * 8, 16, 2); g.fill();
                    g.rect(x + 26, y + 26 - ((c + r) % 2) * 8, 14, 2); g.fill();
                    continue;
                }
                if (t === TILE.LAVA) {
                    g.fillColor = hazA;
                    g.rect(x, y, T, T); g.fill();
                    g.fillColor = hazB;
                    g.circle(x + 14 + ((c * 3) % 12), y + 16 + ((r * 5) % 10), 5); g.fill();
                    g.circle(x + 32 - ((r * 3) % 8), y + 32 - ((c * 5) % 10), 3.5); g.fill();
                    continue;
                }
            }
        }

        // 第二遍：墙（只画贴着可走格的一圈 + 深处填充，避免 3200 格全画砖）
        for (let r = 0; r < MAP_ROWS; r++) {
            for (let c = 0; c < MAP_COLS; c++) {
                if (L.tile(c, r) !== TILE.WALL) continue;
                const x = ox + c * T;
                const y = oy + r * T;
                const n = L.tile(c, r + 1) !== TILE.WALL;
                const s = L.tile(c, r - 1) !== TILE.WALL;
                const e = L.tile(c + 1, r) !== TILE.WALL;
                const w = L.tile(c - 1, r) !== TILE.WALL;
                const exposed = n || s || e || w
                    || L.tile(c + 1, r + 1) !== TILE.WALL || L.tile(c - 1, r + 1) !== TILE.WALL
                    || L.tile(c + 1, r - 1) !== TILE.WALL || L.tile(c - 1, r - 1) !== TILE.WALL;
                if (!exposed) {
                    g.fillColor = deep;
                    g.rect(x, y, T, T); g.fill();
                    continue;
                }
                // 墙顶
                g.fillColor = dark;
                g.rect(x, y, T, T); g.fill();
                g.fillColor = mid;
                g.rect(x + 2, y + 2, T - 4, T - 4); g.fill();
                // 砖缝
                g.fillColor = dark;
                g.rect(x + 2, y + T / 2 - 1, T - 4, 2); g.fill();
                g.rect(x + T / 2 - 1, y + 2, 2, T / 2 - 3); g.fill();
                g.rect(x + T / 4 - 1, y + T / 2 + 1, 2, T / 2 - 3); g.fill();
                g.rect(x + (T * 3) / 4 - 1, y + T / 2 + 1, 2, T / 2 - 3); g.fill();
                // 朝南立面（南边是可走格 → 画一条更亮的墙脚线，像有厚度）
                if (s) {
                    g.fillColor = light;
                    g.rect(x, y, T, 5); g.fill();
                    g.fillColor = new Color(0, 0, 0, 90);
                    g.rect(x, y - 6, T, 6); g.fill();
                }
                if (n) {
                    g.fillColor = light;
                    g.rect(x, y + T - 3, T, 3); g.fill();
                }
                if (e) { g.fillColor = light; g.rect(x + T - 3, y, 3, T); g.fill(); }
                if (w) { g.fillColor = light; g.rect(x, y, 3, T); g.fill(); }
            }
        }

        g.strokeColor = theme.borderColor;
        g.lineWidth = 8;
        g.rect(-MAP_HALF_W, -MAP_HALF_H, MAP_W, MAP_H); g.stroke();
    }

    /** 布局模式：主题装饰按 features.prop 放，机关交给 Hazards */
    private _drawLayoutTerrain(worldLayer: Node, theme: MapThemeDef, L: DungeonLayout) {
        let i = 0;
        for (const f of L.features) {
            if (f.kind !== 'prop') continue;
            const x = DungeonLayout.tileX(f.c);
            const y = DungeonLayout.tileY(f.r);
            // #128 布局模式装饰限尺：半径 ≤26，保证相邻格中心(48px)对 20 半径单位可过
            const size = Math.min(56, this._obstacleSize(theme.obstacleStyle) * (f.sizeMul ?? 1));
            this._placeObstacle(worldLayer, `Prop_${i++}`, x, y, size, theme);
        }
        spawnHazards(worldLayer, L);
    }

    private _drawTerrain(worldLayer: Node, theme: MapThemeDef) {
        const L = DungeonLayout.current;
        if (L) {
            this._drawLayoutTerrain(worldLayer, theme, L);
            return;
        }
        const rng = (a: number, b: number) => a + Math.random() * (b - a);
        const count = theme.obstacleCount;
        const blocked = (x: number, y: number) => Math.hypot(x, y) < 280 || Math.abs(x) < 120;

        const place = (name: string, ox: number, oy: number, sizeMul = 1) => {
            if (blocked(ox, oy)) return;
            const size = this._obstacleSize(theme.obstacleStyle) * sizeMul;
            this._placeObstacle(worldLayer, name, ox, oy, size, theme);
        };

        // 主题布局差异：同样是障碍，站位节奏不同 → 可玩性拉开
        if (theme.obstacleStyle === 'pillar') {
            // 遗迹：双环柱林，中间留战斗空地
            for (let ring = 0; ring < 2; ring++) {
                const rad = 380 + ring * 260;
                const n = 8 + ring * 4;
                for (let i = 0; i < n; i++) {
                    const a = (i / n) * Math.PI * 2 + ring * 0.2;
                    place(`Ring_${ring}_${i}`, Math.cos(a) * rad, Math.sin(a) * rad, ring === 0 ? 1.15 : 0.9);
                }
            }
        } else if (theme.obstacleStyle === 'root') {
            // 沼泽：纵向泥廊，两侧树根挤道
            for (let i = 0; i < count; i++) {
                const lane = i % 2 === 0 ? -1 : 1;
                const ox = lane * rng(220, 520) + rng(-40, 40);
                const oy = rng(-MAP_HALF_H + 100, MAP_HALF_H - 100);
                place(`Root_${i}`, ox, oy, 0.9 + (i % 3) * 0.15);
            }
        } else if (theme.obstacleStyle === 'crystal') {
            // 冰原：斜向晶带，制造滑行走廊
            for (let band = 0; band < 3; band++) {
                const base = -420 + band * 420;
                for (let i = 0; i < Math.ceil(count / 3); i++) {
                    const t = i / Math.max(1, Math.ceil(count / 3) - 1);
                    const ox = base + t * 280 + rng(-30, 30);
                    const oy = -MAP_HALF_H + 160 + t * (MAP_H - 320) + rng(-40, 40);
                    place(`Crystal_${band}_${i}`, ox, oy, 0.85 + (i % 2) * 0.25);
                }
            }
        } else if (theme.obstacleStyle === 'cloud') {
            // 云海：浮岛团簇，岛间空隙宽
            for (let c = 0; c < 5; c++) {
                const ang = (c / 5) * Math.PI * 2 + 0.3;
                const cx = Math.cos(ang) * rng(420, 900);
                const cy = Math.sin(ang) * rng(320, 700);
                for (let k = 0; k < 4; k++) {
                    place(`Isle_${c}_${k}`, cx + rng(-90, 90), cy + rng(-70, 70), k === 0 ? 1.4 : 0.7);
                }
            }
        } else {
            // 洞穴：散落岩 + 侧翼岩墙簇
            for (let i = 0; i < count; i++) {
                let ox = 0, oy = 0, guard = 0;
                do {
                    ox = rng(-MAP_HALF_W + 80, MAP_HALF_W - 80);
                    oy = rng(-MAP_HALF_H + 80, MAP_HALF_H - 80);
                    guard++;
                } while (blocked(ox, oy) && guard < 12);
                place(`Rock_${i}`, ox, oy);
            }
            for (let c = 0; c < 4; c++) {
                const side = c % 2 === 0 ? -1 : 1;
                const cx = side * rng(480, 1100);
                const cy = rng(-700, 700);
                for (let k = 0; k < 3; k++) {
                    place(`Cluster_${c}_${k}`, cx + rng(-70, 70), cy + rng(-70, 70), k === 0 ? 1.35 : 0.75);
                }
            }
        }

        const corners = [
            [-MAP_HALF_W + 200, -MAP_HALF_H + 200],
            [ MAP_HALF_W - 200, -MAP_HALF_H + 200],
            [-MAP_HALF_W + 200,  MAP_HALF_H - 200],
            [ MAP_HALF_W - 200,  MAP_HALF_H - 200],
        ];
        corners.forEach(([cx, cy], ci) => {
            for (let j = 0; j < theme.cornerCount; j++) {
                place(`Corner_${ci}_${j}`, cx + rng(-60, 60), cy + rng(-60, 60), 0.85);
            }
        });
    }

    private _placeObstacle(worldLayer: Node, name: string, ox: number, oy: number, size: number, theme: MapThemeDef) {
        const node = new Node(name);
        node.setParent(worldLayer);
        node.setPosition(ox, oy, 0);
        this._drawObstacle(node, size, theme);
        WorldBridge.addObstacle(ox, oy, DungeonLayout.current ? Math.min(26, size * 0.45) : size * 0.45);
    }

    private _obstacleSize(style: MapThemeDef['obstacleStyle']): number {
        switch (style) {
            case 'pillar':  return 28 + Math.random() * 22;
            case 'root':    return 32 + Math.random() * 28;
            case 'crystal': return 30 + Math.random() * 26;
            case 'cloud':   return 36 + Math.random() * 28;
            case 'gear':    return 34 + Math.random() * 26;
            default:        return 40 + Math.random() * 30;
        }
    }

    private _drawObstacle(node: Node, size: number, theme: MapThemeDef) {
        switch (theme.obstacleStyle) {
            case 'pillar':  this._drawPillar(node, size, theme); break;
            case 'root':    this._drawRoot(node, size, theme); break;
            case 'crystal': this._drawCrystal(node, size, theme); break;
            case 'cloud':   this._drawCloud(node, size, theme); break;
            case 'gear':    this._drawGear(node, size, theme); break;
            default:        this._drawRock(node, size, theme); break;
        }
    }

    private _drawRock(node: Node, size: number, theme: MapThemeDef) {
        const s = Math.round(size);
        node.addComponent(UITransform).setContentSize(s, s);
        const g = node.addComponent(Graphics);
        const h = s / 2;
        g.fillColor = theme.obstacleDark;
        g.moveTo(-h * 0.9, -h * 0.5); g.lineTo(-h * 0.4, -h * 0.9);
        g.lineTo(h * 0.5, -h * 0.8); g.lineTo(h * 0.9, -h * 0.2);
        g.lineTo(h * 0.7, h * 0.6); g.lineTo(-h * 0.2, h * 0.8);
        g.lineTo(-h * 0.8, h * 0.4); g.close(); g.fill();
        g.fillColor = theme.obstacleMid;
        g.moveTo(-h * 0.8, -h * 0.4); g.lineTo(-h * 0.3, -h * 0.8);
        g.lineTo(h * 0.4, -h * 0.7); g.lineTo(h * 0.8, -h * 0.1);
        g.lineTo(h * 0.6, h * 0.5); g.lineTo(-h * 0.1, h * 0.7);
        g.lineTo(-h * 0.7, h * 0.3); g.close(); g.fill();
    }

    private _drawPillar(node: Node, size: number, theme: MapThemeDef) {
        const s = Math.round(size);
        node.addComponent(UITransform).setContentSize(s, s * 1.6);
        const g = node.addComponent(Graphics);
        const hw = s / 2, hh = s * 0.8;
        g.fillColor = theme.obstacleDark;
        g.rect(-hw - 4, -hh, (hw + 4) * 2, 12); g.fill();
        g.fillColor = theme.obstacleMid;
        g.rect(-hw, -hh + 10, hw * 2, hh * 2 - 20); g.fill();
        g.fillColor = theme.obstacleLight;
        g.roundRect(-hw - 2, hh - 14, (hw + 2) * 2, 14, 3); g.fill();
    }

    private _drawRoot(node: Node, size: number, theme: MapThemeDef) {
        const s = Math.round(size);
        node.addComponent(UITransform).setContentSize(s * 1.4, s * 1.2);
        const g = node.addComponent(Graphics);
        const h = s / 2;
        // 主干
        g.fillColor = theme.obstacleDark;
        g.moveTo(-h * 0.2, -h * 0.9);
        g.lineTo(h * 0.15, -h * 0.5);
        g.lineTo(h * 0.1, h * 0.9);
        g.lineTo(-h * 0.15, h * 0.85);
        g.close(); g.fill();
        // 左叉根
        g.fillColor = theme.obstacleMid;
        g.moveTo(-h * 0.15, h * 0.1);
        g.lineTo(-h * 0.95, -h * 0.15);
        g.lineTo(-h * 0.85, h * 0.15);
        g.lineTo(-h * 0.05, h * 0.35);
        g.close(); g.fill();
        // 右叉根
        g.fillColor = theme.obstacleLight;
        g.moveTo(h * 0.05, h * 0.2);
        g.lineTo(h * 0.9, h * 0.55);
        g.lineTo(h * 0.7, h * 0.75);
        g.lineTo(0, h * 0.45);
        g.close(); g.fill();
    }

    private _drawCrystal(node: Node, size: number, theme: MapThemeDef) {
        const s = Math.round(size);
        node.addComponent(UITransform).setContentSize(s, s * 1.3);
        const g = node.addComponent(Graphics);
        const h = s / 2;
        g.fillColor = theme.obstacleDark;
        g.moveTo(0, -h * 1.1);
        g.lineTo(h * 0.55, -h * 0.15);
        g.lineTo(h * 0.35, h * 0.95);
        g.lineTo(-h * 0.35, h * 0.95);
        g.lineTo(-h * 0.55, -h * 0.15);
        g.close(); g.fill();
        g.fillColor = theme.obstacleMid;
        g.moveTo(0, -h * 0.95);
        g.lineTo(h * 0.35, -h * 0.1);
        g.lineTo(h * 0.2, h * 0.7);
        g.lineTo(-h * 0.05, h * 0.55);
        g.close(); g.fill();
        g.fillColor = theme.obstacleLight;
        g.moveTo(-h * 0.15, -h * 0.4);
        g.lineTo(h * 0.05, -h * 0.7);
        g.lineTo(h * 0.12, -h * 0.25);
        g.close(); g.fill();
    }

    private _drawCloud(node: Node, size: number, theme: MapThemeDef) {
        const s = Math.round(size);
        node.addComponent(UITransform).setContentSize(s * 1.6, s);
        const g = node.addComponent(Graphics);
        const h = s / 2;
        g.fillColor = theme.obstacleDark;
        g.ellipse(-h * 0.35, 0, h * 0.7, h * 0.45); g.fill();
        g.ellipse(h * 0.35, 0, h * 0.75, h * 0.5); g.fill();
        g.ellipse(0, h * 0.25, h * 0.85, h * 0.55); g.fill();
        g.fillColor = theme.obstacleMid;
        g.ellipse(-h * 0.25, h * 0.1, h * 0.55, h * 0.35); g.fill();
        g.ellipse(h * 0.3, h * 0.05, h * 0.6, h * 0.38); g.fill();
        g.fillColor = theme.obstacleLight;
        g.ellipse(0, h * 0.28, h * 0.45, h * 0.28); g.fill();
    }

    private _drawGear(node: Node, size: number, theme: MapThemeDef) {
        const s = Math.round(size);
        node.addComponent(UITransform).setContentSize(s * 1.2, s * 1.2);
        const g = node.addComponent(Graphics);
        const R = s * 0.42;
        const teeth = 8;
        g.fillColor = theme.obstacleDark;
        for (let i = 0; i < teeth; i++) {
            const a0 = (i / teeth) * Math.PI * 2;
            const a1 = ((i + 0.38) / teeth) * Math.PI * 2;
            const a2 = ((i + 1) / teeth) * Math.PI * 2;
            if (i === 0) g.moveTo(Math.cos(a0) * R, Math.sin(a0) * R);
            g.lineTo(Math.cos(a1) * R * 1.32, Math.sin(a1) * R * 1.32);
            g.lineTo(Math.cos(a2) * R, Math.sin(a2) * R);
        }
        g.close(); g.fill();
        g.fillColor = theme.obstacleMid;
        g.circle(0, 0, R * 0.72); g.fill();
        g.fillColor = theme.obstacleLight;
        g.circle(0, 0, R * 0.28); g.fill();
        g.fillColor = theme.obstacleDark;
        g.circle(0, 0, R * 0.12); g.fill();
    }
}
