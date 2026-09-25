import { Color } from 'cc';
import { BUILTIN_PACK } from './BuiltinPack';
import {
    ConfigBiomeEntry, ConfigCharacter, ConfigDungeon, ConfigEconomy, ConfigEnemy, ConfigFloor, ConfigDropTable, ConfigPack, ConfigShopOffer,
    ConfigStage, ConfigTalent, ConfigTheme, ConfigWeapon, ConfigItem, ConfigEnemyId, ConfigEncounter, ConfigThemeEncounter,
    ObstacleStyleId, SpawnEnemyTypeId, StatKey,
} from './ConfigSchema';
import type { CharacterDef } from './CharacterData';
import type { ShopOffer } from './ShopData';
import type { TalentDef } from './TalentData';
import type { BiomeSpawnEntry, MapThemeDef } from '../game/dungeon/MapThemes';
import type { WeaponDef } from '../game/weapon/WeaponController';

const STAT_KEYS: readonly StatKey[] = ['maxHp', 'atk', 'def', 'moveSpeed', 'critChance', 'critMultiplier'];
const OBSTACLE_STYLES: readonly ObstacleStyleId[] = ['rock', 'pillar', 'root', 'crystal', 'cloud'];
const SPAWN_TYPES: readonly SpawnEnemyTypeId[] = ['slime', 'fast', 'tank', 'archer', 'wisp', 'mage', 'beetle', 'bat', 'toad', 'crystal', 'golem', 'moth', 'dragon', 'raven', 'mosquito', 'specter', 'bone', 'spider', 'snake', 'imp', 'shroom', 'jelly'];
const ENEMY_IDS: readonly ConfigEnemyId[] = ['slime', 'fast', 'tank', 'archer', 'wisp', 'mage', 'beetle', 'bat', 'toad', 'crystal', 'golem', 'moth', 'dragon', 'raven', 'mosquito', 'specter', 'bone', 'spider', 'snake', 'imp', 'shroom', 'jelly'];
const BULLET_SHAPES = ['ball', 'arrow', 'orb'] as const;
const FIRE_MODES = ['slash', 'thrust', 'heavy', 'flurry', 'wave', 'bolt', 'spread', 'burst', 'bounce', 'homing', 'beam', 'lob'] as const;

interface ActivePack {
    version: number;
    publishedAt: string;
    characters: CharacterDef[];
    themes: MapThemeDef[];
    themeById: Map<string, MapThemeDef>;
    biome: Record<string, BiomeSpawnEntry[]>;
    talents: TalentDef[];
    weapons: WeaponDef[];
    weaponById: Map<string, WeaponDef>;
    enemies: ConfigEnemy[];
    enemyById: Map<string, ConfigEnemy>;
    dungeon: ConfigDungeon;
    encounters: ConfigEncounter[];
    encounterById: Map<string, ConfigEncounter>;
    themeEncounters: Record<string, ConfigThemeEncounter[]>;
    shop: ShopOffer[];
    items: ConfigItem[];
    economy: ConfigEconomy;
    floors: ConfigFloor[];
    floorByNumber: Map<number, ConfigFloor>;
    drops: ConfigDropTable[];
    dropById: Map<string, ConfigDropTable>;
    stages: ConfigStage[];
    stageById: Map<string, ConfigStage>;
}

/**
 * ConfigStore —— 启动读内置包；tryApply 收外部包，校验失败保持上一份（没有则内置）。
 * 网络拉取在 ConfigRemote（可选）；本类不发起请求。floors[] / drops[] 已进包。
 */
export class ConfigStore {
    private static _active: ActivePack | null = null;
    private static _source: 'builtin' | 'external' = 'builtin';
    private static _error = '';

    static get source() { return ConfigStore._source; }
    static get lastError() { return ConfigStore._error; }
    static get version() { return ConfigStore._ensure().version; }

    static loadBuiltin() {
        const err = validatePack(BUILTIN_PACK);
        if (err) {
            ConfigStore._error = err;
            // 不 throw：编辑器反序列化时抛错会变成「Load current scene data failed」
            console.error(`[ConfigStore] 内置包无效: ${err}`);
            return;
        }
        ConfigStore._active = materialize(BUILTIN_PACK);
        ConfigStore._source = 'builtin';
        ConfigStore._error = '';
    }

    /**
     * 换成外部包。失败时不覆盖已加载内容；若尚未加载则退回内置包。
     * 返回 false 时看 lastError。
     */
    static tryApply(raw: unknown): boolean {
        const err = validatePack(raw);
        if (err) {
            ConfigStore._error = err;
            if (!ConfigStore._active) ConfigStore.loadBuiltin();
            return false;
        }
        ConfigStore._active = materialize(raw as ConfigPack);
        ConfigStore._source = 'external';
        ConfigStore._error = '';
        return true;
    }

    static characters(): readonly CharacterDef[] {
        return ConfigStore._ensure().characters;
    }

    static themes(): readonly MapThemeDef[] {
        return ConfigStore._ensure().themes;
    }

    static theme(id: string): MapThemeDef | null {
        return ConfigStore._ensure().themeById.get(id) ?? null;
    }

    static biomeSpawn(): Readonly<Record<string, readonly BiomeSpawnEntry[]>> {
        return ConfigStore._ensure().biome;
    }

    static talents(): readonly TalentDef[] {
        return ConfigStore._ensure().talents;
    }

    static shop(): readonly ShopOffer[] {
        return ConfigStore._ensure().shop;
    }

    static items(): readonly ConfigItem[] {
        return ConfigStore._ensure().items;
    }

    static item(id: string): ConfigItem | null {
        return ConfigStore._ensure().items.find(i => i.id === id) ?? null;
    }

    static weapon(id: string): WeaponDef | null {
        return ConfigStore._ensure().weaponById.get(id) ?? null;
    }

