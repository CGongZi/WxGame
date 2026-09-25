import {
    Node, Label, Color, UITransform, Graphics,
    tween, Vec3, Tween, Layers, input, Input, EventKeyboard, KeyCode, find,
} from 'cc';
import { GameManager } from '../../core/GameManager';
import { GameFlow } from '../../core/GameFlow';
import { eventBus } from '../../core/EventBus';
import { TalentTree } from './TalentTree';
import { SoulShop } from './SoulShop';
import { SettingsPanel } from './SettingsPanel';
import { CodexUI } from './CodexUI';
import { CharacterSelect } from './CharacterSelect';
import { LoadoutUI } from './LoadoutUI';
import { RankBoard } from './RankBoard';
import { ViewZoom } from '../camera/ViewZoom';
import { AudioManager } from '../../core/AudioManager';
import { ModeSelect } from './ModeSelect';
import { StageSelect } from './StageSelect';
import { NewbieGuide } from './NewbieGuide';
import { LobbyBag } from './LobbyBag';
import { RedeemUI } from './RedeemUI';
import { getCharacter } from '../../core/CharacterData';
import { getWeapon } from '../weapon/WeaponController';
import { PlayerController } from '../player/PlayerController';

/**
 * LobbyUI —— 主界面
 * 侧栏 / 底栏：纯滑动进出 + 回弹（backOut / backIn），无淡入淡出
 */
export class LobbyUI {
    private static _root: Node | null = null;
    private static _starting = false;
    private static _refreshStats: (() => void) | null = null;
    private static _onKey: ((e: EventKeyboard) => void) | null = null;
    private static _inputLockUntil = 0;
    private static _onLock: ((d: { ms?: number }) => void) | null = null;

    // 布局：须落在大厅相机可视区以内
    // LOBBY_ORTHO=235 → 半高 235、半宽 ≈418；侧栏/顶底缩小后更疏朗
    private static readonly LEFT_X = -298;
    private static readonly RIGHT_X = 298;
    private static readonly BAR_Y = 8;
    private static readonly BOTTOM_Y = -158;
    private static readonly OFF_L = -520;
    private static readonly OFF_R = 520;
    private static readonly OFF_B = -380;
    private static readonly TOP_Y = 188;

    static reset() {
        LobbyUI._unbindStats();
        LobbyUI._unbindKey();
        LobbyUI._unbindLock();
        LobbyUI._starting = false;
        LobbyUI._inputLockUntil = 0;
        TalentTree.reset();
        SoulShop.reset();
        SettingsPanel.reset();
        CodexUI.reset();
        CharacterSelect.reset();
        LoadoutUI.reset();
        RankBoard.reset();
        ModeSelect.reset();
        StageSelect.reset();
        LobbyBag.reset();
        RedeemUI.reset();
        if (LobbyUI._root?.isValid) {
            Tween.stopAllByTarget(LobbyUI._root);
            for (const c of LobbyUI._root.children) Tween.stopAllByTarget(c);
            LobbyUI._root.destroy();
        }
        LobbyUI._root = null;
        GameFlow.reset();
    }

    static lockInput(ms = 500) {
        LobbyUI._inputLockUntil = Date.now() + ms;
    }

    private static _unbindStats() {
        if (LobbyUI._refreshStats) {
            eventBus.off('soul-changed', LobbyUI._refreshStats);
            eventBus.off('stash-changed', LobbyUI._refreshStats);
            eventBus.off('loadout-changed', LobbyUI._refreshStats);
            LobbyUI._refreshStats = null;
        }
    }

    private static _unbindKey() {
        if (LobbyUI._onKey) {
            input.off(Input.EventType.KEY_DOWN, LobbyUI._onKey);
            LobbyUI._onKey = null;
        }
    }

    private static _unbindLock() {
        if (LobbyUI._onLock) {
            eventBus.off('lobby-input-lock', LobbyUI._onLock);
            LobbyUI._onLock = null;
        }
    }

