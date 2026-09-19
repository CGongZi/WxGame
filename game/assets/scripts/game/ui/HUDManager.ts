import { _decorator, Component, Node, Label, Color,
         UITransform, Graphics, find } from 'cc';
import { eventBus, GameEvents } from '../../core/EventBus';

const { ccclass } = _decorator;

/**
 * HUDManager —— 全用 Graphics 画，不依赖任何图片资源
 * 挂到 Canvas/HUD 节点即可
 */
@ccclass('HUDManager')
export class HUDManager extends Component {

    private _fillNode: Node      = null!;
    private _hpLabel: Label      = null!;
    private _coinLabel: Label    = null!;
    private _killLabel: Label    = null!;
    private _weaponLabel: Label  = null!;

    private _barMaxW = 200;
    private _killCount = 0;
    private _totalCoins = 0;
    private _hp    = 100;
    private _maxHp = 100;

    onLoad() {
        this._killCount  = 0;
        this._totalCoins = 0;
        this._buildUI();
        eventBus.on(GameEvents.PLAYER_HP_CHANGED, this._onHp,     this);
        eventBus.on(GameEvents.COIN_COLLECTED,    this._onCoin,   this);
        eventBus.on(GameEvents.ENEMY_KILLED,      this._onKill,   this);
        eventBus.on(GameEvents.WEAPON_CHANGED,    this._onWeapon, this);
    }

    start() {
        this.scheduleOnce(() => {
            const wc = find('Game/Canvas/Player')?.getComponent('WeaponController') as any
                    ?? find('Canvas/Player')?.getComponent('WeaponController') as any;
            if (wc?.currentWeapon) {
                this._onWeapon({
                    name:  wc.currentWeapon.name,
                    emoji: wc.currentWeapon.emoji,
                    type:  wc.currentWeapon.type,
                });
            }
        }, 0.1);
    }

    onDestroy() {
        eventBus.off(GameEvents.PLAYER_HP_CHANGED, this._onHp,     this);
        eventBus.off(GameEvents.COIN_COLLECTED,    this._onCoin,   this);
        eventBus.off(GameEvents.ENEMY_KILLED,      this._onKill,   this);
        eventBus.off(GameEvents.WEAPON_CHANGED,    this._onWeapon, this);
    }

    // ── 构建 UI ───────────────────────────────────────────

