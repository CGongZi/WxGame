import { _decorator, Component, Node, Label, ProgressBar, Sprite, Color } from 'cc';
import { eventBus, GameEvents } from '../../core/EventBus';
import { GameManager } from '../../core/GameManager';
import { WeaponData } from '../../core/types';

const { ccclass, property } = _decorator;

/**
 * 游戏内 HUD（血条、金币、层数、武器图标）
 */
@ccclass('HUDPanel')
export class HUDPanel extends Component {

    @property(ProgressBar)
    hpBar: ProgressBar = null!;

    @property(Label)
    hpLabel: Label = null!;

    @property(Label)
    coinsLabel: Label = null!;

    @property(Label)
    floorLabel: Label = null!;

    @property(Node)
    weaponIcon: Node = null!;

    @property(Label)
    killCountLabel: Label = null!;

    onLoad() {
        // 监听游戏事件，自动刷新 UI
        eventBus.on(GameEvents.PLAYER_HP_CHANGED, this._onHpChanged, this);
        eventBus.on(GameEvents.COIN_COLLECTED, this._onCoinChanged, this);
        eventBus.on(GameEvents.FLOOR_STARTED, this._onFloorChanged, this);
        eventBus.on(GameEvents.WEAPON_EQUIPPED, this._onWeaponChanged, this);
        eventBus.on(GameEvents.ENEMY_KILLED, this._onEnemyKilled, this);
    }

    onDestroy() {
        eventBus.off(GameEvents.PLAYER_HP_CHANGED, this._onHpChanged, this);
        eventBus.off(GameEvents.COIN_COLLECTED, this._onCoinChanged, this);
        eventBus.off(GameEvents.FLOOR_STARTED, this._onFloorChanged, this);
        eventBus.off(GameEvents.WEAPON_EQUIPPED, this._onWeaponChanged, this);
        eventBus.off(GameEvents.ENEMY_KILLED, this._onEnemyKilled, this);
    }

    start() {
        // 初始化显示
        const state = GameManager.instance.runState;
        this._refreshHp(state.playerHp, state.playerMaxHp);
        this._refreshCoins(state.coins);
        this._refreshFloor(state.floor);
    }

    // ── 事件处理 ──

    private _onHpChanged(data: { current: number; max: number }) {
        this._refreshHp(data.current, data.max);
    }

    private _onCoinChanged(data: { total: number }) {
        this._refreshCoins(data.total);
    }

    private _onFloorChanged(data: { floor: number }) {
        this._refreshFloor(data.floor);
    }

    private _onWeaponChanged(weapon: WeaponData) {
        // TODO: 刷新武器图标 Sprite
        console.log('[HUD] 装备武器:', weapon.name);
    }

    private _onEnemyKilled() {
        const state = GameManager.instance.runState;
        if (this.killCountLabel) {
            this.killCountLabel.string = `击杀: ${state.killCount}`;
        }
    }

    // ── 私有 ──

    private _refreshHp(current: number, max: number) {
        if (this.hpBar) {
            this.hpBar.progress = max > 0 ? current / max : 0;
            // 血量低于 30% 变红
            if (this.hpBar.progress < 0.3) {
                this.hpBar.totalLength = this.hpBar.totalLength; // 触发刷新
            }
        }
        if (this.hpLabel) {
            this.hpLabel.string = `${current} / ${max}`;
        }
    }

    private _refreshCoins(coins: number) {
        if (this.coinsLabel) {
            this.coinsLabel.string = `🪙 ${coins}`;
        }
    }

    private _refreshFloor(floor: number) {
        if (this.floorLabel) {
            this.floorLabel.string = `第 ${floor} 层`;
        }
    }
}
