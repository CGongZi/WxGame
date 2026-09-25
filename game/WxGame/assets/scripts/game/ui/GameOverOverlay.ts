import { _decorator, Component, Node, Label, Color,
         UITransform, Graphics, Vec3, tween, find,
         BlockInputEvents, Layers } from 'cc';
import { eventBus, GameEvents } from '../../core/EventBus';
import { GameManager, DeathReport } from '../../core/GameManager';
import { PlayerStats } from '../../core/PlayerStats';
import { DungeonManager } from '../dungeon/DungeonManager';
import { UpgradeShop } from './UpgradeShop';
import { FloorResult } from './FloorResult';
import { TalentPick } from './TalentPick';
import { WeaponReplaceUI } from './WeaponReplaceUI';
import { LobbyReturn } from './LobbyReturn';

const { ccclass } = _decorator;

/**
 * GameOverOverlay —— 死亡本局报告（双货币：局内金币统计 + 折算灵魂石）
 * 「回主界面」挂到 Canvas 最顶层，避免被 FadeLayer 挡住
 */
@ccclass('GameOverOverlay')
export class GameOverOverlay extends Component {

    private _panel: Node | null = null;
    private _kills = 0;
    private _coins = 0;
    private _floor = 1;
    private _startMs = 0;
    private _going = false;
    private _pendingSoulTip = 0;

    onLoad() {
        this.node.active = true;
        this._startMs = Date.now();
        eventBus.on(GameEvents.ENEMY_KILLED, this._onKill, this);
        eventBus.on(GameEvents.COIN_COLLECTED, this._onCoin, this);
        eventBus.on(GameEvents.FLOOR_STARTED, this._onFloor, this);
        eventBus.on(GameEvents.PLAYER_DIED, this._onPlayerDied, this);
    }

    onDestroy() {
        eventBus.off(GameEvents.ENEMY_KILLED, this._onKill, this);
        eventBus.off(GameEvents.COIN_COLLECTED, this._onCoin, this);
        eventBus.off(GameEvents.FLOOR_STARTED, this._onFloor, this);
        eventBus.off(GameEvents.PLAYER_DIED, this._onPlayerDied, this);
    }

    private _onKill() { this._kills++; }
    private _onCoin(d: { amount?: number; total?: number }) {
        if (d.total !== undefined) this._coins = Math.max(0, d.total);
        else if (d.amount !== undefined) this._coins = Math.max(0, this._coins + d.amount);
    }
    private _onFloor(d: { floor?: number }) {
        if (d?.floor != null) this._floor = d.floor;
    }

    private _onPlayerDied(data: DeathReport | unknown) {
        const gm = GameManager.instance;
        const report = (data && typeof data === 'object' && 'soulEarned' in (data as object))
            ? data as DeathReport
            : gm?.lastDeathReport;
        const elapsed = report?.time ?? ((Date.now() - this._startMs) / 1000);
        const floor = report?.floor ?? Math.max(this._floor, DungeonManager.progress.floor);
        const kills = report?.kills ?? this._kills;
        const coins = report?.coins ?? this._coins;
        const score = report?.score ?? (kills * 10 + coins);
        this._pendingSoulTip = report?.soulEarned ?? 0;
        this.scheduleOnce(() => this._show({
            floor, score, kills, time: elapsed, coins,
            soulEarned: report?.soulEarned ?? 0,
            soulTotal: report?.soulTotal ?? (gm?.save.currency.soul ?? 0),
            newFloorRecord: report?.newFloorRecord ?? false,
            newScoreRecord: report?.newScoreRecord ?? false,
            weaponName: report?.weaponName ?? '—',
        }), 0.6);
    }

