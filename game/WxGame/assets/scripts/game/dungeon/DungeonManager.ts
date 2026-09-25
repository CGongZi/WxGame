import { _decorator, Component, Node, Color, Graphics, UITransform,
         BlockInputEvents, find } from 'cc';
import { eventBus, GameEvents } from '../../core/EventBus';
import { EnemyRegistry } from '../enemy/EnemyRegistry';
import type { CombatEnemy as EnemyRegistryEnemy } from '../enemy/EnemyRegistry';
import { EliteMark } from '../enemy/EliteMark';
import { PlayerController } from '../player/PlayerController';
import { SlimeEnemy } from '../enemy/SlimeEnemy';
import { RoomController } from './RoomController';
import { PortalObject } from './PortalObject';
import { MAP_HALF_W, MAP_HALF_H } from './MapConstants';
import { WorldBridge } from './WorldBridge';
import { DungeonLayout } from './DungeonLayout';
import { Hazards } from './Hazards';
import { FloorRenderer } from './FloorRenderer';
import { ThemeRuntime, pickBiomeSpawn, bossTintForTheme } from './MapThemes';
import type { SpawnEnemyType } from './MapThemes';
import { UpgradeShop } from '../ui/UpgradeShop';
import { TalentPick } from '../ui/TalentPick';
import { WeaponReplaceUI } from '../ui/WeaponReplaceUI';
import { FloorResult } from '../ui/FloorResult';
import { RoomBriefing } from '../ui/RoomBriefing';
import { BossEnemy } from '../enemy/BossEnemy';
import { ArcherEnemy } from '../enemy/ArcherEnemy';
import { WispEnemy } from '../enemy/WispEnemy';
import { MageEnemy } from '../enemy/MageEnemy';
import { DragonEnemy } from '../enemy/DragonEnemy';
import { drawEnemySilhouette } from '../enemy/EnemySilhouette';
import { EnemyMotion } from '../enemy/EnemyMotion';
import { EnemyAggro } from '../enemy/EnemyAggro';
import { GameManager } from '../../core/GameManager';
import { ConfigStore } from '../../core/ConfigStore';
import type { ConfigEncounter } from '../../core/ConfigSchema';
import { GameFlow } from '../../core/GameFlow';
import { GameClearOverlay } from '../ui/GameClearOverlay';
import { BulletPool } from '../weapon/BulletPool';
import { EnemyBoltPool } from '../enemy/EnemyBoltPool';
import { CombatVfx } from '../fx/CombatVfx';
import { GroundFlame } from '../fx/GroundFlame';
import { ViewZoom } from '../camera/ViewZoom';
import { RunJuice } from '../fx/RunJuice';
import { ExperienceCoach } from '../fx/ExperienceCoach';
import { AudioManager } from '../../core/AudioManager';
import { ChamberClear } from './ChamberClear';
import { RunProgress, resetRunProgress, writeRunProgress } from './RunProgress';

const { ccclass } = _decorator;

// ── 敌人配置 ─────────────────────────────────────────────────

interface EnemyConfig {
    type:   SpawnEnemyType;
    x: number; y: number;
    hp: number; speed: number; damage: number;
    /** 主题池色调提示（占位 Graphics） */
    color?: Color;
    /** #122 精英：血伤加倍、金冠光环、额外掉落 */
    elite?: boolean;
}

interface RoomConfig {
    roomIndex: number;
    floor:     number;
    /** 当前房主题；敌人必须来自该主题 BiomeSpawnTable */
    themeId:   string;
    /** 柱边/门口要等地形生成后再落点 */
    placement: 'scatter' | 'ring' | 'pillar' | 'door';
    enemies:   EnemyConfig[];
    hasBoss:   boolean;
    isFinal:   boolean;
    /** #129 瓦片地牢按厅补怪时沿用的数值倍率 */
    scale:     number;
    dmgScale:  number;
}

/** 单只怪的数值落地（generateRoom 与按厅补怪共用） */
function buildEnemyConfig(plan: PlannedEnemy, scale: number, dmgScale: number, x = 0, y = 0): EnemyConfig {
    const base = ConfigStore.enemy(plan.type);
    return {
        type: plan.type,
        x, y,
        hp: Math.round((base?.hp ?? 30) * scale * plan.hpMul),
        speed: Math.round((base?.speed ?? 65) * plan.spdMul * (base?.speedScale === 'flat' ? 1 : Math.min(1.6, scale * 0.35 + 0.65))),
        damage: Math.round((base?.damage ?? 8) * dmgScale),
        color: plan.color ? new Color(plan.color[0], plan.color[1], plan.color[2], 255) : undefined,
    };
}

/**
 * #129 瓦片地牢：每个非起始厅按面积配怪（2~7 只），玩家进厅整厅一起冲。
 * 遭遇模板抽出的怪先填，剩余从主题池补；同厅尽量 ≥2 种，整图 ≥3 种。
 */