    private static _uiLayer(n: Node) {
        n.layer = Layers.Enum.UI_2D;
    }

    static show(canvas: Node, onPlay: () => void) {
        const old = canvas.getChildByName('LobbyUI');
        if (old?.isValid) old.destroy();
        LobbyUI._root = null;
        LobbyUI._starting = false;
        LobbyUI._unbindKey();
        LobbyUI._unbindLock();

        // 回大厅时视角拉近（与侧栏滑入同期）
        ViewZoom.toLobby(0.42);
        GameFlow.reset();
        AudioManager.startBgm('lobby');
        // #166 回大厅清战斗无敌闪，避免角色闪两下
        try {
            find('Canvas/Player')?.getComponent(PlayerController)?.clearInvuln();
        } catch { /* ignore */ }

        const root = new Node('LobbyUI');
        LobbyUI._uiLayer(root);
        root.setParent(canvas);
        root.setPosition(0, 0, 0);
        root.setSiblingIndex(9999);
        root.addComponent(UITransform).setContentSize(1334, 750);
        LobbyUI._root = root;

        // 顶栏一条：补给 | 标题 | 排行·设置·灵魂石
        LobbyUI._drawTopBar(root, canvas);

        // 中央氛围框（不挡侧栏点击）
        LobbyUI._drawCenterFrame(root);

        // 左侧主循环：备战 / 商店；右侧成长：天赋 / 图鉴
        const left = LobbyUI._sideBar(root, 'LeftBar', LobbyUI.LEFT_X, [
            { title: '备战', sub: '角色·武器', action: () => LoadoutUI.show(canvas) },
            { title: '商店', sub: '灵魂石', action: () => SoulShop.show(canvas) },
        ]);
        const right = LobbyUI._sideBar(root, 'RightBar', LobbyUI.RIGHT_X, [
            { title: '天赋', sub: '永久强化', action: () => TalentTree.show(canvas) },
            { title: '图鉴', sub: '见闻录', action: () => CodexUI.show(canvas) },
        ]);

        const bottom = LobbyUI._buildBottom(root);

        // ★ 入场：从屏外滑入 + 回弹（backOut），无淡入
        left.setPosition(LobbyUI.OFF_L, LobbyUI.BAR_Y, 0);
        right.setPosition(LobbyUI.OFF_R, LobbyUI.BAR_Y, 0);
        bottom.setPosition(0, LobbyUI.OFF_B, 0);
        tween(left)
            .to(0.42, { position: new Vec3(LobbyUI.LEFT_X, LobbyUI.BAR_Y, 0) }, { easing: 'backOut' })
            .start();
        tween(right)
            .to(0.42, { position: new Vec3(LobbyUI.RIGHT_X, LobbyUI.BAR_Y, 0) }, { easing: 'backOut' })
            .start();
        tween(bottom)
            .delay(0.06)
            .to(0.45, { position: new Vec3(0, LobbyUI.BOTTOM_Y, 0) }, { easing: 'backOut' })
            .start();

        LobbyUI._onLock = (d: { ms?: number }) => LobbyUI.lockInput(d?.ms ?? 500);
        eventBus.on('lobby-input-lock', LobbyUI._onLock);

        const start = bottom.getChildByName('StartBtn')!;
        const launch = () => {
            LobbyUI._starting = true;
            LobbyUI._unbindStats();
            LobbyUI._unbindKey();
            LobbyUI._unbindLock();
            AudioManager.playUi();
            try {
                const cid = GameManager.instance?.selectedCharacterId
                    ?? GameManager.instance?.save?.selectedCharacter
                    ?? 'knight';
                AudioManager.playVoice(cid);
            } catch { /* ignore */ }
            // ★ 先建房再甩出侧栏：否则拉高视角的 0.4s 里露出的是大厅平地（旧长方形地图）
            // beginStageRun / beginEndlessRun 已在 ModeSelect 里调用
            GameFlow.setPlaying();
            onPlay();
            LobbyUI._playOut(left, right, bottom, root, () => {
                const mode = GameManager.instance?.runConfig.mode;
                const tip = mode === 'endless'
                    ? '♾ 无尽模式 · 层数不停'
                    : '📜 关卡模式 · 左移右攻';
                eventBus.emit('show-tip', { text: tip });
            });
        };
        const doStart = () => {
            if (LobbyUI._starting) return;
            if (TalentTree.isOpen) return;
            if (SoulShop.isOpen) return;
            if (SettingsPanel.isOpen) return;
            if (CodexUI.isOpen) return;
            if (CharacterSelect.isOpen || LoadoutUI.isOpen) return;
            if (RankBoard.isOpen) return;
            if (ModeSelect.isOpen || StageSelect.isOpen) return;
            if (NewbieGuide.isOpen) return;
            if (LobbyBag.isOpen) return;
            if (Date.now() < LobbyUI._inputLockUntil) return;
            AudioManager.playUi();
            ModeSelect.show(canvas, () => launch());
        };
        start.on(Node.EventType.TOUCH_END, (ev) => { ev.propagationStopped = true; doStart(); });
        start.on(Node.EventType.MOUSE_UP, (ev) => {
            ev.propagationStopped = true;
            if (Date.now() < LobbyUI._inputLockUntil) return;
            doStart();
        });

        LobbyUI._onKey = (e: EventKeyboard) => {
            if (e.keyCode === KeyCode.ENTER) doStart();
        };
        input.on(Input.EventType.KEY_DOWN, LobbyUI._onKey);

        console.log('[LobbyUI] 主界面已显示（滑动回弹）');
    }

