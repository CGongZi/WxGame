import {
    Node, Label, Color, UITransform, Graphics,
    Layers, find,
} from 'cc';
import { GameManager } from '../../core/GameManager';
import { listShopOffers, ShopOffer } from '../../core/ShopData';
import { getWeapon } from '../weapon/WeaponController';
import { getCharacter } from '../../core/CharacterData';
import { ConfigStore } from '../../core/ConfigStore';
import { drawWeaponGlyph } from '../fx/WeaponArt';
import { CharacterRig } from '../fx/CharacterRig';
import { IdleBreath } from '../fx/IdleBreath';
import { drawItemGlyph } from '../fx/ItemArt';
import { mountThumbArt } from './UiPixelThumb';
import { skillFor } from '../player/SkillDefs';
import { eventBus } from '../../core/EventBus';
import { AudioManager } from '../../core/AudioManager';
import {
    mountOverlay, paintWarmPanel, UiTone, fitPanelSize, mountScrollArea,
    softClose, overlayChromeY, OverlaySafe,
} from './UiChrome';

/** 右侧宫格：与图鉴同规格（CodexUI CELL/COLS/GAP） */
const DETAIL_W = 280;
const GRID_W = 390;
const CELL = 68;
const GAP = 8;
const COLS = 4;
const PAD_TOP = 10;
const PAD_BOT = 12;

type ShopTab = 'character' | 'kit' | 'perm_stat';
const SHOP_TABS: ReadonlyArray<{ id: ShopTab; label: string }> = [
    { id: 'character', label: '角色' },
    { id: 'kit', label: '补给' },
    { id: 'perm_stat', label: '永久' },
];

/**
 * SoulShop —— 局外灵魂石商店
 * #156 武器改局内掉落，商店不再卖永久武器解锁。
 * 左侧详情 · 右侧分类宫格（角色/补给/永久）· 点选后购买。
 */
export class SoulShop {
    private static _open = false;
    private static _root: Node | null = null;
    /** 当前弹窗内宫格/详情高度（由 show 按安全框算） */
    private static _gridH = 180;

    static reset() {
        SoulShop._open = false;
        const orphan = SoulShop._root?.isValid
            ? SoulShop._root
            : find('Canvas/SoulShop');
        if (orphan?.isValid) orphan.destroy();
        SoulShop._root = null;
    }
    static get isOpen() { return SoulShop._open; }

    private static _tabOf(offer: ShopOffer): ShopTab {
        if (offer.kind === 'kit') return 'kit';
        if (offer.kind === 'perm_stat') return 'perm_stat';
        if (offer.kind === 'character') return 'character';
        // 旧包若仍带 weapon 货架，归到角色页不展示
        return 'character';
    }