function fillChambers(config: RoomConfig, L: DungeonLayout) {
    const floor = config.floor;
    const runCount = GameManager.instance?.runCountMul() ?? 1;
    const floorMul = floor === 1 ? 0.8 : floor === 2 ? 0.95 : 1 + (floor - 3) * 0.06;
    const pending = config.enemies.slice();
    const out: EnemyConfig[] = [];
    const kindsAll = new Set<string>();

    L.chambers.forEach((ch, idx) => {
        if (ch.kind === 'start' || ch.kind === 'treasure' || ch.kind === 'shrine') return;
        // #142 各原型的厅可带刷怪密度乘子（墓园空棺 0 / 开阔地分区 0.65）
        const mul = ch.spawnMul ?? 1;
        if (mul <= 0) return;
        const area = L.chamberArea(ch);
        let n = Math.round(Math.max(2, Math.min(7, area / 22)) * floorMul * runCount * mul);
        if (ch.kind === 'boss') n = Math.min(Math.max(1, n - 2), 3);
        if (ch.kind === 'challenge') n = Math.min(8, Math.max(4, n + 2));
        n = Math.max(ch.kind === 'boss' ? 1 : mul < 1 ? 1 : 2, n);
        const pts = L.spawnPointsIn(idx, n);
        const kindsHere = new Set<string>();
        let forcedElite = ch.kind === 'challenge';
        for (let i = 0; i < pts.length; i++) {
            let ec: EnemyConfig | undefined = pending.shift();
            if (!ec) {
                let entry = pickBiomeSpawn(config.themeId, floor);
                // 同厅第 2 只起避免重复种类（重抽最多 3 次）
                for (let k = 0; k < 3 && kindsHere.has(entry.type) && kindsHere.size < 3; k++) entry = pickBiomeSpawn(config.themeId, floor);
                ec = buildEnemyConfig({
                    type: entry.type, hpMul: entry.hpMul ?? 1, spdMul: entry.spdMul ?? 1, color: entry.color,
                }, config.scale, config.dmgScale);
                // 第 2 层起每厅 12% 再出一只精英；挑战厅必出至少一只
                const rollElite = forcedElite || (ch.kind !== 'boss' && floor >= 2 && Math.random() < 0.12);
                if (rollElite) {
                    ec.elite = true;
                    ec.hp = Math.round(ec.hp * 2.4);
                    ec.damage = Math.round(ec.damage * 1.3);
                    forcedElite = false;
                }
            }
            ec.x = pts[i][0];
            ec.y = pts[i][1];
            kindsHere.add(ec.type);
            kindsAll.add(ec.type);
            out.push(ec);
        }
    });

    // 模板剩余的怪也要有落点
    if (pending.length > 0) {
        const pts = L.spawnPoints(pending.length);
        pending.forEach((ec, i) => {
            const p = pts[i];
            if (p) { ec.x = p[0]; ec.y = p[1]; }
            out.push(ec);
        });
    }
    // 整图种类太单一 → 换掉部分
    if (kindsAll.size < 3 && out.length >= 4) {
        for (let i = 1; i < out.length && kindsAll.size < 3; i += 2) {
            const entry = pickBiomeSpawn(config.themeId, floor);
            if (kindsAll.has(entry.type)) continue;
            const ec = buildEnemyConfig({
                type: entry.type, hpMul: entry.hpMul ?? 1, spdMul: entry.spdMul ?? 1, color: entry.color,
            }, config.scale, config.dmgScale, out[i].x, out[i].y);
            out[i] = ec;
            kindsAll.add(entry.type);
        }
    }
    config.enemies = out;
}

function rng(min: number, max: number) { return min + Math.random() * (max - min); }

/** 返回一个距原点不小于 minDist 的随机位置 */
function randPos(minDist: number): [number, number] {
    const margin = 120;
    let x: number, y: number;
    do {
        x = rng(-MAP_HALF_W + margin, MAP_HALF_W - margin);
        y = rng(-MAP_HALF_H + margin, MAP_HALF_H - margin);
    } while (Math.sqrt(x * x + y * y) < minDist);
    return [x, y];
}

/**
 * 仅从 themeId 对应 BiomeSpawnTable 加权抽怪。
 * 禁止在未传入 themeId 时用全球模板。
 */
function roomsPerFloor(): number {
    return GameManager.instance?.effectiveRoomsPerFloor()
        ?? ConfigStore.dungeon().roomsPerFloor;
}

function totalFloorsCap(): number {
    return GameManager.instance?.effectiveTotalFloors()
        ?? ConfigStore.dungeon().totalFloors;
}

function floorOf(roomIndex: number): number {
    const rooms = roomsPerFloor();
    return Math.floor(roomIndex / rooms) + 1;
}

function isBossIndex(roomIndex: number): boolean {
    const rooms = roomsPerFloor();
    return roomIndex % rooms === rooms - 1;
}

function roomInFloor(roomIndex: number): number {
    return (roomIndex % roomsPerFloor()) + 1;
}

function pickEncounter(themeId: string): ConfigEncounter {
    const table = ConfigStore.themeEncounters(themeId);
    const all = ConfigStore.encounters();
    const fallback = all[0];
    if (!fallback) throw new Error('[Dungeon] 遭遇模板为空');
    let total = 0;
    for (const row of table) total += Math.max(0, row.weight);
    if (total <= 0) return ConfigStore.encounter(table[0]?.encounterId) ?? fallback;
    let r = Math.random() * total;
    for (const row of table) {
        r -= Math.max(0, row.weight);
        if (r <= 0) return ConfigStore.encounter(row.encounterId) ?? fallback;
    }
    return ConfigStore.encounter(table[table.length - 1].encounterId) ?? fallback;
}

