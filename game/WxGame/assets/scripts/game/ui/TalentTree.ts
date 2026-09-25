import {
    Node, Label, Color, UITransform, Graphics,
    Layers, find,
} from 'cc';
import { GameManager } from '../../core/GameManager';
import {
    listTalents, canUnlock, nextLevelCost, formatTalentDetailLine, formatTalentTotals,
    formatTalentAtLevel, type TalentDef,
} from '../../core/TalentData';
import { eventBus } from '../../core/EventBus';
import { AudioManager } from '../../core/AudioManager';
import {
    mountOverlay, paintWarmPanel, UiTone, fitPanelSize, softClose, overlayChromeY,
    OverlaySafe, mountScrollArea,
} from './UiChrome';

const TREE_W = 700;
const CARD_W = 108;
const CARD_H = 80;
const GAP_X = 16;
/** 层距必须明显大于卡高，树才「往下长」而不是横网 */
const LAYER_H = 152;
const PAD_TOP = 22;
const PAD_BOT = 28;

/**
 * TalentTree —— 局外天赋树
 * #157 真树形：大层距 + 子节点对齐父节点 + 折线连边；中间可纵向滑动。
 */
export class TalentTree {
    private static _open = false;
    private static _root: Node | null = null;

    static reset() {
        TalentTree._open = false;
        const orphan = TalentTree._root?.isValid
            ? TalentTree._root
            : find('Canvas/TalentTree');
        if (orphan?.isValid) orphan.destroy();
        TalentTree._root = null;
    }
    static get isOpen() { return TalentTree._open; }

