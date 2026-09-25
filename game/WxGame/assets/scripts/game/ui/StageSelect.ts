import {
    Node, Label, Color, UITransform, Graphics, Layers, find,
} from 'cc';
import { GameManager } from '../../core/GameManager';
import { starsLabel } from '../../core/Difficulty';
import {
    listStages, isStageUnlocked, isStageCleared, stageBrief,
} from '../../core/StageData';
import {
    mountOverlay, makePanel, makeLabel, makeSubtitleBar, makeButton,
    paintRowCard, bindPress, UiTone, mountScrollArea, softClose, overlayChromeY,
} from './UiChrome';
import { eventBus } from '../../core/EventBus';

/**
 * StageSelect —— 关卡列表（链式解锁 + 历史最高星）
 */
export class StageSelect {
    private static _open = false;
    private static _root: Node | null = null;

    static get isOpen() { return StageSelect._open; }

    static reset() {
        StageSelect._open = false;
        const n = StageSelect._root?.isValid
            ? StageSelect._root
            : find('Canvas/StageSelect');
        if (n?.isValid) n.destroy();
        StageSelect._root = null;
    }

    static show(
        canvas: Node,
        onPick: (stageId: string) => void,
        onBack?: () => void,
    ) {
        StageSelect.reset();
        StageSelect._open = true;

        const gm = GameManager.instance;
        const cleared = gm?.save.progress.stagesCleared ?? [];
        const stages = listStages();
        const diff = gm?.selectedDifficultyId ?? 'normal';
        const diffTxt = diff === 'nightmare' ? '噩梦★★★' : diff === 'hard' ? '困难★★' : '普通★';

        const root = mountOverlay('StageSelect', canvas, 10011);
        StageSelect._root = root;

        const panel = makePanel(root, 'Panel', 680, 400, 0, 'amber');
        const { titleY, backY } = overlayChromeY(400);
        makeLabel(panel, '关卡选择', 0, titleY, 22, UiTone.title, 320);
        makeSubtitleBar(
            panel,
            `当前难度将记星 · 历史最高星保留  ·  本局：${diffTxt}`,
            titleY - 26, 560,
        );

        const listW = 560;
        const listH = 210;
        const listHost = new Node('ListHost');
        listHost.layer = Layers.Enum.UI_2D;
        listHost.setParent(panel);
        listHost.setPosition(0, 4, 0);
        const { content, contentUI } = mountScrollArea(listHost, {
            w: listW, h: listH, vertical: true,
        });

        const rowH = 64;
        const gap = 8;
        const totalH = Math.max(listH, stages.length * (rowH + gap) + 8);
        contentUI.setContentSize(listW, totalH);

        stages.forEach((s, i) => {
            const unlocked = isStageUnlocked(s.id, cleared);
            const done = isStageCleared(s.id, cleared);
            const stars = gm?.stageStars(s.id) ?? 0;
            const y = -i * (rowH + gap) - rowH / 2 - 4;
            const row = new Node(s.id);
            row.layer = Layers.Enum.UI_2D;
            row.setParent(content);
            row.setPosition(0, y, 0);
            row.addComponent(UITransform).setContentSize(listW, rowH);
            const rg = row.addComponent(Graphics);
            if (!unlocked) {
                paintRowCard(rg, listW, rowH, false, true);
                rg.fillColor = new Color(28, 24, 22, 255);
                rg.roundRect(-listW / 2, -rowH / 2, listW, rowH, 12); rg.fill();
            } else {
                paintRowCard(rg, listW, rowH, done, i % 2 === 1);
            }

            const status = !unlocked
                ? '🔒 未解锁'
                : done
                    ? `✅ ${starsLabel(stars)}`
                    : '▶ 可挑战';
            makeLabel(
                row,
                `${s.emoji} ${s.name}   ${status}`,
                0, 10, 15,
                unlocked ? UiTone.body : UiTone.muted,
                540,
            );
            makeLabel(
                row,
                unlocked ? `${stageBrief(s)}` : '需先通关上一关',
                0, -14, 11, UiTone.muted, 540,
            );

            if (unlocked) {
                bindPress(row, () => {
                    StageSelect._open = false;
                    StageSelect._root = null;
                    softClose(root, () => onPick(s.id));
                });
            }
        });

        if (stages.length * (rowH + gap) > listH) {
            makeLabel(panel, '↑ 滑动查看更多关卡 ↓', 0, backY + 36, 11, UiTone.muted, 400);
        }

        makeButton(panel, '返回', 0, backY, () => {
            if (!StageSelect._open) return;
            StageSelect._open = false;
            StageSelect._root = null;
            eventBus.emit('lobby-input-lock', { ms: 400 });
            softClose(root, () => onBack?.());
        }, { w: 160, h: 42, color: UiTone.btn });
    }
}
