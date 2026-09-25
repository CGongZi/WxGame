import { Color } from 'cc';
import type { WeaponDef } from './WeaponController';

/**
 * #156 武器稀有度（元气骑士式色阶）
 * white → green → blue → purple → gold → red
 * 兼容旧包 common/rare/epic。
 */
export type WeaponRarity =
    | 'white' | 'green' | 'blue' | 'purple' | 'gold' | 'red'
    | 'common' | 'rare' | 'epic';

export const RARITY_ORDER: Array<Exclude<WeaponRarity, 'common' | 'rare' | 'epic'>> = [
    'white', 'green', 'blue', 'purple', 'gold', 'red',
];

const LEGACY: Record<string, typeof RARITY_ORDER[number]> = {
    common: 'white',
    rare: 'blue',
    epic: 'purple',
};

export function normalizeRarity(r?: string | null): typeof RARITY_ORDER[number] {
    if (!r) return 'white';
    if (LEGACY[r]) return LEGACY[r];
    if ((RARITY_ORDER as string[]).indexOf(r) >= 0) return r as typeof RARITY_ORDER[number];
    return 'white';
}

export function rarityLabel(r?: string | null): string {
    switch (normalizeRarity(r)) {
        case 'white': return '白';
        case 'green': return '绿';
        case 'blue': return '蓝';
        case 'purple': return '紫';
        case 'gold': return '金';
        case 'red': return '红';
        default: return '白';
    }
}

export function rarityColor(r?: string | null): Color {
    switch (normalizeRarity(r)) {
        case 'white': return new Color(220, 220, 230, 255);
        case 'green': return new Color(90, 210, 110, 255);
        case 'blue': return new Color(90, 160, 255, 255);
        case 'purple': return new Color(200, 110, 255, 255);
        case 'gold': return new Color(255, 190, 60, 255);
        case 'red': return new Color(255, 70, 80, 255);
        default: return new Color(220, 220, 230, 255);
    }
}

/** 相对白武的伤害倍率 */
export function rarityDamageMul(r?: string | null): number {
    switch (normalizeRarity(r)) {
        case 'white': return 1;
        case 'green': return 1.12;
        case 'blue': return 1.28;
        case 'purple': return 1.48;
        case 'gold': return 1.72;
        case 'red': return 2.05;
        default: return 1;
    }
}

/** 层数抬伤：越高层掉落越狠 */
export function floorDamageMul(floor: number): number {
    const f = Math.max(1, Math.floor(floor || 1));
    return 1 + (f - 1) * 0.14;
}

/**
 * 按层偏置抽稀有度：低层多白绿，高层才出金红。
 */
export function rollDropRarity(floor: number): typeof RARITY_ORDER[number] {
    const f = Math.max(1, Math.floor(floor || 1));
    const weights: Array<{ r: typeof RARITY_ORDER[number]; w: number }> = [
        { r: 'white',  w: Math.max(1, 14 - f * 1.6) },
        { r: 'green',  w: Math.max(1, 10 - f * 0.6) },
        { r: 'blue',   w: 4 + f * 0.9 },
        { r: 'purple', w: 1.2 + f * 0.7 },
        { r: 'gold',   w: f >= 3 ? 0.4 + (f - 2) * 0.55 : 0.05 },
        { r: 'red',    w: f >= 4 ? 0.15 + (f - 3) * 0.35 : 0 },
    ];
    const total = weights.reduce((s, x) => s + x.w, 0);
    let roll = Math.random() * total;
    for (const row of weights) {
        roll -= row.w;
        if (roll <= 0) return row.r;
    }
    return 'white';
}

/** 生成局内掉落副本：叠层数 × 稀有度伤害，并写回 rarity */
export function scaleDropWeapon(base: WeaponDef, floor: number, rarity?: string): WeaponDef {
    const tier = rarity ? normalizeRarity(rarity) : rollDropRarity(floor);
    const mul = floorDamageMul(floor) * rarityDamageMul(tier);
    return {
        ...base,
        bulletColor: base.bulletColor ? base.bulletColor.clone() : undefined,
        damage: Math.max(1, Math.round(base.damage * mul)),
        rarity: tier,
        description: base.description,
    };
}