    static show(canvas: Node) {
        const existing = canvas.getChildByName('TalentTree');
        if (existing) {
            if (TalentTree._open) return;
            existing.destroy();
        }
        TalentTree._open = true;

        const root = mountOverlay('TalentTree', canvas, 10002);
        TalentTree._root = root;

        const fit = fitPanelSize(OverlaySafe.maxW, OverlaySafe.maxH);
        const { titleY, backY } = overlayChromeY(fit.h);
        const panel = new Node('Panel');
        panel.layer = Layers.Enum.UI_2D;
        panel.setParent(root);
        panel.setPosition(0, 0, 0);
        panel.addComponent(UITransform).setContentSize(fit.w, fit.h);
        const pg = panel.addComponent(Graphics);
        paintWarmPanel(pg, fit.w, fit.h, 14, 'amber');

        TalentTree._lbl(panel, '天赋树', 0, titleY, 22, UiTone.title, 320);
        const soulLbl = TalentTree._lbl(panel, '', 0, titleY - 24, 14, UiTone.accent, 320);

        const tipY = titleY - 48;
        const tipBar = new Node('TipBar');
        tipBar.layer = Layers.Enum.UI_2D;
        tipBar.setParent(panel);
        tipBar.setPosition(0, tipY, 0);
        tipBar.addComponent(UITransform).setContentSize(640, 24);
        const tipBg = tipBar.addComponent(Graphics);
        tipBg.fillColor = new Color(18, 14, 12, 160);
        tipBg.roundRect(-320, -12, 640, 24, 6); tipBg.fill();
            const tipLbl = TalentTree._lbl(
            tipBar, '点选查看 · 再点同一节点升级 · 从上往下点亮分支',
            0, 0, 11, new Color(180, 165, 145, 255), 620,
        );

        const detailY = tipY - 28;
        const detailBar = new Node('DetailBar');
        detailBar.layer = Layers.Enum.UI_2D;
        detailBar.setParent(panel);
        detailBar.setPosition(0, detailY, 0);
        detailBar.addComponent(UITransform).setContentSize(640, 26);
        const detailBg = detailBar.addComponent(Graphics);
        detailBg.fillColor = new Color(22, 18, 14, 180);
        detailBg.roundRect(-320, -12, 640, 24, 6); detailBg.fill();
        const detailLbl = TalentTree._lbl(
            detailBar, '选择一个天赋查看数值效果',
            0, 0, 11, new Color(160, 150, 135, 255), 620,
        );

        // 底栏加成（返回钮之上）
        const statsY = backY + 40;
        const statsChip = new Node('StatsChip');
        statsChip.layer = Layers.Enum.UI_2D;
        statsChip.setParent(panel);
        statsChip.setPosition(0, statsY, 0);
        statsChip.addComponent(UITransform).setContentSize(700, 26);
        const scg = statsChip.addComponent(Graphics);
        scg.fillColor = new Color(22, 18, 14, 200);
        scg.roundRect(-340, -13, 680, 26, 6); scg.fill();
        const statsLbl = TalentTree._lbl(
            statsChip, '尚未加点 · 点选天赋查看每级数值', 0, 0, 12,
            new Color(190, 175, 145, 255), 660,
        );

        // 节点滚动区：详情底 → 加成顶，严格不叠栏
        const listTop = detailY - 20;
        const listBot = statsY + 20;
        const listH = Math.max(120, listTop - listBot);
        const listY = (listTop + listBot) / 2;

        const listHost = new Node('ListHost');
        listHost.layer = Layers.Enum.UI_2D;
        listHost.setParent(panel);
        listHost.setPosition(0, listY, 0);
        const { scroll, content, contentUI } = mountScrollArea(listHost, {
            w: TREE_W, h: listH, vertical: true,
        });

        let selectedId = '';

        const raiseChrome = () => {
            tipBar.setSiblingIndex(panel.children.length - 1);
            detailBar.setSiblingIndex(panel.children.length - 1);
            statsChip.setSiblingIndex(panel.children.length - 1);
        };

        const setTip = (text: string, ok: boolean) => {
            const tip = tipLbl.getComponent(Label)!;
            tip.string = text;
            tip.color = ok ? new Color(120, 255, 160, 255) : new Color(255, 120, 120, 255);
            raiseChrome();
        };

        const setDetail = (def: TalentDef | undefined, lv: number) => {
            const lab = detailLbl.getComponent(Label)!;
            if (!def) {
                lab.string = '选择一个天赋查看数值效果';
                lab.color = new Color(170, 155, 130, 255);
                return;
            }
            lab.string = formatTalentDetailLine(def, lv);
            lab.color = new Color(230, 210, 170, 255);
        };

        const refresh = () => {
            const gm = GameManager.instance;
            const soul = gm?.save.currency.soul ?? 0;
            const levels = gm?.save.talents ?? {};
            soulLbl.getComponent(Label)!.string = `灵魂石  ${soul}`;
            statsLbl.getComponent(Label)!.string = formatTalentTotals(levels);

            // 保留滚动偏移，升级后不弹回顶部
            const prevOffset = scroll.getScrollOffset().clone();

            content.removeAllChildren();
            const defs = listTalents();
            if (selectedId && !defs.some(d => d.id === selectedId)) {
                selectedId = '';
            }

            const depthOf = TalentTree._depths(defs);
            const layers = new Map<number, typeof defs[number][]>();
            let maxDepth = 0;
            for (const def of defs) {
                const d = depthOf.get(def.id) ?? 0;
                maxDepth = Math.max(maxDepth, d);
                const row = layers.get(d) ?? [];
                row.push(def);
                layers.set(d, row);
            }

            const rows = maxDepth + 1;
            const contentH = Math.max(
                listH,
                PAD_TOP + PAD_BOT + rows * LAYER_H,
            );
            contentUI.setContentSize(TREE_W, contentH);
            content.setPosition(0, listH / 2, 0);

            // #157 子节点尽量对齐父节点中心，再推开防重叠 → 真·树形而不是两排横条
            const pos = TalentTree._layoutTree(defs, depthOf, layers, maxDepth);

            // 层带：淡色横条暗示「往下更深」
            const bandsNd = new Node('Bands');
            bandsNd.layer = Layers.Enum.UI_2D;
            bandsNd.setParent(content);
            const bg = bandsNd.addComponent(Graphics);
            for (let d = 0; d <= maxDepth; d++) {
                const y = -PAD_TOP - CARD_H / 2 - d * LAYER_H;
                bg.fillColor = d % 2 === 0
                    ? new Color(40, 30, 18, 55)
                    : new Color(28, 22, 14, 40);
                bg.roundRect(-TREE_W / 2 + 8, y - LAYER_H / 2 + 8, TREE_W - 16, LAYER_H - 12, 10);
                bg.fill();
            }

            const linesNd = new Node('Lines');
            linesNd.layer = Layers.Enum.UI_2D;
            linesNd.setParent(content);
            const lg = linesNd.addComponent(Graphics);
            for (const def of defs) {
                const child = pos.get(def.id);
                if (!child) continue;
                for (const req of def.requires) {
                    const parent = pos.get(req);
                    if (!parent) continue;
                    const lit = (levels[req] ?? 0) > 0;
                    TalentTree._drawBranch(lg, parent.x, parent.y, child.x, child.y, lit);
                }
            }

            for (const def of defs) {
                const at = pos.get(def.id);
                if (!at) continue;
                const lv = levels[def.id] ?? 0;
                const unlocked = canUnlock(def, levels);
                const cost = nextLevelCost(def, lv);
                const maxed = lv >= def.maxLevel;
                const open = unlocked || lv > 0;
                const selected = def.id === selectedId;

                const cell = new Node(`T_${def.id}`);
                cell.layer = Layers.Enum.UI_2D;
                cell.setParent(content);
                cell.setPosition(at.x, at.y, 0);
                cell.addComponent(UITransform).setContentSize(CARD_W, CARD_H);
                const cg = cell.addComponent(Graphics);

                if (maxed) {
                    cg.fillColor = new Color(48, 40, 22, 255);
                } else if (lv > 0) {
                    cg.fillColor = new Color(42, 32, 20, 255);
                } else if (open) {
                    cg.fillColor = new Color(36, 28, 18, 255);
                } else {
                    cg.fillColor = new Color(22, 18, 14, 255);
                }
                cg.roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 10); cg.fill();
                cg.lineWidth = selected ? 1.8 : 1.2;
                if (selected) {
                    cg.strokeColor = new Color(200, 165, 100, 210);
                } else if (maxed) {
                    cg.strokeColor = new Color(180, 150, 90, 160);
                } else if (lv > 0) {
                    cg.strokeColor = new Color(150, 120, 70, 140);
                } else if (open) {
                    cg.strokeColor = new Color(110, 95, 70, 120);
                } else {
                    cg.strokeColor = new Color(70, 60, 50, 100);
                }
                cg.roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 10); cg.stroke();

                const thumb = new Node('Thumb');
                thumb.layer = Layers.Enum.UI_2D;
                thumb.setParent(cell);
                thumb.setPosition(0, 22, 0);
                thumb.addComponent(UITransform).setContentSize(36, 36);
                const tg = thumb.addComponent(Graphics);
                tg.fillColor = open ? new Color(50, 36, 20, 255) : new Color(28, 24, 18, 255);
                tg.circle(0, 0, 14); tg.fill();
                tg.strokeColor = lv > 0
                    ? new Color(230, 180, 90, 220)
                    : new Color(110, 90, 60, 140);
                tg.lineWidth = 2;
                tg.circle(0, 0, 14); tg.stroke();
                TalentTree._lbl(
                    thumb, def.emoji, 0, 0, 15,
                    new Color(255, 255, 255, open ? 255 : 100), 32,
                );

                const status = maxed ? 'MAX' : (!unlocked ? '未解锁' : `${cost} 魂`);
                TalentTree._lbl(
                    cell, def.name, 0, 2, 12,
                    new Color(255, 240, 220, open ? 255 : 130), CARD_W - 14,
                );
                TalentTree._lbl(
                    cell, status, 0, -14, 10,
                    maxed
                        ? new Color(255, 210, 120, 255)
                        : new Color(190, 170, 140, open ? 230 : 110),
                    CARD_W - 14,
                );

                const pipN = Math.max(1, def.maxLevel);
                const pipGap = 10;
                const pipSpan = (pipN - 1) * pipGap;
                const pipY = -CARD_H / 2 + 8;
                for (let i = 0; i < pipN; i++) {
                    const px = -pipSpan / 2 + i * pipGap;
                    const filled = i < lv;
                    cg.fillColor = filled
                        ? new Color(255, 200, 90, 255)
                        : new Color(60, 48, 32, 200);
                    cg.circle(px, pipY, filled ? 3.2 : 2.4); cg.fill();
                }

                cell.on(Node.EventType.TOUCH_END, (ev) => {
                    ev.propagationStopped = true;
                    AudioManager.playUi();

                    if (selectedId !== def.id) {
                        selectedId = def.id;
                        setDetail(def, lv);
                        if (!unlocked) setTip('需先点亮前置天赋', false);
                        else if (maxed) setTip(`${def.name} 已满级`, true);
                        else setTip(`已选 ${def.name} · 再点一次升级`, true);
                        refresh();
                        return;
                    }

                    if (!maxed && unlocked) {
                        const r = GameManager.instance?.tryUpgradeTalent(def.id);
                        if (!r?.ok) {
                            setTip(`失败：${r?.reason ?? '未知'}`, false);
                            refresh();
                            return;
                        }
                        const newLv = GameManager.instance?.save.talents[def.id] ?? 0;
                        setTip(`${def.name} → Lv.${newLv}（${formatTalentAtLevel(def, newLv)}）`, true);
                        refresh();
                        return;
                    }
                    if (!unlocked) setTip('需先点亮前置天赋', false);
                    else if (maxed) setTip(`${def.name} 已满级`, true);
                    refresh();
                });
            }

