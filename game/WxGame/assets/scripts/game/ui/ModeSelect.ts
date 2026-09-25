import {
    Node, Label, Color, UITransform, Graphics, Layers, find, tween, Vec3,
} from 'cc';
import { GameManager } from '../../core/GameManager';
import { DIFFICULTIES, getDifficulty, starsLabel } from '../../core/Difficulty';
import { listStages } from '../../core/StageData';
import { StageSelect } from './StageSelect';
import { eventBus } from '../../core/EventBus';
import {
    mountOverlay, makePanel, makeLabel, makeSubtitleBar, makeButton,
    paintChip, bindPress, UiTone, softClose, overlayChromeY,
} from './UiChrome';

/**
 * ModeSelect —— 开战前选难度 +「关卡 / 无尽」
 * #158 收敛花哨：统一字色层级，去掉徽记/角饰/标签牌/斜纹。
 */
export class ModeSelect {
    private static _open = false;
    private static _root: Node | null = null;

    static get isOpen() { return ModeSelect._open; }

    static reset() {
        ModeSelect._open = false;
        const n = ModeSelect._root?.isValid
            ? ModeSelect._root
            : find('Canvas/ModeSelect');
        if (n?.isValid) n.destroy();
        ModeSelect._root = null;
    }

    static show(
        canvas: Node,
        onConfirm: (kind: 'stage' | 'endless') => void,
    ) {
        ModeSelect.reset();
        ModeSelect._open = true;

        const root = mountOverlay('ModeSelect', canvas, 10010);
        ModeSelect._root = root;

        const panel = makePanel(root, 'Panel', 640, 400, 0, 'amber');
        const { titleY, backY } = overlayChromeY(400);
        makeLabel(panel, '选择模式', 0, titleY, 22, UiTone.title, 320);
        makeSubtitleBar(panel, '先选难度，再选模式', titleY - 24, 560);

        const diffRow = new Node('DiffRow');
        diffRow.layer = Layers.Enum.UI_2D;
        diffRow.setParent(panel);
        diffRow.setPosition(0, 88, 0);
        diffRow.addComponent(UITransform).setContentSize(600, 48);

        const tipN = makeLabel(
            panel,
            getDifficulty(GameManager.instance?.selectedDifficultyId).desc,
            0, 46, 12, UiTone.muted, 580,
        );
        const tip = tipN.getComponent(Label)!;

        const refreshDiff = () => {
            const cur = GameManager.instance?.selectedDifficultyId ?? 'normal';
            for (const child of [...diffRow.children]) child.destroy();
            DIFFICULTIES.forEach((d, i) => {
                const selected = d.id === cur;
                const x = (i - 1) * 200;
                const btn = ModeSelect._diffChip(
                    diffRow, x, 0, d.name, starsLabel(d.stars), selected,
                );
                bindPress(btn, () => {
                    GameManager.instance?.selectDifficulty(d.id);
                    refreshDiff();
                    tip.string = getDifficulty(d.id).desc;
                });
            });
        };
        refreshDiff();

        const save = GameManager.instance?.save;
        const endlessBest = save?.progress.highestEndlessFloor ?? 0;
        const stageTotal = listStages().length;
        const stageCleared = save?.progress.stagesCleared?.length ?? 0;
        const starMap = save?.progress.stageStars ?? {};
        const starSum = Object.keys(starMap).reduce((a, k) => a + (starMap[k] | 0), 0);

        const closeToLobby = () => {
            if (!ModeSelect._open) return;
            ModeSelect._open = false;
            ModeSelect._root = null;
            eventBus.emit('lobby-input-lock', { ms: 450 });
            softClose(root);
        };

        const stageBtn = ModeSelect._modeCard(panel, -150, -48, {
            title: '关卡模式',
            line: '短关推进，通关记星',
            stat: stageCleared > 0
                ? `已通关 ${stageCleared}/${stageTotal} · ⭐${starSum}`
                : `${stageTotal} 关待探索`,
        });
        bindPress(stageBtn, () => {
            ModeSelect._open = false;
            ModeSelect._root = null;
            softClose(root, () => {
                StageSelect.show(
                    canvas,
                    (stageId) => {
                        if (!GameManager.instance?.beginStageRun(stageId)) return;
                        onConfirm('stage');
                    },
                    () => ModeSelect.show(canvas, onConfirm),
                );
            });
        });

        const endBtn = ModeSelect._modeCard(panel, 150, -48, {
            title: '无尽模式',
            line: '层数不停，越深越强',
            stat: endlessBest > 0 ? `最高 第 ${endlessBest} 层` : '尚无纪录',
        });
        bindPress(endBtn, () => {
            ModeSelect._open = false;
            ModeSelect._root = null;
            GameManager.instance?.beginEndlessRun();
            softClose(root, () => onConfirm('endless'));
        });

        makeButton(panel, '返回', 0, backY, () => {
            closeToLobby();
        }, { w: 160, h: 42, color: UiTone.btn });
    }

    /** 难度芯片：选中高亮即可，字只用 body / muted */
    private static _diffChip(
        p: Node, x: number, y: number, name: string, stars: string, on: boolean,
    ): Node {
        const W = 176, H = 46;
        const n = new Node('Diff');
        n.layer = Layers.Enum.UI_2D;
        n.setParent(p);
        n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(W, H);
        const g = n.addComponent(Graphics);
        paintChip(g, W, H, on, false);
        makeLabel(n, name, 0, 6, 15, on ? UiTone.title : UiTone.body, 150);
        makeLabel(n, stars, 0, -12, 12, UiTone.muted, 150);
        if (on) {
            n.setScale(0.97, 0.97, 1);
            tween(n).to(0.12, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
        }
        return n;
    }

    /** 模式卡：标题 + 一句说明 + 进度，三层字色封顶 */
    private static _modeCard(
        p: Node, x: number, y: number,
        o: { title: string; line: string; stat: string },
    ): Node {
        const W = 236, H = 128, R = 12;
        const n = new Node('Card');
        n.layer = Layers.Enum.UI_2D;
        n.setParent(p);
        n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(W, H);
        const g = n.addComponent(Graphics);

        g.fillColor = new Color(36, 28, 20, 255);
        g.roundRect(-W / 2, -H / 2, W, H, R); g.fill();
        g.strokeColor = new Color(140, 115, 80, 140);
        g.lineWidth = 1.4;
        g.roundRect(-W / 2, -H / 2, W, H, R); g.stroke();

        // 底部分隔：进度一行
        g.fillColor = new Color(0, 0, 0, 70);
        g.roundRect(-W / 2 + 10, -H / 2 + 10, W - 20, 26, 6); g.fill();

        makeLabel(n, o.title, 0, 28, 20, UiTone.title, 200);
        makeLabel(n, o.line, 0, 2, 13, UiTone.body, 200);
        makeLabel(n, o.stat, 0, -H / 2 + 22, 12, UiTone.muted, 200);

        n.setScale(0.98, 0.98, 1);
        tween(n).to(0.16, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
        return n;
    }
}