    static weaponList(): readonly WeaponDef[] {
        return ConfigStore._ensure().weapons;
    }

    static enemy(id: string): ConfigEnemy | null {
        return ConfigStore._ensure().enemyById.get(id) ?? null;
    }

    static dungeon(): ConfigDungeon {
        return ConfigStore._ensure().dungeon;
    }

    /** 逐层覆盖；无配置时返回 null（走默认曲线） */
    static floorOverride(floor: number): ConfigFloor | null {
        return ConfigStore._ensure().floorByNumber.get(floor) ?? null;
    }

    static floors(): readonly ConfigFloor[] {
        return ConfigStore._ensure().floors;
    }

    static dropTable(id: string): ConfigDropTable | null {
        return ConfigStore._ensure().dropById.get(id) ?? null;
    }

    static drops(): readonly ConfigDropTable[] {
        return ConfigStore._ensure().drops;
    }

    static encounters(): readonly ConfigEncounter[] {
        return ConfigStore._ensure().encounters;
    }

    static encounter(id: string): ConfigEncounter | null {
        return ConfigStore._ensure().encounterById.get(id) ?? null;
    }

    static themeEncounters(themeId: string): readonly ConfigThemeEncounter[] {
        return ConfigStore._ensure().themeEncounters[themeId] ?? [];
    }

    static economy(): ConfigEconomy {
        return ConfigStore._ensure().economy;
    }

    static stages(): readonly ConfigStage[] {
        return ConfigStore._ensure().stages;
    }

    static stage(id: string): ConfigStage | null {
        return ConfigStore._ensure().stageById.get(id) ?? null;
    }

    private static _ensure(): ActivePack {
        if (!ConfigStore._active) ConfigStore.loadBuiltin();
        if (!ConfigStore._active) {
            throw new Error(`[ConfigStore] 内容包未就绪: ${ConfigStore._error || 'unknown'}`);
        }
        return ConfigStore._active;
    }
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === 'object' && !Array.isArray(v);
}

function num(v: unknown): number | null {
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
    return typeof v === 'string' && v.length > 0 ? v : null;
}

function rgb3(v: unknown): boolean {
    if (!Array.isArray(v) || v.length < 3) return false;
    return num(v[0]) !== null && num(v[1]) !== null && num(v[2]) !== null;
}

function rgba4(v: unknown): boolean {
    return rgb3(v) && Array.isArray(v) && v.length >= 4 && num(v[3]) !== null;
}

function uniqueIds(rows: Array<{ id: string }>, label: string): string | null {
    const seen = new Set<string>();
    for (const row of rows) {
        if (seen.has(row.id)) return `${label} id 重复: ${row.id}`;
        seen.add(row.id);
    }
    return null;
}

export function validatePack(raw: unknown): string | null {
    if (!isRecord(raw)) return '配置不是对象';
    const version = num(raw.version);
    if (version === null || version < 1) return 'version 无效';
    if (typeof raw.publishedAt !== 'string') return 'publishedAt 无效';

    const weaponIds = checkWeaponTable(raw.weapons);
    if (typeof weaponIds === 'string') return weaponIds;
    const enemyIds = checkEnemyTable(raw.enemies);
    if (typeof enemyIds === 'string') return enemyIds;
    const dungeonErr = checkDungeon(raw.dungeon);
    if (dungeonErr) return dungeonErr;

    if (!Array.isArray(raw.characters) || raw.characters.length < 1) return '角色表为空';
    const characters: ConfigCharacter[] = [];
    for (const row of raw.characters) {
        const err = checkCharacter(row);
        if (err) return err;
        characters.push(row as ConfigCharacter);
    }
    const dupC = uniqueIds(characters, '角色');
    if (dupC) return dupC;
    if (!characters.some(c => c.cost === 0)) return '至少要有一个免费角色';
    for (const c of characters) {
        if (!weaponIds.has(c.exclusiveWeaponId)) return `专属武器不存在: ${c.id} → ${c.exclusiveWeaponId}`;
    }
    const charIds = new Set(characters.map(c => c.id));
    if (Array.isArray(raw.weapons)) {
        for (const w of raw.weapons) {
            if (!isRecord(w)) continue;
            const owner = w.ownerCharacterId;
            if (owner !== undefined && typeof owner === 'string' && owner && !charIds.has(owner)) {
                return `武器专属角色不存在: ${w.id} → ${owner}`;
            }
        }
    }

    if (!Array.isArray(raw.mapThemes) || raw.mapThemes.length < 1) return '地图主题表为空';
    const themes: ConfigTheme[] = [];
    for (const row of raw.mapThemes) {
        const err = checkTheme(row);
        if (err) return err;
        themes.push(row as ConfigTheme);
    }
    const dupT = uniqueIds(themes, '主题');
    if (dupT) return dupT;
    const themeIds = new Set(themes.map(t => t.id));
    const encounterErr = checkEncounters(raw.encounters, raw.themeEncounters, enemyIds, themeIds);
    if (encounterErr) return encounterErr;

    if (!isRecord(raw.biomeSpawn)) return '刷怪池不是对象';
    for (const key of Object.keys(raw.biomeSpawn)) {
        if (!themeIds.has(key)) return `刷怪池主题不存在: ${key}`;
        const pool = raw.biomeSpawn[key];
        if (!Array.isArray(pool) || pool.length < 1) return `刷怪池为空: ${key}`;
        for (const entry of pool) {
            const err = checkBiome(entry);
            if (err) return `${key}: ${err}`;
        }
    }

    if (!Array.isArray(raw.talents) || raw.talents.length < 1) return '天赋表为空';
    const talents: ConfigTalent[] = [];
    for (const row of raw.talents) {
        const err = checkTalent(row);
        if (err) return err;
        talents.push(row as ConfigTalent);
    }
    const dupTalent = uniqueIds(talents, '天赋');
    if (dupTalent) return dupTalent;
    const talentIds = new Set(talents.map(t => t.id));
    for (const t of talents) {
        for (const req of t.requires) {
            if (!talentIds.has(req)) return `天赋前置不存在: ${t.id} → ${req}`;
        }
    }

    if (!Array.isArray(raw.shop)) return '商店表不是数组';
    const shop: ConfigShopOffer[] = [];
    for (const row of raw.shop) {
        const err = checkShop(row);
        if (err) return err;
        shop.push(row as ConfigShopOffer);
    }
    const dupShop = uniqueIds(shop, '商店');
    if (dupShop) return dupShop;
    for (const offer of shop) {
        if (offer.kind === 'weapon' && !weaponIds.has(offer.weaponId)) {
            return `商店武器不在武器表: ${offer.id}`;
        }
    }

    const eco = checkEconomy(raw.economy);
    if (eco) return eco;

    for (const key of ['floors', 'items', 'drops'] as const) {
        if (!Array.isArray(raw[key])) return `${key} 不是数组`;
    }
    // stages 可选；缺省视为空表
    if (raw.stages !== undefined && !Array.isArray(raw.stages)) return 'stages 不是数组';
    const floorErr = checkFloors(raw.floors, raw.dungeon, themeIds);
    if (floorErr) return floorErr;
    const dropErr = checkDrops(raw.drops);
    if (dropErr) return dropErr;
    const itemErr = checkItems(raw.items);
    if (itemErr) return itemErr;
    const itemIds = new Set<string>();
    if (Array.isArray(raw.items)) {
        for (const row of raw.items) {
            if (isRecord(row) && typeof row.id === 'string') itemIds.add(row.id);
        }
    }
    const stageErr = checkStages(raw.stages ?? [], themeIds, itemIds);
    if (stageErr) return stageErr;
    for (const offer of shop) {
        if (offer.kind === 'kit' && !itemIds.has(offer.itemId)) {
            return `商店补给道具不存在: ${offer.id} → ${offer.itemId}`;
        }
    }
    if (Array.isArray(raw.drops)) {
        for (const row of raw.drops) {
            if (!isRecord(row) || !Array.isArray(row.itemPool)) continue;
            for (const pid of row.itemPool) {
                if (typeof pid === 'string' && pid && !itemIds.has(pid)) {
                    return `掉落道具池不存在: ${row.id} → ${pid}`;
                }
            }
        }
    }
    return null;
}