            const sel = defs.find(d => d.id === selectedId);
            setDetail(sel, levels[selectedId] ?? 0);
            scroll.stopAutoScroll();
            if (!selectedId) scroll.scrollToTop(0);
            else scroll.scrollToOffset(prevOffset as any, 0);
            raiseChrome();
        };

        refresh();

        const back = TalentTree._btn(panel, '返回主界面', 0, backY, 170, 38, new Color(72, 50, 30, 255));
        const close = () => {
            if (!TalentTree._open) return;
            TalentTree._open = false;
            TalentTree._root = null;
            AudioManager.playUi();
            eventBus.emit('lobby-input-lock', { ms: 500 });
            softClose(root);
        };
        back.on(Node.EventType.TOUCH_END, (ev) => { ev.propagationStopped = true; close(); });

        raiseChrome();
        back.setSiblingIndex(panel.children.length - 1);
    }

    private static _depths(defs: readonly TalentDef[]): Map<string, number> {
        const byId = new Map(defs.map(d => [d.id, d]));
        const depth = new Map<string, number>();
        const visiting = new Set<string>();
        const walk = (id: string): number => {
            const known = depth.get(id);
            if (known !== undefined) return known;
            if (visiting.has(id)) return 0;
            visiting.add(id);
            let d = 0;
            for (const req of byId.get(id)?.requires ?? []) {
                if (byId.has(req)) d = Math.max(d, walk(req) + 1);
            }
            visiting.delete(id);
            depth.set(id, d);
            return d;
        };
        for (const def of defs) walk(def.id);
        return depth;
    }

    /**
     * 按深度分层；同层按「父节点平均 x」落点，再左右推开防叠卡。
     */
    private static _layoutTree(
        defs: readonly TalentDef[],
        depthOf: Map<string, number>,
        layers: Map<number, TalentDef[]>,
        maxDepth: number,
    ): Map<string, { x: number; y: number }> {
        const byId = new Map(defs.map(d => [d.id, d]));
        const pos = new Map<string, { x: number; y: number }>();
        const minGap = CARD_W + GAP_X;
        const halfLimit = TREE_W / 2 - CARD_W / 2 - 12;

        for (let d = 0; d <= maxDepth; d++) {
            const row = (layers.get(d) ?? []).slice();
            // 稳定顺序：先按主父 x，再按 id
            row.sort((a, b) => {
                const ax = TalentTree._preferredX(a, byId, pos);
                const bx = TalentTree._preferredX(b, byId, pos);
                if (ax !== bx) return ax - bx;
                return a.id.localeCompare(b.id);
            });
            const y = -PAD_TOP - CARD_H / 2 - d * LAYER_H;
            const xs: number[] = row.map(def => TalentTree._preferredX(def, byId, pos));

            // 根层：均匀铺开
            if (d === 0 && row.length > 0) {
                const span = row.length * CARD_W + Math.max(0, row.length - 1) * GAP_X;
                row.forEach((_, i) => {
                    xs[i] = -span / 2 + CARD_W / 2 + i * (CARD_W + GAP_X);
                });
            }

            // 推开重叠
            for (let pass = 0; pass < 8; pass++) {
                for (let i = 1; i < xs.length; i++) {
                    const need = xs[i - 1] + minGap;
                    if (xs[i] < need) {
                        const mid = (xs[i - 1] + xs[i]) / 2;
                        xs[i - 1] = mid - minGap / 2;
                        xs[i] = mid + minGap / 2;
                    }
                }
                // 整行居中拉回可视区
                let minX = Infinity;
                let maxX = -Infinity;
                for (const x of xs) {
                    minX = Math.min(minX, x);
                    maxX = Math.max(maxX, x);
                }
                const shift = -(minX + maxX) / 2;
                for (let i = 0; i < xs.length; i++) xs[i] += shift;
                for (let i = 0; i < xs.length; i++) {
                    xs[i] = Math.max(-halfLimit, Math.min(halfLimit, xs[i]));
                }
            }

            row.forEach((def, i) => pos.set(def.id, { x: xs[i], y }));
        }
        return pos;
    }

    private static _preferredX(
        def: TalentDef,
        byId: Map<string, TalentDef>,
        pos: Map<string, { x: number; y: number }>,
    ): number {
        const parents = def.requires.filter(id => byId.has(id) && pos.has(id));
        if (parents.length === 0) return 0;
        let s = 0;
        for (const id of parents) s += pos.get(id)!.x;
        return s / parents.length;
    }

    /** 折线连边：父底 → 中段横移 → 子顶（垂直段够长，不会「几乎水平」） */
    private static _drawBranch(
        g: Graphics,
        px: number, py: number,
        cx: number, cy: number,
        lit: boolean,
    ) {
        const topY = py - CARD_H / 2 - 2;
        const botY = cy + CARD_H / 2 + 2;
        const midY = (topY + botY) / 2;
        g.lineWidth = lit ? 3.2 : 1.8;
        g.strokeColor = lit
            ? new Color(230, 175, 70, 230)
            : new Color(75, 58, 40, 150);
        g.moveTo(px, topY);
        g.lineTo(px, midY);
        g.lineTo(cx, midY);
        g.lineTo(cx, botY);
        g.stroke();
        // 肘关节小点
        g.fillColor = lit
            ? new Color(255, 215, 120, 220)
            : new Color(90, 70, 50, 160);
        g.circle(px, midY, lit ? 3.2 : 2.2); g.fill();
        if (Math.abs(px - cx) > 4) {
            g.circle(cx, midY, lit ? 3.2 : 2.2); g.fill();
        }
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
        g.fillColor = c; g.roundRect(-w / 2, -h / 2, w, h, 8); g.fill();
        g.strokeColor = new Color(160, 140, 110, 90);
        g.lineWidth = 1.1;
        g.roundRect(-w / 2, -h / 2, w, h, 8); g.stroke();
        const lbl = TalentTree._lbl(n, t, 0, 0, 14, new Color(255, 248, 230, 255), w - 10);
        lbl.getComponent(UITransform)!.setContentSize(w - 10, h - 8);
        return n;
    }
}
