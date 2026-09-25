import { _decorator, Component, Node, Label, Color,
         UITransform, Graphics, find, input, Input, EventKeyboard, KeyCode,
         tween, Vec3, EventTouch, BlockInputEvents, UIOpacity } from 'cc';
import { WorldBridge } from '../dungeon/WorldBridge';
import { MiniMapUI } from './MiniMapUI';
import { eventBus, GameEvents } from '../../core/EventBus';
import { EnemyRegistry } from '../enemy/EnemyRegistry';
import { GameOverOverlay } from './GameOverOverlay';
import { DungeonManager } from '../dungeon/DungeonManager';
import { ThemeRuntime } from '../dungeon/MapThemes';
import { MainMenu } from './MainMenu';
import { LobbyUI } from './LobbyUI';
import { GameManager } from '../../core/GameManager';
import { PlayerStats } from '../../core/PlayerStats';
import { GameClearOverlay } from './GameClearOverlay';
import { TalentTree } from './TalentTree';
import { SoulShop } from './SoulShop';
import { SettingsPanel } from './SettingsPanel';
import { CodexUI } from './CodexUI';
import { RankBoard } from './RankBoard';
import { GameFlow, FlowEvents } from '../../core/GameFlow';
import { WeaponController } from '../weapon/WeaponController';
import { rarityLabel } from '../weapon/WeaponRarity';
import { runCoins } from './UpgradeShop';
import { UpgradeShop } from './UpgradeShop';
import { TalentPick } from './TalentPick';
import { EnemyRadar } from './EnemyRadar';
import { BootLoading } from './BootLoading';
import { OpeningIntro } from './OpeningIntro';
import { CharacterSelect } from './CharacterSelect';
import { RoomBriefing } from './RoomBriefing';
import { ConfigStore } from '../../core/ConfigStore';
import { RunBag } from '../item/RunBag';
import { BagPanel } from './BagPanel';
import { drawItemGlyph } from '../fx/ItemArt';
import { AudioManager } from '../../core/AudioManager';
import { ExperienceCoach } from '../fx/ExperienceCoach';
import { PlayerSkill } from '../player/PlayerSkill';
import { EliteMark } from '../enemy/EliteMark';

const { ccclass } = _decorator;

/**
 * HUDManager —— 全用 Graphics 画，不依赖任何图片资源
 * 挂到 Canvas/HUD 节点即可
 */
@ccclass('HUDManager')
export class HUDManager extends Component {

    private _fillNode: Node      = null!;
    private _hpLabel: Label      = null!;
    private _coinLabel: Label    = null!;
    private _killLabel: Label    = null!;
    private _weaponLabel: Label  = null!;
    private _weaponHint: Label | null = null;
    private _tipLabel: Label     = null!;
    private _remainLabel: Label  = null!;
    private _goalLabel: Label    = null!;
    private _goalKey = '';
    private _floorLabel: Label   = null!;
    private _statsLabel: Label   = null!;
    private _hotbarRoot: Node | null = null;
    private _bagBtnLabel: Label | null = null;
    private _runStarted = false;
    private _combatHud: Node[] = [];
    private _healPulseT = 0;
    static readonly SKILL_BTN_X = 340;
    static readonly SKILL_BTN_Y = -120;
    private _skillBtn: Node | null = null;
    private _skillG: Graphics | null = null;
    private _skillIcon: Label | null = null;
    private _skillName: Label | null = null;
    private _skillCd: Label | null = null;
    private _skillPaintAcc = 0;
    private _skillWasReady = true;

    private _barMaxW = 200;
    private _killCount = 0;
    private _totalCoins = 0;
    private _hp = 100;
    private _maxHp = 100;
    private _shield = 0;
    private _armor = -1;
    /** #130 靶点靠近时半透的 HUD 块 */
    private _fadeNodes: Node[] = [];
    private _bagSig = '';
    private _lastTapAt = 0;

    /** 鼠标点击会同时触发 TOUCH_END + MOUSE_UP：同一 140ms 内只认一次 */
    private _tapOnce(): boolean {
        const now = Date.now();
        if (now - this._lastTapAt < 140) return false;
        this._lastTapAt = now;
        return true;
    }

