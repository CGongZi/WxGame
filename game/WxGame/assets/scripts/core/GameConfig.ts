/**
 * 全局游戏配置常量
 * 所有数值调整都在这里改，不要硬编码在组件里
 */
export const GameConfig = {
    // ── 玩家 ──
    PLAYER_BASE_HP: 100,
    PLAYER_BASE_SPEED: 150,        // 像素/秒
    PLAYER_BASE_DAMAGE: 20,
    PLAYER_INVINCIBLE_TIME: 0.5,   // 受击无敌时间（秒）

    // ── 地牢 ──
    DUNGEON_TOTAL_FLOORS: 5,       // 总层数
    DUNGEON_ROOMS_MIN: 5,          // 每层最少房间数
    DUNGEON_ROOMS_MAX: 8,          // 每层最多房间数
    ROOM_WIDTH_TILES: 20,          // 房间宽度（瓦片数）
    ROOM_HEIGHT_TILES: 14,         // 房间高度（瓦片数）
    TILE_SIZE: 16,                 // 单个瓦片像素大小

    // ── 战斗 ──
    CRIT_CHANCE: 0.15,             // 暴击概率 15%
    CRIT_MULTIPLIER: 1.5,          // 暴击倍率
    DAMAGE_VARIANCE: 0.1,          // 伤害随机浮动 ±10%
    KNOCKBACK_FORCE: 200,          // 击退力度

    // ── 经济 ──
    COIN_BASE_DROP_CHANCE: 0.6,    // 怪物掉金币概率
    COIN_VALUE_MIN: 1,
    COIN_VALUE_MAX: 5,
    SHOP_ITEM_COUNT: 3,            // 商店同时展示商品数

    // ── 音频 ──
    BGM_VOLUME: 0.6,
    SFX_VOLUME: 0.8,
    BGM_FADE_DURATION: 0.5,

    // ── UI ──
    CANVAS_WIDTH: 750,
    CANVAS_HEIGHT: 1334,
    SAFE_AREA_BOTTOM: 34,          // iPhone 底部安全区（像素）

    // ── 广告 ──
    AD_REVIVE_UNIT_ID: '',         // 填入激励视频广告 ID
    MAX_REVIVE_COUNT: 1,           // 每局最多复活次数
} as const;