    static showReturn(canvas: Node, onReady?: () => void) {
        LobbyUI.reset();
        LobbyUI.show(canvas, () => onReady?.());
    }

    /** 开战：侧栏左右甩出 + 底栏下甩，同时视角拉高看全图 */
    private static _playOut(
        left: Node, right: Node, bottom: Node, root: Node, done: () => void,
    ) {
        const dur = 0.38;
        Tween.stopAllByTarget(left);
        Tween.stopAllByTarget(right);
        Tween.stopAllByTarget(bottom);

        // ★ 与按钮滑出同步：相机拉高，视野更全
        ViewZoom.toPlay(dur);

        // 标题带一并甩走
        const title = root.getChildByName('TitleBand');
        if (title?.isValid) {
            Tween.stopAllByTarget(title);
            tween(title)
                .to(dur * 0.85, { position: new Vec3(0, 460, 0) }, { easing: 'backIn' })
                .start();
        }
        const frame = root.getChildByName('CenterFrame');
        if (frame?.isValid) {
            Tween.stopAllByTarget(frame);
            tween(frame)
                .to(0.2, { scale: new Vec3(0.92, 0.92, 1) }, { easing: 'quadIn' })
                .to(0.15, { scale: new Vec3(1.05, 1.05, 1) }, { easing: 'quadOut' })
                .start();
        }

        // backIn：先微微往回弹一下，再甩出屏外
        tween(left)
            .to(dur, { position: new Vec3(LobbyUI.OFF_L, LobbyUI.BAR_Y, 0) }, { easing: 'backIn' })
            .start();
        tween(right)
            .to(dur, { position: new Vec3(LobbyUI.OFF_R, LobbyUI.BAR_Y, 0) }, { easing: 'backIn' })
            .start();
        tween(bottom)
            .to(dur, { position: new Vec3(0, LobbyUI.OFF_B, 0) }, { easing: 'backIn' })
            .call(() => {
                if (root.isValid) root.destroy();
                LobbyUI._root = null;
                LobbyUI._starting = false;
                done();
            })
            .start();
    }

    // ── 视觉构建 ──────────────────────────────────────────