    onLoad() {
        this._killCount  = 0;
        this._totalCoins = 0;
        this._buildUI();
        this._syncCombatHud();
        eventBus.on(FlowEvents.STATE, this._syncCombatHud, this);

        const canvas = this.node.parent ?? this.node;
        this.node.setSiblingIndex(canvas.children.length - 1);

        if (!this.node.getComponent(GameOverOverlay)) {
            this.node.addComponent(GameOverOverlay);
        }
        if (!this.node.getComponent(EnemyRadar)) {
            this.node.addComponent(EnemyRadar);
        }
        if (!this.node.getComponent(RoomBriefing)) {
            this.node.addComponent(RoomBriefing);
        }

        // 确保有 GameManager（场景里已有节点；此处兜底）
        if (!GameManager.instance) {
            const host = canvas.parent ?? canvas;
            if (!host.getComponent(GameManager)) host.addComponent(GameManager);
        }

        // 主界面由 LobbyBootstrap（FloorRenderer 挂上）负责弹出；
        // 这里只重置壳层状态；若 Bootstrap 未挂上再兜一次
        MainMenu.reset();
        GameClearOverlay.reset();
        TalentTree.reset();
        SoulShop.reset();
        SettingsPanel.reset();
        CodexUI.reset();
        RankBoard.reset();
        CharacterSelect.reset();
        RoomBriefing.forceClose(canvas);
        BagPanel.forceClose(canvas);
        GameFlow.reset();
        this.scheduleOnce(() => {
            BootLoading.whenReady(canvas, () => {
                if (!GameFlow.isLobby || canvas.getChildByName('LobbyUI')) return;
                OpeningIntro.play(canvas, () => {
                    if (!GameFlow.isLobby || canvas.getChildByName('LobbyUI')) return;
                    try {
                        LobbyUI.show(canvas, () => {
                            this._runStarted = true;
                            const dm = canvas.getComponent(DungeonManager);
                            if (dm) dm.restartRun();
                            else canvas.addComponent(DungeonManager);
                            this._refreshStats();
                        });
                    } catch (e) {
                        console.error('[HUD] LobbyUI 失败', e);
                    }
                });
            });
        }, 0.25);

        eventBus.on(GameEvents.PLAYER_HP_CHANGED, this._onHp,     this);
        eventBus.on(GameEvents.COIN_COLLECTED,    this._onCoin,   this);
        eventBus.on(GameEvents.ENEMY_KILLED,      this._onKill,   this);
        eventBus.on(GameEvents.WEAPON_CHANGED,    this._onWeapon, this);
        eventBus.on(GameEvents.ROOM_CLEARED,      this._onRoomCleared, this);
        eventBus.on(GameEvents.FLOOR_STARTED,     this._onFloorStarted, this);
        eventBus.on(GameEvents.BAG_CHANGED,       this._onBagChanged, this);
        eventBus.on('show-tip', this._onShowTip, this);
        eventBus.on('player-stats-changed', this._refreshStats, this);
        input.on(Input.EventType.KEY_DOWN, this._onKeyDown, this);
    }

    start() {
        this.scheduleOnce(() => {
            // Player 留在 Canvas 下，钉屏幕中心 (0,0)
            const player = find('Canvas/Player');
            const wc = player?.getComponent('WeaponController') as any;
            if (wc?.currentWeapon) {
                this._onWeapon({
                    name:  wc.currentWeapon.name,
                    emoji: wc.currentWeapon.emoji,
                    type:  wc.currentWeapon.type,
                });
            }
            // 主动读一次血量（Player.onLoad 可能早于 HUD，事件已丢）
            const pc = player?.getComponent('PlayerController') as any;
            if (pc) {
                this._onHp({ current: pc.currentHp ?? 100, max: pc.maxHp ?? 100 });
            } else {
                this._onHp({ current: 100, max: 100 });
            }
            this._refreshRemain();
            this._refreshStats();
        }, 0.5);
    }

    onDestroy() {
        eventBus.off(GameEvents.PLAYER_HP_CHANGED, this._onHp,     this);
        eventBus.off(GameEvents.COIN_COLLECTED,    this._onCoin,   this);
        eventBus.off(GameEvents.ENEMY_KILLED,      this._onKill,   this);
        eventBus.off(GameEvents.WEAPON_CHANGED,    this._onWeapon, this);
        eventBus.off(GameEvents.ROOM_CLEARED,      this._onRoomCleared, this);
        eventBus.off(GameEvents.FLOOR_STARTED,    this._onFloorStarted, this);
        eventBus.off(GameEvents.BAG_CHANGED,      this._onBagChanged, this);
        eventBus.off('show-tip', this._onShowTip, this);
        eventBus.off('player-stats-changed', this._refreshStats, this);
        eventBus.off(FlowEvents.STATE, this._syncCombatHud, this);
        input.off(Input.EventType.KEY_DOWN, this._onKeyDown, this);
    }

    private _onKeyDown = (e: EventKeyboard) => {
        if (!GameFlow.isPlaying) return;
        if (BagPanel.isOpen) {
            if (e.keyCode === KeyCode.KEY_B || e.keyCode === KeyCode.ESCAPE) {
                BagPanel.forceClose(this.node.parent ?? this.node);
            }
            return;
        }
        if (UpgradeShop.isOpen) return;
        if (TalentPick.isOpen) return;
        if (GameFlow.isCombatFrozen) return;
        if (e.keyCode === KeyCode.KEY_B) {
            BagPanel.toggle(this.node.parent ?? this.node);
            return;
        }
        const idxByKey: Partial<Record<number, number>> = {
            [KeyCode.DIGIT_1]: 0, [KeyCode.NUM_1]: 0,
            [KeyCode.DIGIT_2]: 1, [KeyCode.NUM_2]: 1,
            [KeyCode.DIGIT_3]: 2, [KeyCode.NUM_3]: 2,
            [KeyCode.DIGIT_4]: 3, [KeyCode.NUM_4]: 3,
            [KeyCode.DIGIT_5]: 4, [KeyCode.NUM_5]: 4,
            [KeyCode.DIGIT_6]: 5, [KeyCode.NUM_6]: 5,
        };
        const idx = idxByKey[e.keyCode];
        if (idx === undefined) return;
        const tip = RunBag.use(idx);
        if (tip) eventBus.emit('show-tip', { text: `✅ ${tip}` });
        else eventBus.emit('show-tip', { text: '空格子' });
    };

    private _onShowTip(d: { text: string }) {
        this._showTip(d.text);
    }

    // ── 构建 UI ───────────────────────────────────────────

