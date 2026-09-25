import { _decorator, Component, director, profiler } from 'cc';
import { GameConfig } from './GameConfig';
import { RunState, WeaponData, GameSettings } from './types';
import { eventBus, GameEvents } from './EventBus';
import { SaveData, DEFAULT_SAVE, migrateSave } from './SaveData';
import { SaveStore } from './SaveStore';
import { PlayerStats } from './PlayerStats';
import {
    getTalent, computeTalentStats, computeKillHeal,
    canUnlock, nextLevelCost,
} from './TalentData';
import { getShopOffer } from './ShopData';
import { findRedeemCode, normalizeRedeemCode, type RedeemReward } from './RedeemCodes';
import { CloudSync } from './CloudSync';
import { listCharacters as configCharacters, defaultCharacter, getCharacter } from './CharacterData';
import { GameFlow } from './GameFlow';
import { ConfigStore } from './ConfigStore';
import { AudioManager } from './AudioManager';
import { RunBag } from '../game/item/RunBag';
import { RunTalent } from '../game/item/RunTalent';
import { LootMagnet } from '../game/item/LootMagnet';
import { resetRunCoins } from '../game/ui/UpgradeShop';
import { getStage, nextStageId } from './StageData';
import { getDifficulty, DifficultyId } from './Difficulty';

export type PlayMode = 'stage' | 'endless';

export interface RunConfig {
    mode: PlayMode;
    stageId: string | null;
    totalFloors: number;
    roomsPerFloor: number;
    themeId: string | null;
    scaleMul: number;
    /** 难度叠到刷怪数量 */
    countMul: number;
    /** 通关魂倍率（难度） */
    soulMul: number;
    /** 本局难度 id */
    difficultyId: DifficultyId;
    /** 通关刚结算的关卡（供 UI） */
    lastClearedStageId: string | null;
    lastClearSoul: number;
    lastClearItemTip: string;
}

const DEFAULT_BGM = DEFAULT_SAVE.settings.bgmVolume;
const DEFAULT_SFX = DEFAULT_SAVE.settings.sfxVolume;

/** 死亡结算快照（局内金币 → 局外灵魂石） */
export interface DeathReport {
    floor: number;
    score: number;
    kills: number;
    time: number;
    coins: number;
    soulEarned: number;
    soulTotal: number;
    newFloorRecord: boolean;
    newScoreRecord: boolean;
    weaponName: string;
}

const { ccclass } = _decorator;

declare const wx: any;

/**
 * 游戏主管理器（单例，跨场景保留）
 * 负责：局内状态、持久存档、全局生命周期
 */
@ccclass('GameManager')
export class GameManager extends Component {
    private static _instance: GameManager | null = null;

    static get instance(): GameManager | null {
        return GameManager._instance;
    }

    private _runState: RunState = GameManager.defaultRunState();
    private _save: SaveData = structuredClone(DEFAULT_SAVE);
    private _lastDeath: DeathReport | null = null;
    private _runConfig: RunConfig = GameManager.defaultRunConfig();

    get lastDeathReport(): DeathReport | null { return this._lastDeath; }
    get runConfig(): Readonly<RunConfig> { return this._runConfig; }

    isEndless(): boolean { return this._runConfig.mode === 'endless'; }

    effectiveTotalFloors(): number {
        return Math.max(1, this._runConfig.totalFloors);
    }

    effectiveRoomsPerFloor(): number {
        return Math.max(1, this._runConfig.roomsPerFloor);
    }

    runScaleMul(): number {
        return this._runConfig.scaleMul > 0 ? this._runConfig.scaleMul : 1;
    }

    runCountMul(): number {
        return this._runConfig.countMul > 0 ? this._runConfig.countMul : 1;
    }

    runThemeId(): string | null {
        return this._runConfig.themeId;
    }

    get selectedDifficultyId(): DifficultyId {
        return getDifficulty(this._save.selectedDifficulty).id;
    }

    selectDifficulty(id: string): boolean {
        const def = getDifficulty(id);
        this._save.selectedDifficulty = def.id;
        this.persist();
        return true;
    }

    stageStars(stageId: string): number {
        const map = this._save.progress.stageStars ?? {};
        const n = map[stageId];
        return typeof n === 'number' && n > 0 ? Math.min(3, Math.floor(n)) : 0;
    }

    onLoad() {
        if (GameManager._instance) {
            this.destroy();
            return;
        }
        GameManager._instance = this;
        director.addPersistRootNode(this.node);
        try { profiler.hideStats(); } catch { /* ignore */ }
        this._save = SaveStore.load();
        this._applyTalentsToStats();
        this._emitCharacter();
        AudioManager.ensure(this._save.settings);
        console.log('[GameManager] 存档已加载', {
            floor: this._save.progress.highestFloor,
            soul: this._save.currency.soul,
        });
    }

