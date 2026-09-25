import { Node, Label, Color, UITransform, Graphics, BlockInputEvents, find, tween, Vec3 } from 'cc';
import { eventBus } from '../../core/EventBus';
import { getTalent, formatTalentPerLevel, formatTalentAtLevel } from '../../core/TalentData';
import { GameFlow } from '../../core/GameFlow';
import { AudioManager } from '../../core/AudioManager';
import { RunTalent } from '../item/RunTalent';

/**
 * F4 局内三选一天赋 —— 清怪商店关闭后弹出；免费选一；可跳过。
 * 不改 Player 世界坐标；遮罩挡输入。
 */
export class TalentPick {
    private static _open = false;

    static get isOpen() { return TalentPick._open; }

    static forceClose(canvas?: Node | null) {
        TalentPick._open = false;
        GameFlow.setCombatFrozen(false);
        const host = canvas ?? find('Canvas');
        const n = host?.getChildByName('TalentPick');
        if (n?.isValid) n.destroy();
    }

    /** 无可选天赋时直接跳过 */
    static show(canvas: Node) {
        if (TalentPick._open) return;
        const ids = TalentPick._drawThree();
        if (ids.length === 0) {
            GameFlow.setCombatFrozen(false);
            return;
        }

        TalentPick._open = true;
        GameFlow.setCombatFrozen(true);

        const root = new Node('TalentPick');
        root.setParent(canvas);
        root.setPosition(0, 0, 0);
        root.setSiblingIndex(9999);
        root.addComponent(UITransform).setContentSize(1334, 750);
        root.addComponent(BlockInputEvents);

        const bg = root.addComponent(Graphics);
        bg.fillColor = new Color(6, 8, 14, 180);
        bg.rect(-667, -375, 1334, 750); bg.fill();

        const panel = new Node('Panel');
        panel.setParent(root);
        panel.setPosition(0, 16, 0);
        panel.setScale(0.88, 0.88, 1);
        panel.addComponent(UITransform).setContentSize(760, 400);
        const pg = panel.addComponent(Graphics);
        pg.fillColor = new Color(18, 22, 36, 250);
        pg.roundRect(-380, -200, 760, 400, 18); pg.fill();
        pg.strokeColor = new Color(120, 160, 255, 220);
        pg.lineWidth = 2.5;
        pg.roundRect(-380, -200, 760, 400, 18); pg.stroke();
        pg.fillColor = new Color(80, 120, 220, 45);
        pg.roundRect(-360, 140, 720, 36, 10); pg.fill();

        tween(panel).to(0.2, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();

        TalentPick._label(panel, '天赋觉醒 · 三选一', 0, 158, 26, new Color(200, 220, 255, 255));
        TalentPick._label(panel, '本局大幅强化 · 立刻体感 · 不耗灵魂石', 0, 128, 14, new Color(150, 170, 210, 255));

        const spacing = 230;
        const startX = -((ids.length - 1) * spacing) / 2;
        ids.forEach((id, i) => {
            const def = getTalent(id)!;
            const lv = RunTalent.levelOf(id);
            const cell = new Node(`C_${id}`);
            cell.setParent(panel);
            cell.setPosition(startX + i * spacing, -10, 0);
            cell.addComponent(UITransform).setContentSize(200, 240);
            const cg = cell.addComponent(Graphics);
            cg.fillColor = new Color(28, 34, 52, 255);
            cg.roundRect(-96, -112, 192, 224, 14); cg.fill();
            cg.strokeColor = new Color(140, 170, 255, 160);
            cg.lineWidth = 2;
            cg.roundRect(-96, -112, 192, 224, 14); cg.stroke();

            // 缩略圆
            const thumb = new Node('T');
            thumb.setParent(cell);
            thumb.setPosition(0, 62, 0);
            thumb.addComponent(UITransform).setContentSize(72, 72);
            const tg = thumb.addComponent(Graphics);
            tg.fillColor = new Color(40, 50, 80, 255);
            tg.circle(0, 0, 30); tg.fill();
            tg.strokeColor = new Color(160, 190, 255, 180);
            tg.lineWidth = 2;
            tg.circle(0, 0, 30); tg.stroke();
            TalentPick._label(thumb, def.emoji, 0, 0, 28, new Color(255, 255, 255, 255));

            TalentPick._label(cell, def.name, 0, 22, 16, new Color(230, 235, 255, 255));
            TalentPick._label(cell, formatTalentPerLevel(def), 0, -2, 11, new Color(150, 165, 200, 255));
            TalentPick._label(
                cell,
                `本局 Lv.${lv}→${lv + 1}`,
                0, -28, 12, new Color(180, 200, 255, 255),
            );
            TalentPick._label(
                cell,
                formatTalentAtLevel(def, lv + 1),
                0, -48, 11, new Color(160, 190, 140, 255),
            );

            const pick = TalentPick._btn(cell, '觉醒', 0, -78, 110, 30, new Color(50, 70, 140, 255));
            pick.on(Node.EventType.TOUCH_END, () => {
                AudioManager.playUi();
                const r = RunTalent.pick(id);
                if (r.ok) {
                    const gain = formatTalentPerLevel(def);
                    eventBus.emit('show-tip', { text: `✨ ${r.tip}（${gain}）` });
                    eventBus.emit('player-stats-changed', {});
                }
                tween(cell)
                    .to(0.1, { scale: new Vec3(1.08, 1.08, 1) })
                    .to(0.1, { scale: new Vec3(0.9, 0.9, 1) })
                    .call(() => TalentPick._finish(root))
                    .start();
            });
        });

        const skip = TalentPick._btn(panel, '跳过', 0, -168, 160, 32, new Color(40, 48, 70, 255));
        skip.on(Node.EventType.TOUCH_END, () => {
            AudioManager.playUi();
            TalentPick._finish(root);
        });
    }

    private static _finish(root: Node) {
        if (root.isValid) root.destroy();
        TalentPick._open = false;
        GameFlow.setCombatFrozen(false);
    }

    private static _drawThree(): string[] {
        const pool = RunTalent.eligibleIds();
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
        }
        return pool.slice(0, Math.min(3, pool.length));
    }

    private static _label(parent: Node, text: string, x: number, y: number,
                          size: number, color: Color) {
        const n = new Node('L');
        n.setParent(parent);
        n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(180, size + 10);
        const lbl = n.addComponent(Label);
        lbl.string = text;
        lbl.fontSize = size;
        lbl.color = color;
        lbl.horizontalAlign = 1;
        lbl.overflow = 0;
        return n;
    }

    private static _btn(parent: Node, text: string, x: number, y: number,
                        w: number, h: number, color: Color): Node {
        const n = new Node('B');
        n.setParent(parent);
        n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(w, h);
        const g = n.addComponent(Graphics);
        g.fillColor = color;
        g.roundRect(-w / 2, -h / 2, w, h, 8); g.fill();
        g.strokeColor = new Color(180, 200, 255, 120);
        g.lineWidth = 1.5;
        g.roundRect(-w / 2, -h / 2, w, h, 8); g.stroke();
        TalentPick._label(n, text, 0, 0, 15, new Color(240, 245, 255, 255));
        return n;
    }
}