function checkWeaponTable(raw: unknown): Set<string> | string {
    if (!Array.isArray(raw) || raw.length < 1) return '武器表为空';
    const ids = new Set<string>();
    for (const row of raw) {
        const err = checkWeapon(row);
        if (err) return err;
        const id = (row as ConfigWeapon).id;
        if (ids.has(id)) return `武器 id 重复: ${id}`;
        ids.add(id);
    }
    if (!ids.has('sword')) return '武器表缺少 sword';
    return ids;
}

function checkWeapon(row: unknown): string | null {
    if (!isRecord(row)) return '武器条目不是对象';
    if (!str(row.id)) return '武器 id 无效';
    if (!str(row.name) || typeof row.emoji !== 'string' || typeof row.description !== 'string') {
        return `武器文案无效: ${row.id}`;
    }
    if (row.type !== 'melee' && row.type !== 'ranged') return `武器类型无效: ${row.id}`;
    const damage = num(row.damage);
    const cooldown = num(row.cooldown);
    const range = num(row.range);
    const cone = num(row.coneHalf);
    const multi = num(row.multiHit);
    if (damage === null || damage < 0) return `武器伤害无效: ${row.id}`;
    if (cooldown === null || cooldown <= 0) return `武器冷却无效: ${row.id}`;
    if (range === null || range <= 0) return `武器射程无效: ${row.id}`;
    if (cone === null || cone < 0) return `武器扇角无效: ${row.id}`;
    if (multi === null || multi < 1) return `武器连击无效: ${row.id}`;
    if (row.type === 'ranged') {
        const speed = num(row.bulletSpeed);
        const size = num(row.bulletSize);
        if (speed === null || speed <= 0 || size === null || size <= 0) return `弹道参数无效: ${row.id}`;
        if (typeof row.bulletShape !== 'string' || BULLET_SHAPES.indexOf(row.bulletShape as typeof BULLET_SHAPES[number]) < 0) {
            return `弹道形状无效: ${row.id}`;
        }
        if (!rgba4(row.bulletColor)) return `弹道颜色无效: ${row.id}`;
    }
    if (row.piercing !== undefined && typeof row.piercing !== 'boolean') return `穿透标记无效: ${row.id}`;
    if (row.fireMode !== undefined && FIRE_MODES.indexOf(row.fireMode as typeof FIRE_MODES[number]) < 0) {
        return `武器打法无效: ${row.id}`;
    }
    for (const k of ['pellets', 'spreadDeg', 'burst', 'knockback', 'splash', 'bounce'] as const) {
        if (row[k] === undefined) continue;
        const v = num(row[k]);
        if (v === null || v < 0) return `武器打法参数无效: ${row.id}.${k}`;
    }
    if (row.slow !== undefined) {
        const sl = row.slow;
        if (!Array.isArray(sl) || sl.length !== 2 || num(sl[0]) === null || num(sl[1]) === null) return `武器减速参数无效: ${row.id}`;
    }
    if (row.rarity !== undefined) {
        const ok = ['white', 'green', 'blue', 'purple', 'gold', 'red', 'common', 'rare', 'epic']
            .indexOf(row.rarity as string) >= 0;
        if (!ok) return `武器稀有度无效: ${row.id}`;
    }
    if (row.unlockFloor !== undefined) {
        const uf = num(row.unlockFloor);
        if (uf === null || uf < 1 || !Number.isInteger(uf)) return `武器解锁层无效: ${row.id}`;
    }
    if (row.dropWeight !== undefined) {
        const dw = num(row.dropWeight);
        // 0 = 明确不参与刷取（如起始剑）；负值非法
        if (dw === null || dw < 0) return `武器掉落权重无效: ${row.id}`;
    }
    if (row.ownerCharacterId !== undefined) {
        if (!str(row.ownerCharacterId)) return `武器专属角色无效: ${row.id}`;
    }
    return null;
}