    onDestroy() {
        if (GameManager._instance === this) GameManager._instance = null;
    }

    // ── 局内 ──────────────────────────────────────────────

    get runState(): Readonly<RunState> { return this._runState; }
    get save(): Readonly<SaveData> { return this._save; }

    /** 关卡模式开战（配置好再 startNewRun） */
    beginStageRun(stageId: string): boolean {
        const stage = getStage(stageId);
        if (!stage) return false;
        const dungeon = ConfigStore.dungeon();
        const diff = getDifficulty(this._save.selectedDifficulty);
        this._runConfig = {
            mode: 'stage',
            stageId: stage.id,
            totalFloors: stage.totalFloors,
            roomsPerFloor: stage.roomsPerFloor ?? dungeon.roomsPerFloor,
            themeId: stage.themeId ?? null,
            scaleMul: (stage.scaleMul ?? 1) * diff.enemyScale,
            countMul: diff.countMul,
            soulMul: diff.soulMul,
            difficultyId: diff.id,
            lastClearedStageId: null,
            lastClearSoul: 0,
            lastClearItemTip: '',
        };
        this.startNewRun();
        return true;
    }

    /** 无尽模式开战 */
    beginEndlessRun() {
        const dungeon = ConfigStore.dungeon();
        const diff = getDifficulty(this._save.selectedDifficulty);
        this._runConfig = {
            mode: 'endless',
            stageId: null,
            totalFloors: 9999,
            roomsPerFloor: dungeon.roomsPerFloor,
            themeId: null,
            scaleMul: diff.enemyScale,
            countMul: diff.countMul,
            soulMul: diff.soulMul,
            difficultyId: diff.id,
            lastClearedStageId: null,
            lastClearSoul: 0,
            lastClearItemTip: '',
        };
        this.startNewRun();
    }

    /** @deprecated 请用 beginStageRun / beginEndlessRun；保留给兜底 */
    startNewRun() {
        this._runState = GameManager.defaultRunState();
        this._save.progress.totalRuns++;
        this._applyTalentsToStats();
        PlayerStats.I.resetForNewRun();
        RunBag.reset();
        RunTalent.reset();
        LootMagnet.reset();
        resetRunCoins();
        this._injectStashIntoBag();
        this.persist();
        eventBus.emit(GameEvents.COIN_COLLECTED, { amount: 0, total: 0 });
        try { AudioManager.playVoice(this.selectedCharacterId); } catch { /* ignore */ }
        const tag = this._runConfig.mode === 'endless'
            ? 'endless'
            : `stage:${this._runConfig.stageId ?? '?'}`;
        console.log('[GameManager] 新局开始', tag, 'bag=', RunBag.count());
    }

    /** 补给箱 → 局内背包，并扣减 stash */
    private _injectStashIntoBag() {
        if (!this._save.stash) this._save.stash = {};
        let loaded = 0;
        for (const id of Object.keys(this._save.stash)) {
            let left = Math.max(0, Math.floor(this._save.stash[id] ?? 0));
            while (left > 0) {
                if (!RunBag.tryAdd(id, 1)) break;
                left--;
                loaded++;
                this._save.stash[id] = (this._save.stash[id] ?? 0) - 1;
            }
            if ((this._save.stash[id] ?? 0) <= 0) delete this._save.stash[id];
        }
        if (loaded > 0) {
            this.persist();
            eventBus.emit('stash-changed', {});
            eventBus.emit('show-tip', { text: `🎒 补给装入背包 ×${loaded}` });
        }
    }

    addCoins(amount: number) {
        this._runState.coins += amount;
        if (amount > 0) this._save.currency.totalRunCoins += amount;
        eventBus.emit(GameEvents.COIN_COLLECTED, { amount, total: this._runState.coins });
    }

    spendCoins(amount: number): boolean {
        if (this._runState.coins < amount) return false;
        this._runState.coins -= amount;
        eventBus.emit(GameEvents.COIN_COLLECTED, { amount: -amount, total: this._runState.coins });
        return true;
    }

    addSoul(amount: number, persist = true) {
        this._save.currency.soul += amount;
        if (persist) this.persist();
        eventBus.emit('soul-changed', { soul: this._save.currency.soul });
    }

    /**
     * 扣除灵魂石。persist=false 时仅改内存，由调用方统一落盘（商店原子购买）。
     */
    spendSoul(amount: number, persist = true): boolean {
        if (this._save.currency.soul < amount) return false;
        this._save.currency.soul -= amount;
        if (persist) this.persist();
        eventBus.emit('soul-changed', { soul: this._save.currency.soul });
        return true;
    }

