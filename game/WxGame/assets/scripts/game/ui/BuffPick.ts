import { Node, Label, Color, UITransform, Graphics, BlockInputEvents, find, tween, Vec3 } from 'cc';
import { eventBus } from '../../core/EventBus';
import { GameFlow } from '../../core/GameFlow';
import { AudioManager } from '../../core/AudioManager';
import { RunBuff } from '../item/RunBuff';

/** #167 神龛三选一增益 */
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
        root.setParent(canvas);
        root.setPosition(0, 0, 0);
        root.setSiblingIndex(9999);
        root.addComponent(UITransform).setContentSize(1334, 750);
        root.addComponent(BlockInputEvents);

        const bg = root.addComponent(Graphics);
        bg.fillColor = new Color(10, 8, 18, 185);
        bg.rect(-667, -375, 1334, 750); bg.fill();

        const panel = new Node('Panel');
        panel.setParent(root);
        panel.setPosition(0, 20, 0);
        panel.setScale(0.9, 0.9, 1);
        panel.addComponent(UITransform).setContentSize(720, 360);
        const pg = panel.addComponent(Graphics);
        pg.fillColor = new Color(22, 18, 36, 250);
        pg.roundRect(-360, -180, 720, 360, 16); pg.fill();
        pg.strokeColor = new Color(220, 170, 80, 220);
        pg.lineWidth = 2.5;
        pg.roundRect(-360, -180, 720, 360, 16); pg.stroke();

        tween(panel).to(0.2, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();

        BuffPick._label(panel, '神龛赐福 · 三选一', 0, 140, 24, new Color(255, 220, 140, 255));
        BuffPick._label(panel, '本局增益 · 立刻生效', 0, 112, 13, new Color(180, 160, 120, 255));

        const spacing = 210;
        const startX = -((defs.length - 1) * spacing) / 2;
        defs.forEach((def, i) => {
            const cell = new Node(`B_${def.id}`);
            cell.setParent(panel);
            cell.setPosition(startX + i * spacing, -20, 0);
            cell.addComponent(UITransform).setContentSize(190, 220);
            const cg = cell.addComponent(Graphics);
            cg.fillColor = new Color(36, 28, 48, 255);
            cg.roundRect(-90, -100, 180, 200, 12); cg.fill();
            cg.strokeColor = new Color(230, 180, 90, 170);
            cg.lineWidth = 2;
            cg.roundRect(-90, -100, 180, 200, 12); cg.stroke();

            BuffPick._label(cell, def.emoji, 0, 48, 36, new Color(255, 255, 255, 255));
            BuffPick._label(cell, def.name, 0, 8, 16, new Color(255, 230, 180, 255));
            BuffPick._label(cell, def.desc, 0, -28, 12, new Color(170, 155, 130, 255));

            cell.on(Node.EventType.TOUCH_END, () => {
                if (!BuffPick._open) return;
                AudioManager.playUi();
                const tip = RunBuff.apply(def.id);
                eventBus.emit('show-tip', { text: tip });
                BuffPick.forceClose(canvas);
            });
        });

        const skip = new Node('Skip');
        skip.setParent(panel);
        skip.setPosition(0, -150, 0);
        skip.addComponent(UITransform).setContentSize(120, 36);
        const sg = skip.addComponent(Graphics);
        sg.fillColor = new Color(50, 45, 60, 220);
        sg.roundRect(-60, -16, 120, 32, 8); sg.fill();
        BuffPick._label(skip, '放弃', 0, 0, 14, new Color(180, 170, 160, 255));
        skip.on(Node.EventType.TOUCH_END, () => {
            AudioManager.playUi();
            eventBus.emit('show-tip', { text: '离开神龛' });
            BuffPick.forceClose(canvas);
        });
    }

    private static _label(parent: Node, text: string, x: number, y: number, size: number, color: Color) {
        const n = new Node('L');
        n.setParent(parent);
        n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(180, size + 8);
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
