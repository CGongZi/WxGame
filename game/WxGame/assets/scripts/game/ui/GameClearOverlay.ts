import { Node, Label, Color, UITransform, Graphics, BlockInputEvents, Vec3, tween, Layers } from 'cc';
import { eventBus, GameEvents } from '../../core/EventBus';
import { GameManager } from '../../core/GameManager';
import { runCoins } from './UpgradeShop';
import { LobbyReturn } from './LobbyReturn';
import { DungeonManager } from '../dungeon/DungeonManager';
import { director } from 'cc';
import { AudioManager } from '../../core/AudioManager';
import { GameFlow } from '../../core/GameFlow';

type ClearPayload = {
    score?: number;
    kills?: number;
    time?: number;
    mode?: string;
    stageId?: string | null;
    stageName?: string | null;
    clearSoul?: number;
    itemTip?: string;
    nextStageId?: string | null;
};

/**
 * GameClearOverlay —— 关卡/战役通关结算
 * 关卡模式：奖励 + 「下一关」/「回大厅」
 */
export class GameClearOverlay {
    private static _open = false;
    private static _listening = false;
    private static _going = false;

    static reset() {
        GameClearOverlay._open = false;
        GameClearOverlay._going = false;
    }

    static ensureListening() {
        if (GameClearOverlay._listening) return;
        GameClearOverlay._listening = true;
        eventBus.on(GameEvents.GAME_CLEARED, (d: ClearPayload) => {
            const canvas = director.getScene()?.getChildByName('Canvas');
            if (canvas) GameClearOverlay.show(canvas, d ?? {});
        });
    }