    /** 升级天赋一级；失败返回原因 */
    tryUpgradeTalent(id: string): { ok: boolean; reason?: string } {
        const def = getTalent(id);
        if (!def) return { ok: false, reason: '未知天赋' };
        const cur = this._save.talents[id] ?? 0;
        if (cur >= def.maxLevel) return { ok: false, reason: '已满级' };
        if (!canUnlock(def, this._save.talents)) {
            return { ok: false, reason: '前置未解锁' };
        }
        const cost = nextLevelCost(def, cur);
        if (cost === null) return { ok: false, reason: '已满级' };
        if (!this.spendSoul(cost, false)) return { ok: false, reason: '灵魂石不足' };
        this.setTalentLevel(id, cur + 1);
        return { ok: true };
    }

    /** 当前击杀回血量（局外天赋 + 局内三选一） */
    getKillHealAmount(): number {
        return computeKillHeal(this._save.talents) + RunTalent.killHealBonus();
    }

    equipWeapon(weapon: WeaponData) {
        this._runState.equippedWeapon = weapon;
        eventBus.emit(GameEvents.WEAPON_EQUIPPED, weapon);
    }

    onEnemyKilled(_enemyId: string) {
        this._runState.killCount++;
        this._save.progress.totalKills++;
        this._runState.score += 10;

        // 嗜血：击杀回血（天赋）
        const heal = this.getKillHealAmount();
        if (heal > 0) {
            const max = PlayerStats.I.get('maxHp');
            const before = PlayerStats.I.hp;
            PlayerStats.I.hp = Math.min(max, before + heal);
            if (PlayerStats.I.hp !== before) {
                eventBus.emit(GameEvents.PLAYER_HP_CHANGED, {
                    current: PlayerStats.I.hp,
                    max,
                });
            }
        }
    }

    /** 记录到达层并自动存 */
    recordFloor(floor: number) {
        this._runState.floor = floor;
        if (floor > this._save.progress.highestFloor) {
            this._save.progress.highestFloor = floor;
            this.persist();
        }
    }

    onFloorCleared(floor: number) {
        this.recordFloor(floor);
        const eco = ConfigStore.economy();
        const soul = Math.floor(eco.floorClearSoulBase + floor * eco.floorClearSoulPerFloor);
        if (soul > 0) this.addSoul(soul);

        // #123 过层回复：回 25% 上限，给下一层一个体面的起点（不满血，药水仍有价值）
        try {
            const max = PlayerStats.I.get('maxHp');
            const before = PlayerStats.I.hp;
            const after = Math.min(max, before + Math.round(max * 0.25));
            if (after > before) {
                PlayerStats.I.hp = after;
                eventBus.emit(GameEvents.PLAYER_HP_CHANGED, { current: after, max, shield: PlayerStats.I.shield });
                eventBus.emit('show-tip', { text: `❤ 过层回复 +${after - before}` });
            }
        } catch { /* ignore */ }

        if (this.isEndless()) {
            if (floor > (this._save.progress.highestEndlessFloor ?? 0)) {
                this._save.progress.highestEndlessFloor = floor;
                this.persist();
            }
            // 每 5 层里程碑魂
            if (floor > 0 && floor % 5 === 0) {
                const tip = Math.max(3, Math.floor(4 + floor * 0.4));
                this.addSoul(tip);
                eventBus.emit('show-tip', { text: `♾ 无尽里程碑 第${floor}层 +${tip}魂` });
            }
            return;
        }

        if (floor >= this.effectiveTotalFloors()) {
            this._onStageOrCampaignCleared();
        }
    }

    unlockWeapon(id: string, persist = true) {
        let changed = false;
        if (this._save.unlocks.weapons.indexOf(id) < 0) {
            this._save.unlocks.weapons.push(id);
            changed = true;
        }
        if (this.unlockCodexWeapon(id, false)) changed = true;
        if (changed && persist) this.persist();
    }

    /** 图鉴：首次遭遇地图主题（幂等） */
    unlockCodexTheme(id: string): boolean {
        this._ensureCodex();
        if (!id || this._save.codex.themes.indexOf(id) >= 0) return false;
        this._save.codex.themes.push(id);
        this.persist();
        return true;
    }

    /** 图鉴：首次遭遇怪物类型（幂等）；type = slime|fast|tank|archer|boss */
    unlockCodexEnemy(type: string): boolean {
        this._ensureCodex();
        if (!type || this._save.codex.enemies.indexOf(type) >= 0) return false;
        this._save.codex.enemies.push(type);
        this.persist();
        return true;
    }