    /**
     * 顶栏一条齐：左补给 · 中标题 · 右排行/设置/灵魂石
     * 同一高度、同一底板，避免散件错位叠在标题上。
     */
    private static _drawTopBar(root: Node, canvas: Node) {
        const y = LobbyUI.TOP_Y;
        const band = new Node('TitleBand');
        LobbyUI._uiLayer(band);
        band.setParent(root);
        band.setPosition(0, y, 0);
        const BW = 640;
        const BH = 42;
        band.addComponent(UITransform).setContentSize(BW, BH);

        const g = band.addComponent(Graphics);
        g.fillColor = new Color(22, 16, 12, 235);
        g.roundRect(-BW / 2, -BH / 2, BW, BH, 10); g.fill();
        g.strokeColor = new Color(210, 160, 70, 220);
        g.lineWidth = 1.8;
        g.roundRect(-BW / 2, -BH / 2, BW, BH, 10); g.stroke();
        g.fillColor = new Color(255, 210, 130, 28);
        g.roundRect(-BW / 2 + 8, BH / 2 - 11, BW - 16, 8, 4); g.fill();

        LobbyUI._lbl(band, '像素地牢', -40, 6, 20, new Color(255, 228, 160, 255), 200);
        LobbyUI._lbl(
            band, '备战组装 · 点下方选模式开战',
            -40, -11, 10, new Color(175, 155, 125, 220), 200,
        );

        LobbyUI._chip(band, 'BagBadge', -BW / 2 + 46, 0, 74, 30, () => {
            if (Date.now() < LobbyUI._inputLockUntil) return;
            if (LobbyUI._anyOverlayOpen()) return;
            AudioManager.playUi();
            LobbyBag.show(canvas);
        }, (n) => {
            const count = LobbyBag.totalCount();
            const lbl = LobbyUI._lbl(
                n, count > 0 ? `🎒 ${count}` : '🎒',
                0, 0, 14, new Color(255, 220, 150, 255), 70,
            );
            lbl.name = 'BagLbl';
        });

        // 右侧：排行 · 设置 · 灵魂石（从右往左排布，固定间距）
        const padR = 14;
        const gapR = 14;
        const chipW = 52;
        const chipH = 28;
        const soulW = 112;
        let rx = BW / 2 - padR;
        rx -= soulW / 2;
        const soulX = rx;
        rx -= soulW / 2 + gapR + chipW / 2;
        const settingsX = rx;
        rx -= chipW / 2 + gapR + chipW / 2;
        const rankX = rx;

        LobbyUI._chip(band, 'RankBadge', rankX, 0, chipW, chipH, () => {
            if (Date.now() < LobbyUI._inputLockUntil) return;
            if (LobbyUI._anyOverlayOpen()) return;
            AudioManager.playUi();
            RankBoard.show(canvas);
        }, (n) => {
            LobbyUI._lbl(n, '排行', 0, 0, 12, new Color(220, 200, 160, 255), 48);
        });
        LobbyUI._chip(band, 'SettingsBadge', settingsX, 0, chipW, chipH, () => {
            if (Date.now() < LobbyUI._inputLockUntil) return;
            if (LobbyUI._anyOverlayOpen()) return;
            AudioManager.playUi();
            SettingsPanel.show(canvas);
        }, (n) => {
            LobbyUI._lbl(n, '设置', 0, 0, 12, new Color(220, 200, 160, 255), 48);
        });

        const soul = GameManager.instance?.save.currency.soul ?? 0;
        LobbyUI._chip(band, 'SoulBadge', soulX, 0, soulW, 30, null, (n) => {
            const lbl = LobbyUI._lbl(
                n, `✦ ${soul}`,
                0, 0, 13, new Color(255, 220, 150, 255), 100,
            );
            lbl.name = 'SoulLbl';
        });
    }