function placeEnemy(placement: 'scatter' | 'ring', index: number, total: number): [number, number] {
    if (placement === 'ring') {
        const radius = 480;
        const a = (Math.PI * 2 * index) / Math.max(1, total);
        return [Math.cos(a) * radius, Math.sin(a) * radius];
    }
    return randPos(300);
}

function clampMap(x: number, y: number): [number, number] {
    const margin = 100;
    return [
        Math.max(-MAP_HALF_W + margin, Math.min(MAP_HALF_W - margin, x)),
        Math.max(-MAP_HALF_H + margin, Math.min(MAP_HALF_H - margin, y)),
    ];
}

/** 贴障碍外侧。地形尚未生成时退回散点。 */
function placeBesideObstacle(index: number, roomIndex: number): [number, number] {
    const list = WorldBridge.obstacles();
    if (list.length < 1) return randPos(300);
    const ob = list[(index + roomIndex * 2) % list.length];
    const ang = Math.atan2(ob.y, ob.x) + (index % 2 === 0 ? 0.9 : -0.9);
    const dist = ob.radius + 64;
    return clampMap(ob.x + Math.cos(ang) * dist, ob.y + Math.sin(ang) * dist);
}

/** 开放世界没有门洞，门口取地图南北边缘内侧。 */
function placeAtGate(index: number, total: number): [number, number] {
    const inset = 220;
    const y = index % 2 === 0 ? MAP_HALF_H - inset : -(MAP_HALF_H - inset);
    const slot = Math.floor(index / 2);
    const slotsOnSide = Math.max(1, Math.ceil(total / 2));
    const x = slotsOnSide <= 1 ? 0 : (slot - (slotsOnSide - 1) / 2) * 220;
    return clampMap(x, y);
}

interface PlannedEnemy {
    type: SpawnEnemyType;
    hpMul: number;
    spdMul: number;
    color?: readonly [number, number, number];
}

function generateRoom(roomIndex: number, themeId: string): RoomConfig {
    const floor = floorOf(roomIndex);
    const curve = ConfigStore.dungeon();
    const ov = ConfigStore.floorOverride(floor);
    const stageMul = GameManager.instance?.runScaleMul() ?? 1;
    const scale = (1 + roomIndex * curve.roomScaleStep) * (ov?.scaleMul ?? 1) * stageMul;
    const hasBoss = isBossIndex(roomIndex);
    const endless = GameManager.instance?.isEndless() ?? false;
    const isFinal = !endless && hasBoss && floor >= totalFloorsCap();
    const encounter = pickEncounter(themeId);

    const planned: PlannedEnemy[] = [];
    for (const slot of encounter.slots) {
        for (let n = 0; n < slot.count; n++) {
            if (slot.source === 'enemy') {
                planned.push({ type: slot.enemyId, hpMul: 1, spdMul: 1 });
                continue;
            }
            const entry = pickBiomeSpawn(themeId, floor);
            planned.push({
                type: entry.type,
                hpMul: entry.hpMul ?? 1,
                spdMul: entry.spdMul ?? 1,
                color: entry.color,
            });
        }
    }

    const runCount = GameManager.instance?.runCountMul() ?? 1;
    const countMul = (ov?.enemyCountMul ?? 1) * runCount;
    let adjusted = planned;
    if (countMul !== 1 && planned.length > 0) {
        const target = Math.max(1, Math.round(planned.length * countMul));
        if (target < planned.length) {
            adjusted = planned.slice(0, target);
        } else if (target > planned.length) {
            adjusted = planned.slice();
            let i = 0;
            while (adjusted.length < target) {
                adjusted.push(planned[i % planned.length]);
                i++;
            }
        }
    }

    const capped = isFinal ? adjusted.slice(0, curve.finalRoomTrashCap) : adjusted;
    // #123 数值曲线：怪血按 scale 全速成长，怪伤只按 55% 成长（后期不至于两三下秒人），
    // 玩家成长（天赋三选一 / 清房店 / 道具）才追得上。
    const dmgScale = 1 + (scale - 1) * 0.55;
    const enemies: EnemyConfig[] = capped.map((plan, i) => {
        const placement = encounter.placement;
        const [x, y] = placement === 'scatter' || placement === 'ring'
            ? placeEnemy(placement, i, capped.length)
            : [0, 0];
        return buildEnemyConfig(plan, scale, dmgScale, x, y);
    });

    // #122 精英：第 2 房起、非 Boss 房，按层数递增概率抽 1 只
    if (!hasBoss && roomIndex >= 1 && enemies.length >= 2) {
        const chance = Math.min(0.75, 0.28 + floor * 0.09);
        if (Math.random() < chance) {
            const idx = Math.floor(Math.random() * enemies.length);
            const e = enemies[idx];
            e.elite = true;
            e.hp = Math.round(e.hp * 2.4);
            e.damage = Math.round(e.damage * 1.3);
        }
    }

    return { roomIndex, floor, themeId, placement: encounter.placement, enemies, hasBoss, isFinal, scale, dmgScale };
}

/** rollTheme → generateRoom：主题先于刷怪，保证池匹配 */
function prepareRoom(roomIndex: number): RoomConfig {
    const floor = floorOf(roomIndex);
    const forced = GameManager.instance?.runThemeId();
    const theme = forced
        ? ThemeRuntime.getTheme(forced)
        : ThemeRuntime.rollTheme(floor);
    if (forced) {
        ThemeRuntime.currentTheme = theme;
    }
    return generateRoom(roomIndex, theme.id);
}