    /**
     * 图鉴：记录见过的武器（幂等）。
     * persist=false 时仅改内存，由调用方统一 persist（供 unlockWeapon 合并写盘）。
     */
    unlockCodexWeapon(id: string, persist = true): boolean {
        this._ensureCodex();
        if (!id || this._save.codex.weapons.indexOf(id) >= 0) return false;
        this._save.codex.weapons.push(id);
        if (persist) this.persist();
        return true;
    }

    hasCodexTheme(id: string): boolean {
        this._ensureCodex();
        return this._save.codex.themes.indexOf(id) >= 0;
    }

    hasCodexEnemy(type: string): boolean {
        this._ensureCodex();
        return this._save.codex.enemies.indexOf(type) >= 0;
    }

    /** 武器图鉴：unlocks.weapons 或 codex.weapons 任一命中即已解锁 */
    hasCodexWeapon(id: string): boolean {
        this._ensureCodex();
        if (this._save.unlocks.weapons.indexOf(id) >= 0) return true;
        return this._save.codex.weapons.indexOf(id) >= 0;
    }

    private _ensureCodex() {
        if (!this._save.codex) {
            this._save.codex = { themes: [], enemies: [], weapons: [] };
        }
        if (!Array.isArray(this._save.codex.themes)) this._save.codex.themes = [];
        if (!Array.isArray(this._save.codex.enemies)) this._save.codex.enemies = [];
        if (!Array.isArray(this._save.codex.weapons)) this._save.codex.weapons = [];
    }

    /** 局外商店购买；失败返回原因（扣魂与发货同一次 persist） */
    tryBuyShopOffer(offerId: string): { ok: boolean; reason?: string; message?: string } {
        const offer = getShopOffer(offerId);
        if (!offer) return { ok: false, reason: '未知商品' };

        if (offer.kind === 'weapon') {
            if (this._save.unlocks.weapons.indexOf(offer.weaponId) >= 0) {
                return { ok: false, reason: '已拥有该武器' };
            }
            const wdef = ConfigStore.weapon(offer.weaponId);
            const ownerId = wdef?.ownerCharacterId;
            if (ownerId && this._save.unlocks.characters.indexOf(ownerId) < 0) {
                const ch = getCharacter(ownerId);
                return { ok: false, reason: `需先解锁角色 ${ch?.name ?? ownerId}` };
            }
            if (!this.spendSoul(offer.cost, false)) return { ok: false, reason: '灵魂石不足' };
            this.unlockWeapon(offer.weaponId, false);
            // 当前角色可用则自动装备为备战默认武
            if (this._weaponFits(offer.weaponId)) {
                this._save.selectedWeapon = offer.weaponId;
            }
            this.persist();
            this._emitWeapon();
            return { ok: true, message: `已解锁 ${offer.name.replace(/^解锁|^专属·/, '')}` };
        }

        if (offer.kind === 'character') {
            if (this._save.unlocks.characters.indexOf(offer.characterId) >= 0) {
                return { ok: false, reason: '已拥有该角色' };
            }
            const def = getCharacter(offer.characterId);
            if (!def) return { ok: false, reason: '未知角色' };
            if (!this.spendSoul(offer.cost, false)) return { ok: false, reason: '灵魂石不足' };
            this._save.unlocks.characters.push(offer.characterId);
            this._save.selectedCharacter = offer.characterId;
            this._ensureWeaponFitsCharacter(false);
            this._applyTalentsToStats();
            this.persist();
            this._emitCharacter();
            this._emitWeapon();
            return { ok: true, message: `已解锁角色 ${def.name}` };
        }

        if (offer.kind === 'kit') {
            const item = ConfigStore.item(offer.itemId);
            if (!item) return { ok: false, reason: '未知补给' };
            if (!this.spendSoul(offer.cost, false)) return { ok: false, reason: '灵魂石不足' };
            if (!this._save.stash) this._save.stash = {};
            this._save.stash[offer.itemId] = (this._save.stash[offer.itemId] ?? 0) + offer.amount;
            this.persist();
            eventBus.emit('stash-changed', {});
            return {
                ok: true,
                message: `${item.name} ×${offer.amount} 已入补给箱（开战装包）`,
            };
        }

        // perm_stat
        if (!offer.stackable) {
            const cur = this._save.shopPurchases?.[offer.purchaseKey] ?? 0;
            if (cur >= offer.amount) return { ok: false, reason: '已购买' };
        }
        if (!this.spendSoul(offer.cost, false)) return { ok: false, reason: '灵魂石不足' };
        if (!this._save.shopPurchases) {
            this._save.shopPurchases = { maxHp: 0, atk: 0, def: 0, moveSpeed: 0 };
        }
        this._save.shopPurchases[offer.purchaseKey] =
            (this._save.shopPurchases[offer.purchaseKey] ?? 0) + offer.amount;
        this._applyTalentsToStats();
        this.persist();
        return {
            ok: true,
            message: `${offer.name} +${offer.amount}（累计 ${this._save.shopPurchases[offer.purchaseKey]}）`,
        };
    }

