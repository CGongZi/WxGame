import { Node, Label, Color, UITransform, Graphics, find } from 'cc';
import { GameManager } from '../../core/GameManager';
import { eventBus } from '../../core/EventBus';
import { WechatService } from '../../wechat/WechatService';
import {
    mountOverlay, makePanel, makeLabel, makeSubtitleBar, makeButton,
    paintRowCard, UiTone, softClose, overlayChromeY,
} from './UiChrome';

/**
 * RankBoard —— 大厅排行榜（本机纪录）
 * 微信好友榜待开放数据域接通；玩家侧不暴露 API 名。
 */
export class RankBoard {
    private static _open = false;
    private static _root: Node | null = null;

    static get isOpen() { return RankBoard._open; }

    static reset() {
        RankBoard._open = false;
        const orphan = RankBoard._root?.isValid
            ? RankBoard._root
            : find('Canvas/RankBoard');
        if (orphan?.isValid) orphan.destroy();
        RankBoard._root = null;
    }

    static show(canvas: Node) {
        const existing = canvas.getChildByName('RankBoard');
        if (existing) {
            if (RankBoard._open) return;
            existing.destroy();
        }
        RankBoard._open = true;

        const root = mountOverlay('RankBoard', canvas, 10004);
        RankBoard._root = root;

        const panel = makePanel(root, 'Panel', 680, 400, 0, 'amber');
        const { titleY, backY } = overlayChromeY(400);
        makeLabel(panel, '排行榜', 0, titleY, 22, UiTone.title, 320);
        makeSubtitleBar(
            panel,
            WechatService.hasOpenDataRank()
                ? '好友榜已接通（开放数据域）'
                : '本机纪录 · 微信好友榜接入后显示在此',
            titleY - 32,
            580,
        );

        const save = GameManager.instance?.save;
        const p = save?.progress;
        const rows: Array<{ rank: string; title: string; value: string }> = [
            { rank: '①', title: '最高到达层', value: `${p?.highestFloor ?? 0} 层` },
            { rank: '②', title: '历史最高分', value: `${p?.highestScore ?? 0}` },
            { rank: '③', title: '累计击杀', value: `${p?.totalKills ?? 0}` },
            { rank: '④', title: '通关次数', value: `${p?.clearCount ?? 0}` },
            { rank: '⑤', title: '总局数', value: `${p?.totalRuns ?? 0}` },
            {
                rank: '⑥',
                title: '最快通关',
                value: RankBoard._fmtClearTime(p?.bestClearTime ?? 0),
            },
        ];

        let y = 88;
        rows.forEach((row, i) => {
            RankBoard._row(panel, 0, y, row.rank, row.title, row.value, i % 2 === 1);
            y -= 36;
        });

        makeLabel(
            panel,
            WechatService.hasOpenDataRank()
                ? '可与微信好友比层数与通关时间'
                : '好友排行即将开放 · 当前仅显示本机纪录',
            0, backY + 36, 11, UiTone.muted, 540,
        );

        makeButton(panel, '返回', 0, backY, () => {
            if (!RankBoard._open) return;
            RankBoard._open = false;
            RankBoard._root = null;
            eventBus.emit('lobby-input-lock', { ms: 500 });
            softClose(root);
        }, { w: 160, h: 40, color: UiTone.btn });
    }

    private static _fmtClearTime(sec: number): string {
        if (!sec || sec <= 0) return '—';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    private static _row(
        parent: Node, x: number, y: number,
        rank: string, title: string, value: string, alt: boolean,
    ) {
        const n = new Node('Row');
        n.layer = parent.layer;
        n.setParent(parent);
        n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(580, 34);
        const g = n.addComponent(Graphics);
        paintRowCard(g, 580, 34, false, alt);
        makeLabel(n, rank, -250, 0, 15, UiTone.accent, 44);
        makeLabel(n, title, -40, 0, 14, UiTone.body, 260);
        makeLabel(n, value, 200, 0, 14, UiTone.ok, 180);
    }
}