// ── DungeonManager ────────────────────────────────────────────

@ccclass('DungeonManager')
export class DungeonManager extends Component {

    /** 供 HUD 轮询的进度快照（避免 FLOOR_STARTED 事件丢失导致层数卡死；与 RunProgress 同引用） */
    static progress = RunProgress;

    private _playerNode:  Node | null = null;
    private _enemyLayer:  Node | null = null;
    private _worldLayer:  Node | null = null;
    private _fadeG:       Graphics | null = null;
    private _fadeNode:    Node | null = null;

    private _roomIndex = 0;
    private _busy      = false;
    private _portalNode: Node | null = null;
    /** 递增以作废进行中的淡入淡出，避免回大厅后 FadeLayer 又被 schedule 点亮 */
    private _fadeGen = 0;

    onLoad() {
        resetRunProgress();
        // loadScene 后模块静态仍在：清层主题缓存，避免通关重载后同局主题复用
        ThemeRuntime.resetRun();
        // DungeonManager 挂在 Canvas
        const canvas = this.node;

        this._worldLayer = canvas.getChildByName('WorldLayer')
                        ?? find('Canvas/WorldLayer');

        // Player 永远在 Canvas 下（钉屏幕中心）
        this._playerNode = canvas.getChildByName('Player')
                        ?? find('Canvas/Player');

        const wl = this._worldLayer ?? canvas;
        this._enemyLayer = wl.getChildByName('EnemyLayer')
                        ?? canvas.getChildByName('EnemyLayer');

        this._buildFadeLayer(canvas);

        eventBus.on(GameEvents.ROOM_ENTERED,   this._onPortalEntered, this);
        eventBus.on(GameEvents.ROOM_CLEARED,   this._onRoomCleared,   this);
        FloorResult.ensureTracking();
        RunJuice.ensure();
        ExperienceCoach.ensure();
        AudioManager.ensure();
        // HUD 已挂 RoomBriefing；缺失时挂到 Canvas 兜底
        const hud = canvas.getChildByName('HUD');
        const hasBrief =
            !!(hud?.getComponent(RoomBriefing) || canvas.getComponent(RoomBriefing));
        if (!hasBrief) (hud ?? canvas).addComponent(RoomBriefing);
        GameClearOverlay.ensureListening();
        console.log('[DungeonManager] 初始化, player:', this._playerNode?.name ?? '未找到');
    }

    start() {
        // 确保 WorldLayer 已经建好（FloorRenderer.onLoad 比 HUDManager.onLoad 先运行）
        if (!this._worldLayer) {
            this._worldLayer = this.node.getChildByName('WorldLayer');
            const wl = this._worldLayer ?? this.node;
            if (!this._playerNode)  this._playerNode  = this.node.getChildByName('Player') ?? find('Canvas/Player');
            if (!this._enemyLayer)  this._enemyLayer  = wl.getChildByName('EnemyLayer') ?? null;
        }
        console.log('[DungeonManager] start, wl=', this._worldLayer?.name ?? 'null',
                    'player=', this._playerNode?.name ?? 'null',
                    'enemy=', this._enemyLayer?.name ?? 'null');

        // 首局自动刷第 0 房间（延迟等组件就绪）。大厅态禁止刷怪/写图鉴，避免冷启动遭遇解锁
        this.scheduleOnce(() => {
            if (!GameFlow.isPlaying) {
                console.log('[DungeonManager] start 跳过刷怪（仍在 Lobby）');
                return;
            }
            ThemeRuntime.resetRun();
            const config = prepareRoom(0);
            const pc = this._playerNode?.getComponent(PlayerController) ?? null;
            this._loadRoom(config, pc);
        }, 0.5);
    }

    onDestroy() {
        eventBus.off(GameEvents.ROOM_ENTERED,  this._onPortalEntered, this);
        eventBus.off(GameEvents.ROOM_CLEARED,  this._onRoomCleared,   this);
    }

    /** 从大厅再次开战：重置到第 0 房并重新刷怪（仅 Playing 态应调用） */
    restartRun() {
        if (!GameFlow.isPlaying) {
            console.warn('[DungeonManager] restartRun 被忽略（非 Playing）');
            return;
        }
        this._busy = false;
        this._roomIndex = 0;
        this._cancelFade();
        resetRunProgress();
        ThemeRuntime.resetRun();
        UpgradeShop.forceClose(this.node);
        TalentPick.forceClose(this.node);
        WeaponReplaceUI.forceClose(this.node);
        FloorResult.forceClose(this.node);
        RoomBriefing.forceClose(this.node);
        if (this._portalNode?.isValid) this._portalNode.destroy();
        this._portalNode = null;

        const pc = this._playerNode?.getComponent(PlayerController) ?? null;
        const config = prepareRoom(0);
        this._loadRoom(config, pc);
        console.log('[DungeonManager] restartRun → 第1层 R1');
    }

    /** GameOver / 回大厅：立刻熄灭 FadeLayer 并作废进行中的转场动画 */
    cancelFadeForLobby() {
        this._busy = false;
        this._cancelFade();
        RoomBriefing.forceClose(this.node);
        BulletPool.clear();
        EnemyBoltPool.clear();
        CombatVfx.clear();
        GroundFlame.clearAll(this._enemyLayer ?? this._worldLayer);
        const pc = this._playerNode?.getComponent(PlayerController) ?? null;
        pc?.setTransitioning(false);
        pc?.clearInvuln();
    }

