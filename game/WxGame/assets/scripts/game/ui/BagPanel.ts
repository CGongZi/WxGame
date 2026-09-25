import {
    Node, Label, Color, UITransform, Graphics, BlockInputEvents, find, Layers,
} from 'cc';
import { ConfigStore } from '../../core/ConfigStore';
import { eventBus, GameEvents } from '../../core/EventBus';
import { GameFlow } from '../../core/GameFlow';
import { RunBag } from '../item/RunBag';
import { drawItemGlyph } from '../fx/ItemArt';
import { AudioManager } from '../../core/AudioManager';
import { UpgradeShop } from './UpgradeShop';
import { TalentPick } from './TalentPick';

/**
 * BagPanel —— 局内背包面板（6 格 · 点选使用）
 * 闭环：掉落入包 / 补给开战灌包 / 清房店买入包 → 此处或 HUD 快捷栏使用。
 */
export class BagPanel {
    private static _open = false;
    private static _root: Node | null = null;

    static get isOpen() { return BagPanel._open; }

    static forceClose(canvas?: Node | null) {
        const wasOpen = BagPanel._open;
        BagPanel._open = false;
        const host = canvas ?? find('Canvas');
        const n = host?.getChildByName('BagPanel');
        if (n?.isValid) n.destroy();
        BagPanel._root = null;
        // 仅在本面板曾冻结时解冻，避免误解除 RoomBriefing / UpgradeShop 冻结
        if (wasOpen && GameFlow.isPlaying) GameFlow.setCombatFrozen(false);
    }

    static toggle(canvas: Node) {
        if (BagPanel._open) {
            BagPanel.forceClose(canvas);
            return;
        }
        BagPanel.show(canvas);
    }

    static show(canvas: Node) {
        if (!GameFlow.isPlaying) return;
        if (BagPanel._open) return;
        // 清房店 / 入场展板已冻结时勿抢开，否则关闭会误解冻
        if (GameFlow.isCombatFrozen) return;
        if (UpgradeShop.isOpen) return;
        if (TalentPick.isOpen) return;
        BagPanel._open = true;
        GameFlow.setCombatFrozen(true);

        const root = new Node('BagPanel');
        BagPanel._root = root;
        root.layer = Layers.Enum.UI_2D;
        root.setParent(canvas);
        root.setPosition(0, 0, 0);
        root.setSiblingIndex(9997);
        root.addComponent(UITransform).setContentSize(1334, 750);
        root.addComponent(BlockInputEvents);

        const bg = root.addComponent(Graphics);
        bg.fillColor = new Color(6, 5, 8, 170);
        bg.rect(-667, -375, 1334, 750); bg.fill();

        const panel = new Node('Panel');
        panel.layer = Layers.Enum.UI_2D;
        panel.setParent(root);
        panel.setPosition(0, 10, 0);
        panel.addComponent(UITransform).setContentSize(520, 360);
        const pg = panel.addComponent(Graphics);
        pg.fillColor = new Color(22, 16, 12, 250);
        pg.roundRect(-260, -180, 520, 360, 16); pg.fill();
        pg.strokeColor = new Color(200, 150, 70, 210);
        pg.lineWidth = 2.5;
        pg.roundRect(-260, -180, 520, 360, 16); pg.stroke();

        BagPanel._lbl(panel, '背包', 0, 148, 26, new Color(255, 228, 160, 255));
        BagPanel._lbl(
            panel,
            `格位 ${RunBag.usedSlots()}/${RunBag.CAP} · 同种叠 ×${RunBag.STACK} · 点格使用`,
            0, 118, 13, new Color(180, 160, 130, 255),
        );

        const grid = new Node('Grid');
        grid.layer = Layers.Enum.UI_2D;
        grid.setParent(panel);
        grid.setPosition(0, -10, 0);
        grid.addComponent(UITransform).setContentSize(440, 200);
        BagPanel._paintSlots(grid);

        const close = BagPanel._btn(panel, '关闭', 0, -148, 140, 36, new Color(70, 50, 30, 255));
        close.on(Node.EventType.TOUCH_END, () => {
            AudioManager.playUi();
            BagPanel.forceClose(canvas);
        });
    }

