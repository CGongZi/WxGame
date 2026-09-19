import { _decorator, Component, director, game } from 'cc';
import { GameConfig } from './GameConfig';
import { RunState, PlayerProgress, DEFAULT_PROGRESS, WeaponData, ItemData } from './types';
import { eventBus, GameEvents } from './EventBus';

const { ccclass } = _decorator;

/**
 * 游戏主管理器（单例，跨场景保留）
 * 负责：局内状态管理、场景切换、全局生命周期
 */
@ccclass('GameManager')
export class GameManager extends Component {
    private static _instance: GameManager | null = null;

    static get instance(): GameManager {
        if (!GameManager._instance) {
            console.error('[GameManager] 未初始化！确保 Main 场景中有 GameManager 节点');
        }
        return GameManager._instance!;
    }

    // ── 局内状态 ──
    private _runState: RunState = GameManager.defaultRunState();
    // ── 持久存档 ──
    private _progress: PlayerProgress = { ...DEFAULT_PROGRESS };

    // ── 生命周期 ──
    onLoad() {
        if (GameManager._instance) {
            this.destroy();
            return;
        }
        GameManager._instance = this;
        director.addPersistRootNode(this.node);
        this._loadProgress();
        console.log('[GameManager] 初始化完成');
    }

    onDestroy() {
        if (GameManager._instance === this) {
            GameManager._instance = null;
        }
    }

    // ════════════════════════════════
    //  局内状态
    // ════════════════════════════════

    get runState(): Readonly<RunState> { return this._runState; }

    /** 开始新的一局 */
    startNewRun() {
        this._runState = GameManager.defaultRunState();
        this._progress.totalRuns++;
        console.log('[GameManager] 新局开始');
    }

    /** 扣除 HP，返回是否死亡 */
    takeDamage(amount: number): boolean {
        this._runState.playerHp = Math.max(0, this._runState.playerHp - amount);
        eventBus.emit(GameEvents.PLAYER_HP_CHANGED, {
            current: this._runState.playerHp,
            max: this._runState.playerMaxHp,
        });
        if (this._runState.playerHp <= 0) {
            this._onPlayerDied();
            return true;
        }
        return false;
    }

    /** 回复 HP */
    heal(amount: number) {
        this._runState.playerHp = Math.min(
            this._runState.playerMaxHp,
            this._runState.playerHp + amount,
        );
        eventBus.emit(GameEvents.PLAYER_HP_CHANGED, {
            current: this._runState.playerHp,
            max: this._runState.playerMaxHp,
        });
    }

    /** 拾取金币 */
    addCoins(amount: number) {
        this._runState.coins += amount;
        this._progress.totalCoins += amount;
        eventBus.emit(GameEvents.COIN_COLLECTED, { amount, total: this._runState.coins });
    }

    /** 消耗金币，返回是否成功 */
    spendCoins(amount: number): boolean {
        if (this._runState.coins < amount) return false;
        this._runState.coins -= amount;
        return true;
    }

    /** 装备武器 */
    equipWeapon(weapon: WeaponData) {
        this._runState.equippedWeapon = weapon;
        eventBus.emit(GameEvents.WEAPON_EQUIPPED, weapon);
    }

    /** 击杀怪物 */
    onEnemyKilled(enemyId: string) {
        this._runState.killCount++;
        this._progress.totalKills++;
        this._runState.score += 10;
        eventBus.emit(GameEvents.ENEMY_KILLED, { enemyId });
    }

    /** 进入下一层 */
    nextFloor() {
        this._runState.floor++;
        if (this._runState.floor > GameConfig.DUNGEON_TOTAL_FLOORS) {
            this._onGameCleared();
        } else {
            eventBus.emit(GameEvents.FLOOR_STARTED, { floor: this._runState.floor });
        }
    }

    /** 复活（看广告后调用）*/
    revive() {
        if (this._runState.reviveCount >= GameConfig.MAX_REVIVE_COUNT) return;
        this._runState.reviveCount++;
        this._runState.playerHp = Math.floor(this._runState.playerMaxHp * 0.3); // 复活30% HP
        eventBus.emit(GameEvents.PLAYER_REVIVED);
    }

    // ════════════════════════════════
    //  存档
    // ════════════════════════════════

    get progress(): Readonly<PlayerProgress> { return this._progress; }

    saveProgress() {
        try {
            wx.setStorageSync('playerProgress', JSON.stringify(this._progress));
        } catch (e) {
            console.warn('[GameManager] 存档失败', e);
        }
    }

    private _loadProgress() {
        try {
            const raw = wx.getStorageSync('playerProgress');
            if (raw) {
                this._progress = { ...DEFAULT_PROGRESS, ...JSON.parse(raw) };
            }
        } catch {
            this._progress = { ...DEFAULT_PROGRESS };
        }
    }

    // ════════════════════════════════
    //  私有
    // ════════════════════════════════

    private _onPlayerDied() {
        const elapsed = (Date.now() - this._runState.startTime) / 1000;
        // 更新最高记录
        if (this._runState.floor > this._progress.highestFloor) {
            this._progress.highestFloor = this._runState.floor;
        }
        if (this._runState.score > this._progress.highestScore) {
            this._progress.highestScore = this._runState.score;
        }
        this.saveProgress();
        eventBus.emit(GameEvents.PLAYER_DIED, {
            floor: this._runState.floor,
            score: this._runState.score,
            kills: this._runState.killCount,
            time: elapsed,
        });
    }

    private _onGameCleared() {
        const elapsed = (Date.now() - this._runState.startTime) / 1000;
        if (this._progress.bestClearTime === 0 || elapsed < this._progress.bestClearTime) {
            this._progress.bestClearTime = elapsed;
        }
        this._progress.highestFloor = GameConfig.DUNGEON_TOTAL_FLOORS;
        this.saveProgress();
        eventBus.emit(GameEvents.GAME_CLEARED, {
            score: this._runState.score,
            kills: this._runState.killCount,
            time: elapsed,
        });
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