function checkEnemyTable(raw: unknown): Set<string> | string {
    if (!Array.isArray(raw) || raw.length < 1) return '怪物表为空';
    const ids = new Set<string>();
    for (const row of raw) {
        if (!isRecord(row)) return '怪物条目不是对象';
        if (typeof row.id !== 'string' || ENEMY_IDS.indexOf(row.id as ConfigEnemyId) < 0) return '怪物 id 无效';
        const hp = num(row.hp);
        const damage = num(row.damage);
        const speed = num(row.speed);
        if (hp === null || hp <= 0) return `怪物生命无效: ${row.id}`;
        if (damage === null || damage < 0) return `怪物伤害无效: ${row.id}`;
        if (speed === null || speed <= 0) return `怪物移速无效: ${row.id}`;
        if (row.speedScale !== 'flat' && row.speedScale !== 'room') return `怪物移速缩放无效: ${row.id}`;
        if (row.behaviorId !== 'chase' && row.behaviorId !== 'kite'
            && row.behaviorId !== 'fly' && row.behaviorId !== 'cast'
            && row.behaviorId !== 'dragon') {
            return `怪物行为无效: ${row.id}`;
        }
        const bodySize = num(row.bodySize);
        const attackRange = num(row.attackRange);
        if (bodySize === null || bodySize <= 0) return `怪物体型无效: ${row.id}`;
        if (attackRange === null || attackRange < 0) return `怪物攻击距离无效: ${row.id}`;
        if (!rgb3(row.defaultColor)) return `怪物默认色无效: ${row.id}`;
        if (ids.has(row.id)) return `怪物 id 重复: ${row.id}`;
        ids.add(row.id);
    }
    for (const id of ENEMY_IDS) {
        if (!ids.has(id)) return `怪物表缺少 ${id}`;
    }
    return ids;
}

function checkEncounters(
    encountersRaw: unknown,
    themeRaw: unknown,
    enemyIds: Set<string>,
    themeIds: Set<string>,
): string | null {
    if (!Array.isArray(encountersRaw) || encountersRaw.length < 1) return '遭遇模板为空';
    const ids = new Set<string>();
    for (const row of encountersRaw) {
        if (!isRecord(row)) return '遭遇模板无效';
        const id = str(row.id);
        if (!id) return '遭遇模板 id 无效';
        if (ids.has(id)) return `遭遇模板重复: ${id}`;
        ids.add(id);
        if (row.placement !== 'scatter' && row.placement !== 'ring'
            && row.placement !== 'pillar' && row.placement !== 'door') {
            return `遭遇站位无效: ${id}`;
        }
        if (!Array.isArray(row.slots) || row.slots.length < 1) return `遭遇槽位为空: ${id}`;
        for (const slot of row.slots) {
            if (!isRecord(slot)) return `遭遇槽位无效: ${id}`;
            const count = num(slot.count);
            if (count === null || count < 1) return `遭遇数量无效: ${id}`;
            if (slot.source === 'biome') continue;
            if (slot.source !== 'enemy') return `遭遇来源无效: ${id}`;
            if (typeof slot.enemyId !== 'string' || !enemyIds.has(slot.enemyId)) {
                return `遭遇指定怪不存在: ${id}`;
            }
        }
    }
    if (!isRecord(themeRaw)) return '主题遭遇表不是对象';
    for (const themeId of themeIds) {
        const list = themeRaw[themeId];
        if (!Array.isArray(list) || list.length < 1) return `主题没有遭遇模板: ${themeId}`;
        for (const row of list) {
            if (!isRecord(row) || typeof row.encounterId !== 'string' || !ids.has(row.encounterId)) {
                return `主题遭遇模板不存在: ${themeId}`;
            }
            const weight = num(row.weight);
            if (weight === null || weight < 0) return `主题遭遇权重无效: ${themeId}`;
        }
    }
    return null;
}

function checkFloors(raw: unknown, dungeonRaw: unknown, themeIds: Set<string>): string | null {
    if (!Array.isArray(raw)) return 'floors 不是数组';
    const total = isRecord(dungeonRaw) ? num(dungeonRaw.totalFloors) : null;
    const seen = new Set<number>();
    for (const row of raw) {
        if (!isRecord(row)) return '层配置不是对象';
        const floor = num(row.floor);
        if (floor === null || floor < 1 || !Number.isInteger(floor)) return '层号无效';
        if (total !== null && floor > total) return `层号超出 totalFloors: ${floor}`;
        if (seen.has(floor)) return `层号重复: ${floor}`;
        seen.add(floor);
        if (row.themeId !== undefined) {
            if (typeof row.themeId !== 'string' || !themeIds.has(row.themeId)) {
                return `层强制主题不存在: ${floor} → ${row.themeId}`;
            }
        }
        for (const key of ['enemyCountMul', 'scaleMul', 'bossHpMul'] as const) {
            if (row[key] === undefined) continue;
            const v = num(row[key]);
            if (v === null || v <= 0) return `层 ${key} 无效: ${floor}`;
        }
    }
    return null;
}