    private _buildUI() {
        // Canvas 中心是 (0,0)，半宽 667，半高 375
        const HW = 667, HH = 375;

        // HUD 自身铺满设计分辨率，避免子节点被父级尺寸影响
        const hudUI = this.getComponent(UITransform) ?? this.addComponent(UITransform);
        hudUI.setContentSize(1334, 750);

        // ── 左上角 HP（简化：位置更靠内，保证预览窗口能看见）──
        // 不用极端边缘坐标 (-655)，改用 (-520, 300)
        const panel = this._node('HPPanel', -520, 300, this.node);
        panel.getComponent(UITransform)!.setContentSize(260, 60);

        // 背景（暖石板）
        const pbg = panel.addComponent(Graphics);
        pbg.fillColor = new Color(18, 12, 10, 200);
        pbg.roundRect(-130, -30, 260, 60, 10);
        pbg.fill();
        pbg.strokeColor = new Color(180, 120, 60, 140);
        pbg.lineWidth = 1.5;
        pbg.roundRect(-130, -30, 260, 60, 10);
        pbg.stroke();

        // ❤ + 数字（大字号，一眼能看到）
        const heartN = this._node('Heart', -100, 8, panel);
        heartN.getComponent(UITransform)!.setContentSize(40, 30);
        const heartL = heartN.addComponent(Label);
        heartL.string   = '❤';
        heartL.fontSize = 26;
        heartL.color    = new Color(255, 90, 80, 255);

        // HP 进度条背景
        const bgN = this._node('HPBg', 20, 8, panel);
        bgN.getComponent(UITransform)!.setContentSize(this._barMaxW + 4, 18);
        const bgG = bgN.addComponent(Graphics);
        bgG.fillColor = new Color(50, 18, 14, 230);
        bgG.roundRect(-this._barMaxW / 2 - 2, -9, this._barMaxW + 4, 18, 4);
        bgG.fill();

        // HP 填充条
        this._fillNode = this._node('HPFill', 20, 8, panel);
        this._fillNode.getComponent(UITransform)!.setContentSize(this._barMaxW, 14);
        const fillG = this._fillNode.addComponent(Graphics);
        fillG.fillColor = new Color(210, 55, 45, 255);
        fillG.roundRect(-this._barMaxW / 2, -7, this._barMaxW, 14, 3);
        fillG.fill();

        // HP 数字
        const hpN = this._node('HPNum', 20, -16, panel);
        hpN.getComponent(UITransform)!.setContentSize(200, 22);
        this._hpLabel = hpN.addComponent(Label);
        this._hpLabel.string   = '100/100';
        this._hpLabel.fontSize = 16;
        this._hpLabel.color    = new Color(255, 230, 210, 255);
        this._hpLabel.horizontalAlign = 1; // CENTER

        // ── 右上角 局内币（击杀改战报；不常驻数字墙）────────
        const coinN = this._node('Coins', 520, 300, this.node);
        coinN.getComponent(UITransform)!.setContentSize(140, 28);
        this._coinLabel = coinN.addComponent(Label);
        this._coinLabel.string   = '🪙 0';
        this._coinLabel.fontSize = 22;
        this._coinLabel.color    = new Color(255, 210, 100, 255);
        this._coinLabel.horizontalAlign = 2; // RIGHT

        const killN = this._node('Kills', 520, 268, this.node);
        killN.getComponent(UITransform)!.setContentSize(140, 24);
        this._killLabel = killN.addComponent(Label);
        this._killLabel.string   = '';
        this._killLabel.fontSize = 18;
        this._killLabel.color    = new Color(210, 180, 140, 255);
        this._killLabel.horizontalAlign = 2;
        killN.active = false;

        // ── 底部中央 武器栏（点按轮换已拥有武器 · 手机主交互）──
        const wBar = this._node('WeaponBar', 0, -248, this.node);
        wBar.getComponent(UITransform)!.setContentSize(240, 48);
        wBar.addComponent(BlockInputEvents);
        const wbG = wBar.addComponent(Graphics);
        wbG.fillColor = new Color(16, 12, 10, 200);
        wbG.roundRect(-118, -22, 236, 44, 10);
        wbG.fill();
        wbG.strokeColor = new Color(200, 150, 70, 210);
        wbG.lineWidth = 2;
        wbG.roundRect(-118, -22, 236, 44, 10);
        wbG.stroke();
        const wN = this._node('WeaponName', 0, 4, wBar);
        wN.getComponent(UITransform)!.setContentSize(220, 28);
        this._weaponLabel = wN.addComponent(Label);
        this._weaponLabel.string   = '🗡️ 铁剑';
        this._weaponLabel.fontSize = 20;
        this._weaponLabel.color    = new Color(255, 230, 150, 255);
        this._weaponLabel.horizontalAlign = 1;
        const hint = this._node('WeaponHint', 0, -14, wBar);
        hint.getComponent(UITransform)!.setContentSize(220, 16);
        this._weaponHint = hint.addComponent(Label);
        this._weaponHint.string = '点此切换武器';
        this._weaponHint.fontSize = 11;
        this._weaponHint.color = new Color(180, 150, 100, 200);
        this._weaponHint.horizontalAlign = 1;

        const tapWeapon = (ev?: EventTouch) => {
            if (ev) ev.propagationStopped = true;
            if (!this._tapOnce()) return;
            if (!GameFlow.isPlaying) return;
            if (UpgradeShop.isOpen || TalentPick.isOpen || GameFlow.isCombatFrozen) return;
            const player = find('Canvas/Player');
            const wc = player?.getComponent(WeaponController);
            if (!wc) return;
            AudioManager.playUi();
            const name = wc.cycleNext();
            if (!name) {
                eventBus.emit('show-tip', { text: '只有一把武器 · 拾取后再切换' });
            }
            this._refreshWeaponHint(wc);
        };
        wBar.on(Node.EventType.TOUCH_END, tapWeapon);
        wBar.on(Node.EventType.MOUSE_UP, tapWeapon);

        // ── 中央提示 ──────────────────────────────────────
        const tipN = this._node('Tip', 0, 80, this.node);
        tipN.getComponent(UITransform)!.setContentSize(400, 40);
        this._tipLabel = tipN.addComponent(Label);
        this._tipLabel.string   = '';
        this._tipLabel.fontSize = 28;
        this._tipLabel.color    = new Color(255, 220, 120, 255);
        this._tipLabel.horizontalAlign = 1;
        tipN.active = false;

        // ── 剩余敌人（顶部中央，醒目）──────────────────────
        const remN = this._node('Remain', 0, 310, this.node);
        remN.getComponent(UITransform)!.setContentSize(280, 36);
        const remBgN = this._node('RemainBg', 0, 0, remN);
        remBgN.getComponent(UITransform)!.setContentSize(240, 32);
        const remBg = remBgN.addComponent(Graphics);
        remBg.fillColor = new Color(16, 12, 10, 180);
        remBg.roundRect(-120, -16, 240, 32, 10);
        remBg.fill();
        remBg.strokeColor = new Color(180, 130, 60, 120);
        remBg.lineWidth = 1.5;
        remBg.roundRect(-120, -16, 240, 32, 10);
        remBg.stroke();
        const remTxt = this._node('RemainTxt', 0, 0, remN);
        remTxt.getComponent(UITransform)!.setContentSize(240, 32);
        this._remainLabel = remTxt.addComponent(Label);
        this._remainLabel.string   = '剩余 0';
        this._remainLabel.fontSize = 20;
        this._remainLabel.color    = new Color(255, 220, 140, 255);
        this._remainLabel.horizontalAlign = 1;

        // ── 本房目标：并入顶部 Remain，不再双行重复 ──────────
        const goalN = this._node('Goal', 0, 278, this.node);
        goalN.getComponent(UITransform)!.setContentSize(320, 22);
        this._goalLabel = goalN.addComponent(Label);
        this._goalLabel.string = '';
        this._goalLabel.fontSize = 14;
        this._goalLabel.color = new Color(190, 170, 140, 220);
        this._goalLabel.horizontalAlign = 1;
        goalN.active = false;

        // ── 层数 + 主题（右上角，加宽以容纳主题名）────────────────
        const floorN = this._node('Floor', 470, 268, this.node);
        floorN.getComponent(UITransform)!.setContentSize(280, 22);
        this._floorLabel = floorN.addComponent(Label);
        this._floorLabel.string   = '🗺 第1层';
        this._floorLabel.fontSize = 16;
        this._floorLabel.color    = new Color(180, 200, 170, 220);
        this._floorLabel.horizontalAlign = 2;
        this._floorLabel.overflow = Label.Overflow.CLAMP;

        // ── 属性条已隐藏（玩法不卖数字墙）────────────────
        const statsN = this._node('Stats', -520, -300, this.node);
        statsN.getComponent(UITransform)!.setContentSize(280, 24);
        this._statsLabel = statsN.addComponent(Label);
        this._statsLabel.string = '';
        this._statsLabel.fontSize = 14;
        this._statsLabel.color = new Color(170, 190, 150, 220);
        this._statsLabel.horizontalAlign = 0;
        statsN.active = false;

        // ── 左上小地图（#131，血条正下方）────────────────────
        const mm = this._node('MiniMap', -548, 205, this.node);
        mm.addComponent(MiniMapUI);

        // ── 底部快捷栏（6 格）+ 背包钮 ────────────────────
        this._buildHotbar();
        // ── 右下技能钮（#120 角色主动技能）──────────────────
        this._buildSkillBtn();

        // 战斗 HUD 节点（Lobby 隐藏）
        this._combatHud = ['HPPanel', 'MiniMap', 'Coins', 'Kills', 'WeaponBar', 'Remain', 'Goal', 'Floor', 'Stats', 'Hotbar', 'SkillBtn']
            .map(n => this.node.getChildByName(n))
            .filter((n): n is Node => !!n);
        // #130 角色走到底下 / 走到血条后面 → 这些块半透，不挡视线
        this._fadeNodes = ['HPPanel', 'MiniMap', 'WeaponBar', 'Hotbar', 'SkillBtn', 'Remain', 'Coins', 'Floor']
            .map(n => this.node.getChildByName(n))
            .filter((n): n is Node => !!n);
        for (const n of this._fadeNodes) if (!n.getComponent(UIOpacity)) n.addComponent(UIOpacity);
        this._syncCombatHud();
    }

