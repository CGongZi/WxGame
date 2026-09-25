/**
 * 配置包 Schema（K1）
 * 内置包与以后的远程包都用这一份纯数据形状。禁止把 cc.Color / 函数写进包。
 * 武器、角色、地图、刷怪、天赋、商店、怪物基础值、关卡曲线在包内。
 * 怪物 AI、逐层覆盖、道具、掉落仍由各脚本常量驱动。
 */

export type Rgb3 = [number, number, number];
export type Rgba4 = [number, number, number, number];

export interface ConfigStatBlock {
    maxHp: number;
    atk: number;
    def: number;
    moveSpeed: number;
    critChance: number;
    critMultiplier: number;
}

export interface ConfigCharacter {
    id: string;
    name: string;
    emoji: string;
    desc: string;
    /** 0 = 初始可用 */
    cost: number;
    /** C7 大厅换皮用；现在只进表，不换外观 */
    skinId: string;
    /** 开局携带武器 id（字段名历史遗留；#156 起只表示起始武，非锁定） */
    exclusiveWeaponId: string;
    base: ConfigStatBlock;
}

export type ObstacleStyleId = 'rock' | 'pillar' | 'root' | 'crystal' | 'cloud';

export interface ConfigTheme {
    id: string;
    name: string;
    emoji: string;
    floorDark: Rgb3;
    floorLight: Rgb3;
    floorEdge: Rgb3;
    floorShine: Rgba4;
    borderColor: Rgb3;
    obstacleStyle: ObstacleStyleId;
    obstacleCount: number;
    cornerCount: number;
    obstacleDark: Rgb3;
    obstacleMid: Rgb3;
    obstacleLight: Rgb3;
    floorMin: number;
    floorMax: number;
    weight: number;
    /** 图鉴右侧介绍 */
    blurb: string;
}

export type SpawnEnemyTypeId = 'slime' | 'fast' | 'tank' | 'archer' | 'wisp' | 'mage' | 'beetle' | 'bat' | 'toad' | 'crystal' | 'golem' | 'moth' | 'dragon' | 'raven' | 'mosquito' | 'specter' | 'bone' | 'spider' | 'snake' | 'imp' | 'shroom' | 'jelly';

export interface ConfigBiomeEntry {
    type: SpawnEnemyTypeId;
    weight: number;
    hpMul?: number;
    spdMul?: number;
    color?: Rgb3;
    /** #171 该主题下最早/最晚出现层；缺省不限制 */
    floorMin?: number;
    floorMax?: number;
}

export type StatKey = keyof ConfigStatBlock;

export interface ConfigTalentStatEffect {
    kind: 'stat';
    stat: StatKey;
    perLevel: number;
}

export interface ConfigTalentHealEffect {
    kind: 'kill_heal';
    perLevel: number;
}

/** 技能冷却缩减（perLevel 为比例，0.08 = 每级 -8%） */
export interface ConfigTalentSkillCdEffect {
    kind: 'skill_cd';
    perLevel: number;
}

/** 拾取磁吸范围加成（世界单位/级） */
export interface ConfigTalentPickupEffect {
    kind: 'pickup_range';
    perLevel: number;
}

export type ConfigTalentEffect =
    | ConfigTalentStatEffect
    | ConfigTalentHealEffect
    | ConfigTalentSkillCdEffect
    | ConfigTalentPickupEffect;

export interface ConfigTalent {
    id: string;
    name: string;
    emoji: string;
    desc: string;
    maxLevel: number;
    /** 升到 level 的花费 = costBase + (level - 1) * costStep */
    costBase: number;
    costStep: number;
    requires: string[];
    effects: ConfigTalentEffect[];
}

export type ConfigWeaponId = string;

export interface ConfigWeapon {
    id: string;
    name: string;
    emoji: string;
    type: 'melee' | 'ranged';
    damage: number;
    cooldown: number;
    range: number;
    coneHalf: number;
    multiHit: number;
    bulletSpeed?: number;
    bulletSize?: number;
    bulletColor?: Rgba4;
    bulletShape?: 'ball' | 'arrow' | 'orb';
    piercing?: boolean;
    /**
     * #143 打法：slash/thrust/heavy/flurry/wave（近战）· bolt/spread/burst/bounce/homing/beam/lob（远程）。
     * 缺省按 id 查 WeaponModes.MODE_BY_ID，老包不填也能玩。
     */
    fireMode?: string;
    pellets?: number;
    spreadDeg?: number;
    burst?: number;
    knockback?: number;
    splash?: number;
    bounce?: number;
    slow?: [number, number];
    description: string;
    /** 刷取稀有度（白→红；兼容 common/rare/epic） */
    rarity?: 'white' | 'green' | 'blue' | 'purple' | 'gold' | 'red' | 'common' | 'rare' | 'epic';
    /** 最早可刷层（1-based）；缺省 1 */
    unlockFloor?: number;
    /** 刷取相对权重；缺省按 rarity；0 = 不刷（角色开局武） */
    dropWeight?: number;
    /**
     * @deprecated #156 已取消「他人不可用」锁定。
     * 仍可作为作者备注；运行时不再限制装备。
     */
    ownerCharacterId?: string;
}

