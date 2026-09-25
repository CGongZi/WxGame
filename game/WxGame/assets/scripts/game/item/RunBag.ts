import { find } from 'cc';
import { ConfigStore } from '../../core/ConfigStore';
import type { ConfigItem } from '../../core/ConfigSchema';
import { eventBus, GameEvents } from '../../core/EventBus';
import { applyItem } from './ItemEffects';

export interface BagSlot {
    id: string;
    count: number;
}

/**
 * RunBag —— 局内背包（本局有效，死亡/通关清空）
 * 闭环：掉落/刷取拾取 → 入包 → HUD 快捷栏 / 背包面板使用。
 */
export class RunBag {
    static readonly CAP = 6;
    static readonly STACK = 3;

    private static _slots: BagSlot[] = [];

    static reset() {
        RunBag._slots = [];
        eventBus.emit(GameEvents.BAG_CHANGED, { slots: RunBag.snapshot() });
    }

    static snapshot(): BagSlot[] {
        return RunBag._slots.map(s => ({ id: s.id, count: s.count }));
    }

    static slots(): readonly BagSlot[] {
        return RunBag._slots;
    }

    static count(): number {
        return RunBag._slots.reduce((n, s) => n + s.count, 0);
    }

    static usedSlots(): number {
        return RunBag._slots.length;
    }

    /** 是否还能装下 amount 件（不改动背包） */
    static canAdd(itemId: string, amount = 1): boolean {
        if (!ConfigStore.item(itemId) || amount <= 0) return false;
        let left = amount;
        let freeSlots = RunBag.CAP - RunBag._slots.length;
        for (const s of RunBag._slots) {
            if (s.id !== itemId || s.count >= RunBag.STACK) continue;
            left -= RunBag.STACK - s.count;
            if (left <= 0) return true;
        }
        while (left > 0) {
            if (freeSlots <= 0) return false;
            freeSlots -= 1;
            left -= RunBag.STACK;
        }
        return true;
    }

    /** 尝试加入；满包返回 false（不部分写入） */
    static tryAdd(itemId: string, amount = 1): boolean {
        if (!RunBag.canAdd(itemId, amount)) return false;
        let left = amount;
        for (const s of RunBag._slots) {
            if (s.id !== itemId || s.count >= RunBag.STACK) continue;
            const space = RunBag.STACK - s.count;
            const take = Math.min(space, left);
            s.count += take;
            left -= take;
            if (left <= 0) break;
        }
        while (left > 0) {
            const take = Math.min(RunBag.STACK, left);
            RunBag._slots.push({ id: itemId, count: take });
            left -= take;
        }
        eventBus.emit(GameEvents.BAG_CHANGED, { slots: RunBag.snapshot() });
        eventBus.emit(GameEvents.ITEM_PICKED, { kind: 'bag', itemId });
        return true;
    }

    static discard(slotIndex: number, amount = 1): boolean {
        const s = RunBag._slots[slotIndex];
        if (!s || amount <= 0) return false;
        s.count -= amount;
        if (s.count <= 0) RunBag._slots.splice(slotIndex, 1);
        eventBus.emit(GameEvents.BAG_CHANGED, { slots: RunBag.snapshot() });
        return true;
    }

    /** 使用第 index 格；成功返回提示文案 */
    static use(slotIndex: number): string | null {
        const s = RunBag._slots[slotIndex];
        if (!s) return null;
        const def = ConfigStore.item(s.id);
        if (!def) {
            eventBus.emit('show-tip', { text: '未知道具' });
            return null;
        }
        let tip: string;
        try {
            tip = applyItem(def, RunBag._scheduler());
        } catch {
            eventBus.emit('show-tip', { text: '使用失败' });
            return null;
        }
        s.count -= 1;
        if (s.count <= 0) RunBag._slots.splice(slotIndex, 1);
        eventBus.emit(GameEvents.BAG_CHANGED, { slots: RunBag.snapshot() });
        return tip;
    }

    static defOf(slot: BagSlot): ConfigItem | null {
        return ConfigStore.item(slot.id);
    }

    private static _scheduler(): { scheduleOnce: (cb: () => void, t: number) => void } {
        const gmNode = find('GameManager') ?? find('Canvas')?.parent?.getChildByName('GameManager');
        const gm = gmNode?.getComponent('GameManager') as
            { scheduleOnce?: (cb: () => void, t: number) => void } | null;
        if (gm?.scheduleOnce) return gm as { scheduleOnce: (cb: () => void, t: number) => void };
        const hud = find('Canvas/HUD');
        const comp = hud?.getComponent('HUDManager') as
            { scheduleOnce?: (cb: () => void, t: number) => void } | null;
        if (comp?.scheduleOnce) return comp as { scheduleOnce: (cb: () => void, t: number) => void };
        return { scheduleOnce: (cb, t) => { setTimeout(cb, Math.max(0, t) * 1000); } };
    }
}
