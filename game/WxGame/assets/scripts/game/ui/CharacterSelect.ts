import {
    Node, Label, Color, UITransform, Graphics, Layers, find,
    tween, Vec3,
} from 'cc';
import { GameManager } from '../../core/GameManager';
import { listCharacters } from '../../core/CharacterData';
import { getWeapon, isWeaponType } from '../weapon/WeaponController';
import { skillFor } from '../player/SkillDefs';
import { CharacterRig } from '../fx/CharacterRig';
import { IdleBreath } from '../fx/IdleBreath';
import { eventBus } from '../../core/EventBus';
import { AudioManager } from '../../core/AudioManager';
import {
    mountOverlay, makePanel, makeLabel, makeSubtitleBar,
    paintChip, UiTone, softClose, mountScrollArea, OverlaySafe, overlayChromeY,
} from './UiChrome';

const PANEL_W = OverlaySafe.maxW;
const PANEL_H = OverlaySafe.maxH;
const GRID_W = 680;
const GRID_H = 100;
const COLS = 6;
const CELL = 82;
const GAP = 8;
const PAD_X = 10;
const PAD_Y = 6;

/**
 * CharacterSelect —— 大厅出战角色
 * 上：大立绘 + 介绍；下：全角色宫格缩略图点选切换。
 * 未解锁须点「购买」并二次确认，禁止点名字/芯片直接扣魂。
 */
export class CharacterSelect {
    private static _open = false;
    private static _root: Node | null = null;

    static get isOpen() { return CharacterSelect._open; }

    static reset() {
        CharacterSelect._open = false;
        if (CharacterSelect._root?.isValid) CharacterSelect._root.destroy();
        CharacterSelect._root = null;
        const n = find('Canvas/CharacterSelect');
        if (n?.isValid) n.destroy();
    }