    /** 玩家屏幕位与 HUD 块相交 → 目标 alpha 70，否则 255；每帧插值 */
    private _fadeNearPlayer(dt: number) {
        const px = WorldBridge.screenX;
        const py = WorldBridge.screenY;
        const margin = 34;
        const k = Math.min(1, dt * 10);
        for (const n of this._fadeNodes) {
            if (!n.isValid || !n.active) continue;
            const ui = n.getComponent(UITransform);
            const op = n.getComponent(UIOpacity);
            if (!ui || !op) continue;
            const hw = ui.width / 2 + margin;
            const hh = ui.height / 2 + margin;
            const near = Math.abs(px - n.position.x) < hw && Math.abs(py - n.position.y) < hh;
            const target = near ? 70 : 255;
            if (Math.abs(op.opacity - target) < 1) continue;
            op.opacity = Math.round(op.opacity + (target - op.opacity) * k);
        }
    }

    /** 技能钮：设计坐标 (340,-120) 在攻击盘内侧上方，避免贴边裁切 */
    private _buildSkillBtn() {
        const btn = this._node('SkillBtn', HUDManager.SKILL_BTN_X, HUDManager.SKILL_BTN_Y, this.node);
        btn.getComponent(UITransform)!.setContentSize(110, 110);
        btn.addComponent(BlockInputEvents);
        btn.setSiblingIndex(this.node.children.length - 1);
        this._skillBtn = btn;
        this._skillG = btn.addComponent(Graphics);

        const icon = this._node('Icon', 0, 8, btn);
        icon.getComponent(UITransform)!.setContentSize(60, 44);
        this._skillIcon = icon.addComponent(Label);
        this._skillIcon.string = '💨';
        this._skillIcon.fontSize = 30;
        this._skillIcon.horizontalAlign = 1;

        const name = this._node('Name', 0, -20, btn);
        name.getComponent(UITransform)!.setContentSize(100, 18);
        this._skillName = name.addComponent(Label);
        this._skillName.string = '技能';
        this._skillName.fontSize = 12;
        this._skillName.color = new Color(230, 220, 200, 230);
        this._skillName.horizontalAlign = 1;

        const cd = this._node('Cd', 0, 8, btn);
        cd.getComponent(UITransform)!.setContentSize(60, 34);
        this._skillCd = cd.addComponent(Label);
        this._skillCd.string = '';
        this._skillCd.fontSize = 24;
        this._skillCd.color = new Color(255, 255, 255, 240);
        this._skillCd.horizontalAlign = 1;

        const cast = (ev?: EventTouch) => {
            if (ev) ev.propagationStopped = true;
            if (!this._tapOnce()) return;
            if (!GameFlow.isPlaying) return;
            if (UpgradeShop.isOpen || TalentPick.isOpen || GameFlow.isCombatFrozen) return;
            const ok = PlayerSkill.I?.tryCast() ?? false;
            if (ok) {
                tween(btn).stop();
                btn.setScale(1, 1, 1);
                tween(btn)
                    .to(0.08, { scale: new Vec3(0.86, 0.86, 1) })
                    .to(0.14, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
                    .start();
            }
        };
        btn.on(Node.EventType.TOUCH_END, cast);
        btn.on(Node.EventType.MOUSE_UP, cast);
        this._paintSkillBtn(0, true);
    }

    private _paintSkillBtn(ratio: number, ready: boolean) {
        const g = this._skillG;
        if (!g) return;
        g.clear();
        const r = 47;
        g.fillColor = ready ? new Color(40, 60, 90, 225) : new Color(24, 22, 28, 220);
        g.circle(0, 0, r); g.fill();
        if (ratio > 0) {
            // 冷却扇形（从 12 点顺时针清空）
            g.fillColor = new Color(0, 0, 0, 150);
            g.moveTo(0, 0);
            const start = Math.PI / 2;
            g.arc(0, 0, r, start, start - Math.PI * 2 * ratio, false);
            g.lineTo(0, 0);
            g.fill();
        }
        g.strokeColor = ready ? new Color(140, 220, 255, 240) : new Color(120, 110, 100, 160);
        g.lineWidth = ready ? 3 : 2;
        g.circle(0, 0, r); g.stroke();
    }

    private _refreshSkillBtn(dt: number) {
        const sk = PlayerSkill.I;
        if (!sk || !this._skillBtn?.isValid) return;
        const def = sk.def;
        if (this._skillIcon && this._skillIcon.string !== def.emoji) this._skillIcon.string = def.emoji;
        if (this._skillName && this._skillName.string !== def.name) this._skillName.string = def.name;
        const ratio = sk.cdRatio;
        const ready = ratio <= 0;
        if (this._skillCd) this._skillCd.string = ready ? '' : Math.ceil(sk.cdLeft).toString();
        if (this._skillIcon) this._skillIcon.node.active = ready;
        this._skillPaintAcc += dt;
        // 冷却中约 12Hz 重绘；就绪态只在状态切换时重绘
        if (!ready && this._skillPaintAcc >= 0.08) {
            this._skillPaintAcc = 0;
            this._paintSkillBtn(ratio, false);
            this._skillWasReady = false;
        } else if (ready && !this._skillWasReady) {
            this._skillWasReady = true;
            this._paintSkillBtn(0, true);
            tween(this._skillBtn).stop();
            this._skillBtn.setScale(1, 1, 1);
            tween(this._skillBtn)
                .to(0.1, { scale: new Vec3(1.15, 1.15, 1) })
                .to(0.16, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
                .start();
        }
    }

    private _buildHotbar() {
        const bar = this._node('Hotbar', 0, -318, this.node);
        bar.getComponent(UITransform)!.setContentSize(520, 56);
        // 挡住下层穿透，并抬到战斗 HUD 最前，保证点药优先于世界触摸
        bar.addComponent(BlockInputEvents);
        bar.setSiblingIndex(this.node.children.length - 1);
        this._hotbarRoot = bar;
        const bg = bar.addComponent(Graphics);
        bg.fillColor = new Color(14, 10, 8, 200);
        bg.roundRect(-250, -26, 500, 52, 10); bg.fill();
        bg.strokeColor = new Color(180, 130, 60, 140);
        bg.lineWidth = 1.5;
        bg.roundRect(-250, -26, 500, 52, 10); bg.stroke();

        const bagBtn = this._node('BagBtn', -210, 0, bar);
        bagBtn.getComponent(UITransform)!.setContentSize(56, 40);
        const bg2 = bagBtn.addComponent(Graphics);
        bg2.fillColor = new Color(90, 60, 30, 255);
        bg2.roundRect(-28, -20, 56, 40, 8); bg2.fill();
        // Label 必须挂子节点：同一节点上 Graphics + Label 两个 UIRenderer 只会画一个（背包钮曾是空棕块）
        const bagLbl = this._node('Lbl', 0, 0, bagBtn);
        bagLbl.getComponent(UITransform)!.setContentSize(56, 24);
        this._bagBtnLabel = bagLbl.addComponent(Label);
        this._bagBtnLabel.string = '🎒0';
        this._bagBtnLabel.fontSize = 16;
        this._bagBtnLabel.color = new Color(255, 230, 180, 255);
        this._bagBtnLabel.horizontalAlign = 1;
        const openBag = (ev?: EventTouch) => {
            if (ev) ev.propagationStopped = true;
            if (!this._tapOnce()) return;
            if (UpgradeShop.isOpen || TalentPick.isOpen || GameFlow.isCombatFrozen) return;
            const canvas = this.node.parent ?? this.node;
            AudioManager.playUi();
            BagPanel.toggle(canvas);
        };
        bagBtn.on(Node.EventType.TOUCH_END, openBag);
        bagBtn.on(Node.EventType.MOUSE_UP, openBag);

        for (let i = 0; i < RunBag.CAP; i++) {
            const slot = this._node(`H${i}`, -140 + i * 58, 0, bar);
            slot.getComponent(UITransform)!.setContentSize(52, 44);
            const sg = slot.addComponent(Graphics);
            sg.fillColor = new Color(28, 20, 14, 255);
            sg.roundRect(-26, -22, 52, 44, 8); sg.fill();
            sg.strokeColor = new Color(120, 90, 50, 160);
            sg.lineWidth = 1.5;
            sg.roundRect(-26, -22, 52, 44, 8); sg.stroke();

            const art = this._node('Art', 0, 4, slot);
            art.getComponent(UITransform)!.setContentSize(36, 36);

            const cnt = this._node('Cnt', 0, -14, slot);
            cnt.getComponent(UITransform)!.setContentSize(48, 16);
            const cl = cnt.addComponent(Label);
            cl.string = '';
            cl.fontSize = 11;
            cl.color = new Color(220, 200, 160, 255);
            cl.horizontalAlign = 1;

            const idx = i;
            const useSlot = (ev?: EventTouch) => {
                if (ev) ev.propagationStopped = true;
                if (!this._tapOnce()) return;
                if (!GameFlow.isPlaying) return;
                if (UpgradeShop.isOpen || TalentPick.isOpen || GameFlow.isCombatFrozen) return;
                AudioManager.playUi();
                const tip = RunBag.use(idx);
                if (!tip) {
                    eventBus.emit('show-tip', { text: '空格子 · 点有图标的药水使用' });
                    return;
                }
                eventBus.emit('show-tip', { text: `✅ ${tip}` });
            };
            slot.on(Node.EventType.TOUCH_END, useSlot);
            slot.on(Node.EventType.MOUSE_UP, useSlot);
        }
        this._onBagChanged();
    }

    private _onBagChanged = () => {
        if (!this._hotbarRoot?.isValid) return;
        const slots = RunBag.slots();
        this._bagSig = slots.map(s => `${s.id}:${s.count}`).join('|');
        if (this._bagBtnLabel) {
            this._bagBtnLabel.string = `🎒${RunBag.count()}`;
        }
        for (let i = 0; i < RunBag.CAP; i++) {
            const slotN = this._hotbarRoot.getChildByName(`H${i}`);
            if (!slotN) continue;
            const art = slotN.getChildByName('Art');
            const cnt = slotN.getChildByName('Cnt')?.getComponent(Label);
            if (art) {
                art.removeAllChildren();
                const oldG = art.getComponent(Graphics);
                if (oldG) oldG.clear();
            }
            const s = slots[i];
            if (!s) {
                if (cnt) cnt.string = `${i + 1}`;
                continue;
            }
            const def = ConfigStore.item(s.id);
            if (def && art) {
                let g = art.getComponent(Graphics);
                if (!g) g = art.addComponent(Graphics);
                g.clear();
                drawItemGlyph(g, def, 28);
            }
            // 只显数量：格内已画图标，再叠 emoji 会像「两层图标」
            if (cnt) cnt.string = `×${s.count}`;
        }
    };

    private _syncCombatHud = () => {
        const show = GameFlow.isPlaying;
        for (const n of this._combatHud) n.active = show;
        if (show) {
            this._runStarted = true;
            this._pullFromSources();
            this._refreshStats();
            this._onBagChanged();
        } else {
            BagPanel.forceClose(this.node.parent ?? this.node);
        }
    };

    /** 每帧从权威数据源拉齐，避免事件丢失导致 HUD 卡住 */
    update(dt: number) {
        if (!GameFlow.isPlaying) return;
        // 看门狗：无阻塞 UI 却仍冻着 → 怪不追人；强制解开
        GameFlow.ensureCombatThawed();
        this._pullFromSources();
        this._pulseHealSlots(dt);
        this._refreshSkillBtn(dt);
        this._fadeNearPlayer(dt);
        // #130 背包看门狗：事件链被别的监听器打断也不会显示错数
        const sig = RunBag.slots().map(s => `${s.id}:${s.count}`).join('|');
        if (sig !== this._bagSig) this._onBagChanged();
    }

    /** 低血时治疗药水格呼吸闪烁，引导点药 */
    private _pulseHealSlots(dt: number) {
        if (!this._hotbarRoot?.isValid) return;
        const pulse = ExperienceCoach.shouldPulseHeal();
        this._healPulseT += dt;
        const slots = RunBag.slots();
        const breath = 1 + Math.sin(this._healPulseT * 7) * 0.1;
        for (let i = 0; i < RunBag.CAP; i++) {
            const slotN = this._hotbarRoot.getChildByName(`H${i}`);
            if (!slotN) continue;
            const s = slots[i];
            const isHeal = !!(s && ConfigStore.item(s.id)?.kind === 'heal');
            if (pulse && isHeal) {
                slotN.setScale(breath, breath, 1);
            } else if (slotN.scale.x !== 1 || slotN.scale.y !== 1) {
                slotN.setScale(1, 1, 1);
            }
        }
    }

    private _pullFromSources() {
        // ★ 血量直接读 PlayerStats（与 takeDamage 同一数据源），不经 getComponent
        const hp = PlayerStats.I.hp;
        const maxHp = PlayerStats.I.get('maxHp');
        const shield = PlayerStats.I.shield;
        const armor = Math.round(PlayerStats.I.armor);
        if (hp !== this._hp || maxHp !== this._maxHp || shield !== this._shield || armor !== this._armor) {
            this._onHp({ current: hp, max: maxHp, shield, armor });
        }

        const gmNode = find('GameManager');
        const gmComp = (gmNode?.getComponent('GameManager')
            ?? GameManager.instance) as GameManager | null;
        const coins = Math.max(gmComp?.runState?.coins ?? 0, runCoins);
        if (coins !== this._totalCoins) {
            this._totalCoins = coins;
            if (this._coinLabel) this._coinLabel.string = `🪙 ${this._totalCoins}`;
        }
        if (gmComp?.runState) {
            const kills = gmComp.runState.killCount;
            if (kills !== this._killCount) this._killCount = kills;
        }

        const player = find('Canvas/Player');
        const wc = player?.getComponent(WeaponController)
            ?? player?.getComponent('WeaponController') as WeaponController | null;
        const w = wc?.currentWeapon;
        if (w && this._weaponLabel) {
            const tier = rarityLabel(w.rarity);
            const s = `${w.emoji} [${tier}] ${w.name}`;
            if (this._weaponLabel.string !== s) this._weaponLabel.string = s;
        }
        if (wc) this._refreshWeaponHint(wc);

        // 每帧刷新剩余敌人（避免事件丢失导致空白）
        this._refreshRemain();
        // 每帧同步层数/房间（避免 FLOOR_STARTED 丢失一直卡在 R1）
        this._syncFloorLabel();
    }

    private _syncFloorLabel() {
        if (!this._floorLabel) return;
        const p = DungeonManager.progress;
        // M3 后 progress.themeId 权威；缺省回落 currentTheme（与 FloorRenderer 一致）
        const themeId = p.themeId || ThemeRuntime.currentTheme?.id || 'cave';
        const theme = ThemeRuntime.getTheme(themeId);
        // 例：🗺 第2层  R1 · 🪨洞穴（短名取末 2 字，避免挤布局）
        const shortName = theme.name.length > 2 ? theme.name.slice(-2) : theme.name;
        const endless = GameManager.instance?.isEndless();
        const modeTag = endless ? '♾' : '📜';
        const s = `${modeTag} ${theme.emoji}${shortName} · 第${p.floor}层`;
        if (this._floorLabel.string !== s) this._floorLabel.string = s;
    }

    private _refreshStats() {
        // 局内不展示 ATK/DEF/SPD 数字墙；属性变化靠体感与商店文案
        if (this._statsLabel) this._statsLabel.string = '';
    }

    // ── 工具函数 ──────────────────────────────────────────

    private _node(name: string, x: number, y: number, parent: Node): Node {
        const n = new Node(name);
        n.addComponent(UITransform);
        n.setParent(parent);
        n.setPosition(x, y, 0);
        return n;
    }

    // ── 事件响应 ──────────────────────────────────────────

    private _onHp(data: { current: number; max: number; shield?: number; armor?: number }) {
        this._hp    = data.current;
        this._maxHp = data.max;
        const shield = data.shield ?? PlayerStats.I.shield;
        this._shield = shield;
        const armor = Math.round(data.armor ?? PlayerStats.I.armor);
        const armorMax = Math.max(1, PlayerStats.I.armorMax());
        this._armor = armor;
        const ratio = data.max > 0 ? data.current / data.max : 0;
        const w     = Math.max(0, this._barMaxW * ratio);

        const fillG = this._fillNode?.getComponent(Graphics);
        if (fillG) {
            fillG.clear();
            fillG.fillColor = ratio < 0.3
                ? new Color(255, 110, 0, 255)
                : new Color(220, 40,  40, 255);
            // 居中绘制：从 -barMaxW/2 起，宽度按比例
            fillG.roundRect(-this._barMaxW / 2, -7, w, 14, 3);
            fillG.fill();
            // 护盾：蓝色薄条叠在血条上沿
            if (shield > 0 && data.max > 0) {
                const sw = Math.max(6, Math.min(this._barMaxW, this._barMaxW * (shield / data.max)));
                fillG.fillColor = new Color(110, 190, 255, 230);
                fillG.roundRect(-this._barMaxW / 2, 3, sw, 5, 2);
                fillG.fill();
            }
            // #139 护甲：钢白分段条贴在血条下沿（每格 = 1/6 上限），回复中带亮边
            const segs = 6;
            const segW = (this._barMaxW - (segs - 1) * 2) / segs;
            const filled = armor / armorMax * segs;
            for (let i = 0; i < segs; i++) {
                const x = -this._barMaxW / 2 + i * (segW + 2);
                const f = Math.max(0, Math.min(1, filled - i));
                fillG.fillColor = new Color(40, 44, 56, 200);
                fillG.roundRect(x, -12, segW, 4, 1.5); fillG.fill();
                if (f > 0) {
                    fillG.fillColor = PlayerStats.I.armorRegening ? new Color(235, 240, 250, 255) : new Color(200, 210, 228, 245);
                    fillG.roundRect(x, -12, segW * f, 4, 1.5); fillG.fill();
                }
            }
        }

        if (this._hpLabel) {
            const core = `${Math.round(data.current)}/${Math.round(data.max)}`;
            const tags = (shield > 0 ? ` 🛡${Math.round(shield)}` : '') + (armor > 0 ? ` ⛨${armor}` : '');
            this._hpLabel.string = core + tags;
        }
    }

    private _onCoin(data: { total?: number; amount?: number }) {
        // Prefer absolute total (GameManager.addCoins); else delta. Never apply both.
        if (data.total !== undefined) this._totalCoins = data.total;
        else if (data.amount !== undefined) this._totalCoins = Math.max(0, this._totalCoins + data.amount);
        if (this._coinLabel) this._coinLabel.string = `🪙 ${this._totalCoins}`;
    }

    private _onKill() {
        this._killCount++;
        this._refreshRemain();
    }

    private _onWeapon(data: { name: string; emoji: string; type: string }) {
        if (this._weaponLabel)
            this._weaponLabel.string = `${data.emoji} ${data.name}`;
        const player = find('Canvas/Player');
        const wc = player?.getComponent(WeaponController);
        if (wc) this._refreshWeaponHint(wc);
    }

    private _refreshWeaponHint(wc: WeaponController) {
        if (!this._weaponHint) return;
        const n = wc.ownedUsableIds().length;
        this._weaponHint.string = n > 1
            ? `⇄ 切换（${n}/2）`
            : '局内可再拾一把武器';
    }

    private _onRoomCleared() {
        this._showTip('🚪 找传送门');
        this._refreshRemain();
    }

    private _onFloorStarted(data: { floor: number; roomIndex: number }) {
        // 进度权威在 DungeonManager.progress；这里同步提示
        this._syncFloorLabel();
        this._refreshRemain();
        const roomInFloor = ((data?.roomIndex ?? 0) % 4) + 1;
        const floor = data?.floor ?? 1;
        const isBossRoom  = roomInFloor === 4;
        const totalFloors = GameManager.instance?.effectiveTotalFloors()
            ?? ConfigStore.dungeon().totalFloors;
        const isFinal = !(GameManager.instance?.isEndless())
            && isBossRoom && floor >= totalFloors;
        // 普通房不刷 tip；精英/终局才喊一声
        if (isFinal) this._showTip('🔥 最终 Boss');
        else if (isBossRoom) this._showTip('⚠️ 精英房');
    }

    private _refreshRemain() {
        const n = EnemyRegistry.aliveCount;
        if (!this._remainLabel) return;
        const p = DungeonManager.progress;
        const room = p?.roomInFloor ?? 1;
        const floor = p?.floor ?? 1;
        const isBoss = room === 4;
        const totalFloors = GameManager.instance?.effectiveTotalFloors()
            ?? ConfigStore.dungeon().totalFloors;
        const isFinal = !(GameManager.instance?.isEndless())
            && isBoss && floor >= totalFloors;
        let key: string;
        if (n > 0) {
            key = isFinal ? 'final' : isBoss ? 'boss' : 'fight';
            const eliteTag = !isBoss && EliteMark.alive > 0 ? ' · 👑精英' : '';
            this._remainLabel.string = isFinal ? '击败最终 Boss'
                : isBoss ? '击败 Boss'
                : `剩余 ${n}${eliteTag}`;
            this._remainLabel.color = isBoss
                ? new Color(255, 170, 120, 255)
                : new Color(255, 220, 120, 255);
        } else {
            key = 'portal';
            this._remainLabel.string = '🚪 找传送门';
            this._remainLabel.color = new Color(120, 230, 180, 255);
        }
        // 目标态变化时轻弹顶部条（Goal 节点已隐藏，动画挂在 Remain）
        if (key !== this._goalKey) {
            this._goalKey = key;
            const node = this._remainLabel.node.parent ?? this._remainLabel.node;
            tween(node).stop();
            node.setScale(1, 1, 1);
            tween(node)
                .to(0.12, { scale: new Vec3(1.08, 1.08, 1) }, { easing: 'backOut' })
                .to(0.18, { scale: new Vec3(1, 1, 1) })
                .start();
        }
    }

    private _refreshGoal(_alive: number) {
        // 已并入 _refreshRemain；保留空实现以免旧调用崩
    }

    private _showTip(text: string) {
        if (!this._tipLabel) return;
        this._tipLabel.string = text;
        this._tipLabel.node.active = true;
        this.unschedule(this._hideTip);
        this.scheduleOnce(this._hideTip, 2.5);
    }

    private _hideTip = () => {
        if (this._tipLabel) this._tipLabel.node.active = false;
    };
}