    private _cancelFade() {
        this._fadeGen++;
        if (this._fadeNode?.isValid) {
            this._fadeNode.active = false;
            const g = this._fadeG ?? this._fadeNode.getComponent(Graphics);
            if (g) {
                g.clear();
                g.fillColor = new Color(0, 0, 0, 0);
                g.rect(-667, -375, 1334, 750);
                g.fill();
            }
        }
    }

    // ── 清怪 → 生成传送门 ────────────────────────────────────────

    private _onRoomCleared() {
        if (this._portalNode?.isValid) return;

        // 清房立刻清残余弹道，避免升级商店期间仍被射中
        this._clearEnemyBolts();

        const floor = floorOf(this._roomIndex);
        const isBossRoom = isBossIndex(this._roomIndex);
        const endless = GameManager.instance?.isEndless() ?? false;
        const isFinal = !endless && isBossRoom && floor >= totalFloorsCap();

        // 最终层：结算通关，不再刷传送门
        if (isFinal) {
            eventBus.emit(GameEvents.FLOOR_CLEARED, { floor });
            try { GameManager.instance?.onFloorCleared(floor); } catch {}
            return;
        }

        // 传送门刷在玩家逻辑坐标附近（瓦片地牢：吸到最近的地板格，不进墙/坑）
        const angle = Math.random() * Math.PI * 2;
        const dist  = 120 + Math.random() * 80;
        let px = WorldBridge.x + Math.cos(angle) * dist;
        let py = WorldBridge.y + Math.sin(angle) * dist;
        const L = DungeonLayout.current;
        if (L) {
            const p = L.nearestFloor(px, py);
            if (Math.hypot(p.x - WorldBridge.x, p.y - WorldBridge.y) < 60) {
                const q = L.nearestFloor(WorldBridge.x - Math.cos(angle) * dist, WorldBridge.y - Math.sin(angle) * dist);
                px = q.x; py = q.y;
            } else { px = p.x; py = p.y; }
        }

        const portalNode = new Node('Portal');
        portalNode.setParent(this._worldLayer ?? this.node);
        portalNode.setPosition(px, py, 0);

        const portal = portalNode.addComponent(PortalObject);
        portal.init(this._playerNode!);
        this._portalNode = portalNode;

        // 顺带弹出局内升级商店
        UpgradeShop.show(this.node);

        // Boss 房（每层第4间）→ 过层结算
        if (isBossRoom) {
            eventBus.emit(GameEvents.FLOOR_CLEARED, { floor });
            try { GameManager.instance?.onFloorCleared(floor); } catch {}
            FloorResult.show(this.node, floor);
        }

        console.log(`[Dungeon] 传送门生成于玩家附近 (${px.toFixed(0)}, ${py.toFixed(0)})`);
    }

    // ── 进入传送门 → 过场换层 ────────────────────────────────────

    private _onPortalEntered(_data: any) {
        if (this._busy) return;
        this._busy = true;
        this._transitionToRoom(this._roomIndex + 1);
    }

    private _transitionToRoom(nextIndex: number) {
        this._roomIndex = nextIndex;
        // rollTheme → 主题池刷怪（同层吃缓存）；淡出前同步 progress.themeId
        const config = prepareRoom(nextIndex);
        DungeonManager._syncProgress(config);

        // 换房时关掉商店/结算遮罩，避免挡操作或残留
        UpgradeShop.forceClose(this.node);
        TalentPick.forceClose(this.node);
        WeaponReplaceUI.forceClose(this.node);
        FloorResult.forceClose(this.node);

        const pc = this._playerNode?.getComponent(PlayerController) ?? null;
        pc?.setTransitioning(true);

        this._animateFade(0, 255, 0.42, () => {
            this._loadRoom(config, pc);
            // 黑屏稍停，让新层地形/刷怪落稳再渐亮
            this.scheduleOnce(() => {
                this._animateFade(255, 0, 0.48, () => {
                    // 操作解冻交给 RoomBriefing；无展板 / 残留冻结时兜底
                    GameFlow.ensureCombatThawed();
                    if (!GameFlow.isCombatFrozen) {
                        pc?.setTransitioning(false);
                    }
                    this._busy = false;
                });
            }, 0.12);
        });
    }

