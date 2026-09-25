import { GameSettings, DEFAULT_PROGRESS } from './types';

export const SAVE_VERSION = 2;
export const SAVE_KEY = 'wxgame_save_v2';

/** 完整落库存档结构 */
export interface SaveData {
    version: number;
    currency: {
        /** 局外软通货（通关/成就获得） */
        soul: number;
        /** 历史累计局内金币（统计） */
        totalRunCoins: number;
    };
    progress: {
        highestFloor: number;
        highestScore: number;
        totalKills: number;
        totalRuns: number;
        clearCount: number;
        bestClearTime: number;
        /** 已通关关卡 id（关卡模式） */
        stagesCleared: string[];
        /** 关卡最高星级 1–3（对应普通/困难/噩梦通关） */
        stageStars: Record<string, number>;
        /** 无尽模式历史最高层 */
        highestEndlessFloor: number;
    };
    unlocks: {
        weapons: string[];
        characters: string[];
        talents: string[];
    };
    /** 天赋等级 id → level */
    talents: Record<string, number>;
    /** 局外商店永久加成（开局灌入 PlayerStats） */
    shopPurchases: {
        /** 累计最大生命加成（每次购买叠加） */
        maxHp: number;
        /** 累计攻击加成 */
        atk: number;
        /** 累计防御加成 */
        def: number;
        /** 累计移速加成 */
        moveSpeed: number;
    };
    /** 图鉴遭遇解锁（首次见主题/怪/武器） */
    codex: {
        themes: string[];
        enemies: string[];
        weapons: string[];
    };
    /** 当前出战角色 id */
    selectedCharacter: string;
    /** 当前出战武器 id（局外备战；开战默认装备，局内可再切） */
    selectedWeapon: string;
    /** 当前选择难度（普通/困难/噩梦） */
    selectedDifficulty: string;
    settings: GameSettings;
    /** 一次性补偿/调试 grant id（避免重复发） */
    grants?: string[];
    /** 已使用的兑换码（大写） */
    redeemedCodes?: string[];
    /** 局外补给箱（灵魂店购买）。开战时灌进 RunBag 并清空对应数量。 */
    stash: Record<string, number>;
    /** 一次性标记（新手引导等） */
    flags: {
        tutorialDone?: boolean;
    };
}

export const DEFAULT_SAVE: SaveData = {
    version: SAVE_VERSION,
    currency: { soul: 0, totalRunCoins: 0 },
    progress: {
        highestFloor: 0,
        highestScore: 0,
        totalKills: 0,
        totalRuns: 0,
        clearCount: 0,
        bestClearTime: 0,
        stagesCleared: [],
        stageStars: {},
        highestEndlessFloor: 0,
    },
    unlocks: {
        weapons: ['sword'],
        characters: ['knight'],
        talents: [],
    },
    talents: {},
    shopPurchases: { maxHp: 0, atk: 0, def: 0, moveSpeed: 0 },
    codex: { themes: [], enemies: [], weapons: [] },
    selectedCharacter: 'knight',
    selectedWeapon: 'sword',
    selectedDifficulty: 'normal',
    settings: { ...DEFAULT_PROGRESS.settings },
    grants: [],
    redeemedCodes: [],
    stash: {},
    flags: {},
};