    private static _chip(
        parent: Node,
        name: string,
        x: number,
        y: number,
        w: number,
        h: number,
        onTap: (() => void) | null,
        paint: (n: Node) => void,
    ) {
        const n = new Node(name);
        LobbyUI._uiLayer(n);
        n.setParent(parent);
        n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(w, h);
        const g = n.addComponent(Graphics);
        g.fillColor = new Color(32, 24, 16, 230);
        g.roundRect(-w / 2, -h / 2, w, h, 9); g.fill();
        g.strokeColor = new Color(180, 130, 60, 180);
        g.lineWidth = 1.5;
        g.roundRect(-w / 2, -h / 2, w, h, 9); g.stroke();
        paint(n);
        if (onTap) {
            n.on(Node.EventType.TOUCH_END, (ev) => {
                ev.propagationStopped = true;
                onTap();
            });
        }
    }

    private static _anyOverlayOpen(): boolean {
        return TalentTree.isOpen || SoulShop.isOpen || SettingsPanel.isOpen
            || CodexUI.isOpen || CharacterSelect.isOpen || LoadoutUI.isOpen
            || RankBoard.isOpen || ModeSelect.isOpen || StageSelect.isOpen
            || NewbieGuide.isOpen || LobbyBag.isOpen || RedeemUI.isOpen;
    }

    private static _drawCenterFrame(root: Node) {
        const frame = new Node('CenterFrame');
        LobbyUI._uiLayer(frame);
        frame.setParent(root);
        frame.setSiblingIndex(0);
        frame.setPosition(0, 16, 0);
        frame.addComponent(UITransform).setContentSize(280, 280);

        const g = frame.addComponent(Graphics);
        // 暖金双环（略缩小，给侧栏留气口；角色 restScale 仍约占一半直径）
        g.strokeColor = new Color(180, 130, 60, 90);
        g.lineWidth = 2.5;
        g.circle(0, 0, 100); g.stroke();
        g.strokeColor = new Color(210, 170, 90, 55);
        g.lineWidth = 1.8;
        g.circle(0, 0, 114); g.stroke();
        // 四向刻度
        g.fillColor = new Color(200, 160, 80, 100);
        for (const a of [0, 90, 180, 270]) {
            const rad = a * Math.PI / 180;
            const x = Math.cos(rad) * 107;
            const y = Math.sin(rad) * 107;
            g.circle(x, y, 2.5); g.fill();
        }
        // 踏板
        g.fillColor = new Color(28, 20, 14, 140);
        g.ellipse(0, -92, 86, 16); g.fill();
        g.strokeColor = new Color(160, 120, 60, 80);
        g.lineWidth = 1.4;
        g.ellipse(0, -92, 86, 16); g.stroke();
    }

