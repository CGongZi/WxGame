import { PlayerStats } from '../../core/PlayerStats';
import { LootMagnet } from './LootMagnet';
import { find } from 'cc';
import { PlayerController } from '../player/PlayerController';
import { eventBus } from '../../core/EventBus';

/**
 * #167 神龛局内增益（元气骑士式）—— 仅当局，踩神龛三选一。
 */
export type RunBuffId =
    | 'fury' | 'haste' | 'iron' | 'barrier' | 'blood' | 'magnet' | 'sharp';

export interface RunBuffDef {
    id: RunBuffId;
    emoji: string;
    name: string;
    desc: string;
}

const DEFS: RunBuffDef[] = [
    { id: 'fury', emoji: '🔥', name: '狂怒', desc: '攻击 +10（本局）' },
    { id: 'haste', emoji: '💨', name: '疾风', desc: '移速 +55，持续 50 秒' },
    { id: 'iron', emoji: '🛡', name: '铁壁', desc: '防御 +6 · 护甲回满' },
    { id: 'barrier', emoji: '💠', name: '护罩', desc: '护盾 +40 · 护甲回满' },
    { id: 'blood', emoji: '🩸', name: '噬血', desc: '回复 45 生命 · 攻击 +5' },
    { id: 'magnet', emoji: '🧲', name: '磁潮', desc: '全场磁吸 35 秒' },
    { id: 'sharp', emoji: '⚔', name: '锋锐', desc: '暴击 +12% · 暴伤 +0.35' },
];

export class RunBuff {
    private static _picked = new Set<RunBuffId>();

    static reset() {
        RunBuff._picked.clear();
    }

    static all(): readonly RunBuffDef[] { return DEFS; }

    /** 抽 3 个未重复的增益（本局已选过的降权排除） */
    static drawThree(): RunBuffDef[] {
        const pool = DEFS.filter(d => !RunBuff._picked.has(d.id));
        const src = pool.length >= 3 ? pool : [...DEFS];
        const shuffled = src.slice();
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = t;
        }
        return shuffled.slice(0, 3);
    }

    static apply(id: RunBuffId): string {
        const def = DEFS.find(d => d.id === id);
        if (!def) return '未知增益';
        RunBuff._picked.add(id);
        const S = PlayerStats.I;
        const player = find('Canvas/Player');
        const sched = player?.getComponent(PlayerController) ?? null;

        switch (id) {
            case 'fury':
                S.addBonus({ atk: 10 });
                break;
            case 'haste':
                if (sched) S.addTimedBonus({ moveSpeed: 55 }, 50, sched);
                else S.addBonus({ moveSpeed: 40 });
                break;
            case 'iron':
                S.addBonus({ def: 6 });
                S.refillArmor();
                break;
            case 'barrier':
                S.addShield(40, 100);
                S.refillArmor();
                break;
            case 'blood':
                eventBus.emit('loot-heart', { amount: 45 });
                S.addBonus({ atk: 5 });
                break;
            case 'magnet':
                LootMagnet.activate(35);
                break;
            case 'sharp':
                S.addBonus({ critChance: 0.12, critMultiplier: 0.35 });
                break;
        }
        return `${def.emoji} ${def.name} · ${def.desc}`;
    }
}
