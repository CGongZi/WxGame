// ═══════════════════════════════════════════
//  核心游戏类型定义
//  所有游戏数据结构都在这里定义
// ═══════════════════════════════════════════

// ── 基础枚举 ──
export type WeaponType = 'melee' | 'ranged' | 'magic';
export type Rarity = 'common' | 'rare' | 'epic';
export type EnemyType = 'melee' | 'ranged' | 'boss';
export type ItemType = 'weapon' | 'consumable' | 'passive';
export type RoomType = 'start' | 'combat' | 'treasure' | 'shop' | 'boss';
export type Direction = 'north' | 'south' | 'east' | 'west';
export type EnemyState = 'idle' | 'chase' | 'attack' | 'stunned' | 'dead';

// ── 武器数据 ──
export interface WeaponData {
    id: string;
    name: string;
    type: WeaponType;
    rarity: Rarity;
    damage: number;
    attackSpeed: number;     // 攻击冷却时间（秒）
    range: number;           // 攻击范围（像素），近战用
    bulletSpeed?: number;    // 子弹速度（仅远程）
    knockback: number;       // 击退力度
    prefabPath: string;      // resources/ 相对路径
    iconPath: string;        // 图标路径
    description: string;
}

// ── 怪物数据 ──
export interface DropEntry {
    itemId: string;
    weight: number;
}

export interface EnemyData {
    id: string;
    displayName: string;
    type: EnemyType;
    hp: number;
    damage: number;
    speed: number;
    attackRange: number;
    detectionRange: number;  // 感知玩家距离
    dropTable: DropEntry[];
    coinDrop: { min: number; max: number; chance: number };
    prefabPath: string;
    expValue: number;        // 击杀经验（未来扩展）
}

// ── 道具数据 ──
export interface ItemData {
    id: string;
    type: ItemType;
    name: string;
    description: string;
    rarity: Rarity;
    iconPath: string;
    // 消耗品效果
    healAmount?: number;     // 回复 HP
    weaponId?: string;       // 武器类道具对应的武器 ID
    passiveEffect?: string;  // 被动效果描述
}

// ── 地牢房间 ──
export interface RoomData {
    id: string;
    type: RoomType;
    templateId: string;      // Tiled 地图模板文件名（不含扩展）
    exits: Direction[];      // 出口方向
    enemies: EnemySpawnEntry[];
    isCleared: boolean;
    gridX: number;           // 房间在地牢网格中的坐标
    gridY: number;
}

export interface EnemySpawnEntry {
    enemyId: string;
    count: number;
    spawnDelay?: number;     // 生成延迟（秒）
}

// ── 地牢层 ──
export interface FloorData {
    floorNumber: number;     // 1 ~ DUNGEON_TOTAL_FLOORS
    rooms: RoomData[];
    startRoomId: string;
    bossRoomId: string;
    currentRoomId: string;
}

// ── 局内游戏状态 ──
export interface RunState {
    floor: number;
    coins: number;
    playerHp: number;
    playerMaxHp: number;
    equippedWeapon: WeaponData | null;
    inventory: ItemData[];
    killCount: number;
    startTime: number;       // Date.now()
    reviveCount: number;
    score: number;
}

// ── 玩家存档（跨局持久化）──
export interface PlayerProgress {
    highestFloor: number;
    highestScore: number;
    totalKills: number;
    totalRuns: number;
    totalCoins: number;
    bestClearTime: number;   // 最快通关时间（秒），0 表示未通关
    unlockedItems: string[];
    settings: GameSettings;
}

export interface GameSettings {
    bgmVolume: number;       // 0 ~ 1
    sfxVolume: number;       // 0 ~ 1
    vibration: boolean;
}

// ── 默认值 ──
export const DEFAULT_PROGRESS: PlayerProgress = {
    highestFloor: 0,
    highestScore: 0,
    totalKills: 0,
    totalRuns: 0,
    totalCoins: 0,
    bestClearTime: 0,
    unlockedItems: [],
    settings: {
        bgmVolume: 0.6,
        sfxVolume: 0.8,
        vibration: true,
    },
};