export interface ConfigShopWeapon {
    id: string;
    kind: 'weapon';
    weaponId: string;
    name: string;
    desc: string;
    cost: number;
}

export interface ConfigShopPerm {
    id: string;
    kind: 'perm_stat';
    purchaseKey: 'maxHp' | 'atk' | 'def' | 'moveSpeed';
    amount: number;
    name: string;
    desc: string;
    cost: number;
    stackable: boolean;
}

export interface ConfigShopCharacter {
    id: string;
    kind: 'character';
    characterId: string;
    name: string;
    desc: string;
    cost: number;
}

/** 局外补给：买入存入 stash，开战灌入局内背包 */
export interface ConfigShopKit {
    id: string;
    kind: 'kit';
    itemId: string;
    /** 每次购买件数 */
    amount: number;
    name: string;
    desc: string;
    cost: number;
}

export type ConfigShopOffer = ConfigShopWeapon | ConfigShopPerm | ConfigShopCharacter | ConfigShopKit;

export interface ConfigItem {
    id: string;
    name: string;
    emoji: string;
    desc: string;
    kind: 'heal' | 'buff' | 'throw';
    amount: number;
    /** 稀有度；影响拾取光圈与默认投放权重 */
    rarity?: 'common' | 'rare' | 'epic';
    /** 掉落相对权重；缺省按 rarity：common10 / rare5 / epic2；0 = 不进随机池 */
    dropWeight?: number;
}

export type ConfigEnemyId = 'slime' | 'fast' | 'tank' | 'archer' | 'wisp' | 'mage' | 'beetle' | 'bat' | 'toad' | 'crystal' | 'golem' | 'moth' | 'dragon' | 'raven' | 'mosquito' | 'specter' | 'bone' | 'spider' | 'snake' | 'imp' | 'shroom' | 'jelly';

/** 怪物基础数值。层数和主题乘子在刷出时再乘，不写回这张表。 */
export interface ConfigEnemy {
    id: ConfigEnemyId;
    hp: number;
    damage: number;
    speed: number;
    /** flat = 移速不随房间变强（快怪）；room = 随房间略增 */
    speedScale: 'flat' | 'room';
    /** chase 近战 / kite 弓手 / fly 飞行贴脸 / cast 法球 / dragon 飞落喷火 */
    behaviorId: 'chase' | 'kite' | 'fly' | 'cast' | 'dragon';
    bodySize: number;
    attackRange: number;
    defaultColor: Rgb3;
}

export interface ConfigEncounterSlotBiome {
    source: 'biome';
    count: number;
}

export interface ConfigEncounterSlotEnemy {
    source: 'enemy';
    enemyId: ConfigEnemyId;
    count: number;
}

export type ConfigEncounterSlot = ConfigEncounterSlotBiome | ConfigEncounterSlotEnemy;

export interface ConfigEncounter {
    id: string;
    /** scatter = 地图内散点；ring = 绕中心；pillar = 贴已生成障碍外侧；door = 地图南北入口内侧 */
    placement: 'scatter' | 'ring' | 'pillar' | 'door';
    slots: ConfigEncounterSlot[];
}

export interface ConfigThemeEncounter {
    encounterId: string;
    weight: number;
}

/**
 * 关卡曲线。当前是一条公式，不是逐层配表。
 * floors[] 可对某一层做覆盖（主题强制、怪量/强度乘子）。
 */
