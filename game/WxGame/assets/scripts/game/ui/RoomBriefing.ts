import {
    _decorator, Component, Node, Label, Color, UITransform, Graphics,
    BlockInputEvents, Layers, tween, Vec3, find, Tween,
} from 'cc';
import { eventBus, GameEvents } from '../../core/EventBus';
import { GameFlow, FlowEvents } from '../../core/GameFlow';
import { ThemeRuntime } from '../dungeon/MapThemes';
import { DungeonManager } from '../dungeon/DungeonManager';
import { PlayerController } from '../player/PlayerController';
import { ConfigStore } from '../../core/ConfigStore';
import { AudioManager } from '../../core/AudioManager';

const { ccclass } = _decorator;

/**
 * Phase P — 关卡入场展板
 * 仅在：本局首房 / 换主题 / Boss 房 弹出；同主题普通房跳过，不冻战斗。
 * Boss 须点「继续」；非 Boss 可点或约 1.4s 后自动收起。
 * 不改 Camera / ViewZoom / Player 世界坐标。
 */
@ccclass('RoomBriefing')
export class RoomBriefing extends Component {
    private static _inst: RoomBriefing | null = null;
    /** 本局是否已弹过至少一次 */
    private static _seenRun = false;
    /** 上次展板主题，用于「换主题才弹」 */
    private static _lastThemeId = '';
    private _busy = false;
    private _gen = 0;

    onLoad() {
        RoomBriefing._inst = this;
        eventBus.on(GameEvents.FLOOR_STARTED, this._onFloor, this);
        eventBus.on(FlowEvents.STATE, this._onFlow, this);
    }

    onDestroy() {
        if (RoomBriefing._inst === this) RoomBriefing._inst = null;
        eventBus.off(GameEvents.FLOOR_STARTED, this._onFloor, this);
        eventBus.off(FlowEvents.STATE, this._onFlow, this);
        this._releaseLock();
    }

    /** 回大厅立刻拆掉 */
    static forceClose(canvas?: Node | null) {
        const root = find('Canvas/RoomBriefingPanel')
            ?? canvas?.getChildByName('RoomBriefingPanel')
            ?? null;
        if (root?.isValid) {
            TweenStop(root);
            root.destroy();
        }
        GameFlow.setCombatFrozen(false);
        const pc = find('Canvas/Player')?.getComponent(PlayerController);
        pc?.setTransitioning(false);
        if (RoomBriefing._inst) RoomBriefing._inst._busy = false;
    }

    private _onFlow(d: { state: string }) {
        if (d.state === 'lobby') {
            this._gen++;
            RoomBriefing._seenRun = false;
            RoomBriefing._lastThemeId = '';
            RoomBriefing.forceClose(this.node);
        }
    }

    private _onFloor(data: { floor: number; roomIndex: number; themeId?: string }) {
        if (!GameFlow.isPlaying) return;
        this._gen++;
        const gen = this._gen;
        const floor = data?.floor ?? 1;
        const roomIndex = data?.roomIndex ?? 0;
        const roomsPer = ConfigStore.dungeon().roomsPerFloor;
        const roomInFloor = (roomIndex % roomsPer) + 1;
        const isBoss = roomIndex % roomsPer === roomsPer - 1;
        const theme = (data.themeId ? ThemeRuntime.getTheme(data.themeId) : null)
            ?? ThemeRuntime.currentTheme;
        const themeId = theme?.id ?? '';

        const firstOfRun = !RoomBriefing._seenRun;
        const themeChanged = !!themeId && themeId !== RoomBriefing._lastThemeId;
        // 同主题的普通中间房：不打断节奏
        if (!firstOfRun && !isBoss && !themeChanged) {
            // 无展板时确保未残留冻结
            GameFlow.ensureCombatThawed();
            return;
        }
        RoomBriefing._seenRun = true;
        RoomBriefing._lastThemeId = themeId;

        // 换房前若还有旧展板，先配对拆掉，避免 depth 叠高
        if (this._busy || find('Canvas/RoomBriefingPanel')) {
            RoomBriefing.forceClose(this.node);
        }

        const goal = isBoss
            ? (DungeonManager.progress.floor >= ConfigStore.dungeon().totalFloors
                ? '击败最终 Boss'
                : '击败本层 Boss')
            : '清空本房敌人';

        this._busy = true;
        this._lock();
        this._showPanel({
            emoji: theme.emoji,
            title: theme.name,
            floor,
            roomInFloor,
            goal,
            blurb: theme.blurb || '探索地牢，生存下去。',
            isBoss,
            gen,
            autoClose: !isBoss,
        });
    }

