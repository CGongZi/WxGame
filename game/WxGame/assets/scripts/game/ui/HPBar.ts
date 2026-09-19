import { _decorator, Component, Node, Label, UITransform, Sprite, Color } from 'cc';
import { eventBus, GameEvents } from '../../core/EventBus';

const { ccclass, property } = _decorator;

/**
 * 简单血条 HUD
 * 挂到 Canvas 下的 HPBar 节点
 */
@ccclass('HPBar')
export class HPBar extends Component {

    @property(Node)
    fillNode: Node = null!;       // 血条填充节点（红色方块）

    @property(Label)
    hpLabel: Label = null!;       // "HP: 100/100" 文字

    @property(Label)
    coinsLabel: Label = null!;    // "🪙 0"

    @property(Label)
    killLabel: Label = null!;     // "击杀: 0"

    private _barMaxWidth: number = 200;

    onLoad() {
        if (this.fillNode) {
            this._barMaxWidth = this.fillNode.getComponent(UITransform)?.width ?? 200;
        }
        eventBus.on(GameEvents.PLAYER_HP_CHANGED,  this._onHpChanged,  this);
        eventBus.on(GameEvents.COIN_COLLECTED,      this._onCoinChanged, this);
        eventBus.on(GameEvents.ENEMY_KILLED,        this._onKill,       this);
    }

    onDestroy() {
        eventBus.off(GameEvents.PLAYER_HP_CHANGED, this._onHpChanged,  this);
        eventBus.off(GameEvents.COIN_COLLECTED,     this._onCoinChanged, this);
        eventBus.off(GameEvents.ENEMY_KILLED,       this._onKill,       this);
    }

    private _onHpChanged(data: { current: number; max: number }) {
        const ratio = data.max > 0 ? data.current / data.max : 0;

        // 缩放血条宽度
        if (this.fillNode) {
            const tf = this.fillNode.getComponent(UITransform);
            if (tf) tf.width = Math.max(0, this._barMaxWidth * ratio);

            // 血量低于 30% 变橙
            const sp = this.fillNode.getComponent(Sprite);
            if (sp) {
                sp.color = ratio < 0.3
                    ? new Color(255, 100, 0, 255)
                    : new Color(220, 40,  40, 255);
            }
        }

        if (this.hpLabel) {
            this.hpLabel.string = `HP ${data.current} / ${data.max}`;
        }
    }

    private _onCoinChanged(data: { total: number }) {
        if (this.coinsLabel) this.coinsLabel.string = `🪙 ${data.total}`;
    }

    private _onKill() {
        // 从 GameManager 读击杀数
        try {
            const { GameManager } = require('../../core/GameManager');
            const kills = GameManager.instance?.runState?.killCount ?? 0;
            if (this.killLabel) this.killLabel.string = `☠️ ${kills}`;
        } catch {}
    }
}