    private _loadRoom(config: RoomConfig, pc: PlayerController | null) {
        // 0. 主题已在 prepareRoom 确定。关卡强制主题优先于 floors[] / 随机；
        //    否则 rollTheme 同层幂等，缓存被清时按新主题重抽怪。
        const forcedId = GameManager.instance?.runThemeId();
        let theme = forcedId
            ? ThemeRuntime.getTheme(forcedId)
            : ThemeRuntime.rollTheme(config.floor);
        if (forcedId) ThemeRuntime.currentTheme = theme;
        if (theme.id !== config.themeId) {
            const rebuilt = generateRoom(config.roomIndex, theme.id);
            config.themeId = rebuilt.themeId;
            config.placement = rebuilt.placement;
            config.enemies = rebuilt.enemies;
            config.hasBoss = rebuilt.hasBoss;
            config.isFinal = rebuilt.isFinal;
            config.scale = rebuilt.scale;
            config.dmgScale = rebuilt.dmgScale;
        } else {
            config.themeId = theme.id;
        }
        DungeonManager._syncProgress(config);

        // #125 每房生成一套瓦片布局（厅室 + 走廊 + 机关），FloorRenderer 据此重画与刷机关
        DungeonLayout.build({
            themeId: theme.id,
            obstacleStyle: theme.obstacleStyle,
            roomIndex: config.roomIndex,
            floor: config.floor,
            hasBoss: config.hasBoss,
            isFinal: config.isFinal,
        });
        if (config.roomIndex === 0) Hazards.resetTips();
        EnemyAggro.reset();
        ChamberClear.reset();

        const themeChanged = FloorRenderer.I?.applyTheme(theme.id, config.roomIndex === 0) ?? true;
        if (themeChanged) {
            eventBus.emit('show-tip', { text: `${theme.emoji} ${theme.name}` });
        }
        // M5：首次进入该主题地图 → 图鉴解锁
        try { GameManager.instance?.unlockCodexTheme(theme.id); } catch {}

        // 1. 清敌人 / 地面焰 / 传送门（换房必须熄焰，并重置 GroundFlame CAP）
        this._clearEnemies();
        GroundFlame.clearAll(this._enemyLayer ?? this._worldLayer);
        if (this._portalNode?.isValid) { this._portalNode.destroy(); }
        this._portalNode = null;

        // 2. 重置 RoomController（Room 可能在 WorldLayer 下）
        const roomNode = (this._worldLayer ?? this.node.parent!).getChildByName('Room');
        const rc = roomNode?.getComponent(RoomController);
        rc?.resetForNewRoom(config.enemies.length > 0 || config.hasBoss);

        // 3. 重置玩家到世界原点（贴边偏移由 WorldBridge 同步）
        WorldBridge.reset(0, 0);
        WorldBridge.syncPlayerNode(this._playerNode);
        pc?.reviveForNewFloor?.();

        // 4. 刷怪（敌人已由主题池生成；不在此重抽全球表）
        this._spawnEnemies(config);

        // 5. 广播新房间 + 存档层进度（含 themeId）
        eventBus.emit(GameEvents.FLOOR_STARTED, {
            floor:     config.floor,
            roomIndex: config.roomIndex,
            themeId:   config.themeId,
        });
        try { GameManager.instance?.recordFloor(config.floor); } catch {}

        const r = roomInFloor(config.roomIndex);
        const mix = config.enemies.map(e => e.type).join(',');
        console.log(
            `[Dungeon] 房间${config.roomIndex} 第${config.floor}层R${r}` +
            ` themeId=${config.themeId}` +
            ` 敌人×${config.enemies.length}` +
            ` mix=[${mix}]` +
            `${config.isFinal ? ' ★最终Boss★' : config.hasBoss ? ' ★精英★' : ''}`,
        );
    }

    private static _syncProgress(config: RoomConfig) {
        writeRunProgress({
            floor: config.floor,
            roomIndex: config.roomIndex,
            roomInFloor: roomInFloor(config.roomIndex),
            themeId: config.themeId,
        });
    }

    /** 柱边、门口依赖本帧地形，不能在 prepareRoom 时落点。 */
    private _resolvePlacement(config: RoomConfig) {
        // #125 瓦片地牢：怪分散在各厅室的地板格上（起始厅之外），遭遇模板的站位语义退化为厅内散点
        const L = DungeonLayout.current;
        if (L) {
            // #129 按厅配怪：每厅 2~7 只，进厅整厅一起醒
            fillChambers(config, L);
            return;
        }
        if (config.placement !== 'pillar' && config.placement !== 'door') return;
        const total = config.enemies.length;
        config.enemies.forEach((ec, i) => {
            const [x, y] = config.placement === 'pillar'
                ? placeBesideObstacle(i, config.roomIndex)
                : placeAtGate(i, total);
            ec.x = x;
            ec.y = y;
        });
    }

    // ── 刷怪 ─────────────────────────────────────────────────────

    private _spawnEnemies(config: RoomConfig) {
        if (!this._enemyLayer) return;
        this._resolvePlacement(config);

        let eliteSpawned = false;
        config.enemies.forEach((ec, i) => {
            // M5：刷出即遭遇解锁（幂等）
            try { GameManager.instance?.unlockCodexEnemy(ec.type); } catch {}

            const node = new Node(`E_${i}`);
            node.setParent(this._enemyLayer!);
            node.setPosition(ec.x, ec.y, 0);

            const def = ConfigStore.enemy(ec.type);
            const size = def?.bodySize ?? 64;
            const enemy = this._attachEnemy(node, ec, def);
            ChamberClear.track(enemy, ec.x, ec.y);
            if (ec.elite && enemy) {
                // 精英标记须在敌人组件 onLoad（画 Body）之后挂；同帧 addComponent 已触发 onLoad
                this.scheduleOnce(() => {
                    if (node.isValid) EliteMark.mark(node, enemy, size);
                }, 0);
                eliteSpawned = true;
            }
        });

        if (eliteSpawned) {
            this.scheduleOnce(() => {
                if (GameFlow.isPlaying) eventBus.emit('show-tip', { text: '👑 精英怪出现 · 更肉更疼，掉落更丰' });
            }, 0.6);
        }

        if (config.hasBoss) this._spawnBoss(config.floor, config.isFinal, config.themeId);
    }