    static show(canvas: Node) {
        const existing = canvas.getChildByName('SoulShop');
        if (existing) {
            if (SoulShop._open) return;
            existing.destroy();
        }
        SoulShop._open = true;

        const root = mountOverlay('SoulShop', canvas, 10002);
        SoulShop._root = root;

        const fit = fitPanelSize(OverlaySafe.maxW, OverlaySafe.maxH);
        const { titleY, backY } = overlayChromeY(fit.h);
        const panel = new Node('Panel');
        panel.layer = Layers.Enum.UI_2D;
        panel.setParent(root);
        panel.setPosition(0, 0, 0);
        panel.addComponent(UITransform).setContentSize(fit.w, fit.h);
        const pg = panel.addComponent(Graphics);
        paintWarmPanel(pg, fit.w, fit.h, 14, 'amber');

        SoulShop._lbl(panel, '灵魂石商店', 0, titleY, 22, UiTone.title, 340);
        const soulLbl = SoulShop._lbl(panel, '', 0, titleY - 24, 14, UiTone.accent, 340);

        // tip 仅用于购买成败反馈，平时隐藏
        const tipY = titleY - 44;
        const tipBar = new Node('TipBar');
        tipBar.layer = Layers.Enum.UI_2D;
        tipBar.setParent(panel);
        tipBar.setPosition(0, tipY, 0);
        tipBar.addComponent(UITransform).setContentSize(640, 24);
        tipBar.active = false;
        const tipBg = tipBar.addComponent(Graphics);
        const tipLbl = SoulShop._lbl(tipBar, '', 0, 0, 11, UiTone.muted, 620);

        // 页签紧贴标题区；底注在返回钮上方
        const tabY = titleY - 56;
        const noteY = backY + 46;
        const contentTop = tabY - 28;
        const contentBot = noteY + 16;
        const gridH = Math.max(170, Math.min(220, contentTop - contentBot));
        const contentY = (contentTop + contentBot) / 2;
        SoulShop._gridH = gridH;

        const tabHost = new Node('Tabs');
        tabHost.layer = Layers.Enum.UI_2D;
        tabHost.setParent(panel);
        tabHost.setPosition(0, tabY, 0);
        tabHost.addComponent(UITransform).setContentSize(640, 34);

        const detailHost = new Node('DetailHost');
        detailHost.layer = Layers.Enum.UI_2D;
        detailHost.setParent(panel);
        detailHost.setPosition(-190, contentY, 0);
        detailHost.addComponent(UITransform).setContentSize(DETAIL_W, gridH);

        const listHost = new Node('ListHost');
        listHost.layer = Layers.Enum.UI_2D;
        listHost.setParent(panel);
        listHost.setPosition(160, contentY, 0);
        const { scroll, content, contentUI } = mountScrollArea(listHost, {
            w: GRID_W, h: gridH, vertical: true,
        });

        const noteLbl = SoulShop._lbl(
            panel, '', 0, noteY, 11, new Color(165, 180, 150, 255), 640,
        );

        let selectedId = '';
        let tab: ShopTab = 'character';
        /** 购买成功后 refresh 会重绘 tip，先缓存再写回 */
        let stickyTip: { text: string; ok: boolean } | null = null;

        const setTip = (text: string, ok: boolean) => {
            tipBar.active = true;
            const tip = tipLbl.getComponent(Label)!;
            tip.string = text;
            tip.color = ok ? new Color(120, 255, 160, 255) : new Color(255, 120, 120, 255);
            tipBg.clear();
            tipBg.fillColor = ok
                ? new Color(20, 48, 28, 200)
                : new Color(48, 18, 18, 200);
            tipBg.roundRect(-320, -12, 640, 24, 6); tipBg.fill();
            tabHost.setSiblingIndex(panel.children.length - 1);
            tipBar.setSiblingIndex(panel.children.length - 1);
        };

        const paintTabs = () => {
            tabHost.removeAllChildren();
            // 与图鉴 CodexUI._buildTabs 同规格：140×34、字号 14、间距 18
            const tw = 140;
            const th = 34;
            const gap = 18;
            const total = SHOP_TABS.length * tw + (SHOP_TABS.length - 1) * gap;
            SHOP_TABS.forEach((t, i) => {
                const on = t.id === tab;
                const n = new Node(`Tab_${t.id}`);
                n.layer = Layers.Enum.UI_2D;
                n.setParent(tabHost);
                n.setPosition(-total / 2 + tw / 2 + i * (tw + gap), 0, 0);
                n.addComponent(UITransform).setContentSize(tw, th);
                const g = n.addComponent(Graphics);
                g.fillColor = on
                    ? new Color(90, 68, 42, 255)
                    : new Color(40, 32, 26, 255);
                g.roundRect(-tw / 2, -th / 2, tw, th, 8); g.fill();
                g.strokeColor = on
                    ? new Color(200, 165, 100, 160)
                    : new Color(160, 140, 110, 90);
                g.lineWidth = 1.1;
                g.roundRect(-tw / 2, -th / 2, tw, th, 8); g.stroke();
                SoulShop._lbl(
                    n, t.label, 0, 0, 14,
                    on ? new Color(255, 248, 230, 255) : new Color(180, 160, 130, 255),
                    tw - 10,
                );
                n.on(Node.EventType.TOUCH_END, (ev) => {
                    ev.propagationStopped = true;
                    if (tab === t.id) return;
                    AudioManager.playUi();
                    tab = t.id;
                    selectedId = '';
                    refresh(true);
                });
            });
        };

        const paintDetail = (offer: ShopOffer | undefined) => {
            detailHost.removeAllChildren();
            const gh = SoulShop._gridH;
            const dw = DETAIL_W;
            const shell = new Node('Detail');
            shell.layer = Layers.Enum.UI_2D;
            shell.setParent(detailHost);
            shell.setPosition(0, 0, 0);
            shell.addComponent(UITransform).setContentSize(dw, gh);
            const dg = shell.addComponent(Graphics);
            dg.fillColor = new Color(30, 24, 20, 255);
            dg.roundRect(-dw / 2, -gh / 2, dw, gh, 10); dg.fill();
            dg.strokeColor = new Color(130, 110, 85, 120);
            dg.lineWidth = 1.2;
            dg.roundRect(-dw / 2, -gh / 2, dw, gh, 10); dg.stroke();

            if (!offer) {
                SoulShop._lbl(shell, '选择一件商品', 0, 16, 15, new Color(160, 140, 120, 255), dw - 24);
                return;
            }

            const state = SoulShop._offerState(offer);
            // 购买钮贴底；已拥有时底注下移占用钮位，给介绍/技能腾高
            const btnH = 34;
            const btnY = -gh / 2 + 18 + btnH / 2;
            const helperY = state.owned
                ? btnY
                : btnY + btnH / 2 + 14;
            const isChar = offer.kind === 'character';

            // 立绘：角色页与标题并排；其它商品置顶居中
            const thumb = new Node('Thumb');
            thumb.layer = Layers.Enum.UI_2D;
            thumb.setParent(shell);
            if (isChar) {
                thumb.setPosition(-dw / 2 + 36, gh / 2 - 36, 0);
            } else {
                thumb.setPosition(0, gh / 2 - 28, 0);
            }
            thumb.addComponent(UITransform).setContentSize(56, 56);
            const tg = thumb.addComponent(Graphics);
            tg.fillColor = new Color(22, 18, 14, 255);
            tg.roundRect(-26, -26, 52, 52, 8); tg.fill();
            tg.strokeColor = new Color(140, 120, 90, 120);
            tg.lineWidth = 1.2;
            tg.roundRect(-26, -26, 52, 52, 8); tg.stroke();
            const art = new Node('Art');
            art.layer = Layers.Enum.UI_2D;
            art.setParent(thumb);
            art.setPosition(0, 0, 0);
            art.addComponent(UITransform).setContentSize(48, 48);
            // 仅补给画满框；永久属性保持原先 ×0.4（用户确认大小刚好）
            const kitFull = offer.kind === 'kit';
            art.setScale(kitFull ? 1 : 0.4, kitFull ? 1 : 0.4, 1);
            SoulShop._paintThumb(art.addComponent(Graphics), offer);

            const nameY = isChar ? gh / 2 - 24 : gh / 2 - 62;
            const nameCx = isChar ? (-dw / 2 + 72 + (dw - 88) / 2) : 0;
            const nameW = isChar ? dw - 88 : dw - 24;
            const nameLbl = SoulShop._lbl(
                shell, offer.name, nameCx, nameY, 15, new Color(255, 240, 220, 255), nameW,
            );
            if (isChar) nameLbl.getComponent(Label)!.horizontalAlign = Label.HorizontalAlign.LEFT;
            const priceLbl = SoulShop._lbl(
                shell,
                state.owned ? '已拥有' : `售价  ${offer.cost} 魂`,
                nameCx, nameY - 18, 12,
                state.owned ? new Color(140, 200, 140, 255) : new Color(230, 190, 120, 255),
                nameW,
            );
            if (isChar) priceLbl.getComponent(Label)!.horizontalAlign = Label.HorizontalAlign.LEFT;

            const { lines, helper } = SoulShop._detailBlocks(offer, state.owned);

            if (isChar) {
                // 自上而下：介绍 → 技能 → 底注，互不重叠
                const ch = getCharacter(offer.characterId);
                const sk = skillFor(ch?.id ?? offer.characterId);
                const descLines = SoulShop._wrapText(sk.desc || '', 16).slice(0, 2);
                const skillBlockH = 18 + Math.max(1, descLines.length) * 12;
                // 技能固定贴底注上方；介绍只填其上方空隙
                const skillTop = helperY + skillBlockH + 12;

                let cursor = gh / 2 - 72;
                const lineStep = 15;
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    // 介绍底边须高于技能顶（字高余量）
                    if (cursor - 10 < skillTop + 8) break;
                    SoulShop._lbl(
                        shell, line.text, 0, cursor, Math.min(line.size ?? 12, 12),
                        line.color ?? new Color(190, 175, 150, 255), dw - 28,
                    );
                    cursor -= lineStep;
                }

                const skillBtn = new Node('SkillBtn');
                skillBtn.layer = Layers.Enum.UI_2D;
                skillBtn.setParent(shell);
                skillBtn.setPosition(-dw / 2 + 26, skillTop - 4, 0);
                skillBtn.addComponent(UITransform).setContentSize(36, 36);
                const sg = skillBtn.addComponent(Graphics);
                const [cr, cgCol, cb] = sk.color;
                sg.fillColor = new Color(28, 22, 18, 255);
                sg.circle(0, 0, 16); sg.fill();
                sg.fillColor = new Color(cr, cgCol, cb, 55);
                sg.circle(0, 0, 14); sg.fill();
                sg.strokeColor = new Color(cr, cgCol, cb, 200);
                sg.lineWidth = 1.5;
                sg.circle(0, 0, 14); sg.stroke();
                SoulShop._lbl(skillBtn, sk.emoji, 0, 1, 14, new Color(255, 245, 230, 255), 32);
                SoulShop._lbl(skillBtn, '技', 0, -20, 9, new Color(200, 180, 140, 220), 32);

                const infoW = dw - 72;
                const infoCx = -dw / 2 + 50 + infoW / 2;
                const titleLbl = SoulShop._lbl(
                    shell,
                    `${sk.name} · CD ${sk.cooldown}s`,
                    infoCx, skillTop, 12,
                    new Color(255, 220, 160, 255), infoW,
                );
                titleLbl.getComponent(Label)!.horizontalAlign = Label.HorizontalAlign.LEFT;
                descLines.forEach((t, i) => {
                    const dl = SoulShop._lbl(
                        shell, t,
                        infoCx, skillTop - 14 - i * 12, 11,
                        new Color(190, 175, 150, 255), infoW,
                    );
                    dl.getComponent(Label)!.horizontalAlign = Label.HorizontalAlign.LEFT;
                });
            } else {
                const lineTop = nameY - 38;
                const lineStep = 15;
                const lineFloor = helperY + 12;
                lines.forEach((line, i) => {
                    const y = lineTop - i * lineStep;
                    if (y < lineFloor) return;
                    SoulShop._lbl(
                        shell, line.text, 0, y, Math.min(line.size ?? 12, 12),
                        line.color ?? new Color(190, 175, 150, 255), dw - 28,
                    );
                });
            }

            if (helper) {
                SoulShop._lbl(shell, helper, 0, helperY, 11, new Color(165, 150, 130, 255), dw - 28);
            }

            if (!state.owned) {
                const buy = SoulShop._btn(
                    shell, state.btnLabel, 0, btnY, 160, btnH,
                    new Color(100, 72, 40, 255),
                );
                buy.on(Node.EventType.TOUCH_END, (ev) => {
                    ev.propagationStopped = true;
                    AudioManager.playUi();
                    const r = GameManager.instance?.tryBuyShopOffer(offer.id);
                    if (!r?.ok) {
                        const reason = r?.reason ?? '未知';
                        stickyTip = { text: `失败：${reason}`, ok: false };
                        setTip(stickyTip.text, false);
                        return;
                    }
                    stickyTip = { text: `✅ ${r.message ?? '购买成功'}`, ok: true };
                    refresh(false);
                });
            }
        };

