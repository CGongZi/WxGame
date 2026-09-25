/**
 * 三档难度：普通 ★ / 困难 ★★ / 噩梦 ★★★
 * 影响本局怪血伤数量与通关魂；关卡星级取历史最高难度通关。
 */

export type DifficultyId = 'normal' | 'hard' | 'nightmare';

export interface DifficultyDef {
    id: DifficultyId;
    name: string;
    /** 通关后记入关卡的星数（1–3） */
    stars: 1 | 2 | 3;
    /** 叠到 runScaleMul / 怪血伤 */
    enemyScale: number;
    /** 叠到刷怪数量 */
    countMul: number;
    /** 通关灵魂石倍率 */
    soulMul: number;
    desc: string;
}

export const DIFFICULTIES: readonly DifficultyDef[] = [
    {
        id: 'normal',
        name: '普通',
        stars: 1,
        enemyScale: 1,
        countMul: 1,
        soulMul: 1,
        desc: '标准强度 · 熟悉节奏',
    },
    {
        id: 'hard',
        name: '困难',
        stars: 2,
        enemyScale: 1.4,
        countMul: 1.2,
        soulMul: 1.4,
        desc: '怪更肉更多 · 魂奖励↑',
    },
    {
        id: 'nightmare',
        name: '噩梦',
        stars: 3,
        enemyScale: 1.85,
        countMul: 1.4,
        soulMul: 1.85,
        desc: '高压围殴 · 最高魂奖',
    },
];

export function getDifficulty(id: string | null | undefined): DifficultyDef {
    const hit = DIFFICULTIES.find(d => d.id === id);
    return hit ?? DIFFICULTIES[0];
}

export function starsLabel(n: number): string {
    const s = Math.max(0, Math.min(3, Math.floor(n)));
    return '★'.repeat(s) + '☆'.repeat(3 - s);
}
