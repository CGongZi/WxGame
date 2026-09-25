import {
    Node, Label, Color, UITransform, Graphics, Layers,
    BlockInputEvents, tween, Vec3, UIOpacity, Tween,
} from 'cc';
import { AudioManager } from '../../core/AudioManager';

/**
 * OpeningIntro —— J2 开场短片（Loading 之后 → 大厅之前）
 * #194：徽章下落冲击 · 光环扩散 · 尘埃漂浮 · 标题上滑 · 跳过提示呼吸
 * 纯 UI 程序绘制；可点跳过；不改 Camera / WorldBridge。
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

        // 冲击环（徽章落地瞬间弹出）
        const ring = new Node('Ring');
        ring.layer = Layers.Enum.UI_2D;
        ring.setParent(root);
        ring.setPosition(0, 70, 0);
        ring.addComponent(UITransform).setContentSize(420, 420);
        const ringG = ring.addComponent(Graphics);
        OpeningIntro._paintRing(ringG, 0.15, 40);
        ring.setScale(0.2, 0.2, 1);
        const ringOp = ring.addComponent(UIOpacity);
        ringOp.opacity = 0;

        const glow = new Node('Glow');
        glow.layer = Layers.Enum.UI_2D;
        glow.setParent(root);
        glow.setPosition(0, 70, 0);
        glow.addComponent(UITransform).setContentSize(560, 560);
        const glowG = glow.addComponent(Graphics);
        OpeningIntro._paintGlow(glowG, 0.15);
        glow.setScale(0.4, 0.4, 1);

        const emblem = new Node('Emblem');
        emblem.layer = Layers.Enum.UI_2D;
        emblem.setParent(root);
        emblem.setPosition(0, 220, 0);
        emblem.addComponent(UITransform).setContentSize(180, 180);
        const eg = emblem.addComponent(Graphics);
        OpeningIntro._paintEmblem(eg);
        emblem.setScale(0.35, 0.35, 1);
        const emblemOp = emblem.addComponent(UIOpacity);
        emblemOp.opacity = 0;

        const spark = new Node('Spark');
        spark.layer = Layers.Enum.UI_2D;
        spark.setParent(root);
        spark.setPosition(0, 70, 0);
        spark.addComponent(UITransform).setContentSize(200, 200);
        const sparkG = spark.addComponent(Graphics);
        OpeningIntro._paintSpark(sparkG);
        spark.setScale(0.2, 0.2, 1);
        const sparkOp = spark.addComponent(UIOpacity);
        sparkOp.opacity = 0;

        const title = OpeningIntro._lbl(root, '像素地牢', 0, -70, 52, new Color(255, 232, 170, 255));
        title.node.setPosition(0, -100, 0);
        title.node.setScale(0.88, 0.88, 1);
        const titleOp = title.node.addComponent(UIOpacity);
        titleOp.opacity = 0;

        const rule = new Node('Rule');
        rule.layer = Layers.Enum.UI_2D;
        rule.setParent(root);
        rule.setPosition(0, -108, 0);
        rule.addComponent(UITransform).setContentSize(280, 8);
        const ruleG = rule.addComponent(Graphics);
        OpeningIntro._paintRule(ruleG, 0);
        const ruleOp = rule.addComponent(UIOpacity);
        ruleOp.opacity = 0;

        const sub = OpeningIntro._lbl(root, '五层深渊  ·  主题地牢  ·  灵魂永存', 0, -138, 17,
            new Color(200, 180, 145, 255));
        sub.node.setPosition(0, -152, 0);
        const subOp = sub.node.addComponent(UIOpacity);
        subOp.opacity = 0;

        const dustHost = new Node('DustHost');
        dustHost.layer = Layers.Enum.UI_2D;
        dustHost.setParent(root);
        dustHost.addComponent(UITransform).setContentSize(1334, 750);
        const dustBits = OpeningIntro._spawnDust(dustHost);

        const skipLbl = OpeningIntro._lbl(root, '点击任意处跳过', 0, -310, 15,
            new Color(150, 135, 115, 200));
        const skipOp = skipLbl.node.addComponent(UIOpacity);
        skipOp.opacity = 0;

        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            OpeningIntro._stopTweens(root);
            for (const d of dustBits) {
                Tween.stopAllByTarget(d.node);
                const op = d.node.getComponent(UIOpacity);
                if (op) Tween.stopAllByTarget(op);
            }
            tween(rootOp)
                .to(0.36, { opacity: 0 }, { easing: 'sineIn' })
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

        // ── 时序：光晕铺开 → 徽章下落 → 冲击 → 标题/副标题 → 呼吸 → 收束 ──
        tween(glow)
            .to(0.9, { scale: new Vec3(1.05, 1.05, 1) }, { easing: 'sineOut' })
            .to(2.8, { scale: new Vec3(1.18, 1.18, 1) }, { easing: 'sineInOut' })
            .start();

        const glowSteps = [0.3, 0.45, 0.6, 0.78, 0.95];
        glowSteps.forEach((s, i) => {
            tween(glow)
                .delay(0.1 * (i + 1))
                .call(() => { if (!finished && glow.isValid) OpeningIntro._paintGlow(glowG, s); })
                .start();
        });

        // 徽章自上方落下
        tween(emblemOp)
            .delay(0.15)
            .to(0.2, { opacity: 255 })
            .start();
        tween(emblem)
            .delay(0.15)
            .to(0.55, {
                position: new Vec3(0, 70, 0),
                scale: new Vec3(1.12, 1.12, 1),
            }, { easing: 'cubicIn' })
            .to(0.16, { scale: new Vec3(0.96, 1.04, 1) }, { easing: 'sineOut' })
            .to(0.14, { scale: new Vec3(1.04, 0.98, 1) })
            .to(0.12, { scale: new Vec3(1, 1, 1) })
            .start();

        // 落地冲击环 + 火花
        tween(ringOp)
            .delay(0.68)
            .to(0.05, { opacity: 220 })
            .to(0.55, { opacity: 0 }, { easing: 'sineOut' })
            .start();
        tween(ring)
            .delay(0.68)
            .call(() => {
                if (!finished && ring.isValid) OpeningIntro._paintRing(ringG, 0.9, 90);
            })
            .to(0.6, { scale: new Vec3(1.55, 1.55, 1) }, { easing: 'sineOut' })
            .start();

        tween(sparkOp)
            .delay(0.68)
            .to(0.06, { opacity: 255 })
            .to(0.35, { opacity: 0 })
            .start();
        tween(spark)
            .delay(0.68)
            .to(0.4, { scale: new Vec3(1.35, 1.35, 1) }, { easing: 'sineOut' })
            .start();

        // 标题上滑浮现
        tween(titleOp)
            .delay(0.95)
            .to(0.4, { opacity: 255 })
            .start();
        tween(title.node)
            .delay(0.95)
            .to(0.5, {
                position: new Vec3(0, -70, 0),
                scale: new Vec3(1.04, 1.04, 1),
            }, { easing: 'backOut' })
            .to(0.14, { scale: new Vec3(1, 1, 1) })
            .start();

        // 金线展开
        tween(ruleOp)
            .delay(1.25)
            .to(0.2, { opacity: 255 })
            .start();
        [0.25, 0.5, 0.75, 1].forEach((w, i) => {
            tween(rule)
                .delay(1.25 + i * 0.06)
                .call(() => { if (!finished && rule.isValid) OpeningIntro._paintRule(ruleG, w); })
                .start();
        });

        tween(subOp)
            .delay(1.45)
            .to(0.45, { opacity: 255 })
            .start();
        tween(sub.node)
            .delay(1.45)
            .to(0.45, { position: new Vec3(0, -138, 0) }, { easing: 'sineOut' })
            .start();

        // 尘埃缓缓上飘
        for (const d of dustBits) {
            const op = d.node.getComponent(UIOpacity)!;
            tween(op)
                .delay(0.25 + d.delay)
                .to(0.5, { opacity: d.alpha })
                .start();
            tween(d.node)
                .delay(0.25 + d.delay)
                .to(3.2, {
                    position: new Vec3(d.x + d.driftX, d.y + d.driftY, 0),
                }, { easing: 'sineInOut' })
                .start();
        }

        // 徽章轻呼吸
        tween(emblem)
            .delay(1.55)
            .to(0.9, { scale: new Vec3(1.04, 1.04, 1) }, { easing: 'sineInOut' })
            .to(0.9, { scale: new Vec3(1, 1, 1) }, { easing: 'sineInOut' })
            .union()
            .repeat(2)
            .start();

        // 跳过提示呼吸闪烁
        tween(skipOp)
            .delay(1.7)
            .to(0.35, { opacity: 210 })
            .to(0.55, { opacity: 90 })
            .to(0.55, { opacity: 200 })
            .to(0.55, { opacity: 90 })
            .to(0.45, { opacity: 180 })
            .start();

        tween(root)
            .delay(4.05)
            .call(finish)
            .start();
    }

    private static _stopTweens(root: Node) {
        Tween.stopAllByTarget(root);
        const rootOp = root.getComponent(UIOpacity);
        if (rootOp) Tween.stopAllByTarget(rootOp);
        const walk = (n: Node) => {
            Tween.stopAllByTarget(n);
            const op = n.getComponent(UIOpacity);
            if (op) Tween.stopAllByTarget(op);
            for (const c of n.children) walk(c);
        };
        for (const c of root.children) walk(c);
    }

    private static _paintBackdrop(g: Graphics) {
        g.clear();
        // 深洞窟底
        g.fillColor = new Color(10, 7, 6, 255);
        g.rect(-667, -375, 1334, 750);
        g.fill();
        // 中央暖光晕底
        g.fillColor = new Color(42, 28, 16, 90);
        g.ellipse(0, 40, 420, 280);
        g.fill();
        g.fillColor = new Color(28, 18, 12, 120);
        g.ellipse(0, -40, 520, 220);
        g.fill();
        // 上下暗角
        g.fillColor = new Color(4, 2, 2, 230);
        g.rect(-667, 230, 1334, 150);
        g.fill();
        g.rect(-667, -375, 1334, 140);
        g.fill();
        // 两侧石柱剪影
        g.fillColor = new Color(22, 16, 12, 200);
        g.roundRect(-640, -300, 78, 600, 10);
        g.fill();
        g.roundRect(562, -300, 78, 600, 10);
        g.fill();
        g.fillColor = new Color(38, 28, 20, 160);
        g.roundRect(-618, -260, 28, 520, 6);
        g.fill();
        g.roundRect(590, -260, 28, 520, 6);
        g.fill();
        g.strokeColor = new Color(90, 70, 45, 100);
        g.lineWidth = 2;
        g.roundRect(-640, -300, 78, 600, 10);
        g.stroke();
        g.roundRect(562, -300, 78, 600, 10);
        g.stroke();
        // 地面微光
        g.fillColor = new Color(180, 120, 50, 35);
        g.ellipse(0, -250, 280, 28);
        g.fill();
    }

    private static _paintGlow(g: Graphics, strength: number) {
        g.clear();
        const a = Math.floor(28 + 58 * strength);
        g.fillColor = new Color(200, 130, 50, Math.floor(a * 0.55));
        g.circle(0, 0, 240);
        g.fill();
        g.fillColor = new Color(230, 170, 70, a);
        g.circle(0, 0, 150);
        g.fill();
        g.fillColor = new Color(255, 210, 120, Math.floor(a * 0.65));
        g.circle(0, 0, 78);
        g.fill();
        g.fillColor = new Color(255, 240, 190, Math.floor(a * 0.4));
        g.circle(0, 0, 32);
        g.fill();
    }

    private static _paintRing(g: Graphics, strength: number, alpha: number) {
        g.clear();
        const a = Math.floor(alpha * strength);
        g.strokeColor = new Color(255, 210, 120, a);
        g.lineWidth = 4;
        g.circle(0, 0, 90);
        g.stroke();
        g.strokeColor = new Color(255, 180, 80, Math.floor(a * 0.55));
        g.lineWidth = 2;
        g.circle(0, 0, 120);
        g.stroke();
    }

    private static _paintSpark(g: Graphics) {
        g.clear();
        const rays: Array<[number, number, number, number]> = [
            [0, 18, 0, 48], [14, 12, 36, 32], [-14, 12, -36, 32],
            [16, -4, 44, -10], [-16, -4, -44, -10], [6, -16, 16, -42], [-6, -16, -16, -42],
        ];
        g.strokeColor = new Color(255, 230, 160, 220);
        g.lineWidth = 2.2;
        for (const [x0, y0, x1, y1] of rays) {
            g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
        }
        g.fillColor = new Color(255, 245, 200, 230);
        g.circle(0, 0, 8);
        g.fill();
    }

    private static _paintEmblem(g: Graphics) {
        g.clear();
        // 外盾
        g.fillColor = new Color(42, 32, 22, 255);
        g.moveTo(0, 68);
        g.lineTo(52, 46);
        g.lineTo(56, -8);
        g.lineTo(0, -64);
        g.lineTo(-56, -8);
        g.lineTo(-52, 46);
        g.close();
        g.fill();
        g.strokeColor = new Color(230, 185, 95, 240);
        g.lineWidth = 3.5;
        g.moveTo(0, 68);
        g.lineTo(52, 46);
        g.lineTo(56, -8);
        g.lineTo(0, -64);
        g.lineTo(-56, -8);
        g.lineTo(-52, 46);
        g.close();
        g.stroke();
        // 内盾
        g.fillColor = new Color(78, 58, 38, 220);
        g.moveTo(0, 46);
        g.lineTo(30, 30);
        g.lineTo(32, -2);
        g.lineTo(0, -40);
        g.lineTo(-32, -2);
        g.lineTo(-30, 30);
        g.close();
        g.fill();
        // 剑刃
        g.fillColor = new Color(225, 220, 205, 255);
        g.roundRect(-4.5, -32, 9, 78, 2);
        g.fill();
        g.fillColor = new Color(255, 250, 230, 200);
        g.roundRect(-1.5, -28, 3, 68, 1);
        g.fill();
        // 护手 / 柄
        g.fillColor = new Color(190, 145, 70, 255);
        g.roundRect(-18, 20, 36, 9, 2);
        g.fill();
        g.fillColor = new Color(110, 75, 40, 255);
        g.roundRect(-5, -40, 10, 14, 2);
        g.fill();
        g.fillColor = new Color(240, 215, 130, 255);
        g.circle(0, 40, 7);
        g.fill();
        g.fillColor = new Color(255, 245, 200, 180);
        g.circle(-1, 42, 2.5);
        g.fill();
    }

    private static _paintRule(g: Graphics, width01: number) {
        g.clear();
        const half = 90 * Math.max(0, Math.min(1, width01));
        if (half < 1) return;
        g.strokeColor = new Color(220, 175, 90, 200);
        g.lineWidth = 2;
        g.moveTo(-half, 0);
        g.lineTo(half, 0);
        g.stroke();
        g.fillColor = new Color(255, 220, 140, 220);
        g.circle(-half, 0, 2.2);
        g.fill();
        g.circle(half, 0, 2.2);
        g.fill();
    }

    private static _spawnDust(host: Node): Array<{
        node: Node; x: number; y: number; driftX: number; driftY: number; alpha: number; delay: number;
    }> {
        const specs = [
            [-460, 160, 1.8, 100, 18, 70, 0.05],
            [-300, -80, 1.4, 75, -12, 90, 0.12],
            [-140, 210, 2.0, 110, 10, 55, 0.0],
            [80, 150, 1.5, 85, -8, 80, 0.18],
            [280, -50, 2.0, 80, 14, 75, 0.08],
            [420, 110, 1.4, 95, -16, 60, 0.22],
            [-520, -140, 1.2, 65, 8, 100, 0.15],
            [500, -190, 1.5, 70, -10, 85, 0.28],
            [20, 250, 2.2, 90, 6, 50, 0.1],
            [-200, -210, 1.2, 60, 12, 95, 0.2],
            [170, -230, 1.5, 70, -14, 70, 0.3],
            [340, 190, 1.3, 75, 9, 65, 0.16],
            [-80, 40, 1.6, 55, -20, 110, 0.35],
            [120, 20, 1.4, 60, 22, 100, 0.4],
        ] as const;
        const out: Array<{
            node: Node; x: number; y: number; driftX: number; driftY: number; alpha: number; delay: number;
        }> = [];
        for (const [x, y, r, a, driftX, driftY, delay] of specs) {
            const n = new Node('Dust');
            n.layer = Layers.Enum.UI_2D;
            n.setParent(host);
            n.setPosition(x, y, 0);
            n.addComponent(UITransform).setContentSize(8, 8);
            const g = n.addComponent(Graphics);
            g.fillColor = new Color(255, 225, 170, 255);
            g.circle(0, 0, r);
            g.fill();
            const op = n.addComponent(UIOpacity);
            op.opacity = 0;
            out.push({ node: n, x, y, driftX, driftY, alpha: a, delay });
        }
        return out;
    }

    private static _lbl(p: Node, t: string, x: number, y: number, s: number, c: Color): Label {
        const n = new Node('L');
        n.layer = Layers.Enum.UI_2D;
        n.setParent(p);
        n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(760, s + 14);
        const l = n.addComponent(Label);
        l.string = t;
        l.fontSize = s;
        l.color = c;
        l.horizontalAlign = 1;
        return l;
    }
}