function checkDrops(raw: unknown): string | null {
    if (!Array.isArray(raw)) return 'drops 不是数组';
    const ids = new Set<string>();
    for (const row of raw) {
        if (!isRecord(row)) return '掉落表条目不是对象';
        const id = str(row.id);
        if (!id) return '掉落表 id 无效';
        if (ids.has(id)) return `掉落表 id 重复: ${id}`;
        ids.add(id);
        for (const key of ['coinChance', 'heartChance'] as const) {
            const v = num(row[key]);
            if (v === null || v < 0 || v > 1) return `掉落 ${key} 无效: ${id}`;
        }
        if (row.itemChance !== undefined) {
            const ic = num(row.itemChance);
            if (ic === null || ic < 0 || ic > 1) return `掉落 itemChance 无效: ${id}`;
        }
        if (row.itemPool !== undefined) {
            if (!Array.isArray(row.itemPool)) return `掉落 itemPool 无效: ${id}`;
            for (const pid of row.itemPool) {
                if (typeof pid !== 'string' || !pid) return `掉落 itemPool 元素无效: ${id}`;
            }
        }
        for (const key of ['coinMin', 'coinMax', 'heartAmount'] as const) {
            const v = num(row[key]);
            if (v === null || v < 0) return `掉落 ${key} 无效: ${id}`;
        }
        const cmin = num(row.coinMin)!;
        const cmax = num(row.coinMax)!;
        if (cmax < cmin) return `掉落 coinMax < coinMin: ${id}`;
        if (row.lootKind !== 'coin' && row.lootKind !== 'chest') return `掉落 lootKind 无效: ${id}`;
    }
    return null;
}

function checkDungeon(raw: unknown): string | null {
    if (!isRecord(raw)) return '关卡曲线无效';
    const ints = ['totalFloors', 'roomsPerFloor', 'bossAttackRange', 'finalBossAttackRange'] as const;
    for (const key of ints) {
        const n = num(raw[key]);
        if (n === null || n < 1) return `关卡 ${key} 无效`;
    }
    const rest = [
        'roomScaleStep', 'bossHpBase', 'bossHpPerFloor', 'bossSpeedBase', 'bossSpeedPerFloor',
        'bossDamageBase', 'bossDamagePerFloor', 'finalBossHpBase', 'finalBossHpPerFloor',
        'finalBossSpeed', 'finalBossDamage', 'summonHp', 'summonSpeed', 'summonDamage',
    ] as const;
    for (const key of rest) {
        const n = num(raw[key]);
        if (n === null || n < 0) return `关卡 ${key} 无效`;
    }
    for (const key of ['finalRoomTrashCap', 'summonCount', 'summonAttackRange', 'summonDetectionRange'] as const) {
        const n = num(raw[key]);
        if (n === null || n < 1) return `关卡 ${key} 无效`;
    }
    if (raw.bossBehaviorId !== 'boss' && raw.bossBehaviorId !== 'chase' && raw.bossBehaviorId !== 'kite') {
        return 'Boss 行为无效';
    }
    return null;
}

function checkCharacter(row: unknown): string | null {
    if (!isRecord(row)) return '角色条目不是对象';
    if (!str(row.id) || !str(row.name) || typeof row.emoji !== 'string') return '角色 id/名称无效';
    if (typeof row.desc !== 'string') return `角色说明无效: ${row.id}`;
    const cost = num(row.cost);
    if (cost === null || cost < 0) return `角色花费无效: ${row.id}`;
    if (!str(row.skinId) || !str(row.exclusiveWeaponId)) return `角色皮肤或专属武器缺失: ${row.id}`;
    if (!isRecord(row.base)) return `角色属性缺失: ${row.id}`;
    for (const key of STAT_KEYS) {
        const n = num(row.base[key]);
        if (n === null) return `角色属性 ${key} 无效: ${row.id}`;
    }
    return null;
}

function checkTheme(row: unknown): string | null {
    if (!isRecord(row)) return '主题条目不是对象';
    if (!str(row.id) || !str(row.name)) return '主题 id/名称无效';
    const style = row.obstacleStyle;
    if (typeof style !== 'string' || OBSTACLE_STYLES.indexOf(style as ObstacleStyleId) < 0) {
        return `障碍风格无效: ${row.id}`;
    }
    for (const key of ['floorDark', 'floorLight', 'floorEdge', 'borderColor', 'obstacleDark', 'obstacleMid', 'obstacleLight'] as const) {
        if (!rgb3(row[key])) return `主题颜色无效 ${key}: ${row.id}`;
    }
    if (!rgba4(row.floorShine)) return `主题高光无效: ${row.id}`;
    const count = num(row.obstacleCount);
    const corner = num(row.cornerCount);
    const min = num(row.floorMin);
    const max = num(row.floorMax);
    const weight = num(row.weight);
    if (count === null || count < 0 || corner === null || corner < 0) return `障碍数量无效: ${row.id}`;
    if (min === null || max === null || min > max) return `层段无效: ${row.id}`;
    if (weight === null || weight < 0) return `主题权重无效: ${row.id}`;
    if (typeof row.blurb !== 'string' || row.blurb.length < 1) return `主题介绍无效: ${row.id}`;
    return null;
}

function checkBiome(row: unknown): string | null {
    if (!isRecord(row)) return '刷怪条目不是对象';
    if (typeof row.type !== 'string' || SPAWN_TYPES.indexOf(row.type as SpawnEnemyTypeId) < 0) return '怪类型无效';
    const weight = num(row.weight);
    if (weight === null || weight < 0) return '刷怪权重无效';
    if (row.hpMul !== undefined && num(row.hpMul) === null) return 'hpMul 无效';
    if (row.spdMul !== undefined && num(row.spdMul) === null) return 'spdMul 无效';
    if (row.color !== undefined && !rgb3(row.color)) return '刷怪颜色无效';
    if (row.floorMin !== undefined && num(row.floorMin) === null) return 'floorMin 无效';
    if (row.floorMax !== undefined && num(row.floorMax) === null) return 'floorMax 无效';
    return null;
}