        const refresh = (resetScroll: boolean) => {
            const gm = GameManager.instance;
            const soul = gm?.save.currency.soul ?? 0;
            soulLbl.getComponent(Label)!.string = `灵魂石  ${soul}`;

            const hpBonus = gm?.save.shopPurchases?.maxHp ?? 0;
            const atkB = gm?.save.shopPurchases?.atk ?? 0;
            const defB = gm?.save.shopPurchases?.def ?? 0;
            const spdB = gm?.save.shopPurchases?.moveSpeed ?? 0;
            const pips: string[] = [];
            if (hpBonus > 0) pips.push(`❤×${hpBonus}`);
            if (atkB > 0) pips.push(`⚔×${atkB}`);
            if (defB > 0) pips.push(`🛡×${defB}`);
            if (spdB > 0) pips.push(`💨×${spdB}`);
            noteLbl.getComponent(Label)!.string = pips.length > 0
                ? `永久强化  ${pips.join('  ')}`
                : '永久强化  尚未购买 · 开局更稳';

            paintTabs();

            const offers = listShopOffers().filter(o => o.kind !== 'weapon' && SoulShop._tabOf(o) === tab);
            if (!selectedId || !offers.some(o => o.id === selectedId)) {
                selectedId = offers[0]?.id ?? '';
            }

            const prevOffset = resetScroll
                ? { x: 0, y: 0 }
                : scroll.getScrollOffset().clone();

            content.removeAllChildren();
            const gh = SoulShop._gridH;
            const rows = Math.max(1, Math.ceil(offers.length / COLS));
            const contentH = Math.max(
                gh,
                PAD_TOP + PAD_BOT + rows * CELL + Math.max(0, rows - 1) * GAP,
            );
            contentUI.setContentSize(GRID_W, contentH);
            content.setPosition(0, gh / 2, 0);
            if (stickyTip) {
                setTip(stickyTip.text, stickyTip.ok);
                stickyTip = null;
            } else {
                tipBar.active = false;
                tipLbl.getComponent(Label)!.string = '';
                tipBg.clear();
            }

            const span = COLS * CELL + (COLS - 1) * GAP;
            offers.forEach((offer, i) => {
                const col = i % COLS;
                const row = Math.floor(i / COLS);
                const x = -span / 2 + CELL / 2 + col * (CELL + GAP);
                const y = -PAD_TOP - CELL / 2 - row * (CELL + GAP);
                const state = SoulShop._offerState(offer);
                const on = offer.id === selectedId;

                const cell = new Node(`S_${offer.id}`);
                cell.layer = Layers.Enum.UI_2D;
                cell.setParent(content);
                cell.setPosition(x, y, 0);
                cell.addComponent(UITransform).setContentSize(CELL, CELL);
                const cg = cell.addComponent(Graphics);
                cg.fillColor = state.owned
                    ? new Color(32, 40, 28, 255)
                    : new Color(40, 30, 22, 255);
                cg.roundRect(-CELL / 2, -CELL / 2, CELL, CELL, 8); cg.fill();
                cg.lineWidth = on ? 1.6 : 1.1;
                cg.strokeColor = on
                    ? new Color(200, 165, 100, 200)
                    : state.owned
                        ? new Color(90, 140, 95, 130)
                        : new Color(120, 100, 75, 110);
                cg.roundRect(-CELL / 2, -CELL / 2, CELL, CELL, 8); cg.stroke();

                SoulShop._cellIcon(cell, offer);
                // #169 与图鉴同：底栏单行名 · 字号11 · CLAMP（禁 SHRINK 缩成看不见）
                const shortName = offer.name.replace(/^(解锁|专属·)/, '');
                const nameLbl = SoulShop._lbl(
                    cell, shortName,
                    0, -22, 11, new Color(200, 195, 210, 255), CELL - 8,
                );
                const nl = nameLbl.getComponent(Label)!;
                nl.overflow = Label.Overflow.CLAMP;
                nl.enableWrapText = false;
                // 价/已有提到顶部角标，不挤第二行
                SoulShop._lbl(
                    cell,
                    state.owned ? '已有' : `${offer.cost}`,
                    0, 28, 10,
                    state.owned ? new Color(140, 200, 150, 255) : new Color(230, 190, 120, 255),
                    CELL - 10,
                );

                cell.on(Node.EventType.TOUCH_END, (ev) => {
                    ev.propagationStopped = true;
                    AudioManager.playUi();
                    selectedId = offer.id;
                    refresh(false);
                });
            });

            const cur = offers.find(o => o.id === selectedId);
            paintDetail(cur);
            scroll.stopAutoScroll();
            if (resetScroll) scroll.scrollToTop(0);
            else scroll.scrollToOffset(prevOffset as any, 0);
            tipBar.setSiblingIndex(panel.children.length - 1);
            // 页签压在详情/宫格之上，避免顶边叠层挡点击
            tabHost.setSiblingIndex(panel.children.length - 1);
            tipBar.setSiblingIndex(panel.children.length - 1);
        };