/** 从旧 PlayerProgress / 任意 JSON 迁移到 SaveData */
export function migrateSave(raw: any): SaveData {
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_SAVE, settings: { ...DEFAULT_SAVE.settings } };

    // 已是 v2
    if (raw.version >= 2 && raw.currency && raw.progress) {
        return {
            ...DEFAULT_SAVE,
            ...raw,
            version: SAVE_VERSION,
            currency: { ...DEFAULT_SAVE.currency, ...raw.currency },
            progress: {
                ...DEFAULT_SAVE.progress,
                ...raw.progress,
                stagesCleared: Array.isArray(raw.progress?.stagesCleared)
                    ? raw.progress.stagesCleared.filter((x: unknown) => typeof x === 'string')
                    : [],
                stageStars: migrateStageStars(raw.progress?.stageStars),
                highestEndlessFloor: typeof raw.progress?.highestEndlessFloor === 'number'
                    ? Math.max(0, Math.floor(raw.progress.highestEndlessFloor))
                    : 0,
            },
            unlocks: {
                weapons: raw.unlocks?.weapons ?? DEFAULT_SAVE.unlocks.weapons,
                // 必须拷贝：直接引用 DEFAULT 时解锁 push 会污染清档模板
                characters: Array.isArray(raw.unlocks?.characters)
                    ? [...raw.unlocks.characters]
                    : [...DEFAULT_SAVE.unlocks.characters],
                talents: raw.unlocks?.talents ?? [],
            },
            talents: raw.talents ?? {},
            shopPurchases: {
                maxHp: raw.shopPurchases?.maxHp ?? 0,
                atk: raw.shopPurchases?.atk ?? 0,
                def: raw.shopPurchases?.def ?? 0,
                moveSpeed: raw.shopPurchases?.moveSpeed ?? 0,
            },
            codex: {
                themes: Array.isArray(raw.codex?.themes) ? [...raw.codex.themes] : [],
                enemies: Array.isArray(raw.codex?.enemies) ? [...raw.codex.enemies] : [],
                // 商店已解锁武器同步进图鉴（旧档无 codex.weapons 时补齐）
                weapons: mergeUniqueIds(raw.codex?.weapons, raw.unlocks?.weapons),
            },
            selectedCharacter: typeof raw.selectedCharacter === 'string' && raw.selectedCharacter
                ? raw.selectedCharacter
                : 'knight',
            selectedWeapon: typeof raw.selectedWeapon === 'string' && raw.selectedWeapon
                ? raw.selectedWeapon
                : 'sword',
            selectedDifficulty: typeof raw.selectedDifficulty === 'string' && raw.selectedDifficulty
                ? raw.selectedDifficulty
                : 'normal',
            settings: { ...DEFAULT_SAVE.settings, ...raw.settings },
            grants: Array.isArray(raw.grants)
                ? raw.grants.filter((g: unknown) => typeof g === 'string')
                : [],
            redeemedCodes: Array.isArray(raw.redeemedCodes)
                ? raw.redeemedCodes
                    .filter((g: unknown) => typeof g === 'string')
                    .map((g: string) => g.toUpperCase())
                : [],
            stash: migrateStash(raw.stash),
            flags: {
                tutorialDone: !!(raw.flags && raw.flags.tutorialDone),
            },
        };
    }

    // 旧 PlayerProgress 扁平结构
    return {
        version: SAVE_VERSION,
        currency: {
            soul: 0,
            totalRunCoins: raw.totalCoins ?? 0,
        },
        progress: {
            highestFloor: raw.highestFloor ?? 0,
            highestScore: raw.highestScore ?? 0,
            totalKills: raw.totalKills ?? 0,
            totalRuns: raw.totalRuns ?? 0,
            clearCount: 0,
            bestClearTime: raw.bestClearTime ?? 0,
            stagesCleared: [],
            stageStars: {},
            highestEndlessFloor: 0,
        },
        unlocks: {
            weapons: raw.unlockedItems?.length ? raw.unlockedItems : ['sword'],
            characters: ['knight'],
            talents: [],
        },
        talents: {},
        shopPurchases: { maxHp: 0, atk: 0, def: 0, moveSpeed: 0 },
        codex: {
            themes: [],
            enemies: [],
            weapons: mergeUniqueIds(
                raw.unlockedItems?.length ? raw.unlockedItems : ['sword'],
            ),
        },
        selectedCharacter: 'knight',
        selectedWeapon: 'sword',
        selectedDifficulty: 'normal',
        settings: { ...DEFAULT_SAVE.settings, ...(raw.settings ?? {}) },
        grants: [],
        stash: {},
        flags: {},
    };
}

/** 关卡星级 1–3；非法键/值丢弃 */
function migrateStageStars(raw: unknown): Record<string, number> {
    if (!raw || typeof raw !== 'object') return {};
    const out: Record<string, number> = {};
    for (const k of Object.keys(raw as Record<string, unknown>)) {
        if (!k) continue;
        const v = (raw as Record<string, unknown>)[k];
        const n = typeof v === 'number' ? v : Number(v);
        if (!Number.isFinite(n)) continue;
        const stars = Math.max(0, Math.min(3, Math.floor(n)));
        if (stars <= 0) continue;
        out[k] = stars;
    }
    return out;
}

function migrateStash(raw: unknown): Record<string, number> {
    if (!raw || typeof raw !== 'object') return {};
    const out: Record<string, number> = {};
    for (const k of Object.keys(raw as Record<string, unknown>)) {
        if (!k) continue;
        const v = (raw as Record<string, unknown>)[k];
        const n = typeof v === 'number' ? v : Number(v);
        if (!Number.isFinite(n) || n <= 0) continue;
        out[k] = Math.min(99, Math.floor(n));
    }
    return out;
}

/** 合并 id 列表并去重（保序） */
function mergeUniqueIds(...lists: Array<unknown>): string[] {
    const out: string[] = [];
    for (const list of lists) {
        if (!Array.isArray(list)) continue;
        for (const id of list) {
            if (typeof id !== 'string' || !id) continue;
            if (out.indexOf(id) < 0) out.push(id);
        }
    }
    return out;
}
