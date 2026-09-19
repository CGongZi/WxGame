import { _decorator, Component, Node, Label, Sprite, Color,
         UITransform, Canvas, Vec3 } from 'cc';
import { eventBus, GameEvents } from '../../core/EventBus';

const { ccclass, property } = _decorator;

/**
 * HUDManager —— 自给自足的 HUD
 * 只需挂到 Canvas 下任意节点，自动创建血条 + 金币 + 击杀数
 * 不需要在编辑器里手动搭节点树
 */
@ccclass('HUDManager')
export class HUDManager extends Component {

    private _fillNode: Node   = null!;
    private _hpLabel: Label   = null!;
    private _coinLabel: Label = null!;
    private _killLabel: Label = null!;

    private _barMaxW = 200;
    private _maxHp   = 100;
    private _hp      = 100;

    onLoad() {
        this._buildUI();
        eventBus.on(GameEvents.PLAYER_HP_CHANGED,  this._onHp,   this);
        eventBus.on(GameEvents.COIN_COLLECTED,      this._onCoin, this);
        eventBus.on(GameEvents.ENEMY_KILLED,        this._onKill, this);
    }

    onDestroy() {
        eventBus.off(GameEvents.PLAYER_HP_CHANGED, this._onHp,   this);
        eventBus.off(GameEvents.COIN_COLLECTED,     this._onCoin, this);
        eventBus.off(GameEvents.ENEMY_KILLED,       this._onKill, this);
    }

    // ── 构建 UI ────────────────────────────────────────────

    private _buildUI() {
        // 获取画布尺寸（750×1334）
        const cvs = this.node.scene?.getChildByName('Game')
                              ?.getChildByName('Canvas');
        const cvUI  = cvs?.getComponent(UITransform);
        const W     = cvUI?.width  ?? 750;
        const H     = cvUI?.height ?? 1334;

        // ── 左上角血条面板 ──
        const panel = this._makeNode('HPPanel', W * -0.5 + 20, H * 0.5 - 60, this.node);
        panel.getComponent(UITransform)!.setContentSize(220, 50);
        panel.getComponent(UITransform)!.anchorX = 0;
        panel.getComponent(UITransform)!.anchorY = 1;

        // 背景条（深红）
        const bg = this._makeNode('HPBg', 100, -25, panel);
        const bgUI = bg.getComponent(UITransform)!;
        bgUI.setContentSize(204, 22);
        bgUI.anchorX = 0; bgUI.anchorY = 0.5;
        const bgSp  = bg.addComponent(Sprite);
        bgSp.color  = new Color(80, 10, 10, 200);

        // 填充条（红色）
        this._fillNode = this._makeNode('HPFill', 0, 0, bg);
        const fillUI   = this._fillNode.getComponent(UITransform)!;
        fillUI.setContentSize(200, 18);
        fillUI.anchorX = 0; fillUI.anchorY = 0.5;
        const fillSp   = this._fillNode.addComponent(Sprite);
        fillSp.color   = new Color(220, 40, 40, 255);
        this._barMaxW  = 200;

        // ❤ 图标标签
        const heart = this._makeNode('HeartIcon', 10, -25, panel);
        const heartL = heart.addComponent(Label);
        heartL.string   = '❤';
        heartL.fontSize = 20;
        heartL.color    = new Color(255, 60, 60, 255);
        heart.getComponent(UITransform)!.anchorX = 0;

        // HP 数字
        const hpN = this._makeNode('HPNum', 100, -25, panel);
        this._hpLabel = hpN.addComponent(Label);
        this._hpLabel.string   = 'HP 100/100';
        this._hpLabel.fontSize = 16;
        this._hpLabel.color    = new Color(255, 220, 220, 255);
        hpN.getComponent(UITransform)!.anchorX = 0;

        // ── 右上角金币 / 击杀 ──
        const coinN = this._makeNode('Coins', W * 0.5 - 20, H * 0.5 - 40, this.node);
        this._coinLabel = coinN.addComponent(Label);
        this._coinLabel.string   = '🪙 0';
        this._coinLabel.fontSize = 22;
        this._coinLabel.color    = new Color(255, 215, 0, 255);
        coinN.getComponent(UITransform)!.anchorX = 1;
        coinN.getComponent(UITransform)!.anchorY = 1;

        const killN = this._makeNode('Kills', W * 0.5 - 20, H * 0.5 - 70, this.node);
        this._killLabel = killN.addComponent(Label);
        this._killLabel.string   = '☠️ 0';
        this._killLabel.fontSize = 18;
        this._killLabel.color    = new Color(200, 180, 255, 255);
        killN.getComponent(UITransform)!.anchorX = 1;
        killN.getComponent(UITransform)!.anchorY = 1;
    }

    private _makeNode(name: string, x: number, y: number, parent: Node): Node {
        const n = new Node(name);
        n.addComponent(UITransform);
        n.setParent(parent);
        n.setPosition(x, y, 0);
        return n;
    }

    // ── 事件响应 ───────────────────────────────────────────

    private _onHp(data: { current: number; max: number }) {
        this._hp    = data.current;
        this._maxHp = data.max;
        const ratio = data.max > 0 ? data.current / data.max : 0;

        const fillUI = this._fillNode?.getComponent(UITransform);
        if (fillUI) fillUI.width = Math.max(0, this._barMaxW * ratio);

        const fillSp = this._fillNode?.getComponent(Sprite);
        if (fillSp) fillSp.color = ratio < 0.3
            ? new Color(255, 110, 0, 255)   // 低血 → 橙色
            : new Color(220, 40,  40, 255);

        if (this._hpLabel) this._hpLabel.string = `HP ${data.current}/${data.max}`;
    }

    private _onCoin(data: { total: number }) {
        if (this._coinLabel) this._coinLabel.string = `🪙 ${data.total}`;
    }

    private _killCount = 0;
    private _onKill() {
        this._killCount++;
        if (this._killLabel) this._killLabel.string = `☠️ ${this._killCount}`;
    }
}
