import {
    Node, Label, Color, UITransform, Graphics, Layers,
    BlockInputEvents, tween, Vec3, UIOpacity,
} from 'cc';
import { AudioManager } from '../../core/AudioManager';
import { GameManager } from '../../core/GameManager';

interface GuidePage {
    title: string;
    lines: string[];
}

const PAGES: GuidePage[] = [
    {
        title: '欢迎来到像素地牢',
        lines: [
            '大厅左侧：角色 · 天赋 · 图鉴',
            '大厅右侧：商店 · 排行 · 设置',
            '中央是你的出战勇者',
        ],
    },
    {
        title: '开战之前',
        lines: [
            '点选择模式：关卡 或 无尽',
            '灵魂商店可买补给，开战自动装包',
            '天赋树用灵魂石永久强化',
        ],
    },
    {
        title: '战斗操作',
        lines: [
            '左摇杆移动 · 右摇杆瞄准开火（自动软锁定近敌）',
            '右下技能钮：每个角色专属闪避/爆发技',
            '清房后：金币店 → 天赋三选一 → 传送门',
        ],
    },
    {
        title: '背包与生存',
        lines: [
            '靠近发光物会自动吸入；低血时药水格会闪',
            '局内金币不带出；灵魂石永久保留',
            '准备好了就去冒险吧！',
        ],
    },
];

/**
 * H5 新手引导 —— 首次进大厅弹出；可跳过；写入存档 flags.tutorialDone。
 */
export class NewbieGuide {
    private static _open = false;

    static get isOpen() { return NewbieGuide._open; }

    static forceClose(canvas?: Node | null) {
        NewbieGuide._open = false;
        const host = canvas;
        const n = host?.getChildByName('NewbieGuide');
        if (n?.isValid) n.destroy();
    }

    /** 若尚未完成引导则弹出；否则直接 onDone */
    static maybeShow(canvas: Node, onDone?: () => void) {
        const gm = GameManager.instance;
        if (gm?.save?.flags?.tutorialDone) {
            onDone?.();
            return;
        }
        NewbieGuide.show(canvas, onDone);
    }

    static show(canvas: Node, onDone?: () => void) {
        if (NewbieGuide._open) {
            onDone?.();
            return;
        }
        NewbieGuide._open = true;

        const old = canvas.getChildByName('NewbieGuide');
        if (old?.isValid) old.destroy();

        const root = new Node('NewbieGuide');
        root.layer = Layers.Enum.UI_2D;
        root.setParent(canvas);
        root.setPosition(0, 0, 0);
        root.setSiblingIndex(canvas.children.length - 1);
        root.addComponent(UITransform).setContentSize(1334, 750);
        root.addComponent(BlockInputEvents);
        const rootOp = root.addComponent(UIOpacity);
        rootOp.opacity = 0;

        const bg = root.addComponent(Graphics);
        bg.fillColor = new Color(10, 8, 6, 200);
        bg.rect(-667, -375, 1334, 750); bg.fill();

        const panel = new Node('Panel');
        panel.setParent(root);
        panel.setPosition(0, 10, 0);
        panel.setScale(0.9, 0.9, 1);
        panel.addComponent(UITransform).setContentSize(620, 380);
        const pg = panel.addComponent(Graphics);
        pg.fillColor = new Color(28, 22, 16, 250);
        pg.roundRect(-310, -190, 620, 380, 16); pg.fill();
        pg.strokeColor = new Color(210, 160, 70, 220);
        pg.lineWidth = 2.5;
        pg.roundRect(-310, -190, 620, 380, 16); pg.stroke();
        pg.fillColor = new Color(200, 140, 50, 40);
        pg.roundRect(-290, 130, 580, 34, 8); pg.fill();

        let page = 0;
        const titleN = NewbieGuide._lbl(panel, '', 0, 142, 24, new Color(255, 228, 160, 255));
        const lineNodes: Label[] = [];
        for (let i = 0; i < 3; i++) {
            lineNodes.push(NewbieGuide._lbl(panel, '', 0, 70 - i * 36, 16, new Color(210, 195, 170, 255)));
        }
        const dots = NewbieGuide._lbl(panel, '', 0, -70, 14, new Color(170, 150, 120, 255));

        const paint = () => {
            const p = PAGES[page];
            titleN.string = p.title;
            for (let i = 0; i < 3; i++) {
                lineNodes[i].string = p.lines[i] ?? '';
            }
            dots.string = PAGES.map((_, i) => (i === page ? '●' : '○')).join('  ');
        };
        paint();

        tween(rootOp).to(0.25, { opacity: 255 }).start();
        tween(panel).to(0.28, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();

        const finish = (markDone: boolean) => {
            if (markDone) {
                try { GameManager.instance?.markTutorialDone(); } catch { /* ignore */ }
            }
            AudioManager.playUi();
            tween(rootOp).to(0.18, { opacity: 0 }).call(() => {
                if (root.isValid) root.destroy();
                NewbieGuide._open = false;
                onDone?.();
            }).start();
        };

        const next = NewbieGuide._btn(panel, page >= PAGES.length - 1 ? '开始冒险' : '下一步', 70, -130, 160, 40,
            new Color(90, 60, 30, 255));
        const skip = NewbieGuide._btn(panel, '跳过', -70, -130, 120, 40, new Color(50, 40, 28, 255));

        const refreshNextLabel = () => {
            const lbl = next.getChildByName('L')?.getComponent(Label);
            if (lbl) lbl.string = page >= PAGES.length - 1 ? '开始冒险' : '下一步';
        };

        next.on(Node.EventType.TOUCH_END, () => {
            AudioManager.playUi();
            if (page >= PAGES.length - 1) {
                finish(true);
                return;
            }
            page++;
            paint();
            refreshNextLabel();
        });
        skip.on(Node.EventType.TOUCH_END, () => finish(true));
    }

    private static _lbl(parent: Node, text: string, x: number, y: number,
                        size: number, color: Color): Label {
        const n = new Node('L');
        n.setParent(parent);
        n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(560, size + 12);
        const lbl = n.addComponent(Label);
        lbl.string = text;
        lbl.fontSize = size;
        lbl.color = color;
        lbl.horizontalAlign = 1;
        return lbl;
    }

    private static _btn(parent: Node, text: string, x: number, y: number,
                        w: number, h: number, color: Color): Node {
        const n = new Node('B');
        n.setParent(parent);
        n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(w, h);
        const g = n.addComponent(Graphics);
        g.fillColor = color;
        g.roundRect(-w / 2, -h / 2, w, h, 8); g.fill();
        g.strokeColor = new Color(210, 160, 70, 140);
        g.lineWidth = 1.5;
        g.roundRect(-w / 2, -h / 2, w, h, 8); g.stroke();
        const ln = new Node('L');
        ln.setParent(n);
        ln.addComponent(UITransform).setContentSize(w, h);
        const lbl = ln.addComponent(Label);
        lbl.string = text;
        lbl.fontSize = 16;
        lbl.color = new Color(255, 245, 220, 255);
        lbl.horizontalAlign = 1;
        lbl.verticalAlign = 1;
        return n;
    }
}
