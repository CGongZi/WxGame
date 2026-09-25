/**
 * 角色主动技能表（#120 角色差异化）
 * 纯数据；执行逻辑在 PlayerSkill。技能只改 WorldBridge 逻辑坐标 / 世界层特效，不动 Player 节点世界位。
 */
/**
 * dash 冲刺 · bash 冲撞 · nova 环爆 · volley 齐射 · blink 瞬移 · spin 旋斩
 * cone 朝向扇形喷吐（#133） · ward 护盾结界：加护盾 + 周围减速 + 小伤（#133）
 */
export type SkillKind = 'dash' | 'bash' | 'nova' | 'volley' | 'blink' | 'spin' | 'cone' | 'ward';

export interface SkillDef {
    id: string;
    name: string;
    emoji: string;
    kind: SkillKind;
    cooldown: number;
    /** 位移距离（dash/bash/blink） */
    dist?: number;
    /** 无敌秒数 */
    invuln: number;
    /** 伤害倍率（相对 atk） */
    dmgMul?: number;
    /** 范围（nova/spin 半径；bash 路径命中半径） */
    radius?: number;
    /** 施放后回血 */
    heal?: number;
    /** 施放后移速加成（数值，持续 hasteSec） */
    haste?: number;
    hasteSec?: number;
    /** 齐射数量 / 扇角 */
    volleyCount?: number;
    volleySpread?: number;
    /** 命中减速：[倍率, 秒]（nova/cone/ward/spin） */
    slow?: [number, number];
    /** ward：护盾值 */
    shield?: number;
    /** cone：半角（度） */
    coneDeg?: number;
    /** 特效主色 */
    color: [number, number, number];
    desc: string;
}

const DEFAULT_SKILL: SkillDef = {
    id: 'dash', name: '疾冲', emoji: '💨', kind: 'dash', cooldown: 4.5,
    dist: 170, invuln: 0.42, color: [200, 230, 255],
    desc: '朝移动方向冲刺，期间无敌',
};

const SKILLS: Record<string, SkillDef> = {
    knight: {
        id: 'shield_bash', name: '盾冲', emoji: '🛡', kind: 'bash', cooldown: 6,
        dist: 150, invuln: 0.55, dmgMul: 1.3, radius: 64, color: [120, 190, 255],
        desc: '举盾前冲撞击路径敌人，期间无敌',
    },
    ranger: {
        id: 'shadow_roll', name: '疾影翻滚', emoji: '🌀', kind: 'dash', cooldown: 4,
        dist: 190, invuln: 0.45, haste: 60, hasteSec: 2, color: [160, 255, 200],
        desc: '翻滚闪避并短暂加速',
    },
    mage: {
        id: 'arcane_nova', name: '奥术冲击', emoji: '💠', kind: 'nova', cooldown: 7,
        invuln: 0.3, dmgMul: 1.6, radius: 170, color: [190, 120, 255],
        desc: '以自身为中心爆发奥术波，重创周围敌人',
    },
    paladin: {
        id: 'holy_charge', name: '圣盾冲锋', emoji: '✨', kind: 'bash', cooldown: 7,
        dist: 140, invuln: 0.6, dmgMul: 1.1, radius: 66, heal: 12, color: [255, 230, 150],
        desc: '冲锋撞击并回复少量生命',
    },
    assassin: {
        id: 'shadow_step', name: '影遁', emoji: '🌑', kind: 'blink', cooldown: 4,
        dist: 240, invuln: 0.5, haste: 40, hasteSec: 1.5, color: [150, 120, 200],
        desc: '瞬身穿越，短暂提速',
    },
    dragonkin: {
        id: 'dragon_breath', name: '龙息', emoji: '🔥', kind: 'cone', cooldown: 6.5,
        invuln: 0.3, dmgMul: 2.1, radius: 240, coneDeg: 38, color: [255, 130, 60],
        desc: '朝面向喷出扇形龙焰，远距重创一片敌人',
    },
    berserker: {
        id: 'blood_whirl', name: '血怒旋斩', emoji: '🩸', kind: 'spin', cooldown: 6.5,
        invuln: 0.35, dmgMul: 1.7, radius: 150, heal: 6, color: [255, 80, 80],
        desc: '360° 旋斩，命中回一点血',
    },
    geomancer: {
        id: 'quake', name: '地裂', emoji: '🪨', kind: 'nova', cooldown: 7,
        invuln: 0.3, dmgMul: 1.45, radius: 180, slow: [0.15, 1.4], color: [200, 160, 90],
        desc: '震裂大地，重击并震慑周围敌人（近乎定身 1.4s）',
    },
    stormcaller: {
        id: 'chain_bolt', name: '雷链', emoji: '⚡', kind: 'volley', cooldown: 6,
        invuln: 0.2, dmgMul: 0.8, volleyCount: 5, volleySpread: 48, color: [255, 240, 120],
        desc: '扇形齐射五道雷矢',
    },
    cryomancer: {
        id: 'frost_ring', name: '冰霜环', emoji: '❄', kind: 'nova', cooldown: 7,
        invuln: 0.3, dmgMul: 1.35, radius: 175, slow: [0.45, 3.2], color: [150, 220, 255],
        desc: '寒冰扩散，冻伤并减速周围 3 秒',
    },
    warden: {
        id: 'bulwark', name: '守望结界', emoji: '🔱', kind: 'ward', cooldown: 8,
        invuln: 0.4, dmgMul: 0.6, radius: 170, shield: 22, slow: [0.5, 2.5], color: [120, 230, 200],
        desc: '张开结界：获得护盾，震退并减速周围敌人',
    },
    plague: {
        id: 'toxic_rain', name: '毒雾', emoji: '☠', kind: 'cone', cooldown: 6.5,
        invuln: 0.25, dmgMul: 1.4, radius: 210, coneDeg: 50, slow: [0.6, 2.4], color: [140, 220, 90],
        desc: '朝面向喷出宽幅毒雾，伤害并减速',
    },
    voidwalker: {
        id: 'void_blink', name: '虚空闪现', emoji: '🕳', kind: 'blink', cooldown: 3.8,
        dist: 260, invuln: 0.5, color: [170, 100, 255],
        desc: '撕开裂隙瞬移',
    },
    sunpriest: {
        id: 'solar_flare', name: '日曜', emoji: '🌞', kind: 'nova', cooldown: 8,
        invuln: 0.35, dmgMul: 1.3, radius: 165, heal: 16, color: [255, 210, 90],
        desc: '日光爆发伤敌并回血',
    },
};

export function skillFor(characterId: string | null | undefined): SkillDef {
    if (!characterId) return DEFAULT_SKILL;
    return SKILLS[characterId] ?? DEFAULT_SKILL;
}
