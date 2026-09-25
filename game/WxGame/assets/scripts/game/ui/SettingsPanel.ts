import { Node, Label, Color, UITransform, Graphics, Layers, find } from 'cc';
import { GameManager } from '../../core/GameManager';
import { DEFAULT_SAVE } from '../../core/SaveData';
import { eventBus } from '../../core/EventBus';
import { RedeemUI } from './RedeemUI';
import {
    mountOverlay, makePanel, makeLabel, makeSubtitleBar, makeButton,
    paintRowCard, UiTone, softClose, overlayChromeY,
} from './UiChrome';

/**
 * SettingsPanel —— 局外设置页
 * 交互只绑 TOUCH_END（防桌面双触发）。
 */
export class SettingsPanel {
    private static _open = false;
    private static _clearArmed = false;
    private static _root: Node | null = null;

    static reset() {
        SettingsPanel._open = false;
        SettingsPanel._clearArmed = false;
        const orphan = SettingsPanel._root?.isValid
            ? SettingsPanel._root
            : find('Canvas/SettingsPanel');
        if (orphan?.isValid) orphan.destroy();
        SettingsPanel._root = null;
    }
    static get isOpen() { return SettingsPanel._open; }

    static show(canvas: Node) {
        const existing = canvas.getChildByName('SettingsPanel');
        if (existing) {
            if (SettingsPanel._open) return;
            existing.destroy();
        }
        SettingsPanel._open = true;
        SettingsPanel._clearArmed = false;

        const root = mountOverlay('SettingsPanel', canvas, 10003);
        SettingsPanel._root = root;

        const panel = makePanel(root, 'Panel', 680, 400, 0, 'amber');
        const { titleY, backY } = overlayChromeY(400);
        makeLabel(panel, '设置', 0, titleY, 22, UiTone.title, 320);

        const { bar: tipBar, label: tipLbl } = makeSubtitleBar(
            panel, '音效设置会写入本地存档', titleY - 30, 580,
        );

        const setTip = (text: string, ok: boolean) => {
            tipLbl.string = text;
            tipLbl.color = ok ? UiTone.ok : UiTone.warn;
            tipBar.setSiblingIndex(panel.children.length - 1);
        };

        const listHost = new Node('ListHost');
        listHost.layer = Layers.Enum.UI_2D;
        listHost.setParent(panel);
        listHost.setPosition(0, 20, 0);
        listHost.addComponent(UITransform).setContentSize(580, 180);

        const clearBtnHost = new Node('ClearHost');
        clearBtnHost.layer = Layers.Enum.UI_2D;
        clearBtnHost.setParent(panel);
        clearBtnHost.setPosition(130, backY + 52, 0);
        clearBtnHost.addComponent(UITransform).setContentSize(220, 44);

        makeButton(panel, '兑换码', -130, backY + 52, () => {
            SettingsPanel._clearArmed = false;
            RedeemUI.show(canvas);
        }, { w: 200, h: 44, color: new Color(80, 70, 50, 255), fontSize: 15 });

        const refresh = () => {
            const gm = GameManager.instance;
            const s = gm?.getSettings() ?? DEFAULT_SAVE.settings;
            const bgmOn = s.bgmVolume > 0;
            const sfxOn = s.sfxVolume > 0;
            const vibOn = !!s.vibration;

            const old = listHost.getChildByName('List');
            if (old) old.destroy();
            const list = new Node('List');
            list.layer = Layers.Enum.UI_2D;
            list.setParent(listHost);
            list.setPosition(0, 0, 0);

            const rows: Array<{ title: string; on: boolean; toggle: () => void }> = [
                {
                    title: '背景音乐 BGM',
                    on: bgmOn,
                    toggle: () => {
                        gm?.setBgmEnabled(!bgmOn);
                        setTip(bgmOn ? 'BGM 已关闭' : 'BGM 已开启', true);
                        refresh();
                    },
                },
                {
                    title: '音效 SFX',
                    on: sfxOn,
                    toggle: () => {
                        gm?.setSfxEnabled(!sfxOn);
                        setTip(sfxOn ? 'SFX 已关闭' : 'SFX 已开启', true);
                        refresh();
                    },
                },
                {
                    title: '震动反馈',
                    on: vibOn,
                    toggle: () => {
                        gm?.setVibration(!vibOn);
                        setTip(vibOn ? '震动已关闭' : '震动已开启', true);
                        refresh();
                    },
                },
            ];

            const cellW = 600;
            const cellH = 56;
            const gapY = 12;
            const startY = 72;

            rows.forEach((row, i) => {
                const y = startY - i * (cellH + gapY);
                const cell = new Node(`R_${i}`);
                cell.layer = Layers.Enum.UI_2D;
                cell.setParent(list);
                cell.setPosition(0, y, 0);
                cell.addComponent(UITransform).setContentSize(cellW, cellH);
                const cg = cell.addComponent(Graphics);
                paintRowCard(cg, cellW, cellH, false, i % 2 === 1);

                makeLabel(cell, row.title, -100, 0, 17, UiTone.body, 320);
                const toggle = makeButton(
                    cell,
                    row.on ? '开' : '关',
                    210, 0,
                    () => {
                        SettingsPanel._clearArmed = false;
                        row.toggle();
                    },
                    {
                        w: 100, h: 38,
                        color: row.on ? UiTone.btnGood : UiTone.btnGhost,
                        fontSize: 15,
                    },
                );
                toggle.setSiblingIndex(cell.children.length - 1);
            });

            const oldClear = clearBtnHost.getChildByName('ClearBtn');
            if (oldClear) oldClear.destroy();
            const armed = SettingsPanel._clearArmed;
            const clearBtn = makeButton(
                clearBtnHost,
                armed ? '再点确认清除' : '清除存档',
                0, 0,
                () => {
                    if (!SettingsPanel._clearArmed) {
                        SettingsPanel._clearArmed = true;
                        setTip('将清空灵魂 / 天赋 / 解锁 / 图鉴，请再点一次确认', false);
                        refresh();
                        return;
                    }
                    SettingsPanel._clearArmed = false;
                    const ok = GameManager.instance?.clearSave() ?? false;
                    if (ok) {
                        setTip('存档已清除，已回到初始状态', true);
                        eventBus.emit('show-tip', { text: '存档已清除' });
                    } else {
                        setTip('清除失败', false);
                    }
                    refresh();
                },
                {
                    w: 220, h: 46,
                    color: armed ? UiTone.btnDanger : new Color(110, 55, 70, 255),
                },
            );
            clearBtn.name = 'ClearBtn';

            tipBar.setSiblingIndex(panel.children.length - 1);
        };

        refresh();

        makeButton(panel, '返回主界面', 0, backY, () => {
            if (!SettingsPanel._open) return;
            SettingsPanel._open = false;
            SettingsPanel._clearArmed = false;
            SettingsPanel._root = null;
            eventBus.emit('lobby-input-lock', { ms: 500 });
            softClose(root);
        }, { w: 200, h: 42, color: UiTone.btn });

        tipBar.setSiblingIndex(panel.children.length - 1);
    }
}