function checkTalent(row: unknown): string | null {
    if (!isRecord(row)) return '天赋条目不是对象';
    if (!str(row.id) || !str(row.name)) return '天赋 id/名称无效';
    const maxLevel = num(row.maxLevel);
    const costBase = num(row.costBase);
    const costStep = num(row.costStep);
    if (maxLevel === null || maxLevel < 1) return `天赋等级无效: ${row.id}`;
    if (costBase === null || costBase < 0 || costStep === null || costStep < 0) return `天赋花费无效: ${row.id}`;
    if (!Array.isArray(row.requires) || !row.requires.every(id => typeof id === 'string' && id.length > 0)) {
        return `天赋前置无效: ${row.id}`;
    }
    if (!Array.isArray(row.effects) || row.effects.length < 1) return `天赋效果为空: ${row.id}`;
    for (const effect of row.effects) {
        if (!isRecord(effect)) return `天赋效果无效: ${row.id}`;
        if (effect.kind === 'kill_heal' || effect.kind === 'skill_cd' || effect.kind === 'pickup_range') {
            if (num(effect.perLevel) === null) return `特殊效果数值无效: ${row.id}`;
            continue;
        }
        if (effect.kind !== 'stat') return `未知天赋效果: ${row.id}`;
        if (typeof effect.stat !== 'string' || STAT_KEYS.indexOf(effect.stat as StatKey) < 0) {
            return `天赋属性无效: ${row.id}`;
        }
        if (num(effect.perLevel) === null) return `天赋数值无效: ${row.id}`;
    }
    return null;
}

function checkShop(row: unknown): string | null {
    if (!isRecord(row)) return '商店条目不是对象';
    if (!str(row.id) || !str(row.name) || typeof row.desc !== 'string') return '商店文案无效';
    const cost = num(row.cost);
    if (cost === null || cost < 0) return `商店价格无效: ${row.id}`;
    if (row.kind === 'weapon') {
        if (typeof row.weaponId !== 'string' || row.weaponId.length < 1) {
            return `商店武器无效: ${row.id}`;
        }
        return null;
    }
    if (row.kind === 'character') {
        if (typeof row.characterId !== 'string' || row.characterId.length < 1) {
            return `商店角色无效: ${row.id}`;
        }
        return null;
    }
    if (row.kind === 'kit') {
        if (typeof row.itemId !== 'string' || row.itemId.length < 1) {
            return `商店补给道具无效: ${row.id}`;
        }
        const amount = num(row.amount);
        if (amount === null || amount < 1) return `商店补给数量无效: ${row.id}`;
        return null;
    }
    if (row.kind === 'perm_stat') {
        if (row.purchaseKey !== 'maxHp' && row.purchaseKey !== 'atk'
            && row.purchaseKey !== 'def' && row.purchaseKey !== 'moveSpeed') {
            return `商店属性键无效: ${row.id}`;
        }
        const amount = num(row.amount);
        if (amount === null || amount === 0) return `商店加成无效: ${row.id}`;
        if (typeof row.stackable !== 'boolean') return `商店叠加标记无效: ${row.id}`;
        return null;
    }
    return `商店类型无效: ${row.id}`;
}

function checkItems(raw: unknown): string | null {
    if (!Array.isArray(raw)) return '道具表不是数组';
    const ids = new Set<string>();
    for (const row of raw) {
        if (!isRecord(row)) return '道具条目无效';
        const id = str(row.id);
        if (!id) return '道具 id 无效';
        if (ids.has(id)) return `道具重复: ${id}`;
        ids.add(id);
        if (!str(row.name) || typeof row.emoji !== 'string' || typeof row.desc !== 'string') {
            return `道具文案无效: ${id}`;
        }
        if (row.kind !== 'heal' && row.kind !== 'buff' && row.kind !== 'throw') return `道具类型无效: ${id}`;
        const amount = num(row.amount);
        if (amount === null || amount <= 0) return `道具数值无效: ${id}`;
        if (row.rarity !== undefined
            && row.rarity !== 'common' && row.rarity !== 'rare' && row.rarity !== 'epic') {
            return `道具稀有度无效: ${id}`;
        }
        if (row.dropWeight !== undefined) {
            const w = num(row.dropWeight);
            if (w === null || w < 0) return `道具权重无效: ${id}`;
        }
    }
    return null;
}

function checkStages(
    raw: unknown,
    themeIds: Set<string>,
    itemIds: Set<string>,
): string | null {
    if (!Array.isArray(raw)) return 'stages 不是数组';
    const ids = new Set<string>();
    for (const row of raw) {
        if (!isRecord(row)) return '关卡条目不是对象';
        const id = str(row.id);
        if (!id) return '关卡 id 无效';
        if (ids.has(id)) return `关卡 id 重复: ${id}`;
        ids.add(id);
        if (!str(row.name) || typeof row.emoji !== 'string' || typeof row.desc !== 'string') {
            return `关卡文案无效: ${id}`;
        }
        const floors = num(row.totalFloors);
        if (floors === null || floors < 1 || floors > 20) return `关卡层数无效: ${id}`;
        const bonus = num(row.clearBonusSoul);
        if (bonus === null || bonus < 0) return `关卡奖励无效: ${id}`;
        if (row.roomsPerFloor !== undefined) {
            const r = num(row.roomsPerFloor);
            if (r === null || r < 1 || r > 12) return `关卡房间数无效: ${id}`;
        }
        if (row.unlockAfter !== undefined) {
            if (typeof row.unlockAfter !== 'string' || !row.unlockAfter) {
                return `关卡解锁前置无效: ${id}`;
            }
        }
        if (row.themeId !== undefined) {
            if (typeof row.themeId !== 'string' || !themeIds.has(row.themeId)) {
                return `关卡主题不存在: ${id} → ${row.themeId}`;
            }
        }
        if (row.scaleMul !== undefined) {
            const m = num(row.scaleMul);
            if (m === null || m <= 0) return `关卡强度乘子无效: ${id}`;
        }
        if (row.rewardItemId !== undefined) {
            if (typeof row.rewardItemId !== 'string' || !itemIds.has(row.rewardItemId)) {
                return `关卡补给道具不存在: ${id}`;
            }
            const amt = num(row.rewardItemAmount ?? 1);
            if (amt === null || amt < 1) return `关卡补给数量无效: ${id}`;
        }
    }
    for (const row of raw) {
        if (!isRecord(row)) continue;
        const after = row.unlockAfter;
        if (typeof after === 'string' && after && !ids.has(after)) {
            return `关卡前置不存在: ${row.id} → ${after}`;
        }
    }
    return null;
}

