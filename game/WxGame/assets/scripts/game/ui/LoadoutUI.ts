import {
    Node, Label, Color, UITransform, Graphics, Layers, find,
    tween, Vec3, ScrollView,
} from 'cc';
import { GameManager } from '../../core/GameManager';
import { listCharacters } from '../../core/CharacterData';
import { ConfigStore } from '../../core/ConfigStore';
import { isWeaponType } from '../weapon/WeaponController';
import { drawWeaponGlyph } from '../fx/WeaponArt';
import { CharacterRig } from '../fx/CharacterRig';
import { IdleBreath } from '../fx/IdleBreath';
import { eventBus } from '../../core/EventBus';
import { AudioManager } from '../../core/AudioManager';
import {
    mountOverlay, makePanel, makeLabel, makeSubtitleBar, makeButton,
    paintChip, bindPress, UiTone, softClose, mountScrollArea, OverlaySafe,
    overlayChromeY,
} from './UiChrome';

const PANEL_W = OverlaySafe.maxW;
const PANEL_H = OverlaySafe.maxH;
/** 行高：宫格含图标+名称，Mask 不得裁字 */
const ROW_H = 82;
/** 角色/武器同尺寸宫格（对齐图鉴规格） */
const CELL_W = 62;
const CELL_H = 74;
const GAP = 8;
const ROW_W = 660;
/** 左侧「角色/武器」标签列宽 */
const LABEL_COL = 44;
const SCROLL_W = ROW_W - LABEL_COL - 8;
const PREVIEW_H = 108;

/**
 * LoadoutUI —— 备战：上预览角+武，下两行同尺寸横滑宫格。
 * 布局须落在 OverlaySafe 内；名称完整落在 Mask 内。
 */
export class LoadoutUI {
    private static _open = false;
    private static _root: Node | null = null;

    static get isOpen() { return LoadoutUI._open; }

    static reset() {
        LoadoutUI._open = false;
        const n = LoadoutUI._root?.isValid
            ? LoadoutUI._root
            : find('Canvas/LoadoutUI');
        if (n?.isValid) n.destroy();
        LoadoutUI._root = null;
    }

