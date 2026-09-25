/**
 * 动作参数按 id 查表，禁止靠颜色/体型临时 if 堆。
 * IdleBreath / EnemyMotion / WeaponHand 只读本表。
 */

export interface GaitDef {
    idle: number;
    run: number;
    foot: number;
    /** 落地挤压 X */
    sx: number;
    /** 腾空拉高 Y 压缩量 */
    sy: number;
    /** 步伐腾空高度 */
    bobY: number;
    /** 左右晃 */
    sway: number;
    /** 前倾缩放偏置 */
    lean: number;
    /** 步伐倾角 */
    tilt: number;
    /** 落地压扁额外量（0~1） */
    plant: number;
}

export interface StrikeStyleDef {
    dist: number;
    /** 总出击时长（含收回） */
    dur: number;
    scale: number;
    /** 蓄力占比 0~1 */
    wind: number;
    /** 出击占比 0~1（其余为 recover） */
    lunge: number;
}

export type WeaponSwingKind = 'slash' | 'thrust' | 'stab' | 'bow' | 'staff' | 'heavy';

export interface WeaponSwingDef {
    kind: WeaponSwingKind;
    /** 挥击起始角偏移（度，相对瞄准） */
    from: number;
    /** 挥击结束角偏移 */
    to: number;
    /** 出击时径向伸出 */
    reach: number;
    dur: number;
    /** 闲置携带角 */
    rest: number;
}

const DEFAULT_GAIT: GaitDef = {
    // #151 稳身走姿：少晃少倾，靠落地压扁 + 腾空抬高读步伐（四肢摆动在 CharacterRig）
    idle: 2.2, run: 9.5, foot: 11, sx: 0.07, sy: 0.12, bobY: 3.2, sway: 0.5, lean: 0.012, tilt: 2.2, plant: 0.13,
};

/** skinId → 走姿（身体稳、步伐清：压扁/抬脚为主，晃动克制） */
export const GAIT_BY_SKIN: Readonly<Record<string, GaitDef>> = {
    knight: DEFAULT_GAIT,
    ranger: { idle: 2.4, run: 11.5, foot: 13.5, sx: 0.05, sy: 0.13, bobY: 3.8, sway: 0.7, lean: 0.016, tilt: 2.6, plant: 0.1 },
    stormcaller: { idle: 2.4, run: 11.5, foot: 13.5, sx: 0.05, sy: 0.13, bobY: 3.8, sway: 0.7, lean: 0.016, tilt: 2.6, plant: 0.1 },
    mage: { idle: 1.9, run: 7.5, foot: 9, sx: 0.04, sy: 0.09, bobY: 2.4, sway: 0.35, lean: 0.01, tilt: 1.4, plant: 0.07 },
    geomancer: { idle: 1.9, run: 7.5, foot: 9, sx: 0.04, sy: 0.09, bobY: 2.4, sway: 0.35, lean: 0.01, tilt: 1.4, plant: 0.07 },
    berserker: { idle: 2.3, run: 10, foot: 12.5, sx: 0.08, sy: 0.14, bobY: 3.6, sway: 0.65, lean: 0.018, tilt: 2.8, plant: 0.16 },
    assassin: { idle: 2.6, run: 13, foot: 15, sx: 0.045, sy: 0.12, bobY: 4.0, sway: 0.75, lean: 0.014, tilt: 2.8, plant: 0.08 },
    paladin: { idle: 1.9, run: 7.8, foot: 9.5, sx: 0.075, sy: 0.11, bobY: 2.8, sway: 0.4, lean: 0.01, tilt: 1.6, plant: 0.15 },
    warden: { idle: 1.9, run: 7.8, foot: 9.5, sx: 0.075, sy: 0.11, bobY: 2.8, sway: 0.4, lean: 0.01, tilt: 1.6, plant: 0.15 },
    dragonkin: { idle: 2.1, run: 9, foot: 11, sx: 0.07, sy: 0.12, bobY: 3.2, sway: 0.55, lean: 0.014, tilt: 2.2, plant: 0.13 },
    cryomancer: { idle: 1.8, run: 7.2, foot: 8.5, sx: 0.04, sy: 0.08, bobY: 2.2, sway: 0.3, lean: 0.008, tilt: 1.2, plant: 0.06 },
    plague: { idle: 2.5, run: 11, foot: 13, sx: 0.05, sy: 0.12, bobY: 3.6, sway: 0.65, lean: 0.014, tilt: 2.5, plant: 0.09 },
    voidwalker: { idle: 2.6, run: 13, foot: 15.5, sx: 0.04, sy: 0.11, bobY: 4.0, sway: 0.8, lean: 0.015, tilt: 3.0, plant: 0.07 },
    sunpriest: { idle: 1.9, run: 7.5, foot: 9, sx: 0.055, sy: 0.1, bobY: 2.6, sway: 0.35, lean: 0.01, tilt: 1.5, plant: 0.09 },
};