function checkEconomy(raw: unknown): string | null {
    if (!isRecord(raw)) return '经济表无效';
    const chance = num(raw.coinDropChance);
    const min = num(raw.coinValueMin);
    const max = num(raw.coinValueMax);
    const count = num(raw.shopItemCount);
    if (chance === null || chance < 0 || chance > 1) return '金币掉率无效';
    if (min === null || max === null || min < 0 || min > max) return '金币面值无效';
    if (count === null || count < 1 || count > 8) return '商店栏位数无效';
    const dpf = num(raw.deathSoulPerFloor);
    const dpk = num(raw.deathSoulPerKills);
    const dpc = num(raw.deathSoulPerCoins);
    const cap = num(raw.deathSoulCap);
    if (dpf === null || dpf < 0) return '死亡层折算无效';
    if (dpk === null || dpk < 1) return '死亡击杀折算无效';
    if (dpc === null || dpc < 1) return '死亡金币折算无效';
    if (cap === null || cap < 0) return '死亡折算上限无效';
    const fBase = num(raw.floorClearSoulBase);
    const fPer = num(raw.floorClearSoulPerFloor);
    const clear = num(raw.clearBonusSoul);
    if (fBase === null || fBase < 0) return '清层灵魂基础无效';
    if (fPer === null || fPer < 0) return '清层灵魂每层无效';
    if (clear === null || clear < 0) return '通关奖励灵魂无效';
    return null;
}

function colorOf(rgb: number[], alpha?: number): Color {
    return new Color(rgb[0], rgb[1], rgb[2], alpha ?? 255);
}

function materialize(pack: ConfigPack): ActivePack {
    const themes: MapThemeDef[] = pack.mapThemes.map(theme => ({
        id: theme.id,
        name: theme.name,
        emoji: theme.emoji,
        floorDark: colorOf(theme.floorDark),
        floorLight: colorOf(theme.floorLight),
        floorEdge: colorOf(theme.floorEdge),
        floorShine: colorOf(theme.floorShine, theme.floorShine[3]),
        borderColor: colorOf(theme.borderColor),
        obstacleStyle: theme.obstacleStyle,
        obstacleCount: theme.obstacleCount,
        cornerCount: theme.cornerCount,
        obstacleDark: colorOf(theme.obstacleDark),
        obstacleMid: colorOf(theme.obstacleMid),
        obstacleLight: colorOf(theme.obstacleLight),
        floorMin: theme.floorMin,
        floorMax: theme.floorMax,
        weight: theme.weight,
        blurb: theme.blurb,
    }));
    const themeById = new Map(themes.map(t => [t.id, t]));
    const biome: Record<string, BiomeSpawnEntry[]> = {};
    for (const key of Object.keys(pack.biomeSpawn)) {
        biome[key] = pack.biomeSpawn[key].map(copyBiome);
    }
    const weapons = pack.weapons.map(copyWeapon);
    const enemies = pack.enemies.map(copyEnemy);
    const encounters = pack.encounters.map(copyEncounter);
    return {
        version: pack.version,
        publishedAt: pack.publishedAt,
        characters: pack.characters.map(copyCharacter),
        themes,
        themeById,
        biome,
        talents: pack.talents.map(copyTalent),
        weapons,
        weaponById: new Map(weapons.map(w => [w.id, w])),
        enemies,
        enemyById: new Map(enemies.map(e => [e.id, e])),
        dungeon: { ...pack.dungeon },
        encounters,
        encounterById: new Map(encounters.map(e => [e.id, e])),
        themeEncounters: copyThemeEncounters(pack.themeEncounters),
        shop: pack.shop.map(copyShop),
        items: pack.items.map(copyItem),
        economy: { ...pack.economy },
        floors: (pack.floors ?? []).map(copyFloor),
        floorByNumber: new Map((pack.floors ?? []).map(f => [f.floor, copyFloor(f)])),
        drops: (pack.drops ?? []).map(copyDrop),
        dropById: new Map((pack.drops ?? []).map(d => [d.id, copyDrop(d)])),
        stages: (pack.stages ?? []).map(copyStage),
        stageById: new Map((pack.stages ?? []).map(s => [s.id, copyStage(s)])),
    };
}

function copyStage(row: ConfigStage): ConfigStage {
    return {
        id: row.id,
        name: row.name,
        emoji: row.emoji,
        desc: row.desc,
        totalFloors: row.totalFloors,
        roomsPerFloor: row.roomsPerFloor,
        clearBonusSoul: row.clearBonusSoul,
        rewardItemId: row.rewardItemId,
        rewardItemAmount: row.rewardItemAmount,
        unlockAfter: row.unlockAfter,
        themeId: row.themeId,
        scaleMul: row.scaleMul,
    };
}

