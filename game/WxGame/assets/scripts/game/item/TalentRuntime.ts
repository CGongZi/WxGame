import { GameManager } from '../../core/GameManager';
import { computePickupRange, computeSkillCdReduce } from '../../core/TalentData';
import { RunTalent } from './RunTalent';

/**
 * TalentRuntime —— 局外天赋 + 局内三选一 合并读数（#121）
 * 供 PlayerSkill / 拾取物读取，不写状态。
 */
export class TalentRuntime {
    private static _merged(): Record<string, number> {
        const out: Record<string, number> = {};
        const save = GameManager.instance?.save?.talents ?? {};
        for (const k of Object.keys(save)) out[k] = (out[k] ?? 0) + (save[k] ?? 0);
        const run = RunTalent.levels();
        for (const k of Object.keys(run)) out[k] = (out[k] ?? 0) + (run[k] ?? 0);
        return out;
    }

    /** 技能冷却乘数（0.4~1） */
    static skillCdMul(): number {
        try {
            return Math.max(0.4, 1 - computeSkillCdReduce(TalentRuntime._merged()));
        } catch {
            return 1;
        }
    }

    /** 拾取磁吸范围加成 */
    static pickupBonus(): number {
        try {
            return computePickupRange(TalentRuntime._merged());
        } catch {
            return 0;
        }
    }
}