    static show(canvas: Node) {
        if (CharacterSelect._open && CharacterSelect._root?.isValid) return;
        CharacterSelect.reset();
        CharacterSelect._open = true;

        const root = mountOverlay('CharacterSelect', canvas, 10002);
        CharacterSelect._root = root;

        const panel = makePanel(root, 'Panel', PANEL_W, PANEL_H, 0, 'amber');
        const { titleY, backY } = overlayChromeY(PANEL_H);
        makeLabel(panel, '选择角色', 0, titleY, 22, UiTone.title, 320);
        const soulLbl = makeLabel(panel, '', 0, titleY - 24, 13, UiTone.accent, 320).getComponent(Label)!;
        const tipLbl = makeSubtitleBar(
            panel, '点下方缩略图切换 · 未解锁需确认购买', titleY - 48, 640,
        ).label;

        const previewHost = new Node('PreviewHost');
        previewHost.layer = Layers.Enum.UI_2D;
        previewHost.setParent(panel);
        previewHost.setPosition(0, 36, 0);
        previewHost.addComponent(UITransform).setContentSize(680, 130);

        const listHost = new Node('ListHost');
        listHost.layer = Layers.Enum.UI_2D;
        listHost.setParent(panel);
        listHost.setPosition(0, -92, 0);
        const { scroll, content, contentUI } = mountScrollArea(listHost, {
            w: GRID_W, h: GRID_H, vertical: true,
        });

        let focusId = GameManager.instance?.selectedCharacterId ?? listCharacters()[0]?.id ?? 'knight';
        /** 购买二次确认：指向当前武装的角色 id */
        let buyArmedId: string | null = null;

        const setTip = (text: string, ok: boolean) => {
            tipLbl.string = text;
            tipLbl.color = ok ? UiTone.ok : UiTone.warn;
        };

        const isOwned = (id: string) =>
            (GameManager.instance?.save.unlocks.characters.indexOf(id) ?? -1) >= 0;

        const paintPreview = (fx: boolean) => {
            const kids = [...previewHost.children];
            for (const k of kids) k.destroy();

            const all = listCharacters();
            const c = all.find(x => x.id === focusId) ?? all[0];
            if (!c) return;
            const owned = isOwned(c.id);
            const gear = isWeaponType(c.exclusiveWeaponId) ? getWeapon(c.exclusiveWeaponId).name : '';
            const gm = GameManager.instance;
            soulLbl.string = `灵魂石 ${gm?.save.currency.soul ?? 0}`;

            // 左：大立绘
            const stage = new Node('Stage');
            stage.layer = Layers.Enum.UI_2D;
            stage.setParent(previewHost);
            stage.setPosition(-220, 0, 0);
            stage.addComponent(UITransform).setContentSize(280, 120);
            const sg = stage.addComponent(Graphics);
            sg.fillColor = new Color(36, 28, 20, 255);
            sg.roundRect(-140, -60, 280, 120, 10); sg.fill();
            if (owned) {
                sg.strokeColor = new Color(170, 140, 90, 140);
                sg.lineWidth = 1.3;
                sg.roundRect(-140, -60, 280, 120, 10); sg.stroke();
            } else {
                sg.strokeColor = new Color(90, 75, 55, 110);
                sg.lineWidth = 1.1;
                sg.roundRect(-140, -60, 280, 120, 10); sg.stroke();
            }

            const portrait = new Node('Portrait');
            portrait.layer = Layers.Enum.UI_2D;
            portrait.setParent(stage);
            portrait.setPosition(0, 4, 0);
            portrait.addComponent(UITransform).setContentSize(100, 110);
            portrait.addComponent(Graphics);
            CharacterRig.mount(portrait, c.skinId || c.id, true);
            const breath = portrait.addComponent(IdleBreath);
            breath.kind = 'portrait';
            breath.skinId = c.skinId || c.id;
            breath.baseScale = 1.35;
            breath.activeBreath = !fx;
            if (fx) {
                portrait.setScale(0.4, 0.4, 1);
                tween(portrait)
                    .to(0.16, { scale: new Vec3(1.5, 1.5, 1) })
                    .to(0.1, { scale: new Vec3(1.35, 1.35, 1) })
                    .call(() => { if (breath.isValid) breath.activeBreath = true; })
                    .start();
            } else {
                portrait.setScale(1.35, 1.35, 1);
            }
            if (!owned) {
                const veil = new Node('Veil');
                veil.layer = Layers.Enum.UI_2D;
                veil.setParent(stage);
                veil.setPosition(0, 4, 0);
                veil.addComponent(UITransform).setContentSize(120, 130);
                const vg = veil.addComponent(Graphics);
                vg.fillColor = new Color(10, 8, 20, 110);
                vg.roundRect(-60, -65, 120, 130, 10); vg.fill();
                CharacterSelect._lbl(veil, '🔒', 0, 0, 28, new Color(255, 220, 160, 255), 70);
            }

            // 右：介绍
            const detail = new Node('Detail');
            detail.layer = Layers.Enum.UI_2D;
            detail.setParent(previewHost);
            detail.setPosition(190, 0, 0);
            detail.addComponent(UITransform).setContentSize(340, 120);
            const dg = detail.addComponent(Graphics);
            dg.fillColor = new Color(34, 26, 18, 255);
            dg.roundRect(-170, -60, 340, 120, 10); dg.fill();
            dg.strokeColor = new Color(140, 115, 85, 120);
            dg.lineWidth = 1.2;
            dg.roundRect(-170, -60, 340, 120, 10); dg.stroke();

            CharacterSelect._lbl(detail, c.name, 0, 40, 17, UiTone.title, 300);
            CharacterSelect._lbl(detail, c.desc, 0, 22, 11, UiTone.muted, 300);
            CharacterSelect._lbl(
                detail,
                `生命 ${c.base.maxHp} · 攻 ${c.base.atk} · 防 ${c.base.def} · 速 ${c.base.moveSpeed}`,
                0, 4, 11, UiTone.accent, 300,
            );
            const sk = skillFor(c.id);
            CharacterSelect._lbl(
                detail,
                `暴击 ${(c.base.critChance * 100).toFixed(0)}% ×${c.base.critMultiplier} · 开局 ${gear || '—'} · 技 ${sk.emoji}${sk.name}`,
                0, -12, 11, UiTone.body, 300,
            );

            // 操作钮：已拥有=出战；未解锁=购买（二次确认）
            if (owned) {
                const active = (gm?.selectedCharacterId ?? '') === c.id;
                const btn = CharacterSelect._btn(
                    detail,
                    active ? '出战中' : '设为出战',
                    0, -42, 160, 32,
                    active ? UiTone.btnGood : UiTone.btn,
                );
                if (!active) {
                    btn.on(Node.EventType.TOUCH_END, (ev) => {
                        ev.propagationStopped = true;
                        AudioManager.playUi();
                        buyArmedId = null;
                        if (gm?.selectCharacter(c.id)) {
                            AudioManager.playVoice(c.id);
                            setTip(`已出战 ${c.name}`, true);
                            paintPreview(true);
                            paintGrid(false);
                        }
                    });
                }
            } else {
                const armed = buyArmedId === c.id;
                const enough = (gm?.save.currency.soul ?? 0) >= c.cost;
                const btn = CharacterSelect._btn(
                    detail,
                    armed ? `再点确认 · ${c.cost}魂` : `购买 · ${c.cost}魂`,
                    0, -42, 190, 32,
                    armed ? new Color(180, 70, 50, 255)
                        : enough ? new Color(120, 80, 36, 255) : new Color(70, 55, 50, 255),
                );
                btn.on(Node.EventType.TOUCH_END, (ev) => {
                    ev.propagationStopped = true;
                    AudioManager.playUi();
                    if (!enough) {
                        buyArmedId = null;
                        setTip(`灵魂石不足（需要 ${c.cost}）`, false);
                        paintPreview(false);
                        return;
                    }
                    if (buyArmedId !== c.id) {
                        buyArmedId = c.id;
                        setTip(`将花费 ${c.cost} 魂解锁 ${c.name}，请再点一次确认`, false);
                        paintPreview(false);
                        return;
                    }
                    buyArmedId = null;
                    const res = gm?.tryUnlockCharacter(c.id) ?? { ok: false, reason: '未就绪' };
                    if (!res.ok) {
                        setTip(res.reason ?? '解锁失败', false);
                        paintPreview(false);
                        paintGrid(false);
                        return;
                    }
                    AudioManager.playVoice(c.id);
                    setTip(`已解锁并出战 ${c.name}`, true);
                    eventBus.emit('show-tip', { text: `✅ 解锁 ${c.name}` });
                    paintPreview(true);
                    paintGrid(false);
                });
            }
        };

        const paintGrid = (resetScroll: boolean) => {
            const all = listCharacters();
            const prevOffset = resetScroll
                ? { x: 0, y: 0 }
                : scroll.getScrollOffset().clone();

            content.removeAllChildren();
            const rows = Math.max(1, Math.ceil(all.length / COLS));
            const contentH = Math.max(
                GRID_H,
                PAD_Y * 2 + rows * CELL + Math.max(0, rows - 1) * GAP,
            );
            contentUI.setContentSize(GRID_W, contentH);
            contentUI.setAnchorPoint(0.5, 1);
            content.setPosition(0, GRID_H / 2, 0);

            const span = COLS * CELL + (COLS - 1) * GAP;

            all.forEach((c, i) => {
                const owned = isOwned(c.id);
                const on = c.id === focusId;
                const active = owned && (GameManager.instance?.selectedCharacterId === c.id);
                const col = i % COLS;
                const row = Math.floor(i / COLS);
                const x = -span / 2 + CELL / 2 + col * (CELL + GAP);
                const y = -PAD_Y - CELL / 2 - row * (CELL + GAP);

                const cell = new Node(`C_${c.id}`);
                cell.layer = Layers.Enum.UI_2D;
                cell.setParent(content);
                cell.setPosition(x, y, 0);
                cell.addComponent(UITransform).setContentSize(CELL, CELL);
                const cg = cell.addComponent(Graphics);
                paintChip(cg, CELL, CELL, on, !owned);
                if (active && !on) {
                    cg.strokeColor = new Color(120, 220, 160, 200);
                    cg.lineWidth = 2;
                    cg.roundRect(-CELL / 2, -CELL / 2, CELL, CELL, 12); cg.stroke();
                }

                const thumb = new Node('Thumb');
                thumb.layer = Layers.Enum.UI_2D;
                thumb.setParent(cell);
                thumb.setPosition(0, 12, 0);
                thumb.addComponent(UITransform).setContentSize(72, 72);
                thumb.setScale(0.72, 0.72, 1);
                // 与上方大立绘同一套骨骼小人，缩略静态
                thumb.addComponent(Graphics);
                CharacterRig.mount(thumb, c.skinId || c.id, false);

                if (!owned) {
                    const veil = new Node('Lock');
                    veil.layer = Layers.Enum.UI_2D;
                    veil.setParent(cell);
                    veil.setPosition(0, 14, 0);
                    veil.addComponent(UITransform).setContentSize(CELL - 16, 64);
                    const vg = veil.addComponent(Graphics);
                    vg.fillColor = new Color(8, 6, 14, 120);
                    vg.roundRect(-(CELL - 16) / 2, -32, CELL - 16, 64, 8); vg.fill();
                    CharacterSelect._lbl(veil, '🔒', 0, 4, 16, new Color(255, 210, 150, 255), 36);
                }

                CharacterSelect._lbl(
                    cell,
                    c.name,
                    0, -32, 11,
                    owned ? new Color(230, 235, 255, 255) : new Color(180, 160, 140, 255),
                    CELL - 10,
                );
                if (!owned) {
                    CharacterSelect._lbl(
                        cell, `${c.cost}魂`, 0, -44, 10, new Color(230, 190, 120, 255), CELL - 10,
                    );
                } else if (active) {
                    CharacterSelect._lbl(
                        cell, '出战', 0, -44, 10, new Color(140, 230, 160, 255), CELL - 10,
                    );
                }

                cell.on(Node.EventType.TOUCH_END, (ev) => {
                    ev.propagationStopped = true;
                    AudioManager.playUi();
                    if (focusId !== c.id) buyArmedId = null;
                    focusId = c.id;
                    if (owned) {
                        AudioManager.playVoice(c.id);
                        setTip(`${c.name} · 点右侧可设为出战`, true);
                    } else {
                        setTip(`${c.name}（未解锁）· ${c.cost} 魂 · 点右侧购买并确认`, false);
                    }
                    paintPreview(true);
                    paintGrid(false);
                });
            });

            if (!resetScroll) {
                scroll.scrollToOffset(prevOffset as any, 0);
            }
        };

        paintPreview(false);
        paintGrid(true);

        const back = CharacterSelect._btn(
            panel, '返回主界面', 0, backY, 170, 38, UiTone.btn,
        );
        back.on(Node.EventType.TOUCH_END, (ev) => {
            ev.propagationStopped = true;
            AudioManager.playUi();
            CharacterSelect._open = false;
            CharacterSelect._root = null;
            eventBus.emit('lobby-input-lock', { ms: 400 });
            softClose(root);
        });
    }