        refresh(true);

        const back = SoulShop._btn(panel, '返回主界面', 0, backY, 170, 38, new Color(90, 60, 30, 255));
        const close = () => {
            if (!SoulShop._open) return;
            SoulShop._open = false;
            SoulShop._root = null;
            AudioManager.playUi();
            eventBus.emit('lobby-input-lock', { ms: 500 });
            softClose(root);
        };
        back.on(Node.EventType.TOUCH_END, (ev) => { ev.propagationStopped = true; close(); });

        tipBar.setSiblingIndex(panel.children.length - 1);
    }

    /** 属性行 + 固定底栏提示（不与购买钮抢位） */
    private static _detailBlocks(offer: ShopOffer, owned = false): {
        lines: Array<{ text: string; size?: number; color?: Color }>;
        helper: string;
    } {
        const mute = new Color(165, 150, 130, 255);
        const accent = new Color(255, 220, 160, 255);
        const body = new Color(200, 185, 160, 255);

        if (offer.kind === 'weapon') {
            const w = getWeapon(offer.weaponId);
            const rare = w.rarity === 'epic' ? '史诗' : w.rarity === 'rare' ? '稀有' : '普通';
            const kind = w.type === 'melee' ? '近战' : '远程';
            const lines: Array<{ text: string; size?: number; color?: Color }> = [
                { text: `${kind} · ${rare}`, color: accent },
            ];
            if (w.ownerCharacterId) {
                const ch = getCharacter(w.ownerCharacterId);
                lines.push({
                    text: `专属 · 仅${ch?.name ?? w.ownerCharacterId}可用`,
                    color: new Color(255, 180, 120, 255),
                });
            }
            const desc = (w.description || offer.desc || '').trim();
            if (desc) {
                const one = desc.length > 28 ? `${desc.slice(0, 27)}…` : desc;
                lines.push({ text: one, size: 14, color: body });
            } else {
                lines.push({
                    text: w.type === 'melee' ? '贴身挥砍，手感扎实' : '远程打击，拉开距离',
                    size: 14, color: body,
                });
            }
            return { lines, helper: '解锁后备战可选 · 开战默认装备' };
        }

        if (offer.kind === 'character') {
            const ch = getCharacter(offer.characterId);
            if (!ch) return { lines: [{ text: offer.desc || '', color: mute }], helper: '' };
            let gear = '';
            try { gear = getWeapon(ch.exclusiveWeaponId).name; } catch { gear = ch.exclusiveWeaponId; }
            const desc = (ch.desc || offer.desc || '').trim();
            const lines: Array<{ text: string; size?: number; color?: Color }> = [];
            if (desc) {
                const one = desc.length > 28 ? `${desc.slice(0, 27)}…` : desc;
                lines.push({ text: one, color: body });
            }
            // 风格 + 专属（技能块画在介绍下方）
            const tag = SoulShop._styleTag(ch.base);
            lines.push(
                { text: `风格 · ${tag}`, color: accent },
                { text: `专属 ${gear}`, color: accent },
            );
            return {
                lines,
                helper: owned ? '可在备战中选用出战' : '解锁后备战可选出战',
            };
        }

        if (offer.kind === 'kit') {
            const item = ConfigStore.item(offer.itemId);
            const stash = GameManager.instance?.save.stash?.[offer.itemId] ?? 0;
            return {
                lines: [
                    { text: offer.desc || item?.desc || '', color: mute },
                    { text: `补给 ×${offer.amount}  ·  箱内 ${stash}`, color: accent },
                ],
                helper: '开战自动装进局内背包',
            };
        }

        const cur = GameManager.instance?.save.shopPurchases?.[offer.purchaseKey] ?? 0;
        return {
            lines: [
                { text: offer.desc || '', color: mute },
                { text: cur > 0 ? `已强化 ×${cur}` : '可反复购买叠加强化', color: accent },
            ],
            helper: '开局自动生效',
        };
    }

    /** 角色风格一句话，避免 HP/攻/防 表 */
    private static _styleTag(base: { maxHp: number; atk: number; def: number; moveSpeed: number }): string {
        const tank = base.maxHp >= 130 || base.def >= 4;
        const swift = base.moveSpeed >= 210;
        const glass = base.atk >= 18 && base.maxHp <= 100;
        if (tank && !swift) return '厚实耐打';
        if (swift && !tank) return '轻盈敏锐';
        if (glass) return '高伤脆皮';
        return '均衡可靠';
    }

    private static _offerEmoji(offer: ShopOffer): string {
        if (offer.kind === 'weapon') return getWeapon(offer.weaponId).emoji;
        if (offer.kind === 'character') {
            const ch = getCharacter(offer.characterId);
            return ch?.emoji ?? '👤';
        }
        if (offer.kind === 'kit') {
            return ConfigStore.item(offer.itemId)?.emoji ?? '📦';
        }
        if (offer.purchaseKey === 'atk') return '⚔';
        if (offer.purchaseKey === 'def') return '🛡';
        if (offer.purchaseKey === 'moveSpeed') return '💨';
        return '❤';
    }

    /** 右侧宫格图标：与局内同一套 Rig / 道具剪影（静态） */
    private static _cellIcon(cell: Node, offer: ShopOffer) {
        const icon = new Node('Icon');
        icon.layer = Layers.Enum.UI_2D;
        icon.setParent(cell);
        icon.setPosition(0, 10, 0);
        icon.addComponent(UITransform).setContentSize(44, 44);
        if (offer.kind === 'weapon') {
            if (mountThumbArt(icon, 'weapon', offer.weaponId, 36, true)) return;
            try {
                drawWeaponGlyph(icon.addComponent(Graphics), offer.weaponId, 28);
                return;
            } catch { /* fallthrough → emoji */ }
        } else if (offer.kind === 'character') {
            const ch = getCharacter(offer.characterId);
            if (ch) {
                const skin = ch.skinId || ch.id;
                icon.addComponent(Graphics);
                // 宫格缩略保持静态，左栏详情才呼吸
                CharacterRig.mount(icon, skin, false);
                icon.setScale(0.4, 0.4, 1);
                return;
            }
        } else if (offer.kind === 'kit') {
            if (mountThumbArt(icon, 'item', offer.itemId, 36, true)) return;
            const item = ConfigStore.item(offer.itemId);
            if (item) {
                drawItemGlyph(icon.addComponent(Graphics), item, 26);
                return;
            }
        }
        SoulShop._lbl(
            icon, SoulShop._offerEmoji(offer),
            0, 0, 22, new Color(255, 255, 255, 255), CELL - 8,
        );
    }

    /** 左侧详情缩略：静态 Rig / 程序剪影；属性类仍用符号 */
    private static _paintThumb(g: Graphics, offer: ShopOffer) {
        if (offer.kind === 'weapon') {
            try {
                drawWeaponGlyph(g, offer.weaponId, 42);
                return;
            } catch { /* fallthrough */ }
        }
        if (offer.kind === 'character') {
            const ch = getCharacter(offer.characterId);
            if (ch) {
                const skin = ch.skinId || ch.id;
                CharacterRig.mount(g.node, skin, true);
                const breath = g.node.addComponent(IdleBreath);
                breath.kind = 'portrait';
                breath.skinId = skin;
                breath.baseScale = 0.6;
                g.node.setScale(0.6, 0.6, 1);
                return;
            }
        }
        if (offer.kind === 'kit') {
            // 详情框约 52px：画满框，不再二次缩放
            if (mountThumbArt(g.node, 'item', offer.itemId, 48, true)) return;
            const item = ConfigStore.item(offer.itemId);
            if (item) {
                drawItemGlyph(g, item, 44);
                return;
            }
        }
        // 属性类：色块 + 简易符号
        if (offer.kind === 'perm_stat') {
            const col = offer.purchaseKey === 'atk' ? new Color(255, 140, 80)
                : offer.purchaseKey === 'def' ? new Color(100, 160, 255)
                : offer.purchaseKey === 'moveSpeed' ? new Color(120, 220, 160)
                : new Color(255, 100, 120);
            g.fillColor = new Color(col.r, col.g, col.b, 60);
            g.circle(0, 0, 28); g.fill();
            g.fillColor = col;
            if (offer.purchaseKey === 'atk') {
                g.rect(-2, -16, 4, 28); g.fill();
                g.moveTo(-8, 10); g.lineTo(0, 18); g.lineTo(8, 10); g.close(); g.fill();
            } else if (offer.purchaseKey === 'def') {
                g.moveTo(0, 16); g.lineTo(14, 6); g.lineTo(10, -14); g.lineTo(-10, -14); g.lineTo(-14, 6);
                g.close(); g.fill();
            } else if (offer.purchaseKey === 'moveSpeed') {
                g.moveTo(-14, -4); g.lineTo(4, 12); g.lineTo(0, 0); g.lineTo(14, 4); g.lineTo(-4, -12);
                g.close(); g.fill();
            } else {
                g.moveTo(0, 14); g.lineTo(12, 2); g.lineTo(8, -12); g.lineTo(-8, -12); g.lineTo(-12, 2);
                g.close(); g.fill();
            }
            return;
        }
        g.fillColor = new Color(200, 180, 140, 255);
        g.circle(0, 0, 12); g.fill();
    }

    private static _offerState(offer: ShopOffer): { owned: boolean; btnLabel: string } {
        const gm = GameManager.instance;
        if (offer.kind === 'weapon') {
            const unlocked = gm?.save.unlocks.weapons.indexOf(offer.weaponId) >= 0;
            if (unlocked) return { owned: true, btnLabel: '已拥有' };
            const wdef = (() => { try { return getWeapon(offer.weaponId); } catch { return null; } })();
            const ownerId = wdef?.ownerCharacterId;
            if (ownerId && (gm?.save.unlocks.characters.indexOf(ownerId) ?? -1) < 0) {
                const ch = getCharacter(ownerId);
                return { owned: false, btnLabel: `需${ch?.name ?? '角色'}` };
            }
            return { owned: false, btnLabel: '购买' };
        }
        if (offer.kind === 'character') {
            const unlocked = gm?.save.unlocks.characters.indexOf(offer.characterId) >= 0;
            return unlocked
                ? { owned: true, btnLabel: '已拥有' }
                : { owned: false, btnLabel: '购买' };
        }
        if (offer.kind === 'kit') {
            const n = gm?.save.stash?.[offer.itemId] ?? 0;
            return {
                owned: false,
                btnLabel: n > 0 ? '再买一件' : '购买',
            };
        }
        if (!offer.stackable) {
            const cur = gm?.save.shopPurchases?.[offer.purchaseKey] ?? 0;
            if (cur >= offer.amount) {
                return { owned: true, btnLabel: '已拥有' };
            }
        }
        return { owned: false, btnLabel: '购买' };
    }

    /** 按字数折行（中文按字符；英文空格优先） */
    private static _wrapText(text: string, maxChars: number): string[] {
        const raw = (text || '').trim();
        if (!raw) return [];
        if (raw.length <= maxChars) return [raw];
        const out: string[] = [];
        let i = 0;
        while (i < raw.length) {
            out.push(raw.slice(i, i + maxChars));
            i += maxChars;
        }
        return out;
    }

    private static _lbl(
        p: Node, t: string, x: number, y: number, s: number, c: Color, width = 360,
    ): Node {
        const n = new Node('L');
        n.layer = Layers.Enum.UI_2D;
        n.setParent(p); n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(width, s + 10);
        const l = n.addComponent(Label);
        l.string = t; l.fontSize = s; l.color = c; l.horizontalAlign = 1;
        l.overflow = Label.Overflow.CLAMP;
        return n;
    }

    private static _btn(p: Node, t: string, x: number, y: number, w: number, h: number, c: Color): Node {
        const n = new Node('B');
        n.layer = Layers.Enum.UI_2D;
        n.setParent(p); n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(w, h);
        const g = n.addComponent(Graphics);
        g.fillColor = c;
        g.roundRect(-w / 2, -h / 2, w, h, 8); g.fill();
        g.strokeColor = new Color(160, 140, 110, 90);
        g.lineWidth = 1.1;
        g.roundRect(-w / 2, -h / 2, w, h, 8); g.stroke();
        const lbl = SoulShop._lbl(n, t, 0, 0, 14, new Color(255, 248, 230, 255), w - 10);
        lbl.getComponent(UITransform)!.setContentSize(w - 10, h - 8);
        return n;
    }
}