    private static _buildBottom(root: Node): Node {
        const bottom = new Node('BottomBar');
        LobbyUI._uiLayer(bottom);
        bottom.setParent(root);
        bottom.setPosition(0, LobbyUI.BOTTOM_Y, 0);
        bottom.addComponent(UITransform).setContentSize(380, 120);

        const bg = bottom.addComponent(Graphics);
        bg.fillColor = new Color(18, 13, 10, 235);
        bg.roundRect(-180, -54, 360, 108, 12); bg.fill();
        bg.strokeColor = new Color(200, 150, 70, 180);
        bg.lineWidth = 1.8;
        bg.roundRect(-180, -54, 360, 108, 12); bg.stroke();
        bg.strokeColor = new Color(255, 220, 150, 28);
        bg.lineWidth = 1;
        bg.roundRect(-170, -44, 340, 88, 9); bg.stroke();
        bg.fillColor = new Color(210, 160, 70, 120);
        bg.roundRect(-80, 44, 160, 2.5, 2); bg.fill();

        const save = GameManager.instance?.save;
        const floor = save?.progress.highestFloor ?? 0;
        const floorLbl = LobbyUI._lbl(
            bottom, `最高层  ${floor}`,
            0, 30, 14, new Color(230, 200, 140, 255), 320,
        );
        floorLbl.name = 'FloorLbl';

        // 出战摘要（幻想向，不堆攻防速）
        const loadout = LobbyUI._lbl(bottom, '', 0, 10, 12, new Color(180, 200, 160, 255), 320);
        loadout.name = 'LoadoutLbl';
        const refreshStats = () => {
            if (!bottom.isValid) return;
            const gm = GameManager.instance;
            const cid = gm?.selectedCharacterId ?? gm?.save?.selectedCharacter ?? 'knight';
            const wid = gm?.selectedWeaponId ?? 'sword';
            let cName = cid;
            let wName = wid;
            try { cName = getCharacter(cid)?.name ?? cid; } catch { /* ignore */ }
            try { wName = getWeapon(wid)?.name ?? wid; } catch { /* ignore */ }
            const ll = bottom.getChildByName('LoadoutLbl')?.getComponent(Label);
            if (ll) ll.string = `出战  ${cName} · ${wName}`;

            const f = gm?.save.progress.highestFloor ?? 0;
            const floorComp = bottom.getChildByName('FloorLbl')?.getComponent(Label);
            if (floorComp) floorComp.string = `最高层  ${f}`;

            const s = gm?.save.currency.soul ?? 0;
            const title = LobbyUI._root?.getChildByName('TitleBand');
            const soulComp = title?.getChildByName('SoulBadge')
                ?.getChildByName('SoulLbl')?.getComponent(Label);
            if (soulComp) soulComp.string = `✦ ${s}`;

            const bagComp = title?.getChildByName('BagBadge')
                ?.getChildByName('BagLbl')?.getComponent(Label);
            if (bagComp) {
                const n = LobbyBag.totalCount();
                bagComp.string = n > 0 ? `🎒 ${n}` : '🎒';
            }
        };
        LobbyUI._unbindStats();
        LobbyUI._refreshStats = refreshStats;
        refreshStats();
        eventBus.on('soul-changed', refreshStats);
        eventBus.on('stash-changed', refreshStats);
        eventBus.on('loadout-changed', refreshStats);

        const start = LobbyUI._startBtn(bottom, 0, -24, 220, 42);
        start.name = 'StartBtn';
        return bottom;
    }

    private static _sideBar(
        parent: Node, name: string, x: number,
        items: Array<{ title: string; sub?: string; placeholder?: boolean; action: () => void }>,
    ): Node {
        const bar = new Node(name);
        LobbyUI._uiLayer(bar);
        bar.setParent(parent);
        bar.setPosition(x, LobbyUI.BAR_Y, 0);

        const btnH = 52;
        const gap = 10;
        const padY = 16;
        const innerH = items.length * btnH + Math.max(0, items.length - 1) * gap;
        const barH = innerH + padY * 2;
        const barW = 132;
        bar.addComponent(UITransform).setContentSize(barW + 10, barH + 12);

        const bg = bar.addComponent(Graphics);
        bg.fillColor = new Color(24, 18, 14, 240);
        bg.roundRect(-barW / 2, -barH / 2, barW, barH, 12); bg.fill();
        bg.strokeColor = new Color(180, 130, 60, 200);
        bg.lineWidth = 2;
        bg.roundRect(-barW / 2, -barH / 2, barW, barH, 12); bg.stroke();
        // 顶饰条
        bg.fillColor = new Color(160, 110, 50, 170);
        bg.roundRect(-52, barH / 2 - 12, 104, 5, 2); bg.fill();
        // 侧高光
        bg.fillColor = new Color(255, 230, 180, 16);
        bg.roundRect(-barW / 2, -barH / 2, 6, barH, 3); bg.fill();

        const topY = (innerH / 2) - (btnH / 2);
        items.forEach((it, i) => {
            const y = topY - i * (btnH + gap);
            const label = it.title;
            const sub = it.placeholder ? '即将开放' : (it.sub ?? '');
            const color = it.placeholder
                ? new Color(42, 34, 28, 255)
                : new Color(58, 42, 28, 255);
            const accent = it.placeholder
                ? new Color(110, 90, 70, 180)
                : new Color(210, 160, 80, 220);

            const btn = LobbyUI._menuBtn(bar, label, sub, 0, y, 116, btnH, color, accent);
            const go = (ev: { propagationStopped: boolean }) => {
                ev.propagationStopped = true;
                if (Date.now() < LobbyUI._inputLockUntil) return;
                AudioManager.playUi();
                it.action();
            };
            btn.on(Node.EventType.TOUCH_END, go);
            btn.on(Node.EventType.MOUSE_UP, go);
        });
        return bar;
    }