const DEFAULT_STRIKE: StrikeStyleDef = { dist: 8, dur: 0.26, scale: 1.04, wind: 0.22, lunge: 0.38 };

/** skinId → 出击（#162 整体收抖：前冲小、缩放轻） */
export const STRIKE_BY_SKIN: Readonly<Record<string, StrikeStyleDef>> = {
    knight: DEFAULT_STRIKE,
    assassin: { dist: 10, dur: 0.2, scale: 1.04, wind: 0.18, lunge: 0.42 },
    plague: { dist: 10, dur: 0.2, scale: 1.04, wind: 0.18, lunge: 0.42 },
    voidwalker: { dist: 11, dur: 0.18, scale: 1.05, wind: 0.16, lunge: 0.45 },
    ranger: { dist: 6, dur: 0.22, scale: 1.03, wind: 0.22, lunge: 0.35 },
    stormcaller: { dist: 6, dur: 0.22, scale: 1.03, wind: 0.22, lunge: 0.35 },
    mage: { dist: 5, dur: 0.28, scale: 1.04, wind: 0.35, lunge: 0.28 },
    geomancer: { dist: 5, dur: 0.28, scale: 1.04, wind: 0.35, lunge: 0.28 },
    cryomancer: { dist: 5, dur: 0.28, scale: 1.04, wind: 0.35, lunge: 0.28 },
    sunpriest: { dist: 6, dur: 0.3, scale: 1.05, wind: 0.32, lunge: 0.3 },
    berserker: { dist: 12, dur: 0.3, scale: 1.06, wind: 0.26, lunge: 0.38 },
    paladin: { dist: 9, dur: 0.3, scale: 1.05, wind: 0.28, lunge: 0.34 },
    warden: { dist: 9, dur: 0.3, scale: 1.05, wind: 0.28, lunge: 0.34 },
    dragonkin: { dist: 10, dur: 0.28, scale: 1.05, wind: 0.24, lunge: 0.36 },
};

const DEFAULT_SWING: WeaponSwingDef = {
    kind: 'slash', from: -70, to: 85, reach: 10, dur: 0.22, rest: -25,
};

/** weaponId → 持武挥击 */
export const SWING_BY_WEAPON: Readonly<Record<string, WeaponSwingDef>> = {
    sword: DEFAULT_SWING,
    axe: { kind: 'heavy', from: -95, to: 100, reach: 8, dur: 0.28, rest: -35 },
    hammer: { kind: 'heavy', from: -100, to: 90, reach: 6, dur: 0.3, rest: -40 },
    blood_cleaver: { kind: 'heavy', from: -110, to: 105, reach: 10, dur: 0.3, rest: -38 },
    holy_blade: { kind: 'slash', from: -80, to: 95, reach: 12, dur: 0.26, rest: -30 },
    sunblade: { kind: 'slash', from: -85, to: 100, reach: 12, dur: 0.26, rest: -30 },
    dragon_fang: { kind: 'slash', from: -75, to: 90, reach: 14, dur: 0.24, rest: -28 },
    dagger: { kind: 'stab', from: -20, to: 15, reach: 14, dur: 0.16, rest: -15 },
    shadow_daggers: { kind: 'stab', from: -25, to: 20, reach: 15, dur: 0.14, rest: -18 },
    void_edge: { kind: 'stab', from: -30, to: 25, reach: 16, dur: 0.14, rest: -20 },
    shuriken: { kind: 'stab', from: -15, to: 40, reach: 12, dur: 0.16, rest: -10 },
    spear: { kind: 'thrust', from: -6, to: 6, reach: 18, dur: 0.24, rest: -5 },
    ward_glaive: { kind: 'thrust', from: -10, to: 14, reach: 16, dur: 0.24, rest: -8 },
    bow: { kind: 'bow', from: -10, to: 5, reach: -8, dur: 0.18, rest: -40 },
    crossbow: { kind: 'bow', from: -8, to: 4, reach: -6, dur: 0.16, rest: -35 },
    venom_bow: { kind: 'bow', from: -12, to: 6, reach: -10, dur: 0.18, rest: -42 },
    starfall_bow: { kind: 'bow', from: -12, to: 6, reach: -10, dur: 0.18, rest: -42 },
    wand: { kind: 'staff', from: -35, to: 55, reach: 8, dur: 0.24, rest: -20 },
    frost: { kind: 'staff', from: -40, to: 50, reach: 8, dur: 0.24, rest: -22 },
    earth_staff: { kind: 'staff', from: -45, to: 45, reach: 6, dur: 0.26, rest: -25 },
    storm_rod: { kind: 'staff', from: -50, to: 60, reach: 10, dur: 0.22, rest: -18 },
    glacier_orb: { kind: 'staff', from: -30, to: 40, reach: 4, dur: 0.26, rest: -15 },
    venom_vials: { kind: 'staff', from: -25, to: 35, reach: 6, dur: 0.2, rest: -12 },
    solar_scepter: { kind: 'staff', from: -40, to: 55, reach: 8, dur: 0.24, rest: -20 },
    thunder_lance: { kind: 'thrust', from: -5, to: 5, reach: 20, dur: 0.24, rest: -5 },
    scatter_gun: { kind: 'bow', from: -6, to: 4, reach: -12, dur: 0.2, rest: -30 },
    saw_disc: { kind: 'stab', from: -20, to: 50, reach: 12, dur: 0.18, rest: -12 },
};

