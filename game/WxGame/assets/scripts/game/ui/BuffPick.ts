import { Node, Label, Color, UITransform, Graphics, BlockInputEvents, find, tween, Vec3, Layers } from 'cc';
import { eventBus } from '../../core/EventBus';
import { GameFlow } from '../../core/GameFlow';
import { AudioManager } from '../../core/AudioManager';
import { RunBuff } from '../item/RunBuff';

/** #167 神龛三选一增益 · #203 放大卡片与文案，手机可读 */
export class BuffPick {
    private static _open = false;

    static get isOpen() { return BuffPick._open; }

    static forceClose(canvas?: Node | null) {
        BuffPick._open = false;
        GameFlow.setCombatFrozen(false);
        const host = canvas ?? find('Canvas');
        const n = host?.getChildByName('BuffPick');
        if (n?.isValid) n.destroy();
    }

    static show(canvas: Node) {
        if (BuffPick._open) return;
        const defs = RunBuff.drawThree();
        if (defs.length === 0) {
            GameFlow.setCombatFrozen(false);
            return;
        }

        BuffPick._open = true;
        GameFlow.setCombatFrozen(true);

        const root = new Node('BuffPick');
        root.layer = Layers.Enum.UI_2D;
        root.setParent(canvas);
        root.setPosition(0, 0, 0);
        root.setSiblingIndex(9999);
        root.addComponent(UITransform).setContentSize(1334, 750);
        root.addComponent(BlockInputEvents);

        const bg = root.addComponent(Graphics);
        bg.fillColor = new Color(10, 8, 18, 200);
        bg.rect(-667, -375, 1334, 750); bg.fill();

        const panelW = 920;
        const panelH = 420;
        const panel = new Node('Panel');
        panel.layer = Layers.Enum.UI_2D;
        panel.setParent(root);
        panel.setPosition(0, 16, 0);
        panel.setScale(0.92, 0.92, 1);
        panel.addComponent(UITransform).setContentSize(panelW, panelH);
        const pg = panel.addComponent(Graphics);
        pg.fillColor = new Color(22, 18, 36, 252);
        pg.roundRect(-panelW / 2, -panelH / 2, panelW, panelH, 18); pg.fill();
        pg.strokeColor = new Color(220, 170, 80, 230);
        pg.lineWidth = 2.8;
        pg.roundRect(-panelW / 2, -panelH / 2, panelW, panelH, 18); pg.stroke();

        tween(panel).to(0.2, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();

        BuffPick._label(panel, '神龛赐福 · 三选一', 0, panelH / 2 - 42, 28, new Color(255, 220, 140, 255), panelW - 40);
        BuffPick._label(panel, '本局增益 · 立刻生效 · 点卡片领取', 0, panelH / 2 - 78, 16, new Color(210, 190, 150, 255), panelW - 40);

        const cardW = 240;
        const cardH = 260;
        const spacing = 270;
        const startX = -((defs.length - 1) * spacing) / 2;
        const cardY = -8;
        defs.forEach((def, i) => {
            const cell = new Node(`B_${def.id}`);
            cell.layer = Layers.Enum.UI_2D;
            cell.setParent(panel);
            cell.setPosition(startX + i * spacing, cardY, 0);
            cell.addComponent(UITransform).setContentSize(cardW, cardH);
            const cg = cell.addComponent(Graphics);
            cg.fillColor = new Color(36, 28, 48, 255);
            cg.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 14); cg.fill();
            cg.strokeColor = new Color(230, 180, 90, 190);
            cg.lineWidth = 2.2;
            cg.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 14); cg.stroke();

            BuffPick._label(cell, def.emoji, 0, 72, 44, new Color(255, 255, 255, 255), cardW - 24);
            BuffPick._label(cell, def.name, 0, 18, 22, new Color(255, 235, 190, 255), cardW - 24);
            // 说明加亮加大，换行可读
            const desc = BuffPick._label(cell, def.desc, 0, -36, 16, new Color(230, 215, 185, 255), cardW - 36);
            desc.overflow = Label.Overflow.RESIZE_HEIGHT;
            desc.lineHeight = 22;
            desc.node.getComponent(UITransform)!.setContentSize(cardW - 36, 64);

            cell.on(Node.EventType.TOUCH_END, () => {
                if (!BuffPick._open) return;
                AudioManager.playUi();
                const tip = RunBuff.apply(def.id);
                eventBus.emit('show-tip', { text: tip });
                BuffPick.forceClose(canvas);
            });
        });

        const skip = new Node('Skip');
        skip.layer = Layers.Enum.UI_2D;
        skip.setParent(panel);
        skip.setPosition(0, -panelH / 2 + 40, 0);
        skip.addComponent(UITransform).setContentSize(160, 42);
        const sg = skip.addComponent(Graphics);
        sg.fillColor = new Color(50, 45, 60, 230);
        sg.roundRect(-80, -20, 160, 40, 10); sg.fill();
        BuffPick._label(skip, '放弃', 0, 0, 18, new Color(210, 200, 190, 255), 150);
        skip.on(Node.EventType.TOUCH_END, () => {
            AudioManager.playUi();
            eventBus.emit('show-tip', { text: '离开神龛' });
            BuffPick.forceClose(canvas);
        });
    }

    private static _label(
        parent: Node, text: string, x: number, y: number, size: number, color: Color, width = 220,
    ): Label {
        const n = new Node('L');
        n.layer = Layers.Enum.UI_2D;
        n.setParent(parent);
        n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(width, size + 12);
        const lb = n.addComponent(Label);
        lb.string = text;
        lb.fontSize = size;
        lb.color = color;
        lb.horizontalAlign = Label.HorizontalAlign.CENTER;
        lb.verticalAlign = Label.VerticalAlign.CENTER;
        lb.overflow = Label.Overflow.SHRINK;
        return lb;
    }
}