    private static _menuBtn(
        p: Node, title: string, sub: string,
        x: number, y: number, w: number, h: number,
        fill: Color, accent: Color,
    ): Node {
        const n = new Node('B');
        LobbyUI._uiLayer(n);
        n.setParent(p); n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(w, h);

        const g = n.addComponent(Graphics);
        g.fillColor = fill;
        g.roundRect(-w / 2, -h / 2, w, h, 10); g.fill();
        g.strokeColor = accent;
        g.lineWidth = 1.6;
        g.roundRect(-w / 2, -h / 2, w, h, 10); g.stroke();
        g.fillColor = accent;
        g.roundRect(-w / 2, -h / 2 + 6, 4, h - 12, 2); g.fill();
        // 顶微高光
        g.fillColor = new Color(255, 220, 160, 22);
        g.roundRect(-w / 2 + 6, h / 2 - 12, w - 12, 8, 3); g.fill();

        LobbyUI._lbl(n, title, 4, 6, 16, new Color(255, 245, 230, 255), w - 18);
        LobbyUI._lbl(n, sub, 4, -12, 10, new Color(180, 160, 130, 200), w - 18);
        return n;
    }

    private static _startBtn(p: Node, x: number, y: number, w: number, h: number): Node {
        const n = new Node('StartBtn');
        LobbyUI._uiLayer(n);
        n.setParent(p); n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(w, h);

        const g = n.addComponent(Graphics);
        const draw = (pressed: boolean) => {
            g.clear();
            const pad = pressed ? 1 : 3;
            g.fillColor = new Color(120, 70, 28, 255);
            g.roundRect(-w / 2 - pad, -h / 2 - pad, w + pad * 2, h + pad * 2, 15); g.fill();
            g.fillColor = pressed
                ? new Color(190, 120, 40, 255)
                : new Color(210, 145, 50, 255);
            g.roundRect(-w / 2, -h / 2, w, h, 13); g.fill();
            g.fillColor = new Color(255, 220, 140, pressed ? 50 : 90);
            g.roundRect(-w / 2 + 8, h / 2 - 22, w - 16, 16, 7); g.fill();
            g.strokeColor = new Color(255, 230, 170, 210);
            g.lineWidth = 2;
            g.roundRect(-w / 2, -h / 2, w, h, 13); g.stroke();
        };
        draw(false);

        LobbyUI._lbl(n, '选择模式', 0, 1, 22, new Color(255, 250, 235, 255), w - 16);

        n.on(Node.EventType.TOUCH_START, () => {
            draw(true);
            n.setScale(0.97, 0.97, 1);
        });
        n.on(Node.EventType.TOUCH_CANCEL, () => {
            draw(false);
            n.setScale(1, 1, 1);
        });
        n.on(Node.EventType.TOUCH_END, () => {
            draw(false);
            n.setScale(1, 1, 1);
        });
        n.on(Node.EventType.MOUSE_DOWN, () => {
            draw(true);
            n.setScale(0.97, 0.97, 1);
        });
        n.on(Node.EventType.MOUSE_UP, () => {
            draw(false);
            n.setScale(1, 1, 1);
        });
        n.on(Node.EventType.MOUSE_LEAVE, () => {
            draw(false);
            n.setScale(1, 1, 1);
        });
        return n;
    }

    private static _lbl(
        p: Node, t: string, x: number, y: number, s: number, c: Color, width = 200,
    ): Node {
        const n = new Node('L');
        LobbyUI._uiLayer(n);
        n.setParent(p); n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(width, s + 12);
        const l = n.addComponent(Label);
        l.string = t; l.fontSize = s; l.color = c; l.horizontalAlign = 1;
        l.overflow = 0;
        return n;
    }
}