export function gaitForSkin(skinId: string): GaitDef {
    return GAIT_BY_SKIN[skinId] ?? DEFAULT_GAIT;
}

export function strikeForSkin(skinId: string): StrikeStyleDef {
    return STRIKE_BY_SKIN[skinId] ?? DEFAULT_STRIKE;
}

/** #162 按打法压身体前冲：突刺主要靠枪/刀伸出去，身子几乎不动 */
export function bodyStrikeMul(kind: WeaponSwingKind): number {
    switch (kind) {
        case 'thrust': return 0.22;
        case 'stab': return 0.35;
        case 'bow': return 0.3;
        case 'staff': return 0.4;
        case 'heavy': return 0.75;
        default: return 0.55;
    }
}

export function swingForWeapon(weaponId: string): WeaponSwingDef {
    return SWING_BY_WEAPON[weaponId] ?? DEFAULT_SWING;
}

/** enemy motionKind → 待机呼吸频率（静止时用） */
export const ENEMY_BOB_RATE: Readonly<Record<string, number>> = {
    fast: 3.2,
    bat: 4.0,
    mosquito: 4.5,
    moth: 2.8,
    raven: 3.2,
    specter: 2.4,
    toad: 2.2,
    beetle: 2.5,
    crystal: 1.6,
    golem: 1.2,
    bone: 1.8,
    wisp: 2.8,
    tank: 1.5,
    boss: 1.6,
    archer: 2.2,
    mage: 2.2,
    dragon: 2.8,
    dragon_ground: 1.8,
    slime: 2.4,
    spider: 2.8,
    snake: 2.6,
    imp: 2.4,
    shroom: 1.5,
    jelly: 2.6,
    jelly_ground: 1.8,
};

/** enemy motionKind → 跑步相位速度（仅 moving 时） */
export const ENEMY_RUN_RATE: Readonly<Record<string, number>> = {
    fast: 20,
    bat: 18,
    mosquito: 20,
    moth: 10,
    raven: 12,
    toad: 6.5,
    beetle: 11,
    crystal: 5.5,
    golem: 4.2,
    bone: 7,
    archer: 8,
    slime: 9,
    tank: 5,
    dragon: 10,
    dragon_ground: 7,
    wisp: 7,
    mage: 6,
    boss: 5.5,
    spider: 12,
    snake: 10,
    imp: 9,
    shroom: 4.5,
    jelly: 8,
    jelly_ground: 6,
};

/** 沉重出击时长（秒） */
export const ENEMY_HEAVY_STRIKE = new Set([
    'tank', 'boss', 'beetle', 'crystal', 'golem', 'bone', 'shroom',
]);

export function enemyBobRate(kind: string): number {
    return ENEMY_BOB_RATE[kind] ?? 2.4;
}

export function enemyRunRate(kind: string): number {
    return ENEMY_RUN_RATE[kind] ?? 9;
}

export function enemyStrikeDur(kind: string): number {
    return ENEMY_HEAVY_STRIKE.has(kind) ? 0.38 : 0.22;
}
