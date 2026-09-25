import { computeKillHeal, computeTalentStats, getTalent, listTalents } from '../../core/TalentData';
import { PlayerStats } from '../../core/PlayerStats';

/**
 * 局内三选一天赋（F4）—— 仅当局有效，不写 SaveData.talents。
 */
export class RunTalent {
    private static _levels: Record<string, number> = {};

    static reset() {
        RunTalent._levels = {};
    }

    static levels(): Readonly<Record<string, number>> {
        return RunTalent._levels;
    }

    static levelOf(id: string): number {
        return RunTalent._levels[id] ?? 0;
    }

    /** 还可升一级的天赋 id */
    static eligibleIds(): string[] {
        const out: string[] = [];
        for (const t of listTalents()) {
            if (RunTalent.levelOf(t.id) < t.maxLevel) out.push(t.id);
        }
        return out;
    }

    /** 选中：+1 级并灌入 PlayerStats.bonus / 嗜血计数 */
    static pick(id: string): { ok: boolean; tip: string } {
        const def = getTalent(id);
        if (!def) return { ok: false, tip: '未知天赋' };
        const cur = RunTalent.levelOf(id);
        if (cur >= def.maxLevel) return { ok: false, tip: '本局已满级' };
        RunTalent._levels[id] = cur + 1;
        const delta = computeTalentStats({ [id]: 1 });
        if (Object.keys(delta).length > 0) {
            PlayerStats.I.addBonus(delta);
        }
        const tip = `${def.emoji} ${def.name} → 本局 Lv.${cur + 1}`;
        return { ok: true, tip };
    }

    static killHealBonus(): number {
        return computeKillHeal(RunTalent._levels);
    }
}
