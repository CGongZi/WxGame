import { _decorator, Component, Node, Label, Button, director } from 'cc';
import { eventBus, GameEvents } from '../../core/EventBus';
import { GameManager } from '../../core/GameManager';
import { WechatService } from '../../wechat/WechatService';
import { GameConfig } from '../../core/GameConfig';

const { ccclass, property } = _decorator;

/**
 * 游戏结束面板（死亡 / 通关）
 */
@ccclass('GameOverPanel')
export class GameOverPanel extends Component {

    @property(Node)
    deathPanel: Node = null!;     // 死亡面板

    @property(Node)
    clearPanel: Node = null!;     // 通关面板

    @property(Label)
    floorLabel: Label = null!;

    @property(Label)
    scoreLabel: Label = null!;

    @property(Label)
    killLabel: Label = null!;

    @property(Label)
    timeLabel: Label = null!;

    @property(Button)
    reviveBtn: Button = null!;   // 看广告复活按钮

    @property(Button)
    retryBtn: Button = null!;    // 重新开始

    @property(Button)
    shareBtn: Button = null!;    // 分享

    onLoad() {
        this.node.active = false;
        eventBus.on(GameEvents.PLAYER_DIED, this._onPlayerDied, this);
        eventBus.on(GameEvents.GAME_CLEARED, this._onGameCleared, this);
    }

    onDestroy() {
        eventBus.off(GameEvents.PLAYER_DIED, this._onPlayerDied, this);
        eventBus.off(GameEvents.GAME_CLEARED, this._onGameCleared, this);
    }

    // ── 事件处理 ──

    private _onPlayerDied(data: { floor: number; score: number; kills: number; time: number }) {
        this.node.active = true;
        this.deathPanel.active = true;
        this.clearPanel.active = false;
        this._fillStats(data);

        const state = GameManager.instance.runState;
        // 已用完复活次数则隐藏复活按钮
        if (this.reviveBtn) {
            this.reviveBtn.node.active = state.reviveCount < GameConfig.MAX_REVIVE_COUNT;
        }
    }

    private _onGameCleared(data: { score: number; kills: number; time: number }) {
        this.node.active = true;
        this.deathPanel.active = false;
        this.clearPanel.active = true;
        this._fillStats({ floor: GameConfig.DUNGEON_TOTAL_FLOORS, ...data });

        WechatService.postScore(data.score, GameConfig.DUNGEON_TOTAL_FLOORS);
        WechatService.setupShare(data.score, GameConfig.DUNGEON_TOTAL_FLOORS);
    }

    // ── 按钮回调（在 Inspector 中绑定）──

    async onReviveClick() {
        const rewarded = await WechatService.showRewardedAd();
        if (rewarded) {
            GameManager.instance.revive();
            this.node.active = false;
        }
    }

    onRetryClick() {
        // 重新开始
        GameManager.instance.startNewRun();
        this.node.active = false;
        // 重新加载游戏场景
        director.loadScene('Game');
    }

    onShareClick() {
        const state = GameManager.instance.runState;
        WechatService.setupShare(state.score, state.floor);
    }

    // ── 私有 ──

    private _fillStats(data: { floor: number; score: number; kills: number; time: number }) {
        if (this.floorLabel) this.floorLabel.string = `到达第 ${data.floor} 层`;
        if (this.scoreLabel) this.scoreLabel.string = `得分: ${data.score}`;
        if (this.killLabel) this.killLabel.string = `击杀: ${data.kills} 只`;
        if (this.timeLabel) {
            const m = Math.floor(data.time / 60);
            const s = Math.floor(data.time % 60);
            this.timeLabel.string = `用时: ${m}:${s.toString().padStart(2, '0')}`;
        }
    }
}