    private _lock() {
        GameFlow.setCombatFrozen(true);
        const pc = find('Canvas/Player')?.getComponent(PlayerController);
        pc?.setTransitioning(true);
    }

    private _releaseLock() {
        GameFlow.setCombatFrozen(false);
        const pc = find('Canvas/Player')?.getComponent(PlayerController);
        pc?.setTransitioning(false);
        this._busy = false;
    }

    private _showPanel(opts: {
        emoji: string; title: string; floor: number; roomInFloor: number;
        goal: string; blurb: string; isBoss: boolean; gen: number;
        autoClose?: boolean;
    }) {
        const canvas = this.node;
        const old = canvas.getChildByName('RoomBriefingPanel');
        if (old?.isValid) {
            TweenStop(old);
            old.destroy();
        }

        const root = new Node('RoomBriefingPanel');
        root.layer = Layers.Enum.UI_2D;
        root.setParent(canvas);
        root.setSiblingIndex(9990);
        root.addComponent(UITransform).setContentSize(1334, 750);
        root.addComponent(BlockInputEvents);

        // 左侧淡罩，突出右展板
        const veil = new Node('Veil');
        veil.layer = Layers.Enum.UI_2D;
        veil.setParent(root);
        veil.addComponent(UITransform).setContentSize(1334, 750);
        const vg = veil.addComponent(Graphics);
        vg.fillColor = new Color(8, 6, 10, 130);
        vg.rect(-667, -375, 1334, 750);
        vg.fill();

        const board = new Node('Board');
        board.layer = Layers.Enum.UI_2D;
        board.setParent(root);
        board.setPosition(760, 16, 0);
        board.addComponent(UITransform).setContentSize(360, 460);
        this._drawBoard(board, opts.isBoss);

        // 顶徽章
        const badge = new Node('Badge');
        badge.layer = Layers.Enum.UI_2D;
        badge.setParent(board);
        badge.setPosition(0, 168, 0);
        badge.addComponent(UITransform).setContentSize(72, 72);
        const bg = badge.addComponent(Graphics);
        bg.fillColor = new Color(40, 28, 16, 255);
        bg.circle(0, 0, 30); bg.fill();
        bg.strokeColor = opts.isBoss
            ? new Color(255, 160, 80, 230)
            : new Color(220, 170, 80, 220);
        bg.lineWidth = 2.5;
        bg.circle(0, 0, 30); bg.stroke();
        RoomBriefing._lbl(badge, opts.emoji, 0, 0, 32, new Color(255, 255, 255, 255), 60);

        RoomBriefing._lbl(board, opts.title, 0, 118, 28, new Color(255, 232, 180, 255), 300);
        RoomBriefing._lbl(
            board,
            `第 ${opts.floor} 层 · 房间 ${opts.roomInFloor}`,
            0, 84, 15, new Color(190, 165, 130, 255), 300,
        );

        // 目标芯片
        const goalChip = new Node('GoalChip');
        goalChip.layer = Layers.Enum.UI_2D;
        goalChip.setParent(board);
        goalChip.setPosition(0, 28, 0);
        goalChip.addComponent(UITransform).setContentSize(280, 64);
        const gg = goalChip.addComponent(Graphics);
        gg.fillColor = new Color(48, 34, 18, 240);
        gg.roundRect(-140, -28, 280, 56, 12); gg.fill();
        gg.strokeColor = opts.isBoss
            ? new Color(255, 140, 70, 200)
            : new Color(210, 160, 70, 200);
        gg.lineWidth = 2;
        gg.roundRect(-140, -28, 280, 56, 12); gg.stroke();
        RoomBriefing._lbl(goalChip, '本关目标', 0, 12, 12, new Color(170, 145, 110, 255), 250);
        RoomBriefing._lbl(goalChip, opts.goal, 0, -10, 20, new Color(255, 220, 140, 255), 260);

        RoomBriefing._lbl(board, opts.blurb, 0, -70, 15, new Color(210, 195, 170, 255), 280);

        // 继续按钮（主 CTA）
        const cta = new Node('CTA');
        cta.layer = Layers.Enum.UI_2D;
        cta.setParent(board);
        cta.setPosition(0, -160, 0);
        cta.addComponent(UITransform).setContentSize(200, 48);
        const cg = cta.addComponent(Graphics);
        const paintCta = (pressed: boolean) => {
            cg.clear();
            cg.fillColor = pressed
                ? new Color(160, 100, 40, 255)
                : new Color(190, 125, 45, 255);
            cg.roundRect(-100, -22, 200, 44, 12); cg.fill();
            cg.strokeColor = new Color(255, 220, 140, 90);
            cg.lineWidth = 1.5;
            cg.roundRect(-100, -22, 200, 44, 12); cg.stroke();
            cg.fillColor = new Color(255, 230, 160, 28);
            cg.roundRect(-90, 4, 180, 12, 6); cg.fill();
        };
        paintCta(false);
        RoomBriefing._lbl(cta, '继续', 0, 0, 18, new Color(255, 250, 235, 255), 180);

        let closed = false;
        let canClick = false;
        const finish = () => {
            if (closed || !canClick) return;
            closed = true;
            AudioManager.playUi();
            TweenStop(board);
            tween(board)
                .to(0.28, { position: new Vec3(780, 16, 0) }, { easing: 'quadIn' })
                .call(() => {
                    if (root.isValid) root.destroy();
                    // 始终解冻：不再用 gen 门闩，避免二次 FLOOR_STARTED 导致怪永久不追人
                    this._releaseLock();
                })
                .start();
        };

        const onTap = (ev: { propagationStopped: boolean }) => {
            ev.propagationStopped = true;
            finish();
        };
        root.on(Node.EventType.TOUCH_END, onTap);
        cta.on(Node.EventType.TOUCH_START, (ev) => {
            ev.propagationStopped = true;
            paintCta(true);
        });
        cta.on(Node.EventType.TOUCH_END, (ev) => {
            paintCta(false);
            onTap(ev);
        });
        cta.on(Node.EventType.TOUCH_CANCEL, () => paintCta(false));

        // 入场后才允许点击，避免滑入瞬间误触
        tween(board)
            .to(0.42, { position: new Vec3(370, 16, 0) }, { easing: 'backOut' })
            .call(() => { canClick = true; })
            .start();

        // 非 Boss：短停后自动收，少打断节奏
        if (opts.autoClose) {
            tween(board)
                .delay(1.45)
                .call(() => finish())
                .start();
        }

        // CTA 轻脉冲，提示可点
        tween(cta)
            .delay(0.45)
            .to(0.55, { scale: new Vec3(1.05, 1.05, 1) }, { easing: 'sineInOut' })
            .to(0.55, { scale: new Vec3(1, 1, 1) }, { easing: 'sineInOut' })
            .union()
            .repeatForever()
            .start();
    }