    /** 按 behaviorId 挂对应敌人组件；返回 CombatEnemy 供精英标记引用 */
    private _attachEnemy(
        node: Node,
        ec: EnemyConfig,
        def: ReturnType<typeof ConfigStore.enemy>,
    ): EnemyRegistryEnemy | null {
        if (def?.behaviorId === 'kite') {
            const archer = node.addComponent(ArcherEnemy);
            archer.hp = ec.hp;
            archer.speed = ec.speed;
            archer.damage = ec.damage;
            archer.playerNode = this._playerNode!;
            if (ec.color) archer.bodyColor = ec.color;
            return archer;
        }
        if (def?.behaviorId === 'fly') {
            const wisp = node.addComponent(WispEnemy);
            wisp.hp = ec.hp;
            wisp.speed = ec.speed;
            wisp.damage = ec.damage;
            wisp.attackRange = def.attackRange ?? 48;
            wisp.playerNode = this._playerNode!;
            wisp.motionKind = (ec.type === 'bat' || ec.type === 'moth'
                || ec.type === 'raven' || ec.type === 'mosquito' || ec.type === 'specter'
                || ec.type === 'spark' || ec.type === 'jelly')
                ? ec.type : 'wisp';
            if (ec.color) wisp.bodyColor = ec.color;
            return wisp;
        }
        if (def?.behaviorId === 'cast') {
            const mage = node.addComponent(MageEnemy);
            mage.hp = ec.hp;
            mage.speed = ec.speed;
            mage.damage = ec.damage;
            mage.shootRange = def.attackRange ?? 460;
            mage.playerNode = this._playerNode!;
            if (ec.color) mage.bodyColor = ec.color;
            return mage;
        }
        if (def?.behaviorId === 'dragon') {
            const dragon = node.addComponent(DragonEnemy);
            dragon.hp = ec.hp;
            dragon.speed = ec.speed;
            dragon.damage = ec.damage;
            dragon.shootRange = def.attackRange ?? 480;
            dragon.playerNode = this._playerNode!;
            if (ec.color) dragon.bodyColor = ec.color;
            return dragon;
        }

        const rgb = def?.defaultColor ?? [90, 180, 70];
        const color = ec.color ?? new Color(rgb[0], rgb[1], rgb[2], 255);
        const size = def?.bodySize ?? 64;
        this._drawEnemy(node, size, color, ec.type);

        const slime = node.addComponent(SlimeEnemy);
        slime.hp = ec.hp;
        slime.speed = ec.speed;
        slime.damage = ec.damage;
        slime.attackRange = def?.attackRange ?? 55;
        slime.detectionRange = 560;
        slime.playerNode = this._playerNode!;
        slime.kind = ec.type;
        return slime;
    }

    private _spawnBoss(floor: number, isFinal: boolean, themeId: string) {
        if (!this._enemyLayer || !this._playerNode) return;

        try { GameManager.instance?.unlockCodexEnemy('boss'); } catch {}

        // #125 有瓦片布局时 Boss 站 Boss 厅中央
        const bp = DungeonLayout.current?.bossPoint();
        const [bx, by] = bp ? [bp.x, bp.y] : randPos(450);
        const node = new Node(isFinal ? 'FinalBoss' : 'Boss');
        node.setParent(this._enemyLayer);
        node.setPosition(bx, by, 0);

        const size = isFinal ? 140 : 110;
        node.addComponent(UITransform).setContentSize(size, size);
        let bodyTint = new Color(90, 20, 120, 255);
        try {
            const tint = bossTintForTheme(themeId, isFinal);
            if (tint?.body) bodyTint = tint.body;
            else if (tint?.mid) bodyTint = tint.mid;
        } catch { /* keep defaults */ }
        const body = new Node('Body');
        body.setParent(node);
        body.addComponent(UITransform).setContentSize(size, size);
        const g = body.addComponent(Graphics);
        drawEnemySilhouette(g, 'boss', bodyTint, size);
        const bossMotion = body.addComponent(EnemyMotion);
        bossMotion.kind = 'boss';

        const curve = ConfigStore.dungeon();
        const ov = ConfigStore.floorOverride(floor);
        let hp = isFinal
            ? curve.finalBossHpBase + floor * curve.finalBossHpPerFloor
            : curve.bossHpBase + floor * curve.bossHpPerFloor;
        if (ov?.bossHpMul !== undefined) hp = Math.round(hp * ov.bossHpMul);
        const speed = isFinal ? curve.finalBossSpeed : curve.bossSpeedBase + floor * curve.bossSpeedPerFloor;
        const damage = isFinal ? curve.finalBossDamage : curve.bossDamageBase + floor * curve.bossDamagePerFloor;
        const attackRange = isFinal ? curve.finalBossAttackRange : curve.bossAttackRange;
        const behavior = curve.bossBehaviorId;

        if (behavior === 'kite') {
            const archer = node.addComponent(ArcherEnemy);
            archer.hp = hp;
            archer.speed = speed;
            archer.damage = damage;
            archer.playerNode = this._playerNode;
        } else if (behavior === 'chase') {
            const slime = node.addComponent(SlimeEnemy);
            slime.hp = hp;
            slime.speed = speed;
            slime.damage = damage;
            slime.attackRange = attackRange;
            slime.detectionRange = 900;
            slime.playerNode = this._playerNode;
        } else {
            const boss = node.addComponent(BossEnemy);
            boss.hp = hp;
            boss.speed = speed;
            boss.damage = damage;
            boss.attackRange = attackRange;
            boss.detectionRange = 900;
            boss.playerNode = this._playerNode;
        }

        eventBus.emit('show-tip', {
            text: isFinal ? '🔥 最终 Boss 降临！' : '👑 精英 Boss 出现！',
        });
        console.log(
            `[Dungeon] ${isFinal ? 'Final' : ''}Boss 生成 theme=${themeId}` +
            ` behavior=${behavior} (${bx.toFixed(0)},${by.toFixed(0)}) HP=${hp}`,
        );
    }

