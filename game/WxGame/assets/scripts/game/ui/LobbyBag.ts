import {
    Node, Label, Color, UITransform, Graphics,
    Layers, find,
} from 'cc';
import { GameManager } from '../../core/GameManager';
import { ConfigStore } from '../../core/ConfigStore';
import { eventBus } from '../../core/EventBus';
import { AudioManager } from '../../core/AudioManager';
import { drawItemGlyph } from '../fx/ItemArt';
import {
    mountOverlay, makePanel, makeLabel, makeSubtitleBar, makeButton,
    paintChip, bindPress, UiTone, softClose, mountScrollArea, overlayChromeY,
} from './UiChrome';

const GRID_W = 480;
const GRID_H = 200;
const COLS = 4;
const CELL = 88;
const GAP = 10;
const PAD = 8;

/**
 * LobbyBag —— 大厅补给箱（SaveData.stash）
 */
export class LobbyBag {
    private static _open = false;
    private static _root: Node | null = null;

    static get isOpen() { return LobbyBag._open; }

    static reset() {
        LobbyBag._open = false;
        const n = LobbyBag._root?.isValid
            ? LobbyBag._root
            : find('Canvas/LobbyBag');
        if (n?.isValid) n.destroy();
        LobbyBag._root = null;
    }

    static show(canvas: Node) {
        if (LobbyBag._open && LobbyBag._root?.isValid) return;
        LobbyBag.reset();
        LobbyBag._open = true;

        const root = mountOverlay('LobbyBag', canvas, 10005);
        LobbyBag._root = root;

        const panel = makePanel(root, 'Panel', 600, 400, 0, 'amber');
        const { titleY, backY } = overlayChromeY(400);
        makeLabel(panel, '补给箱', 0, titleY, 22, UiTone.title, 320);
        const { label: tip } = makeSubtitleBar(
            panel, '商店补给存于此 · 开战自动装进局内背包', titleY - 28, 540,
        );

        const listHost = new Node('ListHost');
        listHost.layer = Layers.Enum.UI_2D;
        listHost.setParent(panel);
        listHost.setPosition(0, -4, 0);
        const { content, contentUI } = mountScrollArea(listHost, {
            w: GRID_W, h: GRID_H, vertical: true,
        });

        const detailLbl = makeLabel(
            panel, '点格子查看介绍', 0, backY + 36, 12, UiTone.muted, 520,
        ).getComponent(Label)!;

        const paint = () => {
            content.removeAllChildren();
            const stash = GameManager.instance?.save.stash ?? {};
            const entries = Object.keys(stash)
                .map(id => ({ id, count: Math.max(0, Math.floor(stash[id] ?? 0)) }))
                .filter(e => e.count > 0)
                .sort((a, b) => a.id.localeCompare(b.id));

            tip.string = entries.length
                ? `共 ${entries.reduce((n, e) => n + e.count, 0)} 件 · ${entries.length} 种`
                : '补给箱空空如也 · 去商店补给页购买';

            const rows = Math.max(1, Math.ceil(Math.max(entries.length, COLS) / COLS));
            const contentH = Math.max(
                GRID_H,
                PAD * 2 + rows * CELL + Math.max(0, rows - 1) * GAP,
            );
            contentUI.setContentSize(GRID_W, contentH);
            content.setPosition(0, GRID_H / 2, 0);

            const span = COLS * CELL + (COLS - 1) * GAP;
            const showCount = entries.length > 0 ? entries.length : COLS;

            for (let i = 0; i < showCount; i++) {
                const e = entries[i];
                const col = i % COLS;
                const row = Math.floor(i / COLS);
                const x = -span / 2 + CELL / 2 + col * (CELL + GAP);
                const y = -PAD - CELL / 2 - row * (CELL + GAP);

                const cell = new Node(e ? `S_${e.id}` : `Empty_${i}`);
                cell.layer = Layers.Enum.UI_2D;
                cell.setParent(content);
                cell.setPosition(x, y, 0);
                cell.addComponent(UITransform).setContentSize(CELL, CELL);
                const cg = cell.addComponent(Graphics);
                paintChip(cg, CELL, CELL, false, !e);

                if (!e) {
                    makeLabel(cell, '空', 0, 0, 14, new Color(100, 90, 80, 180), CELL - 8);
                    continue;
                }

                const it = ConfigStore.item(e.id);
                const thumb = new Node('Thumb');
                thumb.layer = Layers.Enum.UI_2D;
                thumb.setParent(cell);
                thumb.setPosition(0, 12, 0);
                thumb.addComponent(UITransform).setContentSize(64, 64);
                if (it) {
                    drawItemGlyph(thumb.addComponent(Graphics), it, 40);
                } else {
                    makeLabel(thumb, '?', 0, 0, 28, UiTone.body, 40);
                }

                makeLabel(cell, it?.name ?? e.id, 0, -32, 12, UiTone.body, CELL - 10);
                makeLabel(cell, `×${e.count}`, 0, -48, 13, UiTone.ok, CELL - 10);

                bindPress(cell, () => {
                    AudioManager.playUi();
                    const kind = it?.kind === 'heal' ? '回复'
                        : it?.kind === 'throw' ? '投掷'
                        : it?.kind === 'buff' ? '增益' : '道具';
                    detailLbl.string = it
                        ? `${it.emoji} ${it.name} ×${e.count} · ${kind} · ${it.desc}`
                        : `${e.id} ×${e.count}`;
                });
            }
        };

        paint();

        makeButton(panel, '返回', 0, backY, () => {
            LobbyBag._open = false;
            LobbyBag._root = null;
            eventBus.emit('lobby-input-lock', { ms: 400 });
            eventBus.emit('stash-changed', {});
            softClose(root);
        }, { w: 160, h: 42, color: UiTone.btn });
    }

    static totalCount(): number {
        const stash = GameManager.instance?.save.stash ?? {};
        let n = 0;
        for (const id of Object.keys(stash)) {
            n += Math.max(0, Math.floor(stash[id] ?? 0));
        }
        return n;
    }
}