    /**
     * #186 兑换码：发货并记已兑。返回到账明细供弹窗展示。
     */
    tryRedeemCode(raw: string): {
        ok: boolean;
        reason?: string;
        title?: string;
        rewards?: RedeemReward[];
        message?: string;
    } {
        const code = normalizeRedeemCode(raw);
        if (!code) return { ok: false, reason: '请输入兑换码' };
        const def = findRedeemCode(code);
        if (!def) return { ok: false, reason: '兑换码无效' };
        if (!Array.isArray(this._save.redeemedCodes)) this._save.redeemedCodes = [];
        if (this._save.redeemedCodes.indexOf(code) >= 0) {
            return { ok: false, reason: '该兑换码已使用' };
        }

        if (!this._save.stash) this._save.stash = {};
        const granted: RedeemReward[] = [];
        for (const r of def.rewards) {
            if (r.kind === 'soul') {
                const n = Math.max(0, Math.floor(r.amount));
                if (n > 0) {
                    this._save.currency.soul += n;
                    granted.push({ kind: 'soul', amount: n });
                }
            } else if (r.kind === 'item') {
                const n = Math.max(0, Math.floor(r.amount));
                if (n > 0 && r.itemId) {
                    this._save.stash[r.itemId] = (this._save.stash[r.itemId] ?? 0) + n;
                    granted.push({ kind: 'item', itemId: r.itemId, amount: n });
                }
            } else if (r.kind === 'character') {
                const id = r.characterId;
                if (id && this._save.unlocks.characters.indexOf(id) < 0) {
                    this._save.unlocks.characters.push(id);
                    granted.push({ kind: 'character', characterId: id });
                } else if (id) {
                    // 已拥有：折成灵魂石 20，避免白兑
                    this._save.currency.soul += 20;
                    granted.push({ kind: 'soul', amount: 20 });
                }
            }
        }

        this._save.redeemedCodes.push(code);
        this.persist();
        eventBus.emit('soul-changed', { soul: this._save.currency.soul });
        eventBus.emit('stash-changed', {});
        return {
            ok: true,
            title: def.title,
            rewards: granted,
            message: `已兑换 ${def.title}`,
        };
    }

    setTalentLevel(id: string, level: number) {
        const def = getTalent(id);
        const max = def?.maxLevel ?? 99;
        const clamped = Math.max(0, Math.min(level, max));
        this._save.talents[id] = clamped;
        if (clamped > 0 && this._save.unlocks.talents.indexOf(id) < 0) {
            this._save.unlocks.talents.push(id);
        }
        this._applyTalentsToStats();
        this.persist();
    }

    revive() {
        if (this._runState.reviveCount >= GameConfig.MAX_REVIVE_COUNT) return;
        this._runState.reviveCount++;
        const max = PlayerStats.I.get('maxHp');
        PlayerStats.I.hp = Math.floor(max * 0.3);
        eventBus.emit(GameEvents.PLAYER_REVIVED);
        eventBus.emit(GameEvents.PLAYER_HP_CHANGED, {
            current: PlayerStats.I.hp,
            max,
        });
    }

    /** 死亡时由外部调用：更新纪录、折算灵魂石、发出本局报告 */
    notifyPlayerDied(floor: number, score: number, kills: number) {
        const coins = Math.max(0, this._runState.coins);
        const finalScore = Math.max(score, kills * 10 + coins);
        const newFloorRecord = floor > this._save.progress.highestFloor;
        const newScoreRecord = finalScore > this._save.progress.highestScore;
        if (newFloorRecord) this._save.progress.highestFloor = floor;
        if (newScoreRecord) this._save.progress.highestScore = finalScore;

        // totalRuns 在 startNewRun 已计；totalRunCoins 在 addCoins 已累计，死亡不再重复加

        const soulEarned = GameManager._deathSoulPayout(floor, kills, coins);
        if (soulEarned > 0) {
            this._save.currency.soul += soulEarned;
            eventBus.emit('soul-changed', { soul: this._save.currency.soul });
        }
        this.persist();

        const elapsed = (Date.now() - this._runState.startTime) / 1000;
        const weaponName = this._runState.equippedWeapon?.name
            || this._runState.equippedWeapon?.id
            || '无';
        const report: DeathReport = {
            floor, score: finalScore, kills, time: elapsed, coins, soulEarned,
            soulTotal: this._save.currency.soul,
            newFloorRecord, newScoreRecord, weaponName,
        };
        this._lastDeath = report;
        eventBus.emit(GameEvents.PLAYER_DIED, report);
        void CloudSync.uploadEvents([{
            type: 'run_death',
            at: new Date().toISOString(),
            payload: {
                floor, score: finalScore, kills, coins, soulEarned,
                mode: this._runConfig?.mode,
                stageId: this._runConfig?.stageId,
            },
        }]);
    }

