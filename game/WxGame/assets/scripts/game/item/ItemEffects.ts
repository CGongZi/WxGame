import type { ConfigItem } from '../../core/ConfigSchema';
import { eventBus } from '../../core/EventBus';
import { PlayerStats } from '../../core/PlayerStats';
import { RunProgress } from '../dungeon/RunProgress';
import { ItemUseFx } from '../fx/ItemUseFx';
import { AudioManager } from '../../core/AudioManager';
import { GameManager } from '../../core/GameManager';
import { LootMagnet } from './LootMagnet';

/**
 * 道具生效逻辑（与拾取/背包解耦，避免 RunBag ↔ ItemPickup 环依赖）。
 */
export function applyItem(
    it: ConfigItem,
    scheduler: { scheduleOnce: (cb: () => void, t: number) => void },
): string {
    if (it.kind === 'heal') {
        eventBus.emit('loot-heart', { amount: it.amount });
        ItemUseFx.useConsumable(it);
        try {
            const cid = GameManager.instance?.selectedCharacterId
                ?? GameManager.instance?.save?.selectedCharacter;
            if (cid) AudioManager.playVoice(cid);
        } catch { /* ignore */ }
        return `${it.emoji} ${it.name} 回复 ${it.amount}`;
    }
    if (it.id === 'potion_rage') {
        PlayerStats.I.addTimedBonus({ atk: it.amount }, 8, scheduler);
        ItemUseFx.useConsumable(it);
        return `${it.emoji} 攻击 +${it.amount}（8秒）`;
    }
    if (it.id === 'scroll_haste') {
        PlayerStats.I.addTimedBonus({ moveSpeed: it.amount }, 6, scheduler);
        ItemUseFx.useConsumable(it);
        return `${it.emoji} 移速 +${it.amount}（6秒）`;
    }
    if (it.id === 'amulet') {
        PlayerStats.I.addBonus({ def: it.amount });
        ItemUseFx.useConsumable(it);
        return `${it.emoji} 本局防御 +${it.amount}`;
    }
    if (it.id === 'compass') {
        ItemUseFx.useCompass();
        const floor = RunProgress.floor;
        const r = RunProgress.roomInFloor;
        return `${it.emoji} 第${floor}层·房${r} —— 清房后传送门会出现在附近`;
    }
    if (it.id === 'potion_shield') {
        PlayerStats.I.addShield(it.amount);
        ItemUseFx.useConsumable(it);
        return `${it.emoji} 护盾 +${it.amount}（先于生命吸收）`;
    }
    if (it.id === 'scroll_magnet') {
        LootMagnet.activate(it.amount);
        ItemUseFx.useConsumable(it);
        return `${it.emoji} 全场掉落飞向你（${it.amount}秒）`;
    }
    if (it.id === 'elixir_life') {
        PlayerStats.I.addBonus({ maxHp: it.amount });
        eventBus.emit('loot-heart', { amount: it.amount });
        ItemUseFx.useConsumable(it);
        return `${it.emoji} 本局生命上限 +${it.amount}`;
    }
    if (it.id === 'scroll_crit') {
        PlayerStats.I.addTimedBonus({ critChance: it.amount / 100 }, 10, scheduler);
        ItemUseFx.useConsumable(it);
        return `${it.emoji} 暴击率 +${it.amount}%（10秒）`;
    }
    if (it.id === 'coin_pouch') {
        const gm = GameManager.instance;
        if (gm) gm.addCoins(it.amount);
        ItemUseFx.useConsumable(it);
        return `${it.emoji} 金币 +${it.amount}`;
    }
    if (it.id === 'frost_bomb') {
        return ItemUseFx.throwBomb(it.amount, scheduler, 'frost');
    }
    if (it.kind === 'throw' || it.id === 'bomb') {
        return ItemUseFx.throwBomb(it.amount, scheduler);
    }
    ItemUseFx.useConsumable(it);
    return `${it.emoji} ${it.name}`;
}