export interface ConfigDungeon {
    totalFloors: number;
    roomsPerFloor: number;
    /** scale = 1 + roomIndex * roomScaleStep */
    roomScaleStep: number;
    bossHpBase: number;
    bossHpPerFloor: number;
    bossSpeedBase: number;
    bossSpeedPerFloor: number;
    bossDamageBase: number;
    bossDamagePerFloor: number;
    bossAttackRange: number;
    /** boss = BossEnemy；chase / kite = 同一套曲线数值，换近战或远程组件 */
    bossBehaviorId: 'boss' | 'chase' | 'kite';
    finalBossHpBase: number;
    finalBossHpPerFloor: number;
    finalBossSpeed: number;
    finalBossDamage: number;
    finalBossAttackRange: number;
    /** 最终 Boss 房杂兵上限 */
    finalRoomTrashCap: number;
    summonCount: number;
    summonHp: number;
    summonSpeed: number;
    summonDamage: number;
    summonAttackRange: number;
    summonDetectionRange: number;
}

/** 击杀掉落表（drops[]）。id=trash 小怪；id=boss Boss。 */
export interface ConfigDropTable {
    id: string;
    /** 掉金币/宝箱概率 0~1 */
    coinChance: number;
    coinMin: number;
    coinMax: number;
    /** 掉心概率 */
    heartChance: number;
    heartAmount: number;
    /** 主货币掉落外观 */
    lootKind: 'coin' | 'chest';
    /** 掉局内道具概率（进背包） */
    itemChance?: number;
    /** 道具池；空则从 items[] 全表随机 */
    itemPool?: string[];
}

/** 逐层覆盖（B1）。未列出的层走 dungeon 曲线 + 随机主题。 */
export interface ConfigFloor {
    /** 1-based 层号 */
    floor: number;
    /** 强制主题；须存在于 mapThemes */
    themeId?: string;
    /** 杂兵数量乘子（相对遭遇模板结果，默认 1） */
    enemyCountMul?: number;
    /** 强度乘子（叠在 roomScaleStep 曲线上，默认 1） */
    scaleMul?: number;
    /** Boss / 最终 Boss 生命乘子（默认 1） */
    bossHpMul?: number;
}

export interface ConfigEconomy {
    coinDropChance: number;
    coinValueMin: number;
    coinValueMax: number;
    /** 局内清房商店同时展示的商品数 */
    shopItemCount: number;
    /** 死亡折算：每层贡献的灵魂石（可小数，再 floor 求和） */
    deathSoulPerFloor: number;
    /** 死亡折算：多少击杀折 1 魂 */
    deathSoulPerKills: number;
    /** 死亡折算：多少局内金币折 1 魂 */
    deathSoulPerCoins: number;
    /** 单局死亡折算上限 */
    deathSoulCap: number;
    /** 清一层：基础魂 + 层数 × 每层加成 */
    floorClearSoulBase: number;
    floorClearSoulPerFloor: number;
    /** 打通最终层额外灵魂石 */
    clearBonusSoul: number;
}

/**
 * 关卡模式条目（stages[]）。
 * 每关独立短局；通关发 clearBonusSoul / 可选补给；unlockAfter 链式解锁。
 */
export interface ConfigStage {
    id: string;
    name: string;
    emoji: string;
    desc: string;
    /** 本关层数（1~N） */
    totalFloors: number;
    /** 覆盖默认 roomsPerFloor；缺省用 dungeon */
    roomsPerFloor?: number;
    /** 通关灵魂石奖励（必发） */
    clearBonusSoul: number;
    /** 通关写入补给箱的道具 */
    rewardItemId?: string;
    rewardItemAmount?: number;
    /** 需先通关的上一关 id；缺省=首关可打 */
    unlockAfter?: string;
    /** 强制主题（整关） */
    themeId?: string;
    /** 强度乘子 */
    scaleMul?: number;
}

export interface ConfigPack {
    version: number;
    publishedAt: string;
    characters: ConfigCharacter[];
    weapons: ConfigWeapon[];
    enemies: ConfigEnemy[];
    mapThemes: ConfigTheme[];
    biomeSpawn: Record<string, ConfigBiomeEntry[]>;
    encounters: ConfigEncounter[];
    /** 每个地图主题抽哪些房间模板 */
    themeEncounters: Record<string, ConfigThemeEncounter[]>;
    /** 逐层覆盖（可空）；强度默认仍走 dungeon 曲线 */
    floors: ConfigFloor[];
    dungeon: ConfigDungeon;
    /** 关卡模式表（可缺省=空） */
    stages?: ConfigStage[];
    items: ConfigItem[];
    talents: ConfigTalent[];
    drops: ConfigDropTable[];
    shop: ConfigShopOffer[];
    economy: ConfigEconomy;
}