    /** 死亡折算：系数读 ConfigStore.economy */
    private static _deathSoulPayout(floor: number, kills: number, coins: number): number {
        const eco = ConfigStore.economy();
        const raw = Math.floor(floor * eco.deathSoulPerFloor)
            + Math.floor(kills / Math.max(1, eco.deathSoulPerKills))
            + Math.floor(coins / Math.max(1, eco.deathSoulPerCoins));
        return Math.max(0, Math.min(eco.deathSoulCap, raw));
    }

    persist() {
        SaveStore.save(this._save);
        CloudSync.schedulePush(this._save);
    }

    /** 用云端返回的存档覆盖本机 */
    applyRemoteSave(raw: SaveData) {
        this._save = migrateSave(raw);
        this._applyTalentsToStats();
        this._emitCharacter();
        SaveStore.save(this._save);
        eventBus.emit('soul-changed', { soul: this._save.currency.soul });
        eventBus.emit('stash-changed', {});
    }

    /**
     * 兑换码：云开启走服务端，否则本地 #186 表。
     */
    async tryRedeemCodeAsync(raw: string): Promise<{
        ok: boolean;
        reason?: string;
        title?: string;
        rewards?: RedeemReward[];
        message?: string;
    }> {
        const code = normalizeRedeemCode(raw);
        if (!code) return { ok: false, reason: '请输入兑换码' };
        if (CloudSync.enabled) {
            const r = await CloudSync.redeem(code);
            if (!r.ok) return { ok: false, reason: r.reason || '兑换失败' };
            if (r.save) this.applyRemoteSave(r.save as SaveData);
            return {
                ok: true,
                title: r.title,
                rewards: r.rewards,
                message: r.message,
            };
        }
        return this.tryRedeemCode(raw);
    }

    /** 新手引导完成（首次大厅） */
    markTutorialDone() {
        if (!this._save.flags) this._save.flags = {};
        if (this._save.flags.tutorialDone) return;
        this._save.flags.tutorialDone = true;
        this.persist();
    }

    /** 当前设置（只读快照） */
    getSettings(): Readonly<GameSettings> {
        return this._save.settings;
    }

    /** 部分更新设置并持久化；发出 audio-settings-changed 供 AudioManager（H3）消费 */
    updateSettings(partial: Partial<GameSettings>) {
        this._save.settings = { ...this._save.settings, ...partial };
        this.persist();
        eventBus.emit(GameEvents.AUDIO_SETTINGS_CHANGED, { ...this._save.settings });
    }

    setBgmEnabled(on: boolean) {
        const cur = this._save.settings.bgmVolume;
        this.updateSettings({
            bgmVolume: on ? (cur > 0 ? cur : DEFAULT_BGM) : 0,
        });
    }

    setSfxEnabled(on: boolean) {
        const cur = this._save.settings.sfxVolume;
        this.updateSettings({
            sfxVolume: on ? (cur > 0 ? cur : DEFAULT_SFX) : 0,
        });
    }

    setVibration(on: boolean) {
        this.updateSettings({ vibration: on });
    }

    /**
     * 清除本地存档并重置内存为 DEFAULT_SAVE。
     * 不启动新局；大厅灵魂/属性靠 soul-changed / player-stats-changed 刷新。
     */
    clearSave(): boolean {
        try {
            SaveStore.clear();
            this._save = structuredClone(DEFAULT_SAVE);
            this._applyTalentsToStats();
            this.persist();
            eventBus.emit('soul-changed', { soul: this._save.currency.soul });
            eventBus.emit('player-stats-changed');
            eventBus.emit(GameEvents.AUDIO_SETTINGS_CHANGED, { ...this._save.settings });
            this._emitCharacter();
            console.log('[GameManager] 存档已清除，已恢复默认');
            return true;
        } catch (e) {
            console.warn('[GameManager] clearSave failed', e);
            return false;
        }
    }

    /** 当前出战角色。未知或未解锁的 id 视为骑士。 */
    get selectedCharacterId(): string {
        return this._resolvedCharacterId();
    }

    /** 空 / 未知 / 未拥有 → knight（表里没有骑士时用表首项） */
    private _resolvedCharacterId(): string {
        const owned = this._save.unlocks?.characters;
        const id = this._save.selectedCharacter;
        const unlocked = Array.isArray(owned)
            && typeof id === 'string'
            && !!id
            && owned.indexOf(id) >= 0;
        if (unlocked && getCharacter(id)) return id;
        return getCharacter('knight')?.id ?? defaultCharacter().id;
    }

