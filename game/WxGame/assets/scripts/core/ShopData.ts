import { ConfigStore } from './ConfigStore';

/** 局外灵魂石商店 —— 商品表（读配置包） */

export type ShopWeaponId = string;

export interface WeaponShopOffer {
    id: string;
    kind: 'weapon';
    weaponId: ShopWeaponId;
    name: string;
    desc: string;
    cost: number;
}

export interface PermStatShopOffer {
    id: string;
    kind: 'perm_stat';
    /** 写入 SaveData.shopPurchases 的键 */
    purchaseKey: 'maxHp' | 'atk' | 'def' | 'moveSpeed';
    amount: number;
    name: string;
    desc: string;
    cost: number;
    /** true = 可反复购买叠加 */
    stackable: boolean;
}

export interface CharacterShopOffer {
    id: string;
    kind: 'character';
    characterId: string;
    name: string;
    desc: string;
    cost: number;
}

export interface KitShopOffer {
    id: string;
    kind: 'kit';
    itemId: string;
    amount: number;
    name: string;
    desc: string;
    cost: number;
}

export type ShopOffer = WeaponShopOffer | PermStatShopOffer | CharacterShopOffer | KitShopOffer;

export function listShopOffers(): readonly ShopOffer[] {
    return ConfigStore.shop();
}

export function getShopOffer(id: string): ShopOffer | undefined {
    for (const offer of ConfigStore.shop()) {
        if (offer.id === id) return offer;
    }
    return undefined;
}