    private static _btn(
        p: Node, t: string, x: number, y: number, w: number, h: number, c: Color,
    ): Node {
        const n = new Node('B');
        n.layer = Layers.Enum.UI_2D;
        n.setParent(p);
        n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(w, h);
        const g = n.addComponent(Graphics);
        g.fillColor = new Color(0, 0, 0, 50);
        g.roundRect(-w / 2 + 2, -h / 2 - 2, w, h, 10); g.fill();
        g.fillColor = c;
        g.roundRect(-w / 2, -h / 2, w, h, 10); g.fill();
        g.fillColor = new Color(255, 230, 180, 45);
        g.roundRect(-w / 2 + 8, h / 2 - 14, w - 16, 8, 4); g.fill();
        g.strokeColor = new Color(255, 210, 130, 120);
        g.lineWidth = 1.5;
        g.roundRect(-w / 2, -h / 2, w, h, 10); g.stroke();
        CharacterSelect._lbl(n, t, 0, 0, 16, new Color(255, 248, 230, 255), w - 10);
        return n;
    }

    private static _lbl(p: Node, t: string, x: number, y: number, s: number, c: Color, width = 620): Label {
        const n = new Node('L');
        n.layer = Layers.Enum.UI_2D;
        n.setParent(p);
        n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(width, s + 8);
        const l = n.addComponent(Label);
        l.string = t;
        l.fontSize = s;
        l.color = c;
        l.horizontalAlign = 1;
        l.overflow = Label.Overflow.CLAMP;
        return l;
    }
}