    selectCharacter(id: string): boolean {
        const def = getCharacter(id);
        if (!def) return false;
        if (this._save.unlocks.characters.indexOf(id) < 0) return false;
        this._save.selectedCharacter = id;
        // #156 备战武器 = 角色开局武（不再商店囤武）
        this._save.selectedWeapon = def.exclusiveWeaponId || 'sword';
        this.persist();
        this._applyTalentsToStats();
        eventBus.emit('player-stats-changed', PlayerStats.I.snapshot());
        this._emitCharacter();
        this._emitWeapon();
        return true;
    }

    /** 当前备战武器 = 角色开局武 */
    get selectedWeaponId(): string {
        const ex = getCharacter(this.selectedCharacterId)?.exclusiveWeaponId;
        if (ex && ConfigStore.weapon(ex)) return ex;
        return this._resolvedWeaponId();
    }

    /**
     * #156 局外不再自选武器；保留 API，强制回到角色开局武。
     */
    selectWeapon(_id: string): { ok: boolean; reason?: string } {
        const starter = getCharacter(this.selectedCharacterId)?.exclusiveWeaponId ?? 'sword';
        this._save.selectedWeapon = starter;
        this.persist();
        this._emitWeapon();
        return { ok: true };
    }

    /** 备战只展示角色开局武 */
    listLoadoutWeapons(): string[] {
        const ex = getCharacter(this.selectedCharacterId)?.exclusiveWeaponId;
        return ex && ConfigStore.weapon(ex) ? [ex] : ['sword'];
    }

    private _weaponUnlocked(_id: string): boolean {
        // #156 武器不再靠商店永久解锁进背包；图鉴遭遇另计
        return true;
    }

    private _resolvedWeaponId(): string {
        return this._fallbackWeaponId();
    }

    private _weaponFits(_id: string): boolean {
        return true;
    }

    private _fallbackWeaponId(): string {
        const ch = getCharacter(this.selectedCharacterId);
        const ex = ch?.exclusiveWeaponId;
        if (ex && ConfigStore.weapon(ex)) return ex;
        return 'sword';
    }

    /** 换角后纠正 selectedWeapon；persist 由调用方决定 */
    private _ensureWeaponFitsCharacter(persistNow: boolean) {
        this._save.selectedWeapon = this._fallbackWeaponId();
        if (persistNow) this.persist();
    }

    private _emitWeapon() {
        const id = this.selectedWeaponId;
        if (this._save.selectedWeapon !== id) this._save.selectedWeapon = id;
        let emoji = '🗡️';
        try { emoji = ConfigStore.weapon(id)?.emoji ?? emoji; } catch { /* ignore */ }
        eventBus.emit('weapon-changed', { id, emoji });
        eventBus.emit('loadout-changed', { characterId: this.selectedCharacterId, weaponId: id });
    }

    /** 用灵魂石解锁角色；已拥有则直接选中（扣魂与入册同一次 persist） */
    tryUnlockCharacter(id: string): { ok: boolean; reason?: string } {
        const def = getCharacter(id);
        if (!def) return { ok: false, reason: '未知角色' };
        if (this._save.unlocks.characters.indexOf(id) >= 0) {
            this.selectCharacter(id);
            return { ok: true };
        }
        if (def.cost > 0 && !this.spendSoul(def.cost, false)) {
            return { ok: false, reason: '灵魂石不足' };
        }
        this._save.unlocks.characters.push(id);
        this._save.selectedCharacter = id;
        this._ensureWeaponFitsCharacter(false);
        this._applyTalentsToStats();
        this.persist();
        this._emitCharacter();
        this._emitWeapon();
        return { ok: true };
    }

    private _emitCharacter() {
        eventBus.emit('character-changed', { id: this.selectedCharacterId });
    }

    listCharacters() { return configCharacters(); }

    /** 对外：按存档重算天赋属性（场景重载 / Player.onLoad 兜底） */
    refreshTalents() {
        this._applyTalentsToStats();
    }

    // ── 天赋 → 属性（读 TalentData 表）──