    /** 暖石异形轮廓 */
    private _drawBoard(board: Node, isBoss: boolean) {
        const g = board.addComponent(Graphics);
        const pts: Array<[number, number]> = [
            [-155, 210], [-30, 225], [100, 205], [168, 160],
            [178, 40], [160, -100], [125, -195], [15, -215],
            [-110, -200], [-168, -110], [-178, 50], [-160, 155],
        ];
        g.fillColor = new Color(24, 18, 12, 250);
        g.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
        g.close();
        g.fill();

        g.strokeColor = isBoss
            ? new Color(255, 150, 70, 220)
            : new Color(210, 160, 70, 220);
        g.lineWidth = 3;
        g.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
        g.close();
        g.stroke();

        // 内金线
        g.strokeColor = new Color(255, 210, 120, 55);
        g.lineWidth = 1.2;
        g.moveTo(-125, 175); g.lineTo(125, 175); g.stroke();
        g.moveTo(-120, -145); g.lineTo(120, -145); g.stroke();

        // 顶高光
        g.fillColor = new Color(255, 210, 130, 22);
        g.moveTo(-130, 190);
        g.lineTo(120, 190);
        g.lineTo(100, 155);
        g.lineTo(-120, 155);
        g.close();
        g.fill();
    }

    private static _lbl(
        parent: Node, text: string, x: number, y: number,
        size: number, color: Color, width: number,
    ) {
        const n = new Node('L');
        n.layer = Layers.Enum.UI_2D;
        n.setParent(parent);
        n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(width, size + 14);
        const lbl = n.addComponent(Label);
        lbl.string = text;
        lbl.fontSize = size;
        lbl.color = color;
        lbl.overflow = Label.Overflow.RESIZE_HEIGHT;
        lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
    }
}

/** 停掉节点及其子树上的 tween，避免销毁后回调乱飞 */
function TweenStop(n: Node) {
    Tween.stopAllByTarget(n);
    for (const c of n.children) TweenStop(c);
}
