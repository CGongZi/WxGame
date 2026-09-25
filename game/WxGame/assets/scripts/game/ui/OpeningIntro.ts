import {
    Node, Label, Color, UITransform, Graphics, Layers,
    BlockInputEvents, tween, Vec3, UIOpacity, Tween,
} from 'cc';
import { AudioManager } from '../../core/AudioManager';

/**
 * OpeningIntro —— J2 开场短片（Loading 之后 → 大厅之前）
 * 程序绘制：石窟光晕 + 徽章 + 标题入场；可点跳过；不改 Camera / WorldBridge。
 */
export class OpeningIntro {
    private static _done = false;
    private static _playing = false;
    private static _waiters: Array<() => void> = [];

    static get isDone() { return OpeningIntro._done; }

    /** 播完或跳过后回调；同会话只播一次 */
    static play(canvas: Node, onDone: () => void) {
        if (OpeningIntro._done) {
            onDone();
            return;
        }
        OpeningIntro._waiters.push(onDone);
        if (OpeningIntro._playing) return;
        OpeningIntro._playing = true;

        const old = canvas.getChildByName('OpeningIntro');
        if (old?.isValid) old.destroy();

        const root = new Node('OpeningIntro');
        root.layer = Layers.Enum.UI_2D;
        root.setParent(canvas);
        root.setPosition(0, 0, 0);
        root.setSiblingIndex(canvas.children.length - 1);
        root.addComponent(UITransform).setContentSize(1334, 750);
        root.addComponent(BlockInputEvents);
        const rootOp = root.addComponent(UIOpacity);
        rootOp.opacity = 255;

        const bg = root.addComponent(Graphics);
        OpeningIntro._paintBackdrop(bg);

        const glow = new Node('Glow');
        glow.layer = Layers.Enum.UI_2D;
        glow.setParent(root);
        glow.setPosition(0, 36, 0);
        glow.addComponent(UITransform).setContentSize(520, 520);
        const glowG = glow.addComponent(Graphics);
        OpeningIntro._paintGlow(glowG, 0.2);
        glow.setScale(0.55, 0.55, 1);

        const emblem = new Node('Emblem');
        emblem.layer = Layers.Enum.UI_2D;
        emblem.setParent(root);
        emblem.setPosition(0, 78, 0);
        emblem.addComponent(UITransform).setContentSize(160, 160);
        const eg = emblem.addComponent(Graphics);
        OpeningIntro._paintEmblem(eg);
        emblem.setScale(0.15, 0.15, 1);
        const emblemOp = emblem.addComponent(UIOpacity);
        emblemOp.opacity = 0;

        const title = OpeningIntro._lbl(root, '像素地牢', 0, -40, 48, new Color(255, 228, 160, 255));
        title.node.setScale(0.72, 0.72, 1);
        const titleOp = title.node.addComponent(UIOpacity);
        titleOp.opacity = 0;

        const sub = OpeningIntro._lbl(root, '五层深渊  ·  主题地牢  ·  灵魂永存', 0, -92, 18,
            new Color(190, 175, 145, 255));
        const subOp = sub.node.addComponent(UIOpacity);
        subOp.opacity = 0;

        const dust = new Node('Dust');
        dust.layer = Layers.Enum.UI_2D;
        dust.setParent(root);
        dust.addComponent(UITransform).setContentSize(1334, 750);
        const dustG = dust.addComponent(Graphics);
        OpeningIntro._paintDust(dustG);
        const dustOp = dust.addComponent(UIOpacity);
        dustOp.opacity = 0;

        const skipLbl = OpeningIntro._lbl(root, '点击任意处跳过', 0, -300, 16,
            new Color(140, 130, 110, 200));
        const skipOp = skipLbl.node.addComponent(UIOpacity);
        skipOp.opacity = 0;

        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            // Keep _playing until fade ends so late play() (Bootstrap + HUD)
            // queues waiters instead of firing onDone under a still-visible overlay.
            OpeningIntro._stopTweens(root);
            tween(rootOp)
                .to(0.32, { opacity: 0 }, { easing: 'sineIn' })
                .call(() => {
                    if (root.isValid) root.destroy();
                    OpeningIntro._done = true;
                    OpeningIntro._playing = false;
                    const list = OpeningIntro._waiters.splice(0);
                    for (const fn of list) {
                        try { fn(); } catch (e) {
                            console.error('[OpeningIntro] onDone', e);
                        }
                    }
                })
                .start();
        };

        const onSkip = () => {
            if (finished) return;
            AudioManager.playUi();
            finish();
        };
        root.on(Node.EventType.TOUCH_END, onSkip);
        root.on(Node.EventType.MOUSE_UP, onSkip);

        AudioManager.playSfx('intro');

        tween(glow)
            .to(0.75, { scale: new Vec3(1.06, 1.06, 1) }, { easing: 'sineOut' })
            .to(2.6, { scale: new Vec3(1.14, 1.14, 1) })
            .start();

        // 光晕逐步加亮
        const glowSteps = [0.35, 0.5, 0.65, 0.8, 0.95];
        glowSteps.forEach((s, i) => {
            tween(glow)
                .delay(0.08 * (i + 1))
                .call(() => { if (!finished && glow.isValid) OpeningIntro._paintGlow(glowG, s); })
                .start();
        });

        tween(emblem)
            .delay(0.2)
            .to(0.55, { scale: new Vec3(1.1, 1.1, 1) }, { easing: 'backOut' })
            .to(0.14, { scale: new Vec3(1, 1, 1) })
            .start();
        tween(emblemOp)
            .delay(0.2)
            .to(0.4, { opacity: 255 })
            .start();

