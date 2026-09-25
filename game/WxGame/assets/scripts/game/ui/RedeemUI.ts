import {
    Node, Label, Color, UITransform, Graphics, Layers, find,
    EditBox, Overflow, HorizontalTextAlignment, VerticalTextAlignment,
} from 'cc';
import { GameManager } from '../../core/GameManager';
import { ConfigStore } from '../../core/ConfigStore';
import { getCharacter } from '../../core/CharacterData';
import { type RedeemReward, REDEEM_CODES } from '../../core/RedeemCodes';
import { drawItemGlyph } from '../fx/ItemArt';
import { CharacterRig } from '../fx/CharacterRig';
import { eventBus } from '../../core/EventBus';
import {
    mountOverlay, makePanel, makeLabel, makeButton,
    UiTone, softClose, overlayChromeY,
} from './UiChrome';

/**
 * #186 兑换码弹窗：输入 → 到账 → 成功缩略展示。
 */
export class RedeemUI {
    private static _open = false;
    private static _root: Node | null = null;

    static get isOpen() { return RedeemUI._open; }

    static reset() {
        RedeemUI._open = false;
        const orphan = RedeemUI._root?.isValid
            ? RedeemUI._root
            : find('Canvas/RedeemUI');
        if (orphan?.isValid) orphan.destroy();
        RedeemUI._root = null;
    }

    static show(canvas: Node) {
        const existing = canvas.getChildByName('RedeemUI');
        if (existing) {
            if (RedeemUI._open) return;
            existing.destroy();
        }
        RedeemUI._open = true;

        const root = mountOverlay('RedeemUI', canvas, 10006);
        RedeemUI._root = root;

        const panel = makePanel(root, 'Panel', 560, 360, 0, 'amber');
        const { titleY, backY } = overlayChromeY(360);
        makeLabel(panel, '兑换码', 0, titleY, 22, UiTone.title, 300);
        makeLabel(panel, '输入兑换码领取奖励（每码限兑一次）', 0, titleY - 28, 12, UiTone.muted, 480);

        // 输入框底
        const inputHost = new Node('InputHost');
        inputHost.layer = Layers.Enum.UI_2D;
        inputHost.setParent(panel);
        inputHost.setPosition(0, 70, 0);
        inputHost.addComponent(UITransform).setContentSize(420, 48);
        const ig = inputHost.addComponent(Graphics);
        ig.fillColor = new Color(22, 18, 14, 255);
        ig.roundRect(-210, -24, 420, 48, 10); ig.fill();
        ig.strokeColor = new Color(160, 130, 90, 160);
        ig.lineWidth = 1.4;
        ig.roundRect(-210, -24, 420, 48, 10); ig.stroke();

        const editNode = new Node('Edit');
        editNode.layer = Layers.Enum.UI_2D;
        editNode.setParent(inputHost);
        editNode.setPosition(0, 0, 0);
        editNode.addComponent(UITransform).setContentSize(400, 40);

        const textLabNode = new Node('TEXT_LABEL');
        textLabNode.layer = Layers.Enum.UI_2D;
        textLabNode.setParent(editNode);
        textLabNode.addComponent(UITransform).setContentSize(400, 36);
        const textLab = textLabNode.addComponent(Label);
        textLab.string = '';
        textLab.fontSize = 18;
        textLab.color = new Color(255, 240, 220, 255);
        textLab.horizontalAlign = HorizontalTextAlignment.CENTER;
        textLab.verticalAlign = VerticalTextAlignment.CENTER;
        textLab.overflow = Overflow.CLAMP;

        const phNode = new Node('PLACEHOLDER_LABEL');
        phNode.layer = Layers.Enum.UI_2D;
        phNode.setParent(editNode);
        phNode.addComponent(UITransform).setContentSize(400, 36);
        const phLab = phNode.addComponent(Label);
        phLab.string = '例如 WELCOME';
        phLab.fontSize = 16;
        phLab.color = new Color(140, 120, 100, 200);
        phLab.horizontalAlign = HorizontalTextAlignment.CENTER;
        phLab.verticalAlign = VerticalTextAlignment.CENTER;

        const edit = editNode.addComponent(EditBox);
        edit.string = '';
        edit.maxLength = 16;
        edit.inputMode = EditBox.InputMode.SINGLE_LINE;
        edit.inputFlag = EditBox.InputFlag.SENSITIVE;
        edit.returnType = EditBox.KeyboardReturnType.DONE;
        edit.textLabel = textLab;
        edit.placeholderLabel = phLab;
        edit.placeholder = '例如 WELCOME';

        const tipNode = makeLabel(panel, '', 0, 28, 12, UiTone.muted, 480);
        const tipLbl = tipNode.getComponent(Label)!;

        // 快捷样例（方便试玩）
        makeLabel(panel, '试玩码', 0, -8, 11, UiTone.muted, 200);
        const samples = REDEEM_CODES.slice(0, 4);
        samples.forEach((c, i) => {
            const x = -165 + i * 110;
            makeButton(panel, c.code, x, -42, () => {
                edit.string = c.code;
                textLab.string = c.code;
                phNode.active = false;
                tipLbl.string = c.title;
                tipLbl.color = UiTone.accent;
            }, { w: 100, h: 32, color: new Color(70, 55, 40, 255), fontSize: 12 });
        });

        makeButton(panel, '兑换', 0, backY + 52, () => {
            const raw = (edit.string || textLab.string || '').trim();
            tipLbl.string = '兑换中…';
            tipLbl.color = UiTone.muted;
            void (async () => {
                const r = await GameManager.instance?.tryRedeemCodeAsync(raw);
                if (!r?.ok) {
                    tipLbl.string = r?.reason ?? '兑换失败';
                    tipLbl.color = UiTone.warn;
                    return;
                }
                tipLbl.string = '';
                RedeemUI._showResult(canvas, r.title ?? '兑换成功', r.rewards ?? []);
                RedeemUI._close(root);
            })();
        }, { w: 160, h: 42, color: UiTone.btnGood, fontSize: 16 });

        makeButton(panel, '返回', 0, backY, () => {
            RedeemUI._close(root);
        }, { w: 160, h: 40, color: UiTone.btn });
    }