    static show(canvas: Node, data: ClearPayload) {
        GameClearOverlay.ensureListening();
        if (canvas.getChildByName('GameClear')) return;
        GameClearOverlay._open = true;
        GameClearOverlay._going = false;
        GameFlow.setCombatFrozen(true);

        const save = GameManager.instance?.save;
        const clearSoul = data.clearSoul
            ?? GameManager.instance?.runConfig.lastClearSoul
            ?? 0;
        const itemTip = data.itemTip
            ?? GameManager.instance?.runConfig.lastClearItemTip
            ?? '';
        const stageName = data.stageName ?? null;
        const nextId = data.nextStageId ?? null;
        const isStage = data.mode === 'stage' || !!data.stageId;

        const root = new Node('GameClear');
        root.layer = Layers.Enum.UI_2D;
        root.setParent(canvas);
        root.setPosition(0, 0, 0);
        root.setSiblingIndex(10001);
        root.addComponent(UITransform).setContentSize(1334, 750);
        root.addComponent(BlockInputEvents);

        const bg = root.addComponent(Graphics);
        bg.fillColor = new Color(8, 12, 28, 220);
        bg.rect(-667, -375, 1334, 750); bg.fill();

        const card = new Node('Card');
        card.layer = Layers.Enum.UI_2D;
        card.setParent(root);
        card.setPosition(0, 10, 0);
        card.addComponent(UITransform).setContentSize(540, 440);
        const cg = card.addComponent(Graphics);
        cg.fillColor = new Color(24, 18, 48, 250);
        cg.roundRect(-270, -220, 540, 440, 20); cg.fill();
        cg.strokeColor = new Color(255, 210, 80, 230);
        cg.lineWidth = 3;
        cg.roundRect(-270, -220, 540, 440, 20); cg.stroke();

        const title = isStage && stageName
            ? `🏆 关卡通关 · ${stageName}`
            : '🏆 地牢通关！';
        GameClearOverlay._lbl(card, title, 0, 170, 28, new Color(255, 220, 100, 255));
        GameClearOverlay._lbl(
            card,
            isStage ? '本关奖励已发放' : '你击败了最终 Boss',
            0, 132, 16, new Color(200, 190, 220, 255),
        );

        const kills = data.kills ?? GameManager.instance?.runState.killCount ?? 0;
        const score = data.score ?? GameManager.instance?.runState.score ?? 0;
        const time = Math.floor(data.time ?? 0);
        const soul = save?.currency.soul ?? 0;

        GameClearOverlay._lbl(card, `☠️ 击杀  ${kills}`, -120, 70, 20, new Color(220, 180, 255, 255));
        GameClearOverlay._lbl(card, `⭐ 分数  ${score}`, 120, 70, 20, new Color(255, 215, 100, 255));
        GameClearOverlay._lbl(card, `⏱ 用时  ${time}s`, -120, 35, 18, new Color(180, 200, 220, 255));
        GameClearOverlay._lbl(card, `🪙 金币  ${runCoins}`, 120, 35, 18, new Color(255, 215, 80, 255));
        GameClearOverlay._lbl(card, `💎 灵魂石  ${soul}`, 0, -5, 18, new Color(200, 160, 255, 255));
        if (clearSoul > 0) {
            GameClearOverlay._lbl(
                card, `通关奖励 +${clearSoul} 灵魂石`, 0, -40, 16, new Color(180, 220, 160, 255),
            );
        }
        if (itemTip) {
            GameClearOverlay._lbl(card, itemTip, 0, -68, 14, new Color(210, 190, 140, 255));
        }

        const goHome = () => {
            if (GameClearOverlay._going) return;
            GameClearOverlay._going = true;
            GameClearOverlay._open = false;
            GameFlow.setCombatFrozen(false);
            LobbyReturn.go(canvas, {
                panel: root,
                soulTip: clearSoul > 0 ? clearSoul : 0,
                soulTipLabel: clearSoul > 0 ? `✦ 通关奖励灵魂石 +${clearSoul}` : undefined,
                onReady: () => {
                    GameClearOverlay._going = false;
                    const dm = canvas.getComponent(DungeonManager);
                    if (dm) dm.restartRun();
                    else canvas.addComponent(DungeonManager);
                },
            });
        };

        if (isStage && nextId) {
            const nextBtn = GameClearOverlay._btn(
                card, '下一关 →', -110, -150, 200, 48, new Color(90, 130, 60, 255),
            );
            nextBtn.on(Node.EventType.TOUCH_END, (ev) => {
                ev.propagationStopped = true;
                if (GameClearOverlay._going) return;
                GameClearOverlay._going = true;
                AudioManager.playUi();
                GameClearOverlay._open = false;
                if (root.isValid) root.destroy();
                GameFlow.setCombatFrozen(false);
                if (!GameManager.instance?.beginStageRun(nextId)) {
                    GameClearOverlay._going = false;
                    goHome();
                    return;
                }
                LobbyReturn.continuePlaying(canvas, () => {
                    GameClearOverlay._going = false;
                    const dm = canvas.getComponent(DungeonManager);
                    if (dm) dm.restartRun();
                    else canvas.addComponent(DungeonManager);
                    eventBus.emit('show-tip', { text: '📜 下一关开始！' });
                });
            });

            const homeBtn = GameClearOverlay._btn(
                card, '回大厅', 110, -150, 180, 48, new Color(50, 100, 180, 255),
            );
            homeBtn.on(Node.EventType.TOUCH_END, (ev) => {
                ev.propagationStopped = true;
                goHome();
            });
        } else {
            const again = GameClearOverlay._btn(
                card, '🏠 回主界面', 0, -150, 220, 48, new Color(50, 140, 230, 255),
            );
            again.on(Node.EventType.TOUCH_END, (ev) => {
                ev.propagationStopped = true;
                goHome();
            });
        }

        root.setScale(0.7, 0.7, 1);
        tween(root)
            .to(0.28, { scale: new Vec3(1.04, 1.04, 1) }, { easing: 'backOut' })
            .to(0.1, { scale: new Vec3(1, 1, 1) })
            .start();
    }

    private static _lbl(p: Node, t: string, x: number, y: number, s: number, c: Color) {
        const n = new Node('L');
        n.layer = Layers.Enum.UI_2D;
        n.setParent(p); n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(500, s + 8);
        const l = n.addComponent(Label);
        l.string = t; l.fontSize = s; l.color = c; l.horizontalAlign = 1;
    }

    private static _btn(p: Node, t: string, x: number, y: number, w: number, h: number, c: Color) {
        const n = new Node('B');
        n.layer = Layers.Enum.UI_2D;
        n.setParent(p); n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(w, h);
        const g = n.addComponent(Graphics);
        g.fillColor = c; g.roundRect(-w / 2, -h / 2, w, h, 10); g.fill();
        GameClearOverlay._lbl(n, t, 0, 0, 18, new Color(255, 255, 255, 255));
        return n;
    }
}
