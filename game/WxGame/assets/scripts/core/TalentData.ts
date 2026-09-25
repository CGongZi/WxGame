import { ConfigStore } from './ConfigStore';
import { StatBlock } from './PlayerStats';

/** 单级属性效果 */
export interface TalentStatEffect {
    kind: 'stat';
    stat: keyof StatBlock;
    /** 每级加成 */
    perLevel: number;
}

/** 击杀回血 / 技能冷却 / 拾取范围等特殊效果 */
export interface TalentSpecialEffect {
    kind: 'kill_heal' | 'skill_cd' | 'pickup_range';
    /** 每级数值（kill_heal=回血量；skill_cd=比例；pickup_range=世界单位） */
    perLevel: number;
}

export type TalentEffect = TalentStatEffect | TalentSpecialEffect;

export interface TalentDef {
    id: string;
    name: string;
    emoji: string;
    desc: string;
    maxLevel: number;
    /** 升到 level 时消耗（level 从 1 起） */
    costForLevel: (level: number) => number;
    /** 前置：这些 id 至少 1 级 */
    requires: string[];
    effects: TalentEffect[];
}

/** 局外天赋。数值来自当前配置包，开局由 GameManager 灌入 PlayerStats.talent。 */
export function listTalents(): readonly TalentDef[] {
    return ConfigStore.talents();
}

export function getTalent(id: string): TalentDef | undefined {
    for (const t of ConfigStore.talents()) {
        if (t.id === id) return t;
    }
    return undefined;
}

/** 根据已点等级汇总属性加成 */
export function computeTalentStats(levels: Record<string, number>): Partial<StatBlock> {
    const out: Partial<StatBlock> = {};
    for (const def of listTalents()) {
        const lv = levels[def.id] ?? 0;
        if (lv <= 0) continue;
        for (const e of def.effects) {
            if (e.kind !== 'stat') continue;
            out[e.stat] = (out[e.stat] ?? 0) + e.perLevel * lv;
        }
    }
    return out;
}

/** 击杀回血总量 */
export function computeKillHeal(levels: Record<string, number>): number {
    let heal = 0;
    for (const def of listTalents()) {
        const lv = levels[def.id] ?? 0;
        if (lv <= 0) continue;
        for (const e of def.effects) {
            if (e.kind === 'kill_heal') heal += e.perLevel * lv;
        }
    }
    return heal;
}

/** 技能冷却缩减比例合计（上限 0.6） */
export function computeSkillCdReduce(levels: Record<string, number>): number {
    let r = 0;
    for (const def of listTalents()) {
        const lv = levels[def.id] ?? 0;
        if (lv <= 0) continue;
        for (const e of def.effects) {
            if (e.kind === 'skill_cd') r += e.perLevel * lv;
        }
    }
    return Math.min(0.6, r);
}

/** 拾取磁吸范围加成合计 */
export function computePickupRange(levels: Record<string, number>): number {
    let r = 0;
    for (const def of listTalents()) {
        const lv = levels[def.id] ?? 0;
        if (lv <= 0) continue;
        for (const e of def.effects) {
            if (e.kind === 'pickup_range') r += e.perLevel * lv;
        }
    }
    return r;
}

function formatSpecial(kind: TalentSpecialEffect['kind'], value: number): string {
    if (kind === 'kill_heal') return `击杀回血 +${value}`;
    if (kind === 'skill_cd') return `技能冷却 -${Math.round(value * 100)}%`;
    return `拾取范围 +${value}`;
}

export function canUnlock(def: TalentDef, levels: Record<string, number>): boolean {
    return def.requires.every(id => (levels[id] ?? 0) >= 1);
}

export function nextLevelCost(def: TalentDef, currentLevel: number): number | null {
    if (currentLevel >= def.maxLevel) return null;
    return def.costForLevel(currentLevel + 1);
}

const STAT_LABEL: Record<keyof StatBlock, string> = {
    maxHp: '生命',
    atk: '攻击',
    def: '防御',
    moveSpeed: '移速',
    critChance: '暴击率',
    critMultiplier: '暴击倍率',
};

/** 单条数值文案（天赋/详情必须显示数字，不用语感词） */
export function formatStatAmount(stat: keyof StatBlock, value: number): string {
    const name = STAT_LABEL[stat] ?? String(stat);
    if (stat === 'critChance') {
        const pct = Math.round(value * 1000) / 10; // 0.03 → 3
        return `${name} +${pct}%`;
    }
    if (stat === 'critMultiplier') {
        const s = Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
        return `${name} +${s}`;
    }
    return `${name} +${value}`;
}

/** 每级效果：攻击 +5/级 · 击杀回血 +2/级 */
export function formatTalentPerLevel(def: TalentDef): string {
    return def.effects.map((e) => {
        if (e.kind !== 'stat') return `${formatSpecial(e.kind, e.perLevel)}/级`;
        return `${formatStatAmount(e.stat, e.perLevel)}/级`;
    }).join(' · ');
}

/** 当前等级已生效数值 */
export function formatTalentAtLevel(def: TalentDef, level: number): string {
    if (level <= 0) return '尚未加点';
    return def.effects.map((e) => {
        if (e.kind !== 'stat') return formatSpecial(e.kind, e.kind === 'skill_cd' ? Math.min(0.6, e.perLevel * level) : e.perLevel * level);
        return formatStatAmount(e.stat, e.perLevel * level);
    }).join(' · ');
}

/** 详情行：名称 + 等级 + 每级/已生效 */
export function formatTalentDetailLine(def: TalentDef, level: number): string {
    const maxTag = level >= def.maxLevel ? '已满级' : `Lv.${level}/${def.maxLevel}`;
    const per = formatTalentPerLevel(def);
    if (level <= 0) return `${def.emoji} ${def.name}  ${maxTag}  ·  ${per}`;
    return `${def.emoji} ${def.name}  ${maxTag}  ·  ${per}  ·  已生效 ${formatTalentAtLevel(def, level)}`;
}

/** 底栏：全部天赋合计加成 */
export function formatTalentTotals(levels: Record<string, number>): string {
    const stats = computeTalentStats(levels);
    const parts: string[] = [];
    const order: (keyof StatBlock)[] = [
        'maxHp', 'atk', 'def', 'moveSpeed', 'critChance', 'critMultiplier',
    ];
    for (const k of order) {
        const v = stats[k];
        if (v === undefined || v === 0) continue;
        parts.push(formatStatAmount(k, v));
    }
    const heal = computeKillHeal(levels);
    if (heal > 0) parts.push(`击杀回血 +${heal}`);
    const cd = computeSkillCdReduce(levels);
    if (cd > 0) parts.push(formatSpecial('skill_cd', cd));
    const pick = computePickupRange(levels);
    if (pick > 0) parts.push(formatSpecial('pickup_range', pick));
    if (parts.length === 0) return '尚未加点 · 点选天赋查看每级数值';
    return `当前加成  ${parts.join('  ')}`;
}