function copyDrop(row: ConfigDropTable): ConfigDropTable {
    return {
        id: row.id,
        coinChance: row.coinChance,
        coinMin: row.coinMin,
        coinMax: row.coinMax,
        heartChance: row.heartChance,
        heartAmount: row.heartAmount,
        lootKind: row.lootKind,
        itemChance: row.itemChance,
        itemPool: row.itemPool ? [...row.itemPool] : undefined,
    };
}

function copyFloor(row: ConfigFloor): ConfigFloor {
    const out: ConfigFloor = { floor: row.floor };
    if (row.themeId) out.themeId = row.themeId;
    if (row.enemyCountMul !== undefined) out.enemyCountMul = row.enemyCountMul;
    if (row.scaleMul !== undefined) out.scaleMul = row.scaleMul;
    if (row.bossHpMul !== undefined) out.bossHpMul = row.bossHpMul;
    return out;
}

function copyItem(row: ConfigItem): ConfigItem {
    return {
        id: row.id,
        name: row.name,
        emoji: row.emoji,
        desc: row.desc,
        kind: row.kind,
        amount: row.amount,
        rarity: row.rarity,
        dropWeight: row.dropWeight,
    };
}

function copyWeapon(row: ConfigWeapon): WeaponDef {
    return {
        id: row.id,
        name: row.name,
        emoji: row.emoji,
        type: row.type,
        damage: row.damage,
        cooldown: row.cooldown,
        range: row.range,
        coneHalf: row.coneHalf,
        multiHit: row.multiHit,
        bulletSpeed: row.bulletSpeed,
        bulletSize: row.bulletSize,
        bulletColor: row.bulletColor ? colorOf(row.bulletColor, row.bulletColor[3]) : undefined,
        bulletShape: row.bulletShape,
        piercing: row.piercing,
        fireMode: row.fireMode,
        pellets: row.pellets,
        spreadDeg: row.spreadDeg,
        burst: row.burst,
        knockback: row.knockback,
        splash: row.splash,
        bounce: row.bounce,
        slow: row.slow ? [row.slow[0], row.slow[1]] : undefined,
        description: row.description,
        rarity: row.rarity ?? 'white',
        unlockFloor: row.unlockFloor ?? 1,
        dropWeight: row.dropWeight,
        ownerCharacterId: row.ownerCharacterId,
    };
}

function copyEnemy(row: ConfigEnemy): ConfigEnemy {
    return {
        id: row.id,
        hp: row.hp,
        damage: row.damage,
        speed: row.speed,
        speedScale: row.speedScale,
        behaviorId: row.behaviorId,
        bodySize: row.bodySize,
        attackRange: row.attackRange,
        defaultColor: [row.defaultColor[0], row.defaultColor[1], row.defaultColor[2]],
    };
}

function copyEncounter(row: ConfigEncounter): ConfigEncounter {
    return {
        id: row.id,
        placement: row.placement,
        slots: row.slots.map(slot => (
            slot.source === 'biome'
                ? { source: 'biome' as const, count: slot.count }
                : { source: 'enemy' as const, enemyId: slot.enemyId, count: slot.count }
        )),
    };
}

function copyThemeEncounters(raw: Record<string, ConfigThemeEncounter[]>): Record<string, ConfigThemeEncounter[]> {
    const out: Record<string, ConfigThemeEncounter[]> = {};
    for (const key of Object.keys(raw)) {
        out[key] = raw[key].map(row => ({ encounterId: row.encounterId, weight: row.weight }));
    }
    return out;
}

function copyCharacter(row: ConfigCharacter): CharacterDef {
    return {
        id: row.id,
        name: row.name,
        emoji: row.emoji,
        desc: row.desc,
        cost: row.cost,
        skinId: row.skinId,
        exclusiveWeaponId: row.exclusiveWeaponId,
        base: { ...row.base },
    };
}

function copyBiome(row: ConfigBiomeEntry): BiomeSpawnEntry {
    return {
        type: row.type,
        weight: row.weight,
        hpMul: row.hpMul,
        spdMul: row.spdMul,
        color: row.color ? [row.color[0], row.color[1], row.color[2]] : undefined,
        floorMin: row.floorMin,
        floorMax: row.floorMax,
    };
}

function copyTalent(row: ConfigTalent): TalentDef {
    const costBase = row.costBase;
    const costStep = row.costStep;
    return {
        id: row.id,
        name: row.name,
        emoji: row.emoji,
        desc: row.desc,
        maxLevel: row.maxLevel,
        costForLevel: (level: number) => costBase + (level - 1) * costStep,
        requires: row.requires.slice(),
        effects: row.effects.map(effect => (
            effect.kind === 'stat'
                ? { kind: 'stat' as const, stat: effect.stat, perLevel: effect.perLevel }
                : { kind: effect.kind, perLevel: effect.perLevel }
        )),
    };
}

function copyShop(row: ConfigShopOffer): ShopOffer {
    if (row.kind === 'weapon') {
        return {
            id: row.id,
            kind: 'weapon',
            weaponId: row.weaponId,
            name: row.name,
            desc: row.desc,
            cost: row.cost,
        };
    }
    if (row.kind === 'character') {
        return {
            id: row.id,
            kind: 'character',
            characterId: row.characterId,
            name: row.name,
            desc: row.desc,
            cost: row.cost,
        };
    }
    if (row.kind === 'kit') {
        return {
            id: row.id,
            kind: 'kit',
            itemId: row.itemId,
            amount: row.amount,
            name: row.name,
            desc: row.desc,
            cost: row.cost,
        };
    }
    return {
        id: row.id,
        kind: 'perm_stat',
        purchaseKey: row.purchaseKey,
        amount: row.amount,
        name: row.name,
        desc: row.desc,
        cost: row.cost,
        stackable: row.stackable,
    };
}