    private static _close(root: Node) {
        if (!RedeemUI._open) return;
        RedeemUI._open = false;
        RedeemUI._root = null;
        eventBus.emit('lobby-input-lock', { ms: 400 });
        softClose(root);
    }

    /** 成功弹窗：缩略图 + 名称 + 数量 */
    private static _showResult(canvas: Node, title: string, rewards: RedeemReward[]) {
        const root = mountOverlay('RedeemResult', canvas, 10007);
        const panel = makePanel(root, 'Panel', 520, 300, 0, 'amber');
        const { titleY, backY } = overlayChromeY(300);
        makeLabel(panel, '兑换成功', 0, titleY, 22, UiTone.title, 280);
        makeLabel(panel, title, 0, titleY - 28, 14, UiTone.ok, 400);

        const row = new Node('Rewards');
        row.layer = Layers.Enum.UI_2D;
        row.setParent(panel);
        row.setPosition(0, 10, 0);
        row.addComponent(UITransform).setContentSize(460, 120);

        const n = Math.max(1, rewards.length);
        const gap = 100;
        const startX = -((n - 1) * gap) / 2;
        rewards.forEach((r, i) => {
            const cell = new Node(`R_${i}`);
            cell.layer = Layers.Enum.UI_2D;
            cell.setParent(row);
            cell.setPosition(startX + i * gap, 0, 0);
            cell.addComponent(UITransform).setContentSize(88, 110);
            const bg = cell.addComponent(Graphics);
            bg.fillColor = new Color(28, 22, 18, 255);
            bg.roundRect(-40, -48, 80, 100, 10); bg.fill();
            bg.strokeColor = new Color(160, 130, 90, 120);
            bg.lineWidth = 1.2;
            bg.roundRect(-40, -48, 80, 100, 10); bg.stroke();

            const art = new Node('Art');
            art.layer = Layers.Enum.UI_2D;
            art.setParent(cell);
            art.setPosition(0, 18, 0);
            art.addComponent(UITransform).setContentSize(48, 48);
            const g = art.addComponent(Graphics);

            let name = '';
            let qty = '';
            if (r.kind === 'soul') {
                g.fillColor = new Color(120, 200, 255, 255);
                g.circle(0, 0, 14); g.fill();
                g.fillColor = new Color(200, 240, 255, 255);
                g.circle(-4, 4, 4); g.fill();
                name = '灵魂石';
                qty = `×${r.amount}`;
            } else if (r.kind === 'item') {
                const it = ConfigStore.item(r.itemId);
                if (it) drawItemGlyph(g, it, 28);
                name = it?.name ?? r.itemId;
                qty = `×${r.amount}`;
            } else {
                const ch = getCharacter(r.characterId);
                CharacterRig.mount(art, ch?.skinId || r.characterId, false);
                art.setScale(0.55, 0.55, 1);
                name = ch?.name ?? r.characterId;
                qty = '解锁';
            }
            makeLabel(cell, name, 0, -22, 11, UiTone.body, 76);
            makeLabel(cell, qty, 0, -38, 12, UiTone.accent, 76);
        });

        makeButton(panel, '好的', 0, backY, () => {
            eventBus.emit('lobby-input-lock', { ms: 400 });
            softClose(root);
        }, { w: 160, h: 40, color: UiTone.btn });
    }
}
