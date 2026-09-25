import { Color } from 'cc';
import { ConfigStore } from '../../core/ConfigStore';

/** 障碍物绘制风格（FloorRenderer 按此分支画形） */
export type ObstacleStyle = 'rock' | 'pillar' | 'root' | 'crystal' | 'cloud';

/**
 * MapThemeDef —— 运行时主题（颜色已由 ConfigStore 从配置包转成 Color）
 */
export interface MapThemeDef {
    id: string;
    name: string;
    emoji: string;
    floorDark: Color;
    floorLight: Color;
    floorEdge: Color;
    floorShine: Color;
    borderColor: Color;
    obstacleStyle: ObstacleStyle;
    /** 散落障碍数量 */
    obstacleCount: number;
    /** 四角加固障碍每角数量 */
    cornerCount: number;
    /** 障碍主色 / 高光 */
    obstacleDark: Color;
    obstacleMid: Color;
    obstacleLight: Color;
    floorMin: number;
    floorMax: number;
    weight: number;
    blurb: string;
}

function c(r: number, g: number, b: number, a = 255): Color {
    return new Color(r, g, b, a);
}

function themes(): readonly MapThemeDef[] {
    return ConfigStore.themes();
}

function firstTheme(): MapThemeDef {
    const first = themes()[0];
    if (!first) throw new Error('[ThemeRuntime] 主题表为空');
    return first;
}

// ── M3：主题刷怪池（数值在配置包） ────────────────────────────

export type SpawnEnemyType = 'slime' | 'fast' | 'tank' | 'archer' | 'wisp' | 'mage' | 'beetle' | 'bat' | 'toad' | 'crystal' | 'golem' | 'moth' | 'dragon' | 'raven' | 'mosquito' | 'specter' | 'bone' | 'spider' | 'snake' | 'imp' | 'shroom' | 'jelly';

/** 单条刷怪权重条目（hp/spd 乘子 + 可选占位色） */
export interface BiomeSpawnEntry {
    type: SpawnEnemyType;
    weight: number;
    hpMul?: number;
    spdMul?: number;
    /** Graphics 占位色 [r,g,b]；缺省走类型默认色 */
    color?: readonly [number, number, number];
    /** #171 层段门控：前几层不刷稀有/终局怪 */
    floorMin?: number;
    floorMax?: number;
}

/** 终极兜底（不读配置包，避免主题池被清空后连锁空表） */
const EMERGENCY_SPAWN: readonly BiomeSpawnEntry[] = [
    { type: 'slime', weight: 1 },
];

function isNonEmptyPool(pool: readonly BiomeSpawnEntry[] | undefined): pool is readonly BiomeSpawnEntry[] {
    return !!pool && pool.length > 0;
}

/**
 * 取主题刷怪池。
 * 未知 themeId / 空表 → cave；cave 也空 → EMERGENCY_SPAWN。
 * 禁止静默用全球混表。
 */
export function getBiomeSpawnTable(themeId: string): readonly BiomeSpawnEntry[] {
    const tables = ConfigStore.biomeSpawn();
    const primary = tables[themeId];
    if (isNonEmptyPool(primary)) return primary;

    const cave = tables.cave;
    if (themeId !== 'cave' && isNonEmptyPool(cave)) return cave;

    return EMERGENCY_SPAWN;
}

/** 按权重抽一条；可按层过滤 floorMin/floorMax。空表/全 0 权重时安全回退 */
export function pickBiomeSpawn(themeId: string, floor = 1): BiomeSpawnEntry {
    const raw = getBiomeSpawnTable(themeId);
    const pool = raw.filter(e => {
        const min = e.floorMin ?? 1;
        const max = e.floorMax ?? 99;
        return floor >= min && floor <= max;
    });
    const use = pool.length > 0 ? pool : raw;
    if (use.length === 0) return EMERGENCY_SPAWN[0];

    const total = use.reduce((s, e) => s + Math.max(0, e.weight), 0);
    if (total <= 0) return use[0] ?? EMERGENCY_SPAWN[0];

    let r = Math.random() * total;
    for (const e of use) {
        r -= Math.max(0, e.weight);
        if (r <= 0) return e;
    }
    return use[use.length - 1] ?? EMERGENCY_SPAWN[0];
}

