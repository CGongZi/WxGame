import { Node, Label, Color, UITransform, Graphics, BlockInputEvents } from 'cc';
import { eventBus, GameEvents } from '../../core/EventBus';
import { runCoins } from './UpgradeShop';

/**
 * FloorResult —— 打完一层（Boss 房）后的过层结算
 */
export class FloorResult {
    private static _open = false;
    private static _floorKills = 0;
    private static _floorCoins = 0;
    private static _listening = false;

    private static _curFloor = 1;

    static forceClose(canvas?: Node | null) {
        FloorResult._open = false;
        const host = canvas;
        const n = host?.getChildByName('FloorResult');
        if (n?.isValid) n.destroy();
    }

    static ensureTracking() {
        if (FloorResult._listening) return;
        FloorResult._listening = true;
        eventBus.on(GameEvents.ENEMY_KILLED, () => { FloorResult._floorKills++; });
        eventBus.on(GameEvents.COIN_COLLECTED, (d: { amount?: number }) => {
            if ((d.amount ?? 0) > 0) FloorResult._floorCoins += d.amount!;
        });
        eventBus.on(GameEvents.FLOOR_STARTED, (d: { floor?: number }) => {
            const f = d?.floor ?? 1;
            if (f !== FloorResult._curFloor) {
                FloorResult._curFloor = f;
                FloorResult._floorKills = 0;
                FloorResult._floorCoins = 0;
            }
        });
    }

    static show(canvas: Node, floor: number) {
        FloorResult.ensureTracking();
        if (FloorResult._open) return;
        FloorResult._open = true;

        const root = new Node('FloorResult');
        root.setParent(canvas);
        root.setPosition(0, 0, 0);
        root.setSiblingIndex(9997);
        root.addComponent(UITransform).setContentSize(1334, 750);
        root.addComponent(BlockInputEvents);

        const bg = root.addComponent(Graphics);
        bg.fillColor = new Color(0, 0, 0, 160);
        bg.rect(-667, -375, 1334, 750); bg.fill();

        const card = new Node('Card');
        card.setParent(root);
        card.setPosition(0, 20, 0);
        card.addComponent(UITransform).setContentSize(460, 300);
        const cg = card.addComponent(Graphics);
        cg.fillColor = new Color(20, 28, 50, 245);
        cg.roundRect(-230, -150, 460, 300, 18); cg.fill();
        cg.strokeColor = new Color(100, 200, 255, 230);
        cg.lineWidth = 3;
        cg.roundRect(-230, -150, 460, 300, 18); cg.stroke();

        FloorResult._lbl(card, `🎉 第 ${floor} 层通关！`, 0, 100, 32, new Color(120, 230, 255, 255));
        FloorResult._lbl(card, `☠️ 击杀  ${FloorResult._floorKills}`, -100, 40, 24, new Color(220, 180, 255, 255));
        FloorResult._lbl(card, `🪙 本层  ${FloorResult._floorCoins}`, 100, 40, 24, new Color(255, 215, 80, 255));
        FloorResult._lbl(card, `背包金币  ${runCoins}`, 0, -10, 20, new Color(200, 200, 220, 255));
        FloorResult._lbl(card, '❤ 过层已回复 25% 生命 · 下层怪更肉，留好药水与护盾', 0, -42, 13, new Color(150, 200, 170, 255));

        const btn = FloorResult._btn(card, '继续探索 →', 0, -90, 240, 48, new Color(40, 140, 220, 255));
        btn.on(Node.EventType.TOUCH_END, () => {
            root.destroy();
            FloorResult._open = false;
            eventBus.emit('show-tip', { text: '🌀 走进传送门前往下一层' });
        });
    }

    private static _lbl(p: Node, t: string, x: number, y: number, s: number, c: Color) {
        const n = new Node('L');
        n.setParent(p); n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(420, s + 8);
        const l = n.addComponent(Label);
        l.string = t; l.fontSize = s; l.color = c; l.horizontalAlign = 1;
    }

    private static _btn(p: Node, t: string, x: number, y: number, w: number, h: number, c: Color) {
        const n = new Node('B');
        n.setParent(p); n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(w, h);
        const g = n.addComponent(Graphics);
        g.fillColor = c; g.roundRect(-w / 2, -h / 2, w, h, 10); g.fill();
        FloorResult._lbl(n, t, 0, 0, 20, new Color(255, 255, 255, 255));
        return n;
    }
}