    private _show(data: DeathReport) {
        if (this._panel?.isValid) return;
        this._going = false;

        eventBus.emit(GameEvents.PLAYER_HP_CHANGED, {
            current: 0,
            max: PlayerStats.I.get('maxHp'),
        });

        const canvas = find('Canvas') ?? this.node.parent ?? this.node;
        UpgradeShop.forceClose(canvas);
        TalentPick.forceClose(canvas);
        WeaponReplaceUI.forceClose(canvas);
        FloorResult.forceClose(canvas);
        const dm = canvas.getComponent(DungeonManager);
        if (dm) dm.cancelFadeForLobby();
        else {
            const fade = canvas.getChildByName('FadeLayer');
            if (fade) fade.active = false;
        }

        const panel = new Node('GameOverPanel');
        panel.layer = Layers.Enum.UI_2D;
        panel.setParent(canvas);
        panel.setPosition(0, 0, 0);
        panel.setSiblingIndex(canvas.children.length - 1);
        panel.addComponent(UITransform).setContentSize(1334, 750);
        panel.addComponent(BlockInputEvents);

        const bg = panel.addComponent(Graphics);
        bg.fillColor = new Color(0, 0, 0, 180);
        bg.rect(-667, -375, 1334, 750);
        bg.fill();

        this._panel = panel;

        const card = new Node('Card');
        card.layer = Layers.Enum.UI_2D;
        card.setParent(panel);
        card.setPosition(0, 50, 0);
        card.addComponent(UITransform).setContentSize(520, 360);
        const cg = card.addComponent(Graphics);
        cg.fillColor = new Color(20, 20, 40, 240);
        cg.roundRect(-260, -180, 520, 360, 20);
        cg.fill();
        cg.lineWidth = 3;
        cg.strokeColor = new Color(200, 80, 80, 255);
        cg.roundRect(-260, -180, 520, 360, 20);
        cg.stroke();
        card.getComponent(UITransform)!.setContentSize(0, 0);

        this._makeLabel(panel, '本局战报', 0, 200, 42, new Color(230, 60, 60, 255));

        const m = Math.floor(data.time / 60);
        const s = Math.floor(data.time % 60);
        const timeStr = `${m}:${s < 10 ? '0' : ''}${s}`;

        this._makeLabel(panel, `第 ${data.floor} 层`, -130, 140, 24, new Color(255, 210, 80, 255));
        this._makeLabel(panel, `得分  ${data.score}`, 130, 140, 24, new Color(100, 230, 100, 255));
        this._makeLabel(panel, `击杀  ${data.kills}`, -130, 100, 22, new Color(200, 160, 255, 255));
        this._makeLabel(panel, `用时  ${timeStr}`, 130, 100, 22, new Color(160, 210, 255, 255));
        this._makeLabel(panel, `局内金币  ${data.coins}`, -130, 58, 22, new Color(255, 220, 120, 255));
        this._makeLabel(panel, `武器  ${data.weaponName}`, 130, 58, 20, new Color(180, 200, 230, 255));

        const soulLine = data.soulEarned > 0
            ? `✦ 折算灵魂石 +${data.soulEarned}（库存 ${data.soulTotal}）`
            : `✦ 灵魂石未增加（库存 ${data.soulTotal}）`;
        this._makeLabel(panel, soulLine, 0, 12, 22, new Color(200, 160, 255, 255));

        const badges: string[] = [];
        if (data.newFloorRecord) badges.push('新最高层');
        if (data.newScoreRecord) badges.push('新最高分');
        if (badges.length) {
            this._makeLabel(panel, badges.join(' · '), 0, -28, 18, new Color(255, 200, 90, 255));
        } else {
            this._makeLabel(panel, '金币不带出 · 灵魂石永久保存', 0, -28, 16, new Color(140, 150, 170, 255));
        }

        const retryBtn = this._makeButton(panel, '回主界面', 0, -170, 260, 60,
            new Color(50, 130, 230, 255), new Color(80, 170, 255, 255));
        retryBtn.setSiblingIndex(panel.children.length - 1);

        const goHome = () => {
            if (this._going) return;
            this._going = true;
            this._returnToLobby(canvas);
        };
        retryBtn.on(Node.EventType.TOUCH_END, (ev) => {
            ev.propagationStopped = true;
            goHome();
        });

        panel.setScale(0.6, 0.6, 1);
        tween(panel)
            .to(0.25, { scale: new Vec3(1.05, 1.05, 1) }, { easing: 'backOut' })
            .to(0.10, { scale: new Vec3(1.00, 1.00, 1) })
            .start();
    }

    private _returnToLobby(canvas: Node) {
        const soulTip = this._pendingSoulTip;
        this._pendingSoulTip = 0;
        const panel = this._panel;
        this._panel = null;

        LobbyReturn.go(canvas, {
            panel,
            soulTip,
            onReady: () => {
                this._kills = 0;
                this._coins = 0;
                this._floor = 1;
                this._startMs = Date.now();
                this._going = false;
                const dm = canvas.getComponent(DungeonManager);
                if (dm) dm.restartRun();
                else canvas.addComponent(DungeonManager);
            },
        });
    }

    private _makeLabel(parent: Node, text: string, x: number, y: number,
                       size: number, color: Color): Node {
        const n = new Node('Lbl');
        n.layer = Layers.Enum.UI_2D;
        n.setParent(parent);
        n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(300, size + 8);
        const lbl = n.addComponent(Label);
        lbl.string = text;
        lbl.fontSize = size;
        lbl.color = color;
        lbl.horizontalAlign = 1;
        return n;
    }

    private _makeButton(parent: Node, text: string, x: number, y: number,
                        w: number, h: number,
                        colorNormal: Color, colorHover: Color): Node {
        const btn = new Node('BtnHome');
        btn.layer = Layers.Enum.UI_2D;
        btn.setParent(parent);
        btn.setPosition(x, y, 0);
        btn.addComponent(UITransform).setContentSize(w, h);

        const g = btn.addComponent(Graphics);
        const draw = (c: Color) => {
            g.clear();
            g.fillColor = c;
            g.roundRect(-w / 2, -h / 2, w, h, 12);
            g.fill();
            g.lineWidth = 2;
            g.strokeColor = new Color(255, 255, 255, 100);
            g.roundRect(-w / 2, -h / 2, w, h, 12);
            g.stroke();
        };
        draw(colorNormal);

        const lblNode = new Node('Txt');
        lblNode.layer = Layers.Enum.UI_2D;
        lblNode.setParent(btn);
        lblNode.setPosition(0, 0, 0);
        lblNode.addComponent(UITransform).setContentSize(w - 16, h - 8);
        const lbl = lblNode.addComponent(Label);
        lbl.string = text;
        lbl.fontSize = 26;
        lbl.color = new Color(255, 255, 255, 255);
        lbl.horizontalAlign = 1;
        lbl.verticalAlign = 1;

        btn.on(Node.EventType.TOUCH_START, () => draw(colorHover));
        btn.on(Node.EventType.TOUCH_CANCEL, () => draw(colorNormal));
        btn.on(Node.EventType.MOUSE_DOWN, () => draw(colorHover));
        btn.on(Node.EventType.MOUSE_LEAVE, () => draw(colorNormal));

        return btn;
    }
}
