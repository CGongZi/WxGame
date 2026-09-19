/**
 * 地牢房间数据结构
 */

export type RoomType = 'start' | 'combat' | 'treasure' | 'shop' | 'boss';
export type DoorDir  = 'north' | 'south' | 'east' | 'west';

export interface DoorInfo {
    dir:      DoorDir;
    toRoomId: number;
}

export interface RoomData {
    id:       number;
    type:     RoomType;
    gridX:    number;   // 在房间地图格子中的位置
    gridY:    number;
    doors:    DoorInfo[];
    cleared:  boolean;
    visited:  boolean;
}

/** 横屏房间物理尺寸（像素，设计分辨率 1334×750） */
export const ROOM_CONFIG = {
    WIDTH:      1100,   // 房间内部宽
    HEIGHT:     620,    // 房间内部高
    WALL_SIZE:  48,     // 墙厚
    DOOR_WIDTH: 80,     // 门洞宽
    /** 房间在格子坐标中的步长（格子间距=房间外尺寸） */
    GRID_STEP_X: 1196,  // WIDTH + WALL_SIZE*2
    GRID_STEP_Y: 716,
} as const;

/** 房间类型配置 */
export const ROOM_TYPE_CONFIG: Record<RoomType, {
    label: string; color: string; enemyCount: number; hasLoot: boolean;
}> = {
    start:    { label: '入口',   color: '#4488ff', enemyCount: 0, hasLoot: false },
    combat:   { label: '战斗',   color: '#ff4444', enemyCount: 5, hasLoot: true  },
    treasure: { label: '宝藏',   color: '#ffcc00', enemyCount: 0, hasLoot: true  },
    shop:     { label: '商店',   color: '#44ff88', enemyCount: 0, hasLoot: false },
    boss:     { label: '🐉BOSS', color: '#aa00ff', enemyCount: 1, hasLoot: true  },
};