/** Boss 占位色（共享 BossEnemy，仅换色提示主题） */
export function bossTintForTheme(themeId: string, isFinal: boolean): { body: Color; mid: Color } {
    if (isFinal) {
        return { body: c(140, 20, 40), mid: c(220, 60, 80) };
    }
    switch (themeId) {
        case 'cave':
            return { body: c(70, 48, 36), mid: c(140, 100, 70) };
        case 'ruins':
            return { body: c(70, 55, 95), mid: c(160, 140, 190) };
        case 'swamp':
            return { body: c(30, 70, 40), mid: c(80, 180, 90) };
        case 'ice':
            return { body: c(60, 100, 140), mid: c(160, 210, 250) };
        case 'sky':
            return { body: c(70, 90, 140), mid: c(180, 200, 240) };
        case 'volcano':
            return { body: c(100, 30, 20), mid: c(240, 100, 40) };
        case 'abyss':
            return { body: c(40, 20, 70), mid: c(160, 100, 240) };
        case 'necropolis':
            return { body: c(50, 48, 55), mid: c(180, 190, 170) };
        default:
            return { body: c(90, 20, 120), mid: c(180, 60, 220) };
    }
}

/**
 * ThemeRuntime —— 当前主题 + 按层抽取（同层 4 房稳定；换层重 roll）
 */
export class ThemeRuntime {
    private static _current: MapThemeDef | null = null;

    static get currentTheme(): MapThemeDef {
        if (!ThemeRuntime._current) ThemeRuntime._current = firstTheme();
        return ThemeRuntime._current;
    }

    static set currentTheme(theme: MapThemeDef) {
        ThemeRuntime._current = theme;
    }

    /** 本局每层已抽到的主题（同层房间复用） */
    private static _floorCache = new Map<number, string>();
    private static _prevFloorThemeId: string | null = null;
    /** 最近抽过的主题（最多记 3 个），用于软降权防连抽 */
    private static _recentThemeIds: string[] = [];

    static getTheme(id: string): MapThemeDef {
        return ConfigStore.theme(id) ?? firstTheme();
    }

    static allThemes(): readonly MapThemeDef[] {
        return themes();
    }

    /** 新一局：清层缓存，允许重新随机 */
    static resetRun() {
        ThemeRuntime._floorCache.clear();
        ThemeRuntime._prevFloorThemeId = null;
        ThemeRuntime._recentThemeIds = [];
        ThemeRuntime._current = firstTheme();
    }

    /**
     * 按层 roll 主题（权重 + 层段过滤 + 尽量不与上一层相同 + 近期软降权）
     * 同 floor 多次调用返回同一主题，保证 4 房视觉稳定（M10）。
     */
    static rollTheme(floor: number): MapThemeDef {
        const overrideId = ConfigStore.floorOverride(floor)?.themeId;
        if (overrideId) {
            const forced = ConfigStore.theme(overrideId);
            if (forced) {
                ThemeRuntime._floorCache.set(floor, forced.id);
                ThemeRuntime._remember(forced.id);
                ThemeRuntime.currentTheme = forced;
                return forced;
            }
        }

        const cached = ThemeRuntime._floorCache.get(floor);
        if (cached) {
            const t = ThemeRuntime.getTheme(cached);
            ThemeRuntime.currentTheme = t;
            return t;
        }

        const all = themes();
        const pool = all.filter(
            t => floor >= t.floorMin && floor <= t.floorMax,
        );
        const candidates = pool.length > 0 ? pool : [...all];

        // 硬规则：尽量不与上一层相同（只剩 1 个候选时放行）
        let pickPool = candidates;
        if (ThemeRuntime._prevFloorThemeId && candidates.length > 1) {
            const filtered = candidates.filter(t => t.id !== ThemeRuntime._prevFloorThemeId);
            if (filtered.length > 0) pickPool = filtered;
        }

        const theme = ThemeRuntime._weightedPick(pickPool);
        ThemeRuntime._floorCache.set(floor, theme.id);
        ThemeRuntime._remember(theme.id);
        ThemeRuntime.currentTheme = theme;
        return theme;
    }

    private static _remember(id: string) {
        ThemeRuntime._prevFloorThemeId = id;
        ThemeRuntime._recentThemeIds = [
            id,
            ...ThemeRuntime._recentThemeIds.filter(x => x !== id),
        ].slice(0, 3);
    }

    private static _weightedPick(pool: MapThemeDef[]): MapThemeDef {
        const fallback = pool[0];
        if (!fallback) throw new Error('[ThemeRuntime] 无可选主题');
        const recent = ThemeRuntime._recentThemeIds;
        const weights = pool.map(t => {
            let w = Math.max(0, t.weight);
            const idx = recent.indexOf(t.id);
            if (idx === 0) w *= 0.12;      // 刚抽过（若硬过滤失败才落到这）
            else if (idx === 1) w *= 0.4;  // 上上层
            else if (idx === 2) w *= 0.7;
            return w;
        });
        const total = weights.reduce((s, w) => s + w, 0);
        if (total <= 0) return fallback;
        let r = Math.random() * total;
        for (let i = 0; i < pool.length; i++) {
            r -= weights[i];
            if (r <= 0) return pool[i] ?? fallback;
        }
        return pool[pool.length - 1] ?? fallback;
    }
}
