import { Node, Label, Color, UITransform, Graphics, BlockInputEvents } from 'cc';
import { GameManager } from '../../core/GameManager';
import { PlayerStats } from '../../core/PlayerStats';
import { eventBus } from '../../core/EventBus';
import { TalentTree } from './TalentTree';

/**
 * MainMenu —— 启动时展示存档进度，点开始再开局
 */
export class MainMenu {
    private static _shown = false;

    /** 场景重载后模块静态仍在，须允许再次弹出 */
    static reset() {
        MainMenu._shown = false;
    }

    static show(canvas: Node, onStart: () => void) {
        if (canvas.getChildByName('MainMenu')) return;
        MainMenu._shown = true;

        const save = GameManager.instance?.save;
        const root = new Node('MainMenu');
        root.setParent(canvas);
        root.setPosition(0, 0, 0);
        root.setSiblingIndex(10000);
        root.addComponent(UITransform).setContentSize(1334, 750);
        root.addComponent(BlockInputEvents);

        const bg = root.addComponent(Graphics);
        bg.fillColor = new Color(12, 10, 24, 230);
        bg.rect(-667, -375, 1334, 750); bg.fill();

        bg.strokeColor = new Color(80, 60, 120, 40);
        bg.lineWidth = 1;
        for (let i = -600; i < 600; i += 48) {
            bg.moveTo(i, -375); bg.lineTo(i, 375); bg.stroke();
        }

        const card = new Node('Card');
        card.setParent(root);
        card.setPosition(0, 20, 0);
        card.addComponent(UITransform).setContentSize(520, 420);
        const cg = card.addComponent(Graphics);
        cg.fillColor = new Color(28, 22, 48, 250);
        cg.roundRect(-260, -210, 520, 420, 20); cg.fill();
        cg.strokeColor = new Color(120, 200, 255, 200);
        cg.lineWidth = 3;
        cg.roundRect(-260, -210, 520, 420, 20); cg.stroke();

        MainMenu._lbl(card, '⚔️ 像素地牢', 0, 160, 40, new Color(255, 230, 120, 255));
        MainMenu._lbl(card, '微信小游戏 · 元气骑士风格', 0, 120, 16, new Color(160, 180, 220, 255));

        const floor = save?.progress.highestFloor ?? 0;
        const kills = save?.progress.totalKills ?? 0;
        const soul  = save?.currency.soul ?? 0;
        const runs  = save?.progress.totalRuns ?? 0;
        MainMenu._lbl(card, `🏆 最高层  ${floor}`, -110, 60, 22, new Color(120, 230, 255, 255));
        MainMenu._lbl(card, `☠️ 总击杀  ${kills}`, 110, 60, 22, new Color(220, 180, 255, 255));
        const soulNode = MainMenu._lbl(card, `💎 灵魂石  ${soul}`, -110, 20, 20, new Color(200, 160, 255, 255));
        MainMenu._lbl(card, `🎮 总场次  ${runs}`, 110, 20, 20, new Color(180, 200, 220, 255));

        const statsNode = MainMenu._lbl(card, '', 0, -25, 15, new Color(180, 200, 180, 255));
        const refreshStats = () => {
            const st = PlayerStats.I.snapshot();
            statsNode.getComponent(Label)!.string =
                `属性  HP${st.maxHp}  攻${st.atk.toFixed(0)}  防${st.def}  速${st.moveSpeed.toFixed(0)}`;
            const s = GameManager.instance?.save.currency.soul ?? 0;
            soulNode.getComponent(Label)!.string = `💎 灵魂石  ${s}`;
        };
        refreshStats();
        eventBus.on('soul-changed', refreshStats);
        eventBus.on('player-stats-changed', refreshStats);

        const start = MainMenu._btn(card, '▶  开始冒险', -110, -100, 200, 50, new Color(50, 150, 230, 255));
        start.on(Node.EventType.TOUCH_END, () => {
            eventBus.off('soul-changed', refreshStats);
            eventBus.off('player-stats-changed', refreshStats);
            try { GameManager.instance?.beginEndlessRun(); } catch {}
            root.destroy();
            onStart();
            eventBus.emit('show-tip', { text: '⚔️ 出发！清怪找传送门' });
        });

        const talent = MainMenu._btn(card, '🌳 天赋', 110, -100, 160, 50, new Color(110, 70, 180, 255));
        talent.on(Node.EventType.TOUCH_END, () => {
            TalentTree.show(canvas);
        });

        MainMenu._lbl(card, '过层/通关获得灵魂石，可在天赋树加点', 0, -160, 13, new Color(140, 150, 180, 255));
    }

    private static _lbl(p: Node, t: string, x: number, y: number, s: number, c: Color): Node {
        const n = new Node('L');
        n.setParent(p); n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(480, s + 10);
        const l = n.addComponent(Label);
        l.string = t; l.fontSize = s; l.color = c; l.horizontalAlign = 1;
        return n;
    }

    private static _btn(p: Node, t: string, x: number, y: number, w: number, h: number, c: Color) {
        const n = new Node('B');
        n.setParent(p); n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(w, h);
        const g = n.addComponent(Graphics);
        g.fillColor = c; g.roundRect(-w / 2, -h / 2, w, h, 12); g.fill();
        MainMenu._lbl(n, t, 0, 0, 20, new Color(255, 255, 255, 255));
        return n;
    }
}
