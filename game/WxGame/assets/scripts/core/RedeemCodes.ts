/**
 * #186 兑换码表（局外）
 * 码统一大写比对；每账号每码仅可兑一次。
 */

export type RedeemReward =
    | { kind: 'soul'; amount: number }
    | { kind: 'item'; itemId: string; amount: number }
    | { kind: 'character'; characterId: string };

export interface RedeemCodeDef {
    /** 玩家输入的码（存储为大写） */
    code: string;
    /** 展示标题 */
    title: string;
    rewards: RedeemReward[];
}

export const REDEEM_CODES: readonly RedeemCodeDef[] = [
    {
        code: 'WELCOME',
        title: '新人礼包',
        rewards: [
            { kind: 'soul', amount: 50 },
            { kind: 'item', itemId: 'potion_hp', amount: 2 },
        ],
    },
    {
        code: 'SOUL88',
        title: '灵魂补给',
        rewards: [
            { kind: 'soul', amount: 88 },
        ],
    },
    {
        code: 'BAGPACK',
        title: '冒险背包',
        rewards: [
            { kind: 'item', itemId: 'potion_hp', amount: 3 },
            { kind: 'item', itemId: 'bomb', amount: 2 },
            { kind: 'item', itemId: 'potion_rage', amount: 1 },
        ],
    },
    {
        code: 'PIXELGO',
        title: '像素出击',
        rewards: [
            { kind: 'soul', amount: 100 },
            { kind: 'item', itemId: 'frost_bomb', amount: 2 },
            { kind: 'item', itemId: 'potion_shield', amount: 1 },
        ],
    },
    {
        code: 'RANGEROK',
        title: '游侠试用',
        rewards: [
            { kind: 'character', characterId: 'ranger' },
            { kind: 'soul', amount: 30 },
            { kind: 'item', itemId: 'scroll_haste', amount: 1 },
        ],
    },
    {
        code: 'VIPDAY',
        title: '节日加赠',
        rewards: [
            { kind: 'soul', amount: 200 },
            { kind: 'item', itemId: 'elixir_life', amount: 1 },
            { kind: 'item', itemId: 'coin_pouch', amount: 2 },
        ],
    },
];

export function normalizeRedeemCode(raw: string): string {
    return (raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function findRedeemCode(raw: string): RedeemCodeDef | null {
    const code = normalizeRedeemCode(raw);
    if (!code) return null;
    return REDEEM_CODES.find(c => c.code === code) ?? null;
}