    private static _paintSlots(grid: Node) {
        const slots = RunBag.slots();
        const cell = 88;
        const gap = 14;
        const cols = 3;
        const rows = 2;
        const spanX = cols * cell + (cols - 1) * gap;
        const spanY = rows * cell + (rows - 1) * gap;

        for (let i = 0; i < RunBag.CAP; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = -spanX / 2 + cell / 2 + col * (cell + gap);
            const y = spanY / 2 - cell / 2 - row * (cell + gap);
            const slot = slots[i];

            const n = new Node(`S${i}`);
            n.layer = Layers.Enum.UI_2D;
            n.setParent(grid);
            n.setPosition(x, y, 0);
            n.addComponent(UITransform).setContentSize(cell, cell);
            const g = n.addComponent(Graphics);
            g.fillColor = new Color(32, 24, 18, 255);
            g.roundRect(-cell / 2, -cell / 2, cell, cell, 10); g.fill();
            g.strokeColor = slot
                ? new Color(210, 160, 70, 200)
                : new Color(90, 70, 50, 140);
            g.lineWidth = 2;
            g.roundRect(-cell / 2, -cell / 2, cell, cell, 10); g.stroke();

            BagPanel._lbl(n, `${i + 1}`, -28, 28, 11, new Color(140, 120, 100, 200), 24);

            if (!slot) {
                BagPanel._lbl(n, '空', 0, 0, 14, new Color(100, 90, 80, 180));
                continue;
            }
            const def = ConfigStore.item(slot.id);
            if (def) {
                const art = new Node('Art');
                art.layer = Layers.Enum.UI_2D;
                art.setParent(n);
                art.setPosition(0, 8, 0);
                art.addComponent(UITransform).setContentSize(48, 48);
                drawItemGlyph(art.addComponent(Graphics), def, 36);
            }
            BagPanel._lbl(
                n,
                def ? `${def.emoji}×${slot.count}` : `×${slot.count}`,
                0, -28, 13, new Color(255, 230, 190, 255),
            );

            n.on(Node.EventType.TOUCH_END, () => {
                AudioManager.playUi();
                const tip = RunBag.use(i);
                if (!tip) {
                    eventBus.emit('show-tip', { text: '无法使用' });
                    return;
                }
                eventBus.emit('show-tip', { text: `✅ ${tip}` });
                eventBus.emit(GameEvents.BAG_CHANGED, { slots: RunBag.snapshot() });
                // 刷新格位
                grid.removeAllChildren();
                BagPanel._paintSlots(grid);
            });
        }
    }

    private static _lbl(
        p: Node, t: string, x: number, y: number, s: number, c: Color, width = 400,
    ): Node {
        const n = new Node('L');
        n.layer = Layers.Enum.UI_2D;
        n.setParent(p);
        n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(width, s + 8);
        const l = n.addComponent(Label);
        l.string = t;
        l.fontSize = s;
        l.color = c;
        l.horizontalAlign = 1;
        return n;
    }

    private static _btn(
        p: Node, t: string, x: number, y: number, w: number, h: number, c: Color,
    ): Node {
        const n = new Node('B');
        n.layer = Layers.Enum.UI_2D;
        n.setParent(p);
        n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(w, h);
        const g = n.addComponent(Graphics);
        g.fillColor = c;
        g.roundRect(-w / 2, -h / 2, w, h, 8); g.fill();
        g.strokeColor = new Color(255, 220, 150, 70);
        g.lineWidth = 1;
        g.roundRect(-w / 2, -h / 2, w, h, 8); g.stroke();
        BagPanel._lbl(n, t, 0, 0, 15, new Color(255, 250, 235, 255), w - 8);
        return n;
    }
}