        tween(titleOp)
            .delay(0.58)
            .to(0.42, { opacity: 255 })
            .start();
        tween(title.node)
            .delay(0.58)
            .to(0.48, { scale: new Vec3(1.05, 1.05, 1) }, { easing: 'backOut' })
            .to(0.12, { scale: new Vec3(1, 1, 1) })
            .start();

        tween(subOp)
            .delay(0.98)
            .to(0.4, { opacity: 255 })
            .start();

        tween(dustOp)
            .delay(0.35)
            .to(0.75, { opacity: 170 })
            .start();

        tween(skipOp)
            .delay(1.15)
            .to(0.35, { opacity: 200 })
            .start();

        tween(emblem)
            .delay(0.95)
            .to(0.85, { scale: new Vec3(1.045, 1.045, 1) }, { easing: 'sineInOut' })
            .to(0.85, { scale: new Vec3(1, 1, 1) }, { easing: 'sineInOut' })
            .union()
            .repeat(2)
            .start();

        tween(root)
            .delay(3.55)
            .call(finish)
            .start();
    }

    private static _stopTweens(root: Node) {
        Tween.stopAllByTarget(root);
        const rootOp = root.getComponent(UIOpacity);
        if (rootOp) Tween.stopAllByTarget(rootOp);
        for (const c of root.children) {
            Tween.stopAllByTarget(c);
            const op = c.getComponent(UIOpacity);
            if (op) Tween.stopAllByTarget(op);
        }
    }

    private static _paintBackdrop(g: Graphics) {
        g.clear();
        g.fillColor = new Color(12, 9, 8, 255);
        g.rect(-667, -375, 1334, 750);
        g.fill();
        g.fillColor = new Color(6, 4, 4, 210);
        g.rect(-667, 210, 1334, 170);
        g.fill();
        g.fillColor = new Color(6, 4, 4, 210);
        g.rect(-667, -375, 1334, 130);
        g.fill();
        g.fillColor = new Color(28, 22, 18, 155);
        g.roundRect(-620, -280, 70, 560, 8);
        g.fill();
        g.roundRect(550, -280, 70, 560, 8);
        g.fill();
        g.strokeColor = new Color(70, 55, 40, 120);
        g.lineWidth = 2;
        g.roundRect(-620, -280, 70, 560, 8);
        g.stroke();
        g.roundRect(550, -280, 70, 560, 8);
        g.stroke();
    }

    private static _paintGlow(g: Graphics, strength: number) {
        g.clear();
        const a = Math.floor(30 + 52 * strength);
        g.fillColor = new Color(210, 150, 70, a);
        g.circle(0, 0, 220);
        g.fill();
        g.fillColor = new Color(255, 200, 110, Math.floor(a * 0.55));
        g.circle(0, 0, 110);
        g.fill();
        g.fillColor = new Color(255, 235, 180, Math.floor(a * 0.35));
        g.circle(0, 0, 48);
        g.fill();
    }

    private static _paintEmblem(g: Graphics) {
        g.clear();
        g.fillColor = new Color(48, 38, 28, 255);
        g.moveTo(0, 62);
        g.lineTo(48, 42);
        g.lineTo(52, -10);
        g.lineTo(0, -58);
        g.lineTo(-52, -10);
        g.lineTo(-48, 42);
        g.close();
        g.fill();
        g.strokeColor = new Color(220, 175, 90, 230);
        g.lineWidth = 3;
        g.moveTo(0, 62);
        g.lineTo(48, 42);
        g.lineTo(52, -10);
        g.lineTo(0, -58);
        g.lineTo(-52, -10);
        g.lineTo(-48, 42);
        g.close();
        g.stroke();
        g.fillColor = new Color(90, 70, 48, 200);
        g.moveTo(0, 42);
        g.lineTo(28, 28);
        g.lineTo(30, -4);
        g.lineTo(0, -36);
        g.lineTo(-30, -4);
        g.lineTo(-28, 28);
        g.close();
        g.fill();
        g.fillColor = new Color(210, 200, 185, 255);
        g.roundRect(-4, -28, 8, 72, 2);
        g.fill();
        g.fillColor = new Color(180, 140, 70, 255);
        g.roundRect(-16, 18, 32, 8, 2);
        g.fill();
        g.fillColor = new Color(230, 210, 140, 255);
        g.circle(0, 36, 6);
        g.fill();
    }

    private static _paintDust(g: Graphics) {
        g.clear();
        const pts: Array<[number, number, number, number]> = [
            [-420, 180, 2, 90], [-280, -60, 1.5, 70], [-120, 220, 2, 100],
            [90, 160, 1.5, 80], [260, -40, 2, 75], [400, 120, 1.5, 95],
            [-500, -120, 1, 60], [480, -180, 1.5, 70], [0, 260, 2, 85],
            [-180, -200, 1, 55], [150, -220, 1.5, 65], [320, 200, 1, 70],
        ];
        for (const [x, y, r, a] of pts) {
            g.fillColor = new Color(255, 220, 160, a);
            g.circle(x, y, r);
            g.fill();
        }
    }

    private static _lbl(p: Node, t: string, x: number, y: number, s: number, c: Color): Label {
        const n = new Node('L');
        n.layer = Layers.Enum.UI_2D;
        n.setParent(p);
        n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(720, s + 12);
        const l = n.addComponent(Label);
        l.string = t;
        l.fontSize = s;
        l.color = c;
        l.horizontalAlign = 1;
        return l;
    }
}