    private _applyTalentsToStats() {
        const id = this._resolvedCharacterId();
        if (this._save.selectedCharacter !== id) this._save.selectedCharacter = id;
        const ch = getCharacter(id) ?? defaultCharacter();
        PlayerStats.I.base = { ...ch.base };
        const bonus = computeTalentStats(this._save.talents);
        const shop = this._save.shopPurchases;
        if (shop) {
            if ((shop.maxHp ?? 0) > 0) bonus.maxHp = (bonus.maxHp ?? 0) + shop.maxHp;
            if ((shop.atk ?? 0) > 0) bonus.atk = (bonus.atk ?? 0) + shop.atk;
            if ((shop.def ?? 0) > 0) bonus.def = (bonus.def ?? 0) + shop.def;
            if ((shop.moveSpeed ?? 0) > 0) bonus.moveSpeed = (bonus.moveSpeed ?? 0) + shop.moveSpeed;
        }
        PlayerStats.I.setTalent(bonus);
        // 大厅换角色：补满到新上限。局内不要在这里回满（商店/天赋只走 setTalent 的增量）。
        if (!GameFlow.isPlaying) {
            const max = PlayerStats.I.get('maxHp');
            if (PlayerStats.I.hp !== max) {
                PlayerStats.I.hp = max;
                eventBus.emit(GameEvents.PLAYER_HP_CHANGED, { current: max, max });
                eventBus.emit('player-stats-changed', PlayerStats.I.snapshot());
            }
        }
    }

    private _onStageOrCampaignCleared() {
        const elapsed = (Date.now() - this._runState.startTime) / 1000;
        this._save.progress.clearCount++;
        if (this._save.progress.bestClearTime === 0 || elapsed < this._save.progress.bestClearTime) {
            this._save.progress.bestClearTime = elapsed;
        }

        const soulMul = this._runConfig.soulMul > 0 ? this._runConfig.soulMul : 1;
        let bonus = Math.round(ConfigStore.economy().clearBonusSoul * soulMul);
        let itemTip = '';
        const stageId = this._runConfig.stageId;
        const diff = getDifficulty(this._runConfig.difficultyId);
        if (stageId) {
            const stage = getStage(stageId);
            if (stage) {
                bonus = Math.round(stage.clearBonusSoul * soulMul);
                if (!this._save.progress.stagesCleared) this._save.progress.stagesCleared = [];
                if (this._save.progress.stagesCleared.indexOf(stageId) < 0) {
                    this._save.progress.stagesCleared.push(stageId);
                }
                if (!this._save.progress.stageStars) this._save.progress.stageStars = {};
                const prev = this._save.progress.stageStars[stageId] ?? 0;
                if (diff.stars > prev) {
                    this._save.progress.stageStars[stageId] = diff.stars;
                }
                if (stage.rewardItemId) {
                    const amt = Math.max(1, stage.rewardItemAmount ?? 1);
                    if (!this._save.stash) this._save.stash = {};
                    this._save.stash[stage.rewardItemId] =
                        (this._save.stash[stage.rewardItemId] ?? 0) + amt;
                    const item = ConfigStore.item(stage.rewardItemId);
                    itemTip = `${item?.emoji ?? '📦'} ${item?.name ?? stage.rewardItemId} ×${amt} 入补给箱`;
                }
            }
            this._runConfig.lastClearedStageId = stageId;
        } else {
            this._save.progress.highestFloor = Math.max(
                this._save.progress.highestFloor,
                this.effectiveTotalFloors(),
            );
        }

        this._runConfig.lastClearSoul = bonus;
        this._runConfig.lastClearItemTip = itemTip;
        if (bonus > 0) this.addSoul(bonus, false);
        this.persist();

        const nextId = stageId
            ? nextStageId(stageId, this._save.progress.stagesCleared ?? [])
            : null;
        eventBus.emit(GameEvents.GAME_CLEARED, {
            score: this._runState.score,
            kills: this._runState.killCount,
            time: elapsed,
            mode: this._runConfig.mode,
            stageId,
            stageName: stageId ? (getStage(stageId)?.name ?? stageId) : null,
            clearSoul: bonus,
            itemTip,
            nextStageId: nextId,
        });
    }

    private static defaultRunConfig(): RunConfig {
        const d = (() => {
            try { return ConfigStore.dungeon(); } catch { return null; }
        })();
        return {
            mode: 'stage',
            stageId: null,
            totalFloors: d?.totalFloors ?? 5,
            roomsPerFloor: d?.roomsPerFloor ?? 4,
            themeId: null,
            scaleMul: 1,
            countMul: 1,
            soulMul: 1,
            difficultyId: 'normal',
            lastClearedStageId: null,
            lastClearSoul: 0,
            lastClearItemTip: '',
        };
    }

    private static defaultRunState(): RunState {
        return {
            floor: 1,
            coins: 0,
            playerHp: GameConfig.PLAYER_BASE_HP,
            playerMaxHp: GameConfig.PLAYER_BASE_HP,
            equippedWeapon: null,
            inventory: [],
            killCount: 0,
            startTime: Date.now(),
            reviveCount: 0,
            score: 0,
        };
    }
}

function structuredClone<T>(o: T): T {
    return JSON.parse(JSON.stringify(o));
}
