import { Node, Label, Color, UITransform, Graphics, BlockInputEvents, find, tween, Vec3 } from 'cc';
import { GameFlow } from '../../core/GameFlow';
import { AudioManager } from '../../core/AudioManager';
import { drawWeaponGlyph } from '../fx/WeaponArt';
import { rarityColor, rarityLabel } from '../weapon/WeaponRarity';
import type { WeaponDef, WeaponType } from '../weapon/WeaponController';

/**
 * #161 满两把再拾取：弹出替换选择（点哪把就换哪把；可取消留下地面武）
 */
export class WeaponReplaceUI {
    private static _open = false;

    static get isOpen() { return WeaponReplaceUI._open; }

    static forceClose(canvas?: Node | null) {
        WeaponReplaceUI._open = false;
        GameFlow.setCombatFrozen(false);
        const host = canvas ?? find('Canvas');
        const n = host?.getChildByName('WeaponReplaceUI');
        if (n?.isValid) n.destroy();
    }

    static show(opts: {
        canvas: Node;
        incoming: WeaponDef;
        slots: WeaponDef[];
        onReplace: (oldId: WeaponType) => void;
        onCancel: () => void;
    }) {
        if (WeaponReplaceUI._open) return;
        if (opts.slots.length < 1) {
            opts.onCancel();
            return;
        }

        WeaponReplaceUI._open = true;
        GameFlow.setCombatFrozen(true);

        const root = new Node('WeaponReplaceUI');
        root.setParent(opts.canvas);
        root.setPosition(0, 0, 0);
        root.setSiblingIndex(10000);
        root.addComponent(UITransform).setContentSize(1334, 750);
        root.addComponent(BlockInputEvents);

        const bg = root.addComponent(Graphics);
        bg.fillColor = new Color(6, 8, 14, 190);
        bg.rect(-667, -375, 1334, 750); bg.fill();

        const panel = new Node('Panel');
        panel.setParent(root);
        panel.setPosition(0, 20, 0);
        panel.setScale(0.9, 0.9, 1);
        panel.addComponent(UITransform).setContentSize(640, 360);
        const pg = panel.addComponent(Graphics);
        pg.fillColor = new Color(22, 18, 14, 250);
        pg.roundRect(-320, -180, 640, 360, 16); pg.fill();
        pg.strokeColor = new Color(210, 160, 70, 200);
        pg.lineWidth = 2;
        pg.roundRect(-320, -180, 640, 360, 16); pg.stroke();
        tween(panel).to(0.18, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();

        WeaponReplaceUI._lbl(panel, '武器已满 · 选择替换', 0, 148, 22, new Color(255, 230, 180, 255), 560);
        WeaponReplaceUI._lbl(panel, '点要放下的那一把；取消则不拾取', 0, 118, 13, new Color(160, 145, 125, 255), 560);

        // 新武器预览
        const neu = new Node('New');
        neu.setParent(panel);
        neu.setPosition(0, 55, 0);
        neu.addComponent(UITransform).setContentSize(200, 88);
        const ng = neu.addComponent(Graphics);
        const ncol = rarityColor(opts.incoming.rarity);
        ng.fillColor = new Color(40, 32, 22, 255);
        ng.roundRect(-100, -44, 200, 88, 12); ng.fill();
        ng.strokeColor = ncol;
        ng.lineWidth = 2;
        ng.roundRect(-100, -44, 200, 88, 12); ng.stroke();
        const nThumb = new Node('T');
        nThumb.setParent(neu);
        nThumb.setPosition(-60, 0, 0);
        nThumb.addComponent(UITransform).setContentSize(48, 48);
        drawWeaponGlyph(nThumb.addComponent(Graphics), opts.incoming.id, 28);
        WeaponReplaceUI._lbl(neu, `新 · ${opts.incoming.name}`, 30, 12, 14, new Color(255, 245, 230, 255), 130);
        WeaponReplaceUI._lbl(
            neu,
            `[${rarityLabel(opts.incoming.rarity)}] 伤${opts.incoming.damage}`,
            30, -12, 12, ncol, 130,
        );

        // 两把已有 → 点选替换
        const span = opts.slots.length === 1 ? 0 : 150;
        opts.slots.forEach((slot, i) => {
            const x = opts.slots.length === 1 ? 0 : (i === 0 ? -span : span);
            const cell = new Node(`S_${slot.id}`);
            cell.setParent(panel);
            cell.setPosition(x, -55, 0);
            cell.addComponent(UITransform).setContentSize(160, 120);
            const cg = cell.addComponent(Graphics);
            const scol = rarityColor(slot.rarity);
            cg.fillColor = new Color(36, 28, 20, 255);
            cg.roundRect(-80, -60, 160, 120, 12); cg.fill();
            cg.strokeColor = scol;
            cg.lineWidth = 2;
            cg.roundRect(-80, -60, 160, 120, 12); cg.stroke();

            const thumb = new Node('T');
            thumb.setParent(cell);
            thumb.setPosition(0, 22, 0);
            thumb.addComponent(UITransform).setContentSize(48, 48);
            drawWeaponGlyph(thumb.addComponent(Graphics), slot.id, 30);
            WeaponReplaceUI._lbl(cell, slot.name, 0, -12, 13, new Color(255, 240, 220, 255), 140);
            WeaponReplaceUI._lbl(cell, `放下 · [${rarityLabel(slot.rarity)}]`, 0, -34, 11, scol, 140);

            cell.on(Node.EventType.TOUCH_END, () => {
                AudioManager.playUi();
                WeaponReplaceUI._finish(root);
                opts.onReplace(slot.id);
            });
        });

        const cancel = WeaponReplaceUI._btn(panel, '取消', 0, -148, 140, 34, new Color(50, 40, 30, 255));
        cancel.on(Node.EventType.TOUCH_END, () => {
            AudioManager.playUi();
            WeaponReplaceUI._finish(root);
            opts.onCancel();
        });
    }

    private static _finish(root: Node) {
        if (root.isValid) root.destroy();
        WeaponReplaceUI._open = false;
        GameFlow.setCombatFrozen(false);
    }

    private static _lbl(p: Node, t: string, x: number, y: number, s: number, c: Color, w: number) {
        const n = new Node('L');
        n.setParent(p);
        n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(w, Math.ceil(s * 1.55));
        const l = n.addComponent(Label);
        l.string = t; l.fontSize = s; l.color = c;
        l.horizontalAlign = 1; l.verticalAlign = 1;
        l.overflow = Label.Overflow.CLAMP;
        return n;
    }

    private static _btn(p: Node, t: string, x: number, y: number, w: number, h: number, c: Color): Node {
        const n = new Node('B');
        n.setParent(p);
        n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(w, h);
        const g = n.addComponent(Graphics);
        g.fillColor = c;
        g.roundRect(-w / 2, -h / 2, w, h, 8); g.fill();
        g.strokeColor = new Color(160, 130, 90, 120);
        g.lineWidth = 1.4;
        g.roundRect(-w / 2, -h / 2, w, h, 8); g.stroke();
        WeaponReplaceUI._lbl(n, t, 0, 0, 14, new Color(255, 245, 230, 255), w - 12);
        return n;
    }
}
