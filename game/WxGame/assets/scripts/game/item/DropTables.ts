import { Node } from 'cc';
import { ConfigStore } from '../../core/ConfigStore';
import { LootDrop, LootKind } from './LootDrop';
import { ItemPickup } from './ItemPickup';

/**
 * DropTables —— 按配置包 drops[] 掷击杀掉落（trash / boss）
 * 金币/心 → LootDrop 即用；道具 → ItemPickup 入背包。
 */
export class DropTables {
    static rollOnKill(parent: Node | null, x: number, y: number, tableId: 'trash' | 'boss' | 'elite'): number {
        const table = ConfigStore.dropTable(tableId) ?? DropTables._fallback(tableId);
        let coinsGranted = 0;

        if (Math.random() < table.coinChance) {
            const span = Math.max(0, table.coinMax - table.coinMin);
            const amount = table.coinMin + Math.floor(Math.random() * (span + 1));
            coinsGranted = Math.max(0, amount);
            if (parent && coinsGranted > 0) {
                const kind: LootKind = table.lootKind === 'chest' ? 'chest' : 'coin';
                const rarity = kind === 'chest' ? 2 : 0;
                LootDrop.spawn(parent, x, y, kind, coinsGranted, rarity);
            }
        }

        if (Math.random() < table.heartChance && parent) {
            // #164 心/道具也贴尸体，只做极小错位避免叠成一团
            const hx = x + (tableId === 'boss' ? -18 : 12);
            const hy = y + (tableId === 'boss' ? 8 : 6);
            LootDrop.spawn(parent, hx, hy, 'heart', Math.max(1, Math.round(table.heartAmount)), 1);
        }

        const itemChance = table.itemChance ?? 0;
        if (itemChance > 0 && Math.random() < itemChance && parent) {
            const id = DropTables._rollItemId(table.itemPool);
            if (id) {
                const ox = x + (Math.random() - 0.5) * 22;
                const oy = y + (Math.random() - 0.5) * 18;
                ItemPickup.spawn(parent, ox, oy, id);
            }
        }

        return coinsGranted;
    }

    private static _rollItemId(pool?: string[]): string | null {
        const ids = (pool && pool.length)
            ? pool.filter(id => !!ConfigStore.item(id))
            : ConfigStore.items().map(i => i.id);
        if (!ids.length) return null;

        const weighted: { id: string; w: number }[] = [];
        for (const id of ids) {
            const it = ConfigStore.item(id);
            if (!it) continue;
            const w = DropTables._itemWeight(it);
            if (w <= 0) continue;
            weighted.push({ id, w });
        }
        if (!weighted.length) return ids[Math.floor(Math.random() * ids.length)] ?? null;

        const total = weighted.reduce((s, x) => s + x.w, 0);
        let r = Math.random() * total;
        for (const row of weighted) {
            r -= row.w;
            if (r <= 0) return row.id;
        }
        return weighted[weighted.length - 1]?.id ?? null;
    }

    private static _itemWeight(it: { rarity?: string; dropWeight?: number }): number {
        if (it.dropWeight !== undefined) return Math.max(0, it.dropWeight);
        if (it.rarity === 'epic') return 2;
        if (it.rarity === 'rare') return 5;
        return 10;
    }

    private static _fallback(id: 'trash' | 'boss' | 'elite') {
        if (id === 'elite') {
            return {
                id: 'elite',
                coinChance: 1,
                coinMin: 6,
                coinMax: 10,
                heartChance: 0.5,
                heartAmount: 20,
                lootKind: 'coin' as const,
                itemChance: 0.8,
                itemPool: ['potion_hp', 'potion_shield', 'frost_bomb', 'scroll_crit', 'coin_pouch'],
            };
        }
        if (id === 'boss') {
            return {
                id: 'boss',
                coinChance: 1,
                coinMin: 10,
                coinMax: 16,
                heartChance: 1,
                heartAmount: 40,
                lootKind: 'chest' as const,
                itemChance: 0.85,
                itemPool: ['potion_hp', 'potion_rage', 'bomb', 'amulet'],
            };
        }
        const eco = ConfigStore.economy();
        return {
            id: 'trash',
            coinChance: eco.coinDropChance,
            coinMin: eco.coinValueMin,
            coinMax: eco.coinValueMax,
            heartChance: 0.12,
            heartAmount: 15,
            lootKind: 'coin' as const,
            itemChance: 0.14,
            itemPool: ['potion_hp', 'scroll_haste', 'bomb'],
        };
    }
}