    private _drawEnemy(node: Node, size: number, color: Color, kind: string) {
        node.addComponent(UITransform).setContentSize(size, size);
        const body = new Node('Body');
        body.layer = node.layer;
        body.setParent(node);
        body.addComponent(UITransform).setContentSize(size, size);
        const g = body.addComponent(Graphics);
        drawEnemySilhouette(g, kind, color, size);
        const motion = body.addComponent(EnemyMotion);
        motion.kind = kind === 'fast' || kind === 'tank' || kind === 'beetle'
            || kind === 'toad' || kind === 'crystal' || kind === 'golem' || kind === 'bone'
            || kind === 'cog' || kind === 'puppet' || kind === 'wolf' || kind === 'crab'
            ? kind : 'slime';
    }

    private _clearEnemies() {
        if (this._enemyLayer) {
            [...this._enemyLayer.children].forEach(c => { if (c.isValid) c.destroy(); });
        }
        EnemyRegistry.clear();
    }

    /** 通关时清掉未落地的敌方弹道 / 地面焰，避免结算或等门期间仍受伤 */
    private _clearEnemyBolts() {
        const layer = this._enemyLayer ?? this._worldLayer;
        if (!layer) return;
        [...layer.children].forEach(c => {
            if (c.isValid && c.name === 'EnemyBolt') EnemyBoltPool.release(c);
        });
        GroundFlame.clearAll(layer);
    }

    // ── 淡黑转场（必须盖住当前 ortho 全视野，不能只盖设计稿 1334×750）──

    /** 按当前/开战视角算出遮罩半宽高，再加余量，避免周围露底 */
    private _fadeCover(): { hw: number; hh: number; w: number; h: number } {
        const cam = ViewZoom.ensureCam();
        const ortho = Math.max(
            ViewZoom.PLAY_ORTHO,
            cam?.orthoHeight ?? ViewZoom.PLAY_ORTHO,
            ViewZoom.targetOrtho,
        );
        const hh = ortho + 80;
        const hw = hh * (ViewZoom.DESIGN_W / ViewZoom.DESIGN_H) + 80;
        return { hw, hh, w: hw * 2, h: hh * 2 };
    }

    private _paintFade(g: Graphics, alpha: number) {
        const { hw, hh, w, h } = this._fadeCover();
        if (this._fadeNode?.isValid) {
            const ui = this._fadeNode.getComponent(UITransform);
            if (ui) ui.setContentSize(w, h);
        }
        g.clear();
        g.fillColor = new Color(0, 0, 0, Math.max(0, Math.min(255, alpha)));
        g.rect(-hw, -hh, w, h);
        g.fill();
    }

    private _buildFadeLayer(canvas: Node) {
        let fade = canvas.getChildByName('FadeLayer');
        const { w, h, hw, hh } = this._fadeCover();
        if (!fade) {
            fade = new Node('FadeLayer');
            fade.setParent(canvas);
            fade.setPosition(0, 0, 0);
            fade.addComponent(UITransform).setContentSize(w, h);
            fade.addComponent(BlockInputEvents);
            const g = fade.addComponent(Graphics);
            g.fillColor = new Color(0, 0, 0, 0);
            g.rect(-hw, -hh, w, h); g.fill();
        } else {
            const ui = fade.getComponent(UITransform) ?? fade.addComponent(UITransform);
            ui.setContentSize(w, h);
        }
        // ★ 空闲时必须关掉：否则全屏 BlockInputEvents 会吃掉 GameOver / Lobby 点击
        fade.active = false;
        fade.setSiblingIndex(canvas.children.length - 1);
        this._fadeNode = fade;
        this._fadeG = fade.getComponent(Graphics);
    }

    private _animateFade(from: number, to: number, duration: number, cb: () => void) {
        if (!this._fadeG || !this._fadeNode) { cb(); return; }
        const g = this._fadeG;
        const fade = this._fadeNode;
        const gen = this._fadeGen;
        fade.active = true;
        fade.setSiblingIndex(fade.parent!.children.length - 1);
        this._paintFade(g, from);

        const step    = 0.016;
        const steps   = Math.max(1, Math.ceil(duration / step));
        let   n       = 0;

        const fn = () => {
            // 回大厅 / restartRun 已作废本轮转场
            if (gen !== this._fadeGen) {
                this.unschedule(fn);
                return;
            }
            n++;
            const alpha = Math.round(from + (to - from) * Math.min(n / steps, 1));
            this._paintFade(g, alpha);
            if (n >= steps) {
                this.unschedule(fn);
                // 淡出结束后关闭遮罩，交还点击权
                if (to <= 0) fade.active = false;
                cb();
            }
        };
        this.schedule(fn, step);
    }
}