    private _buildUI() {
        // Canvas 中心是 (0,0)，半宽 667，半高 375
        const HW = 667, HH = 375;

        // ── 左上角 HP 面板 ──────────────────────────────
        const panel = this._node('HPPanel', -HW + 12, HH - 12, this.node);
        panel.getComponent(UITransform)!.setContentSize(240, 56);
        panel.getComponent(UITransform)!.anchorX = 0;
        panel.getComponent(UITransform)!.anchorY = 1;

        // 面板背景（半透明黑）
        const panelBg = this._node('PanelBg', 120, -28, panel);
        const pbg = panelBg.addComponent(Graphics);
        panelBg.getComponent(UITransform)!.setContentSize(240, 56);
        pbg.fillColor = new Color(0, 0, 0, 140);
        pbg.roundRect(-120, -28, 240, 56, 8);
        pbg.fill();

        // ❤ 图标
        const heartN = this._node('Heart', 18, -28, panel);
        heartN.getComponent(UITransform)!.setContentSize(24, 24);
        heartN.getComponent(UITransform)!.anchorX = 0;
        heartN.getComponent(UITransform)!.anchorY = 0.5;
        const heartL = heartN.addComponent(Label);
        heartL.string = '❤';
        heartL.fontSize = 20;
        heartL.color = new Color(255, 60, 60, 255);

        // HP 进度条背景（深红）
        const bgN = this._node('HPBg', 46, -22, panel);
        bgN.getComponent(UITransform)!.setContentSize(this._barMaxW + 4, 18);
        bgN.getComponent(UITransform)!.anchorX = 0;
        bgN.getComponent(UITransform)!.anchorY = 0.5;
        const bgG = bgN.addComponent(Graphics);
        bgG.fillColor = new Color(80, 10, 10, 220);
        bgG.rect(-1, -9, this._barMaxW + 4, 18);
        bgG.fill();

        // HP 填充条（亮红）— 用 Graphics 动态重绘
        this._fillNode = this._node('HPFill', 46, -22, panel);
        this._fillNode.getComponent(UITransform)!.setContentSize(this._barMaxW, 14);
        this._fillNode.getComponent(UITransform)!.anchorX = 0;
        this._fillNode.getComponent(UITransform)!.anchorY = 0.5;
        const fillG = this._fillNode.addComponent(Graphics);
        fillG.fillColor = new Color(220, 40, 40, 255);
        fillG.rect(0, -7, this._barMaxW, 14);
        fillG.fill();

        // HP 数字
        const hpN = this._node('HPNum', 148, -36, panel);
        hpN.getComponent(UITransform)!.setContentSize(140, 18);
        hpN.getComponent(UITransform)!.anchorX = 0;
        hpN.getComponent(UITransform)!.anchorY = 0.5;
        this._hpLabel = hpN.addComponent(Label);
        this._hpLabel.string   = 'HP 100/100';
        this._hpLabel.fontSize = 14;
        this._hpLabel.color    = new Color(255, 210, 210, 255);

        // ── 右上角 金币 / 击杀 ──────────────────────────
        const coinN = this._node('Coins', HW - 12, HH - 20, this.node);
        coinN.getComponent(UITransform)!.setContentSize(120, 28);
        coinN.getComponent(UITransform)!.anchorX = 1;
        coinN.getComponent(UITransform)!.anchorY = 1;
        this._coinLabel = coinN.addComponent(Label);
        this._coinLabel.string   = '🪙 0';
        this._coinLabel.fontSize = 22;
        this._coinLabel.color    = new Color(255, 215, 0, 255);

        const killN = this._node('Kills', HW - 12, HH - 52, this.node);
        killN.getComponent(UITransform)!.setContentSize(120, 24);
        killN.getComponent(UITransform)!.anchorX = 1;
        killN.getComponent(UITransform)!.anchorY = 1;
        this._killLabel = killN.addComponent(Label);
        this._killLabel.string   = '☠️ 0';
        this._killLabel.fontSize = 18;
        this._killLabel.color    = new Color(200, 180, 255, 255);

        // ── 底部中央 武器栏 ──────────────────────────────
        const wBar = this._node('WeaponBar', 0, -HH + 50, this.node);
        wBar.getComponent(UITransform)!.setContentSize(220, 44);
        // 背景
        const wbG = wBar.addComponent(Graphics);
        wbG.fillColor = new Color(0, 0, 0, 170);
        wbG.roundRect(-108, -20, 216, 40, 10);
        wbG.fill();
        wbG.strokeColor = new Color(180, 150, 60, 200);
        wbG.lineWidth = 2;
        wbG.roundRect(-108, -20, 216, 40, 10);
        wbG.stroke();
        // 武器名
        const wN = this._node('WeaponName', 0, 0, wBar);
        wN.getComponent(UITransform)!.setContentSize(210, 36);
        this._weaponLabel = wN.addComponent(Label);
        this._weaponLabel.string   = '🗡️ 铁剑';
        this._weaponLabel.fontSize = 22;
        this._weaponLabel.color    = new Color(255, 230, 130, 255);
    }

    // ── 工具函数 ──────────────────────────────────────────

    private _node(name: string, x: number, y: number, parent: Node): Node {
        const n = new Node(name);
        n.addComponent(UITransform);
        n.setParent(parent);
        n.setPosition(x, y, 0);
        return n;
    }

    // ── 事件响应 ──────────────────────────────────────────

    private _onHp(data: { current: number; max: number }) {
        this._hp    = data.current;
        this._maxHp = data.max;
        const ratio = data.max > 0 ? data.current / data.max : 0;
        const w     = Math.max(0, this._barMaxW * ratio);

        // 重新绘制填充条
        const fillG = this._fillNode?.getComponent(Graphics);
        if (fillG) {
            fillG.clear();
            fillG.fillColor = ratio < 0.3
                ? new Color(255, 110, 0, 255)   // 低血橙色
                : new Color(220, 40,  40, 255);
            fillG.rect(0, -7, w, 14);
            fillG.fill();
        }

        const ui = this._fillNode?.getComponent(UITransform);
        if (ui) ui.width = w;

        if (this._hpLabel)
            this._hpLabel.string = `HP ${data.current}/${data.max}`;
    }

    private _onCoin(data: { total?: number; amount?: number }) {
        if (data.total  !== undefined) this._totalCoins  = data.total;
        if (data.amount !== undefined) this._totalCoins += data.amount;
        if (this._coinLabel) this._coinLabel.string = `🪙 ${this._totalCoins}`;
    }

    private _onKill() {
        this._killCount++;
        if (this._killLabel) this._killLabel.string = `☠️ ${this._killCount}`;
    }

    private _onWeapon(data: { name: string; emoji: string; type: string }) {
        if (this._weaponLabel)
            this._weaponLabel.string = `${data.emoji} ${data.name}`;
    }
}