    static show(canvas: Node) {
        if (LoadoutUI._open && LoadoutUI._root?.isValid) return;
        LoadoutUI.reset();
        LoadoutUI._open = true;

        const root = mountOverlay('LoadoutUI', canvas, 10002);
        LoadoutUI._root = root;

        const panel = makePanel(root, 'Panel', PANEL_W, PANEL_H, 0, 'amber');
        const { titleY, backY } = overlayChromeY(PANEL_H);
        makeLabel(panel, '备战', 0, titleY, 22, UiTone.title, 320);
        const tipY = titleY - 28;
        const { bar: tipBar, label: tip } = makeSubtitleBar(
            panel, '选角色 · 开局自带专武 · 其余武器局内掉落（最多带 2 把）', tipY, 640,
        );

        // tip 条高 28，底边 = tipY-14；预览顶必须在 tip 底之下，禁止 Math.max 强行抬高盖字
        const tipBot = tipY - 14;
        const weapY = backY + 64;
        const charY = weapY + ROW_H + 10;
        const previewBot = charY + ROW_H / 2 + 10;
        const gapTip = 10;
        const availH = tipBot - gapTip - previewBot;
        const previewH = Math.min(PREVIEW_H, Math.max(70, availH));
        const previewCy = previewBot + previewH / 2;

        const preview = new Node('Preview');
        preview.layer = Layers.Enum.UI_2D;
        preview.setParent(panel);
        preview.setPosition(0, previewCy, 0);
        preview.addComponent(UITransform).setContentSize(ROW_W, previewH);
        const pg = preview.addComponent(Graphics);
        pg.fillColor = new Color(36, 30, 24, 255);
        pg.roundRect(-ROW_W / 2, -previewH / 2, ROW_W, previewH, 10); pg.fill();
        pg.strokeColor = new Color(140, 115, 85, 120);
        pg.lineWidth = 1.2;
        pg.roundRect(-ROW_W / 2, -previewH / 2, ROW_W, previewH, 10); pg.stroke();

        const portraitHost = new Node('Portrait');
        portraitHost.layer = Layers.Enum.UI_2D;
        portraitHost.setParent(preview);
        portraitHost.setPosition(-190, 2, 0);
        portraitHost.addComponent(UITransform).setContentSize(90, previewH - 12);

        const weaponHost = new Node('WeaponHold');
        weaponHost.layer = Layers.Enum.UI_2D;
        weaponHost.setParent(preview);
        weaponHost.setPosition(-110, 4, 0);
        weaponHost.addComponent(UITransform).setContentSize(44, 44);

        const infoHost = new Node('Info');
        infoHost.layer = Layers.Enum.UI_2D;
        infoHost.setParent(preview);
        infoHost.setPosition(120, 0, 0);
        infoHost.addComponent(UITransform).setContentSize(380, previewH - 8);

        const rowX = LABEL_COL / 2;
        const labelX = -ROW_W / 2 + LABEL_COL / 2;
        const charRow = LoadoutUI._hRow(panel, 'CharRow', rowX, charY, SCROLL_W, ROW_H);
        const weapRow = LoadoutUI._hRow(panel, 'WeapRow', rowX, weapY, SCROLL_W, ROW_H);
        makeLabel(panel, '角色', labelX, charY, 12, UiTone.muted, LABEL_COL);
        makeLabel(panel, '武器', labelX, weapY, 12, UiTone.muted, LABEL_COL);

        // tip 压在预览之上
        tipBar.setSiblingIndex(panel.children.length - 1);

        const paintPreview = (strike = false) => {
            portraitHost.removeAllChildren();
            weaponHost.removeAllChildren();
            infoHost.removeAllChildren();
            const gm = GameManager.instance;
            const cid = gm?.selectedCharacterId ?? 'knight';
            const wid = gm?.selectedWeaponId ?? 'sword';
            const chars = listCharacters();
            const ch = chars.find(c => c.id === cid) ?? chars[0];
            const wdef = ConfigStore.weapon(wid);

            const body = new Node('Body');
            body.layer = Layers.Enum.UI_2D;
            body.setParent(portraitHost);
            body.setPosition(0, 0, 0);
            body.addComponent(UITransform).setContentSize(100, 120);
            body.addComponent(Graphics);
            // #181 精致 Rig + 轻呼吸（宫格缩略仍静态）
            CharacterRig.mount(body, ch?.skinId || cid, true);
            const breath = body.addComponent(IdleBreath);
            breath.kind = 'portrait';
            breath.skinId = ch?.skinId || cid;
            breath.baseScale = 1.2;
            body.setScale(1.2, 1.2, 1);
            if (strike) breath.strike(1, 0);

            const wg = weaponHost.getComponent(Graphics) ?? weaponHost.addComponent(Graphics);
            wg.clear();
            if (isWeaponType(wid)) drawWeaponGlyph(wg, wid, 30);
            else makeLabel(weaponHost, wdef?.emoji ?? '🗡️', 0, 0, 24, UiTone.body, 56);

            weaponHost.setScale(0.85, 0.85, 1);
            tween(weaponHost)
                .to(0.12, { scale: new Vec3(1.12, 1.12, 1) })
                .to(0.1, { scale: new Vec3(1, 1, 1) })
                .start();

            makeLabel(infoHost, ch?.name ?? cid, 0, 30, 16, UiTone.title, 360);
            makeLabel(infoHost, ch?.desc ?? '', 0, 10, 11, UiTone.muted, 360);
            makeLabel(
                infoHost,
                `${wdef?.emoji ?? ''} ${wdef?.name ?? wid}`,
                0, -10, 13, UiTone.accent, 360,
            );
            const owner = wdef?.ownerCharacterId;
            makeLabel(
                infoHost,
                owner
                    ? `专属 · 仅${listCharacters().find(c => c.id === owner)?.name ?? owner}可用`
                    : (wdef?.description ?? '共享 · 任意角色可装备'),
                0, -30, 11, UiTone.muted, 360,
            );
            tip.string = `出战：${ch?.name ?? cid} + ${wdef?.name ?? wid} · 开战默认装备（局内可再切）`;
            tipBar.setSiblingIndex(panel.children.length - 1);
        };

        // 重绘行时保留玩家滑到的位置（点后面的角色不能自动弹回最左）
        const keepPx = (row: { scroll: ScrollView }) => Math.abs(row.scroll.getScrollOffset().x);
        const restorePx = (row: { scroll: ScrollView }, px: number, first: boolean) => {
            row.scroll.stopAutoScroll();
            const max = row.scroll.getMaxScrollOffset().x;
            if (first || max <= 0 || px <= 0) { row.scroll.scrollToLeft(0); return; }
            row.scroll.scrollToPercentHorizontal(Math.min(1, px / max), 0, false);
        };

        const paintChars = (first = false) => {
            const content = charRow.content;
            const px = keepPx(charRow);
            content.removeAllChildren();
            const gm = GameManager.instance;
            const owned = gm?.save.unlocks.characters ?? ['knight'];
            const all = listCharacters().filter(c => owned.indexOf(c.id) >= 0);
            const cur = gm?.selectedCharacterId ?? 'knight';
            const n = Math.max(all.length, 1);
            const pad = 10;
            const totalW = Math.max(SCROLL_W, pad * 2 + n * CELL_W + Math.max(0, n - 1) * GAP);
            content.getComponent(UITransform)!.setContentSize(totalW, CELL_H);
            all.forEach((c, i) => {
                const x = -totalW / 2 + pad + CELL_W / 2 + i * (CELL_W + GAP);
                const cell = new Node(`C_${c.id}`);
                cell.layer = Layers.Enum.UI_2D;
                cell.setParent(content);
                cell.setPosition(x, 0, 0);
                cell.addComponent(UITransform).setContentSize(CELL_W, CELL_H);
                const cg = cell.addComponent(Graphics);
                paintChip(cg, CELL_W, CELL_H, c.id === cur, false);
                const thumb = new Node('T');
                thumb.layer = Layers.Enum.UI_2D;
                thumb.setParent(cell);
                thumb.setPosition(0, 10, 0);
                thumb.addComponent(UITransform).setContentSize(44, 44);
                thumb.setScale(0.5, 0.5, 1);
                // 与上方立绘同一套骨骼小人（静态）
                thumb.addComponent(Graphics);
                CharacterRig.mount(thumb, c.skinId || c.id, false);
                // 名称落宫格内，避免 Mask 裁半个字
                const nameLbl = makeLabel(cell, c.name, 0, -26, 10, UiTone.body, CELL_W - 6);
                nameLbl.getComponent(UITransform)!.setContentSize(CELL_W - 6, 16);
                bindPress(cell, () => {
                    if (gm?.selectCharacter(c.id)) {
                        AudioManager.playVoice(c.id);
                        paintPreview(true);
                        paintChars();
                        paintWeapons();
                    }
                });
            });
            restorePx(charRow, px, first);
        };

        const paintWeapons = (first = false) => {
            const content = weapRow.content;
            const px = keepPx(weapRow);
            content.removeAllChildren();
            const gm = GameManager.instance;
            // #156 备战只展示开局武（只读），其余靠局内掉落
            const ids = gm?.listLoadoutWeapons() ?? ['sword'];
            const cur = gm?.selectedWeaponId ?? ids[0] ?? 'sword';
            const n = Math.max(ids.length, 1);
            const pad = 10;
            const totalW = Math.max(SCROLL_W, pad * 2 + n * CELL_W + Math.max(0, n - 1) * GAP);
            content.getComponent(UITransform)!.setContentSize(totalW, CELL_H);
            ids.forEach((id, i) => {
                const x = -totalW / 2 + pad + CELL_W / 2 + i * (CELL_W + GAP);
                const cell = new Node(`W_${id}`);
                cell.layer = Layers.Enum.UI_2D;
                cell.setParent(content);
                cell.setPosition(x, 0, 0);
                cell.addComponent(UITransform).setContentSize(CELL_W, CELL_H);
                const cg = cell.addComponent(Graphics);
                paintChip(cg, CELL_W, CELL_H, id === cur, false);
                const def = ConfigStore.weapon(id);
                const thumb = new Node('T');
                thumb.layer = Layers.Enum.UI_2D;
                thumb.setParent(cell);
                thumb.setPosition(0, 10, 0);
                thumb.addComponent(UITransform).setContentSize(44, 44);
                if (isWeaponType(id)) {
                    drawWeaponGlyph(thumb.addComponent(Graphics), id, 24);
                } else {
                    makeLabel(thumb, def?.emoji ?? '?', 0, 0, 16, UiTone.body, 36);
                }
                const nameLbl = makeLabel(
                    cell,
                    def?.name ?? id,
                    0, -26, 10,
                    UiTone.body,
                    CELL_W - 6,
                );
                nameLbl.getComponent(UITransform)!.setContentSize(CELL_W - 6, 16);
                // 开局武不可改选；点了只刷新预览
                bindPress(cell, () => {
                    AudioManager.playUi();
                    paintPreview(true);
                    paintWeapons();
                    tip.string = `${def?.emoji ?? ''} ${def?.name ?? id} · 开局携带 · 局内可再拾一把`;
                });
            });
            restorePx(weapRow, px, first);
        };

        paintPreview(false);
        paintChars(true);
        paintWeapons(true);

        makeButton(panel, '返回主界面', 0, backY, () => {
            LoadoutUI._open = false;
            LoadoutUI._root = null;
            eventBus.emit('lobby-input-lock', { ms: 400 });
            softClose(root);
        }, { w: 180, h: 40, color: UiTone.btn });
        tipBar.setSiblingIndex(panel.children.length - 1);
    }

    private static _hRow(
        parent: Node, name: string, x: number, y: number, w: number, h: number,
    ): { host: Node; content: Node; scroll: ScrollView } {
        const host = new Node(name);
        host.layer = Layers.Enum.UI_2D;
        host.setParent(parent);
        host.setPosition(x, y, 0);
        const bg = host.addComponent(Graphics);
        bg.fillColor = new Color(20, 16, 14, 160);
        bg.roundRect(-w / 2, -h / 2, w, h, 8); bg.fill();
        bg.strokeColor = new Color(110, 95, 75, 90);
        bg.lineWidth = 1.1;
        bg.roundRect(-w / 2, -h / 2, w, h, 8); bg.stroke();

        // 视口与行等高，避免裁名称
        const { content, scroll } = mountScrollArea(host, {
            w: w - 6, h: h - 4, horizontal: true, vertical: false,
            contentAnchor: { x: 0.5, y: 0.5 },
        });
        return { host, content, scroll };
    }
}
