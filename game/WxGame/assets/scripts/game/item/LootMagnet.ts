import { TalentRuntime } from './TalentRuntime';

/**
 * LootMagnet —— 全局磁吸状态（#121）
 * 磁引卷轴激活期间：所有拾取物无视距离飞向玩家；天赋「磁场」永久加宽范围。
 */
export class LootMagnet {
    private static _until = 0;

    static activate(seconds: number) {
        LootMagnet._until = Math.max(LootMagnet._until, Date.now() / 1000 + seconds);
    }

    static reset() { LootMagnet._until = 0; }

    static get active(): boolean {
        return Date.now() / 1000 < LootMagnet._until;
    }

    /** 有效磁吸范围：基础 + 天赋；卷轴激活时视为无限 */
    static range(base: number): number {
        if (LootMagnet.active) return 99999;
        return base + TalentRuntime.pickupBonus();
    }
}
