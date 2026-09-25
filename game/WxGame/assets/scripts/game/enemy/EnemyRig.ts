import { _decorator, Component, Node, Graphics, UITransform, Color } from 'cc';
import { EnemyMotion } from './EnemyMotion';
import { enemyRunRate } from '../fx/MotionTables';

const { ccclass } = _decorator;

/**
 * EnemyRig —— 怪物分部件小人 / 分翅飞怪（#126b → #138 怪物美术重做）
 *
 * 设计铁律：怪物必须与英雄小人一眼可分——
 *   - 不用英雄肤色（230,200,170 之类），只用骨白 / 苔绿 / 灰石 / 暗紫 / 主题染色
 *   - 头身比夸张（大头小身 / 小头大肩）、佝偻前倾、大爪大嘴、发光眼
 *   - 面部不是"两个小黑点 + 圆脸"，而是骷髅眼窝 / 兜帽虚空 / 獠牙下颚 / 独眼符文
 *
 * 人形怪（bone / archer / mage / tank / golem / boss / imp）：腿×2 臂×2 躯干 头。
 *   mage 无腿悬浮（腿节点隐藏，躯干上下漂）。
 * 飞行怪（bat / raven / moth / mosquito / dragon / jelly）：核心 + 前后翅；dragon 另有尾 / 颈头节点。
 * 其余圆团怪（slime / wisp / specter / beetle / toad / crystal / fast / spider / snake / shroom）仍走 EnemySilhouette。
 * 全部挂在怪 Body/Rig 下，Body 的整体挤压仍由 EnemyMotion 负责；部件只改自身 transform。
 */

const BIPED = new Set(['bone', 'archer', 'mage', 'tank', 'golem', 'boss', 'imp']);
const FLYER = new Set(['bat', 'raven', 'moth', 'mosquito', 'dragon', 'jelly']);

function shade(col: Color, mul: number, a = 255): Color {
    const n = (v: number) => Math.max(0, Math.min(255, Math.round(v * mul)));
    return new Color(n(col.r), n(col.g), n(col.b), a);
}
const c = (r: number, g: number, b: number, a = 255) => new Color(r, g, b, a);
function poly(g: Graphics, pts: number[]) {
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.close();
}
function fillPoly(g: Graphics, col: Color, pts: number[]) { g.fillColor = col; poly(g, pts); g.fill(); }
function dot(g: Graphics, col: Color, x: number, y: number, r: number) { g.fillColor = col; g.circle(x, y, r); g.fill(); }

/** 每种人形怪的部件锚点（64 单位空间） */
interface BipedLayout {
    legX: number; legY: number; torsoY: number; headY: number; armX: number; armY: number;
    shadowW: number; shadowY: number; heavy: boolean; float?: boolean;
}
const LAYOUT: Readonly<Record<string, BipedLayout>> = {
    bone:   { legX: 5,  legY: -12, torsoY: -12, headY: 12, armX: 11, armY: 6,  shadowW: 16, shadowY: -30, heavy: false },
    archer: { legX: 6,  legY: -14, torsoY: -14, headY: 4,  armX: 12, armY: 0,  shadowW: 18, shadowY: -30, heavy: false },
    mage:   { legX: 0,  legY: -10, torsoY: -6,  headY: 16, armX: 13, armY: 6,  shadowW: 14, shadowY: -32, heavy: false, float: true },
    tank:   { legX: 9,  legY: -16, torsoY: -16, headY: 12, armX: 22, armY: 6,  shadowW: 26, shadowY: -32, heavy: true },
    golem:  { legX: 9,  legY: -14, torsoY: -14, headY: 16, armX: 22, armY: 8,  shadowW: 26, shadowY: -32, heavy: true },
    boss:   { legX: 9,  legY: -16, torsoY: -16, headY: 16, armX: 24, armY: 8,  shadowW: 28, shadowY: -34, heavy: true },
    imp:    { legX: 5,  legY: -12, torsoY: -10, headY: 10, armX: 11, armY: 4,  shadowW: 14, shadowY: -28, heavy: false },
};

interface BipedParts {
    kind: 'biped';
    shadow: Node; armBack: Node; legBack: Node; torso: Node; legFront: Node; head: Node; armFront: Node;
}
interface FlyerParts {
    kind: 'flyer';
    shadow: Node; wingBack: Node; core: Node; wingFront: Node; tail?: Node; head?: Node;
}

export class EnemyRig {
    static supports(kind: string): boolean {
        return BIPED.has(kind) || FLYER.has(kind);
    }

    static mount(body: Node, kind: string, tint: Color, size: number, animate = true) {
        const old = body.getChildByName('Rig');
        if (old?.isValid) { old.removeFromParent(); old.destroy(); }
        body.getComponent(Graphics)?.clear();

        const s = size / 64;
        const root = new Node('Rig');
        root.layer = body.layer;
        root.setParent(body);
        root.setSiblingIndex(0);
        root.addComponent(UITransform).setContentSize(size, size);

        const mk = (name: string, x: number, y: number, paint: (g: Graphics) => void) => {
            const n = new Node(name);
            n.layer = body.layer;
            n.setParent(root);
            n.setPosition(x * s, y * s, 0);
            n.setScale(s, s, 1);
            n.addComponent(UITransform).setContentSize(40, 40);
            paint(n.addComponent(Graphics));
            return n;
        };

        const anim = root.addComponent(EnemyRigAnimator);
        anim.kind = kind;
        anim.s = s;
        anim.enabled = animate;

        if (BIPED.has(kind)) {
            const L = LAYOUT[kind] ?? LAYOUT.bone;
            anim.layout = L;
            const shadow = mk('Shadow', 0, L.shadowY, g => { g.fillColor = c(0, 0, 0, 55); g.ellipse(0, 0, L.shadowW, L.shadowW * 0.3); g.fill(); });
            const armBack = mk('ArmBack', -L.armX, L.armY, g => paintBipedArm(g, kind, tint, false));
            const legBack = mk('LegBack', -L.legX, L.legY, g => paintBipedLeg(g, kind, tint, false));
            const torso = mk('Torso', 0, L.torsoY, g => paintBipedTorso(g, kind, tint));
            const legFront = mk('LegFront', L.legX, L.legY, g => paintBipedLeg(g, kind, tint, true));
            const head = mk('Head', 0, L.headY, g => paintBipedHead(g, kind, tint));
            const armFront = mk('ArmFront', L.armX, L.armY, g => paintBipedArm(g, kind, tint, true));
            if (L.float) { legBack.active = false; legFront.active = false; }
            anim.biped = { kind: 'biped', shadow, armBack, legBack, torso, legFront, head, armFront };
            return;
        }

        if (kind === 'dragon') {
            const shadow = mk('Shadow', 0, -30, g => { g.fillColor = c(0, 0, 0, 45); g.ellipse(0, 0, 26, 7); g.fill(); });
            const tail = mk('Tail', -18, -4, g => paintDragonTail(g, tint));
            const wingBack = mk('WingBack', -4, 6, g => paintWing(g, kind, tint, false));
            const core = mk('Core', 0, 0, g => paintDragonBody(g, tint));
            const head = mk('Head', 14, 4, g => paintDragonHead(g, tint));
            const wingFront = mk('WingFront', 2, 8, g => paintWing(g, kind, tint, true));
            anim.flyer = { kind: 'flyer', shadow, wingBack, core, wingFront, tail, head };
            return;
        }

        const shadow = mk('Shadow', 0, -26, g => { g.fillColor = c(0, 0, 0, 40); g.ellipse(0, 0, 16, 5); g.fill(); });
        const wingBack = mk('WingBack', -6, 4, g => paintWing(g, kind, tint, false));
        const core = mk('Core', 0, 0, g => paintFlyerCore(g, kind, tint));
        const wingFront = mk('WingFront', 6, 4, g => paintWing(g, kind, tint, true));
        anim.flyer = { kind: 'flyer', shadow, wingBack, core, wingFront };
    }
}

// ── 人形怪：腿 ────────────────────────────────────────────────────

function paintBipedLeg(g: Graphics, kind: string, tint: Color, front: boolean) {
    const mul = front ? 1 : 0.68;
    switch (kind) {
        case 'bone': {
            // 股骨 + 膝球 + 胫骨 + 脚骨
            const bone = shade(tint, 1.0 * mul);
            g.fillColor = bone;
            g.roundRect(-2, -8, 4, 9, 2); g.fill();
            g.circle(0, -8, 2.6); g.fill();
            g.roundRect(-1.8, -17, 3.6, 9, 1.5); g.fill();
            g.fillColor = shade(tint, 0.85 * mul);
            g.roundRect(-4, -20, 9, 3.5, 1.5); g.fill();
            return;
        }
        case 'archer': {
            // 哥布林：短腿赤脚，大脚掌
            const skin = shade(tint, 0.95 * mul);
            g.fillColor = skin;
            g.roundRect(-3.5, -12, 7, 13, 3); g.fill();
            g.fillColor = shade(tint, 0.7 * mul);
            g.roundRect(-5, -16, 12, 5, 2.5); g.fill();
            g.fillColor = c(40, 30, 24, 255 * mul);
            g.circle(6, -14.5, 1); g.fill(); g.circle(3.5, -15.5, 1); g.fill();
            return;
        }
        case 'tank': {
            // 食人魔：粗短腿 + 兽皮裹脚
            g.fillColor = shade(tint, 0.8 * mul);
            g.roundRect(-6, -14, 12, 15, 4); g.fill();
            g.fillColor = c(58, 40, 30, 255 * mul);
            g.roundRect(-7.5, -21, 15, 8, 3); g.fill();
            g.fillColor = c(30, 20, 16, 255 * mul);
            g.rect(-7.5, -17, 15, 1.5); g.fill();
            return;
        }
        case 'golem': {
            g.fillColor = shade(tint, 0.7 * mul);
            poly(g, [-7, 0, 7, 0, 8, -10, 6, -19, -6, -19, -8, -10]); g.fill();
            g.fillColor = shade(tint, 0.45 * mul);
            g.rect(-8, -11, 16, 2); g.fill();
            g.fillColor = c(120, 220, 255, 150 * mul);
            g.rect(-1, -8, 2, 6); g.fill();
            return;
        }
        case 'boss': {
            // 恶魔：暗色兽腿 + 蹄
            g.fillColor = shade(tint, 0.7 * mul);
            g.roundRect(-5, -13, 10, 14, 4); g.fill();
            g.fillColor = c(28, 16, 36, 255 * mul);
            poly(g, [-6, -13, 6, -13, 7, -21, -7, -21]); g.fill();
            g.fillColor = c(60, 40, 70, 255 * mul);
            g.rect(-0.8, -21, 1.6, 6); g.fill();
            return;
        }
        case 'imp': {
            g.fillColor = shade(tint, 0.85 * mul);
            g.roundRect(-3, -10, 6, 11, 2.5); g.fill();
            g.fillColor = shade(tint, 0.55 * mul);
            poly(g, [-4, -10, 4, -10, 5, -16, -5, -16]); g.fill();
            return;
        }
    }
}

// ── 人形怪：臂 ────────────────────────────────────────────────────

function paintBipedArm(g: Graphics, kind: string, tint: Color, front: boolean) {
    const mul = front ? 1 : 0.68;
    switch (kind) {
        case 'bone': {
            const L = 14;
            g.fillColor = shade(tint, mul);
            g.roundRect(-2, -L, 4, L, 2); g.fill();
            g.circle(0, -L / 2, 2.4); g.fill();
            // 指骨
            for (const dx of [-3, 0, 3]) { g.roundRect(dx - 0.9, -L - 5, 1.8, 5, 0.8); g.fill(); }
            if (!front) return;
            // 锈刀反握向上
            fillPoly(g, c(120, 90, 70), [-1, -L - 4, 1, 10, 5, 8, 3, -L - 4]);
            fillPoly(g, c(180, 150, 120), [0, -L - 2, 1.2, 7, 3.5, 6, 2.2, -L - 2]);
            fillPoly(g, c(90, 66, 50), [-4, -L - 2, 6, -L - 2, 6, -L - 4, -4, -L - 4]);
            return;
        }
        case 'archer': {
            // 细长臂 + 大手四指
            const L = 15;
            g.fillColor = shade(tint, 0.95 * mul);
            g.roundRect(-2.5, -L, 5, L, 2.5); g.fill();
            g.fillColor = shade(tint, 0.8 * mul);
            g.circle(0, -L - 1, 4); g.fill();
            for (const dx of [-3, -1, 1, 3]) { g.roundRect(dx - 0.8, -L - 7, 1.6, 4, 0.8); g.fill(); }
            if (!front) return;
            // 粗糙短弓 + 箭
            g.strokeColor = c(96, 66, 32);
            g.lineWidth = 3;
            g.arc(2, -L - 1, 14, -1.25, 1.25, false); g.stroke();
            g.strokeColor = c(230, 220, 190, 220);
            g.lineWidth = 1.2;
            g.moveTo(2, -L - 15); g.lineTo(2, -L + 13); g.stroke();
            g.strokeColor = c(160, 130, 90);
            g.lineWidth = 1.6;
            g.moveTo(-8, -L - 1); g.lineTo(14, -L - 1); g.stroke();
            fillPoly(g, c(200, 200, 210), [14, -L - 1, 10, -L - 4, 10, -L + 2]);
            return;
        }
        case 'mage': {
            // 长袖 + 骨爪
            const L = 18;
            fillPoly(g, shade(tint, 0.7 * mul), [-3, 0, 3, 0, 6, -L, -6, -L]);
            g.fillColor = c(200, 190, 210, 255 * mul);
            for (const dx of [-3.5, -1.2, 1.2, 3.5]) { g.roundRect(dx - 0.7, -L - 6, 1.4, 6, 0.7); g.fill(); }
            if (!front) return;
            // 歪杖竖握（杖头在肩上方）+ 邪光球
            g.strokeColor = c(70, 45, 40);
            g.lineWidth = 3;
            g.moveTo(3, -L - 8); g.lineTo(2, -L + 6); g.lineTo(5, 4); g.lineTo(3, 14); g.stroke();
            dot(g, shade(tint, 1.5, 90), 3, 19, 8);
            dot(g, shade(tint, 1.6), 3, 19, 4.5);
            dot(g, c(255, 255, 255, 220), 2, 20, 1.6);
            return;
        }
        case 'tank': {
            // 巨臂 + 拳 + 狼牙棒
            const L = 18;
            g.fillColor = shade(tint, 0.85 * mul);
            g.roundRect(-6, -L, 12, L, 5); g.fill();
            g.fillColor = shade(tint, 0.65 * mul);
            g.circle(0, 0, 7.5); g.fill();
            g.fillColor = c(80, 60, 44, 255 * mul);
            g.rect(-6, -8, 12, 2.5); g.fill();
            g.fillColor = shade(tint, 0.75 * mul);
            g.circle(0, -L - 2, 6.5); g.fill();
            if (!front) return;
            // 狼牙棒扛在肩上：柄从拳头向上，棒头在肩侧上方
            g.fillColor = c(96, 66, 40);
            g.roundRect(-2.5, -L - 4, 5, L + 14, 2); g.fill();
            g.fillColor = c(70, 50, 34);
            g.roundRect(-6.5, 8, 13, 16, 4); g.fill();
            g.fillColor = c(200, 200, 205);
            for (const [x, y] of [[-6.5, 12], [6.5, 12], [-6.5, 19], [6.5, 19], [0, 24]]) {
                if (x === 0) poly(g, [-1.5, y, 1.5, y, 0, y + 4]);
                else poly(g, [x, y - 1.5, x, y + 1.5, x + Math.sign(x) * 4, y]);
                g.fill();
            }
            return;
        }
        case 'golem': {
            const L = 18;
            g.fillColor = shade(tint, 0.8 * mul);
            poly(g, [-6, 0, 6, 0, 7, -L, -7, -L]); g.fill();
            g.fillColor = shade(tint, 0.6 * mul);
            poly(g, [-9, -L + 2, 9, -L + 2, 10, -L - 9, 3, -L - 12, -8, -L - 10]); g.fill();
            g.fillColor = c(120, 220, 255, 190 * mul);
            g.rect(-1, -L - 8, 2, 7); g.fill();
            return;
        }
        case 'boss': {
            const L = 20;
            g.fillColor = shade(tint, 0.85 * mul);
            g.roundRect(-5.5, -L, 11, L, 5); g.fill();
            // 尖刺肩甲
            fillPoly(g, c(40, 24, 50, 255 * mul), [-10, 4, 10, 4, 8, -4, -8, -4]);
            fillPoly(g, c(70, 45, 90, 255 * mul), [-9, 3, -4, 12, -1, 3]);
            fillPoly(g, c(70, 45, 90, 255 * mul), [2, 3, 6, 11, 9, 3]);
            // 爪
            g.fillColor = shade(tint, 0.6 * mul);
            g.circle(0, -L - 1, 5.5); g.fill();
            g.fillColor = c(230, 225, 235, 255 * mul);
            for (const dx of [-4, -1.3, 1.3, 4]) { poly(g, [dx - 1, -L - 4, dx + 1, -L - 4, dx, -L - 10]); g.fill(); }
            if (!front) return;
            // 巨刃竖举：柄从爪向上，刃在肩上方
            g.fillColor = c(40, 26, 50);
            g.roundRect(-2.5, -L - 4, 5, L + 14, 2); g.fill();
            fillPoly(g, c(90, 70, 110), [-3, 8, 3, 8, 14, 20, 12, 34, 0, 30, -8, 32, -6, 18]);
            fillPoly(g, c(170, 150, 200), [-1, 10, 2, 10, 11, 20, 10, 31, 0, 27, -5, 29, -4, 18]);
            dot(g, c(255, 90, 90), 0, 12, 2.4);
            return;
        }
        case 'imp': {
            const L = 12;
            g.fillColor = shade(tint, 0.9 * mul);
            g.roundRect(-2.5, -L, 5, L, 2.5); g.fill();
            g.fillColor = shade(tint, 0.7 * mul);
            g.circle(0, -L - 1, 3.5); g.fill();
            g.fillColor = c(240, 230, 210, 255 * mul);
            for (const dx of [-2.5, 0, 2.5]) { poly(g, [dx - 0.8, -L - 3, dx + 0.8, -L - 3, dx, -L - 7]); g.fill(); }
            if (!front) return;
            // 小三叉戟
            g.fillColor = c(160, 140, 80);
            g.roundRect(-1.2, -L - 2, 2.4, L + 10, 1); g.fill();
            fillPoly(g, c(200, 80, 50), [-5, 6, 5, 6, 0, 14]);
            fillPoly(g, c(220, 100, 60), [-6, 4, -2, 4, -4, 10]);
            fillPoly(g, c(220, 100, 60), [2, 4, 6, 4, 4, 10]);
            return;
        }
    }
}

// ── 人形怪：躯干 ──────────────────────────────────────────────────

function paintBipedTorso(g: Graphics, kind: string, tint: Color) {
    switch (kind) {
        case 'bone': {
            // 脊柱 + 4 对开口肋骨 + 骨盆：中间透空，一眼骷髅
            const bone = tint;
            g.fillColor = shade(bone, 0.85);
            g.roundRect(-1.6, 0, 3.2, 24, 1.5); g.fill();
            g.strokeColor = bone;
            g.lineWidth = 2.2;
            for (let i = 0; i < 4; i++) {
                const y = 20 - i * 4.5;
                const w = 9 - i * 1.2;
                g.moveTo(0, y); g.bezierCurveTo(-w, y, -w - 1, y - 3.5, -w + 2, y - 4.5); g.stroke();
                g.moveTo(0, y); g.bezierCurveTo(w, y, w + 1, y - 3.5, w - 2, y - 4.5); g.stroke();
            }
            fillPoly(g, shade(bone, 0.9), [-8, 4, 8, 4, 6, -2, 2, 0, -2, 0, -6, -2]);
            // 破烂布条
            fillPoly(g, c(60, 50, 60, 200), [-6, 4, 6, 4, 4, -6, 1, -2, -3, -7, -5, -1]);
            return;
        }
        case 'archer': {
            // 哥布林：佝偻，肚子前凸，烂布腰带，背箭袋
            const skin = tint;
            g.fillColor = c(70, 50, 34);
            g.roundRect(-11, 4, 7, 17, 2); g.fill();
            g.fillColor = c(235, 225, 200);
            g.rect(-10, 20, 1.4, 6); g.fill(); g.rect(-7.5, 21, 1.4, 6); g.fill();
            g.fillColor = shade(skin, 0.9);
            poly(g, [-9, 2, 9, 2, 12, 12, 8, 22, -6, 22, -10, 12]); g.fill();
            g.fillColor = shade(skin, 1.1);
            g.ellipse(2, 10, 6, 5); g.fill();
            fillPoly(g, c(74, 52, 36), [-10, 0, 10, 0, 8, 6, -8, 6]);
            fillPoly(g, c(74, 52, 36), [-3, 0, 5, 0, 3, -8, -4, -6]);
            g.fillColor = c(190, 160, 90);
            g.rect(-1, 1, 3, 3); g.fill();
            return;
        }
        case 'mage': {
            // 破袍：上窄下宽，下摆撕成锯齿；胸口邪符
            const robe = shade(tint, 0.65);
            poly(g, [-9, 22, 9, 22, 14, -2, 11, -8, 8, -3, 5, -9, 2, -3, -1, -9, -4, -3, -7, -9, -10, -3, -13, -8, -14, -2]);
            g.fillColor = robe; g.fill();
            fillPoly(g, shade(tint, 0.9), [-6, 22, 6, 22, 9, 4, -9, 4]);
            g.strokeColor = shade(tint, 1.6, 200);
            g.lineWidth = 1.4;
            g.circle(0, 12, 4); g.stroke();
            g.moveTo(0, 16); g.lineTo(0, 8); g.stroke();
            g.moveTo(-3.5, 10); g.lineTo(3.5, 14); g.stroke();
            dot(g, shade(tint, 1.8, 220), 0, 12, 1.4);
            return;
        }
        case 'tank': {
            // 食人魔：比高更宽的桶身 + 大肚 + 皮带 + 肩刺
            g.fillColor = shade(tint, 0.75);
            g.roundRect(-20, 0, 40, 30, 8); g.fill();
            g.fillColor = shade(tint, 0.95);
            g.ellipse(2, 12, 13, 10); g.fill();
            g.fillColor = c(58, 40, 30);
            poly(g, [-20, 24, 20, 12, 20, 17, -20, 29]); g.fill();
            g.fillColor = c(210, 170, 70);
            g.circle(6, 18, 2.6); g.fill();
            fillPoly(g, c(220, 215, 200), [-20, 26, -16, 34, -13, 27]);
            fillPoly(g, c(220, 215, 200), [20, 26, 16, 34, 13, 27]);
            g.fillColor = shade(tint, 0.5);
            g.circle(-8, 6, 1.4); g.fill(); g.circle(10, 4, 1.2); g.fill(); g.circle(-2, 3, 1); g.fill();
            return;
        }
        case 'golem': {
            // 叠石身：几块不规则石头 + 发光裂缝
            g.fillColor = shade(tint, 0.55);
            poly(g, [-20, 2, 20, 0, 22, 14, 16, 30, -16, 32, -22, 16]); g.fill();
            g.fillColor = tint;
            poly(g, [-14, 6, 6, 4, 12, 12, 8, 24, -10, 26, -16, 16]); g.fill();
            g.fillColor = shade(tint, 0.8);
            poly(g, [8, 4, 18, 2, 20, 12, 14, 18, 10, 12]); g.fill();
            g.strokeColor = c(120, 220, 255, 230);
            g.lineWidth = 1.8;
            g.moveTo(-6, 26); g.lineTo(-3, 16); g.lineTo(2, 12); g.lineTo(0, 6); g.stroke();
            g.moveTo(8, 22); g.lineTo(10, 14); g.stroke();
            dot(g, c(120, 220, 255, 200), -1, 14, 3.2);
            dot(g, c(90, 160, 80, 200), -12, 8, 2.4);
            dot(g, c(90, 160, 80, 200), 14, 26, 2);
            return;
        }
        case 'boss': {
            // 恶魔领主：巨肩宽躯 + 胸口炽符 + 腰间兽面
            g.fillColor = shade(tint, 0.55);
            poly(g, [-24, 30, 24, 30, 26, 14, 16, 0, -16, 0, -26, 14]); g.fill();
            g.fillColor = tint;
            poly(g, [-16, 26, 16, 26, 18, 12, 10, 4, -10, 4, -18, 12]); g.fill();
            g.fillColor = c(255, 120, 60, 200);
            poly(g, [0, 24, 5, 16, 0, 8, -5, 16]); g.fill();
            dot(g, c(255, 230, 160), 0, 16, 2);
            g.fillColor = c(36, 20, 44);
            g.rect(-18, 2, 36, 4); g.fill();
            dot(g, c(220, 200, 90), 0, 4, 3);
            dot(g, c(40, 20, 30), -1.2, 4.6, 0.8); dot(g, c(40, 20, 30), 1.2, 4.6, 0.8);
            return;
        }
        case 'imp': {
            g.fillColor = shade(tint, 0.75);
            g.roundRect(-9, 2, 18, 18, 5); g.fill();
            g.fillColor = shade(tint, 0.95);
            g.ellipse(0, 10, 7, 6); g.fill();
            // 小翅芽
            fillPoly(g, shade(tint, 0.55, 200), [-9, 14, -18, 20, -10, 8]);
            fillPoly(g, shade(tint, 0.55, 200), [9, 14, 18, 20, 10, 8]);
            g.fillColor = c(40, 20, 30);
            g.rect(-8, 4, 16, 2.5); g.fill();
            return;
        }
    }
}

// ── 人形怪：头 ────────────────────────────────────────────────────

function paintBipedHead(g: Graphics, kind: string, tint: Color) {
    switch (kind) {
        case 'bone': {
            // 骷髅：颅顶圆 + 方下颌 + 深眼窝红光 + 鼻洞 + 牙缝
            g.fillColor = tint;
            g.circle(0, 10, 9.5); g.fill();
            g.roundRect(-6.5, -1, 13, 8, 2); g.fill();
            g.fillColor = c(18, 14, 16);
            g.ellipse(-3.8, 10.5, 3, 3.4); g.fill(); g.ellipse(3.8, 10.5, 3, 3.4); g.fill();
            poly(g, [0, 7, -1.6, 3.5, 1.6, 3.5]); g.fill();
            dot(g, c(255, 70, 50), -3.8, 10, 1.3); dot(g, c(255, 70, 50), 3.8, 10, 1.3);
            g.fillColor = c(18, 14, 16);
            for (const x of [-4.5, -1.5, 1.5, 4.5]) { g.rect(x - 0.6, -0.5, 1.2, 4); g.fill(); }
            g.rect(-6.5, 2.5, 13, 1); g.fill();
            // 裂缝
            g.strokeColor = shade(tint, 0.6);
            g.lineWidth = 1;
            g.moveTo(3, 19); g.lineTo(5, 14); g.lineTo(3.5, 12); g.stroke();
            return;
        }
        case 'archer': {
            // 哥布林：大头长尖耳、鹰钩鼻、黄色竖瞳、裂嘴獠牙
            const skin = tint;
            fillPoly(g, shade(skin, 0.85), [-9, 12, -24, 20, -10, 6]);
            fillPoly(g, shade(skin, 0.85), [9, 12, 24, 20, 10, 6]);
            g.fillColor = skin;
            g.ellipse(0, 10, 11, 10); g.fill();
            g.fillColor = shade(skin, 0.8);
            poly(g, [1, 9, 8, 6, 3, 3]); g.fill();
            g.fillColor = c(240, 210, 70);
            g.ellipse(-4.5, 11, 3, 2.4); g.fill(); g.ellipse(4, 12, 2.4, 2); g.fill();
            g.fillColor = c(20, 16, 10);
            g.rect(-5.2, 9, 1.4, 4); g.fill(); g.rect(3.4, 10.5, 1.2, 3); g.fill();
            g.fillColor = c(40, 20, 20);
            poly(g, [-7, 3, 6, 4, 4, 1, -6, 0.5]); g.fill();
            g.fillColor = c(240, 235, 220);
            poly(g, [-5, 3, -3.5, 3, -4.2, 0]); g.fill(); poly(g, [2, 3.5, 3.5, 3.5, 2.8, 1]); g.fill();
            // 乱发
            fillPoly(g, c(40, 30, 24), [-8, 16, -6, 22, -3, 17, 0, 23, 3, 17, 6, 21, 8, 15]);
            return;
        }
        case 'mage': {
            // 兜帽：帽内一片虚空 + 两点邪光
            const hood = shade(tint, 0.7);
            poly(g, [-14, 0, 14, 0, 12, 10, 4, 24, 0, 27, -4, 24, -12, 10]);
            g.fillColor = hood; g.fill();
            g.fillColor = c(8, 6, 14);
            g.ellipse(0, 7, 8.5, 7.5); g.fill();
            dot(g, shade(tint, 1.7, 230), -3.5, 8.5, 2); dot(g, shade(tint, 1.7, 230), 3.5, 8.5, 2);
            dot(g, c(255, 255, 255, 200), -3.5, 9, 0.8); dot(g, c(255, 255, 255, 200), 3.5, 9, 0.8);
            g.strokeColor = shade(tint, 0.5);
            g.lineWidth = 1.2;
            g.moveTo(-12, 8); g.lineTo(-6, 20); g.stroke();
            g.moveTo(12, 8); g.lineTo(6, 20); g.stroke();
            return;
        }
        case 'tank': {
            // 食人魔：小头沉在肩里、宽低颅顶、下颌前突两根獠牙、独角
            g.fillColor = shade(tint, 0.9);
            g.roundRect(-9, 2, 18, 13, 5); g.fill();
            g.fillColor = shade(tint, 0.75);
            g.roundRect(-10, -3, 20, 7, 3); g.fill();
            fillPoly(g, c(235, 230, 215), [-7, 0, -5, -6, -3, 1]);
            fillPoly(g, c(235, 230, 215), [7, 0, 5, -6, 3, 1]);
            dot(g, c(255, 90, 60), -4, 9, 1.8); dot(g, c(255, 90, 60), 4, 9, 1.8);
            dot(g, c(30, 10, 10), -4, 9, 0.8); dot(g, c(30, 10, 10), 4, 9, 0.8);
            g.fillColor = shade(tint, 0.6);
            g.rect(-9, 12, 18, 1.5); g.fill();
            fillPoly(g, c(200, 190, 170), [-2, 15, 2, 15, 0, 24]);
            g.fillColor = c(90, 70, 50);
            g.circle(-8, 8, 1.6); g.fill(); g.circle(8, 8, 1.6); g.fill();
            return;
        }
        case 'golem': {
            // 独眼石首：方石 + 一枚大符文眼
            g.fillColor = shade(tint, 0.75);
            poly(g, [-9, 0, 9, 0, 10, 8, 6, 14, -7, 13, -10, 7]); g.fill();
            dot(g, c(30, 60, 80), 0, 7, 5);
            dot(g, c(120, 220, 255), 0, 7, 3.6);
            dot(g, c(255, 255, 255, 230), 0, 7, 1.4);
            g.strokeColor = shade(tint, 0.45);
            g.lineWidth = 1.2;
            g.moveTo(-6, 12); g.lineTo(-4, 6); g.stroke();
            dot(g, c(90, 160, 80, 200), 6, 12, 1.8);
            return;
        }
        case 'boss': {
            // 恶魔领主：向后弯曲的巨角 + 骷颚獠牙 + 炽白眼 + 金环冠
            const horn = c(230, 210, 170);
            g.strokeColor = horn;
            g.lineWidth = 4;
            g.moveTo(-8, 16); g.bezierCurveTo(-18, 20, -22, 30, -16, 36); g.stroke();
            g.moveTo(8, 16); g.bezierCurveTo(18, 20, 22, 30, 16, 36); g.stroke();
            g.fillColor = shade(tint, 0.85);
            g.ellipse(0, 10, 11, 10.5); g.fill();
            g.fillColor = shade(tint, 0.6);
            g.roundRect(-8, -2, 16, 8, 3); g.fill();
            g.fillColor = c(255, 250, 230);
            g.ellipse(-4.5, 11, 3.2, 2.2); g.fill(); g.ellipse(4.5, 11, 3.2, 2.2); g.fill();
            dot(g, c(255, 120, 60), -4.5, 11, 1.2); dot(g, c(255, 120, 60), 4.5, 11, 1.2);
            g.fillColor = c(240, 235, 225);
            for (const x of [-5, -2, 1, 4]) { poly(g, [x, 3, x + 2, 3, x + 1, -1]); g.fill(); }
            g.strokeColor = c(255, 210, 90);
            g.lineWidth = 2;
            g.moveTo(-8, 18); g.lineTo(8, 18); g.stroke();
            dot(g, c(255, 90, 90), 0, 19, 1.8);
            return;
        }
        case 'imp': {
            // 小恶魔：弯角 + 尖耳 + 黄竖瞳 + 咧嘴
            fillPoly(g, c(230, 200, 120), [-5, 14, -10, 24, -3, 16]);
            fillPoly(g, c(230, 200, 120), [5, 14, 10, 24, 3, 16]);
            fillPoly(g, shade(tint, 0.8), [-8, 10, -16, 14, -7, 4]);
            fillPoly(g, shade(tint, 0.8), [8, 10, 16, 14, 7, 4]);
            g.fillColor = tint;
            g.ellipse(0, 8, 8.5, 8); g.fill();
            g.fillColor = c(255, 220, 60);
            g.ellipse(-3.2, 9, 2.4, 2); g.fill(); g.ellipse(3.2, 9, 2.4, 2); g.fill();
            g.fillColor = c(20, 10, 10);
            g.rect(-3.6, 7.5, 1.1, 3); g.fill(); g.rect(2.8, 7.5, 1.1, 3); g.fill();
            g.fillColor = c(40, 15, 15);
            poly(g, [-5, 3, 5, 3, 3, 0, -3, 0]); g.fill();
            g.fillColor = c(240, 230, 210);
            poly(g, [-3.5, 3, -2, 3, -2.7, 0.5]); g.fill();
            poly(g, [2, 3, 3.5, 3, 2.7, 0.5]); g.fill();
            return;
        }
    }
}

// ── 飞行怪 ────────────────────────────────────────────────────────

function paintWing(g: Graphics, kind: string, tint: Color, front: boolean) {
    // 翅根在 (0,0)，向 +x 展开（后翅由动画器镜像）
    const dir = front ? 1 : -1;
    const mul = front ? 1 : 0.72;
    if (kind === 'jelly') {
        // 触手当翅
        g.strokeColor = shade(tint, 0.85 * mul, 200);
        g.lineWidth = 2.4;
        for (let i = 0; i < 3; i++) {
            const ox = dir * (4 + i * 5);
            g.moveTo(0, -2);
            g.bezierCurveTo(ox * 0.4, -8 - i * 2, ox, -14 - i * 3, ox * 1.1, -22 - i * 2);
            g.stroke();
        }
        g.fillColor = shade(tint, 1.1 * mul, 160);
        g.circle(dir * 6, -6, 2.5); g.fill();
        return;
    }
    if (kind === 'moth') {
        g.fillColor = shade(tint, 0.6 * mul);
        g.ellipse(dir * 14, 2, 15, 10); g.fill();
        g.ellipse(dir * 10, -8, 9, 6); g.fill();
        g.fillColor = shade(tint, 1.15 * mul, 220);
        g.ellipse(dir * 14, 3, 7, 5); g.fill();
        g.fillColor = c(255, 255, 255, 120);
        g.circle(dir * 16, 4, 2); g.fill();
        return;
    }
    if (kind === 'mosquito') {
        g.fillColor = c(210, 235, 210, 140 * mul + 30);
        g.ellipse(dir * 14, 3, 14, 6); g.fill();
        g.strokeColor = c(255, 255, 255, 110);
        g.lineWidth = 1.2;
        g.moveTo(0, 2); g.lineTo(dir * 24, 4); g.stroke();
        return;
    }
    if (kind === 'raven') {
        g.fillColor = shade(tint, 0.5 * mul);
        poly(g, [0, 0, dir * 30, 8, dir * 26, -6, dir * 14, -8]); g.fill();
        g.fillColor = shade(tint, 0.35 * mul);
        poly(g, [dir * 12, -4, dir * 30, 8, dir * 20, -10]); g.fill();
        g.strokeColor = c(255, 255, 255, 70);
        g.lineWidth = 1.2;
        g.moveTo(dir * 6, -2); g.lineTo(dir * 24, 4); g.stroke();
        return;
    }
    if (kind === 'dragon') {
        // 大膜翼：三根指骨 + 撕裂边缘
        const dark = shade(tint, 0.55 * mul);
        const mem = shade(tint, 0.95 * mul, 215);
        g.fillColor = dark;
        poly(g, [0, 0, dir * 12, 14, dir * 30, 20, dir * 40, 8, dir * 34, -4, dir * 22, -8, dir * 10, -8]); g.fill();
        g.fillColor = mem;
        poly(g, [dir * 4, 0, dir * 12, 10, dir * 27, 15, dir * 35, 6, dir * 30, -2, dir * 20, -5, dir * 9, -5]); g.fill();
        g.strokeColor = shade(tint, 0.4 * mul);
        g.lineWidth = 1.6;
        g.moveTo(0, 0); g.lineTo(dir * 30, 20); g.stroke();
        g.moveTo(0, 0); g.lineTo(dir * 40, 8); g.stroke();
        g.moveTo(0, 0); g.lineTo(dir * 34, -4); g.stroke();
        g.fillColor = c(255, 170, 70, 80 * mul);
        poly(g, [dir * 10, 4, dir * 26, 12, dir * 30, 2]); g.fill();
        return;
    }
    // bat 膜翼
    g.fillColor = shade(tint, 0.55 * mul);
    poly(g, [0, 0, dir * 30, 14, dir * 26, -2, dir * 16, 6, dir * 8, -6]); g.fill();
    g.fillColor = shade(tint, 0.9 * mul, 200);
    poly(g, [dir * 4, 0, dir * 24, 10, dir * 21, -1]); g.fill();
    g.strokeColor = c(255, 255, 255, 80);
    g.lineWidth = 1.2;
    g.moveTo(0, 0); g.lineTo(dir * 26, -2); g.stroke();
}

function paintDragonBody(g: Graphics, tint: Color) {
    // 横卧躯干 + 腹甲条 + 背棘 + 后爪
    g.fillColor = tint;
    g.ellipse(0, 0, 22, 12); g.fill();
    g.fillColor = shade(tint, 1.35);
    g.ellipse(2, -4, 16, 6); g.fill();
    g.strokeColor = shade(tint, 0.85);
    g.lineWidth = 1.2;
    for (let i = -10; i <= 12; i += 5.5) { g.moveTo(i, -9.5); g.lineTo(i + 1, -1); g.stroke(); }
    g.fillColor = shade(tint, 0.55);
    for (let i = -14; i <= 10; i += 6) { poly(g, [i, 10, i + 3, 10, i + 1.5, 16]); g.fill(); }
    // 后爪
    g.fillColor = shade(tint, 0.7);
    g.roundRect(-14, -18, 7, 9, 3); g.fill();
    g.roundRect(6, -18, 7, 9, 3); g.fill();
    g.fillColor = c(240, 230, 200);
    for (const x of [-14, -11, -8, 6, 9, 12]) { poly(g, [x, -17, x + 2, -17, x + 1, -21]); g.fill(); }
}

function paintDragonHead(g: Graphics, tint: Color) {
    // 颈根在 (0,0)：粗颈上扬 → 长吻头，下颌张开露牙，双角后掠，喉部火光
    g.fillColor = shade(tint, 0.95);
    poly(g, [-6, -6, 6, -4, 10, 8, 6, 14, -4, 12, -8, 2]); g.fill();
    g.fillColor = shade(tint, 1.3);
    poly(g, [-3, -4, 3, -3, 6, 8, 2, 11, -3, 8]); g.fill();
    // 头颅 + 吻
    g.fillColor = tint;
    g.ellipse(6, 16, 10, 8); g.fill();
    poly(g, [10, 20, 26, 17, 27, 12, 12, 10]); g.fill();
    // 下颌（张开）
    g.fillColor = shade(tint, 0.8);
    poly(g, [10, 11, 25, 6, 24, 3, 9, 8]); g.fill();
    g.fillColor = c(255, 120, 60, 200);
    poly(g, [12, 11, 22, 8, 22, 12]); g.fill();
    g.fillColor = c(245, 240, 225);
    for (const x of [14, 18, 22]) { poly(g, [x, 12, x + 2, 12, x + 1, 9]); g.fill(); }
    for (const x of [15, 19]) { poly(g, [x, 8.5, x + 2, 8.5, x + 1, 11]); g.fill(); }
    // 鼻孔 / 眼
    dot(g, shade(tint, 0.5), 24, 15, 1);
    g.fillColor = c(255, 230, 90);
    g.ellipse(9, 17, 3, 2.2); g.fill();
    g.fillColor = c(30, 10, 10);
    g.rect(8.6, 15, 1, 4); g.fill();
    // 双角 + 颊鬃
    const horn = c(235, 215, 170);
    fillPoly(g, horn, [2, 22, -6, 32, 6, 24]);
    fillPoly(g, horn, [7, 23, 1, 34, 10, 24]);
    g.fillColor = shade(tint, 0.6);
    for (let i = 0; i < 3; i++) { poly(g, [-2 + i * 3, 8 + i * 3, 1 + i * 3, 10 + i * 3, -6 + i * 2, 14 + i * 3]); g.fill(); }
}

function paintDragonTail(g: Graphics, tint: Color) {
    // 尾根在 (0,0)，向 -x 拖出，末端矛尾 + 沿脊小棘
    g.fillColor = shade(tint, 0.9);
    poly(g, [0, 6, -12, 4, -24, -2, -34, -10, -36, -14, -30, -12, -22, -6, -12, -2, 0, -4]); g.fill();
    g.fillColor = shade(tint, 0.55);
    for (let i = 0; i < 4; i++) { const x = -6 - i * 7; poly(g, [x, 5 - i * 1.5, x - 3, 5 - i * 1.5, x - 1.5, 10 - i * 1.5]); g.fill(); }
    fillPoly(g, c(235, 215, 170), [-34, -10, -46, -16, -40, -22, -32, -14]);
}

function paintFlyerCore(g: Graphics, kind: string, tint: Color) {
    if (kind === 'jelly') {
        g.fillColor = shade(tint, 0.65, 210);
        g.ellipse(0, 4, 16, 11); g.fill();
        g.fillColor = new Color(tint.r, tint.g, tint.b, 200);
        g.ellipse(0, 6, 13, 9); g.fill();
        g.fillColor = shade(tint, 1.35, 160);
        g.ellipse(-3, 10, 5, 3.5); g.fill();
        g.fillColor = c(255, 255, 255, 255);
        g.ellipse(-4.5, 8, 4.2, 4.5); g.fill();
        g.ellipse(4.5, 8, 4.2, 4.5); g.fill();
        g.fillColor = c(40, 90, 110);
        g.circle(-4, 7.5, 1.8); g.fill();
        g.circle(5, 7.5, 1.8); g.fill();
        g.fillColor = c(255, 255, 255, 220);
        g.circle(-5, 9, 0.9); g.fill();
        g.circle(4, 9, 0.9); g.fill();
        g.strokeColor = shade(tint, 0.4, 200);
        g.lineWidth = 1.5;
        g.moveTo(-3, 2); g.bezierCurveTo(-1, 0, 1, 0, 3, 2); g.stroke();
        return;
    }
    if (kind === 'moth') {
        g.fillColor = tint;
        g.ellipse(0, 0, 8, 14); g.fill();
        g.fillColor = shade(tint, 1.2);
        g.ellipse(0, 6, 5, 6); g.fill();
        g.fillColor = c(255, 240, 180);
        g.circle(-2.5, 8, 2); g.fill(); g.circle(2.5, 8, 2); g.fill();
        g.fillColor = c(40, 20, 10);
        g.circle(-2.5, 8, 0.9); g.fill(); g.circle(2.5, 8, 0.9); g.fill();
        g.strokeColor = shade(tint, 0.5);
        g.lineWidth = 1.5;
        g.moveTo(-2, 13); g.lineTo(-8, 21); g.stroke();
        g.moveTo(2, 13); g.lineTo(8, 21); g.stroke();
        return;
    }
    if (kind === 'mosquito') {
        g.fillColor = tint;
        g.ellipse(0, -2, 7, 11); g.fill();
        g.fillColor = shade(tint, 1.25);
        g.ellipse(0, -5, 4, 5); g.fill();
        g.fillColor = shade(tint, 0.85);
        g.circle(0, 10, 6.5); g.fill();
        g.strokeColor = shade(tint, 0.4);
        g.lineWidth = 1.6;
        g.moveTo(-1.5, 14); g.lineTo(0, 22); g.lineTo(1.5, 14); g.stroke();
        g.fillColor = c(255, 255, 210);
        g.ellipse(-3, 10, 3.2, 3.6); g.fill();
        g.ellipse(3, 10, 3.2, 3.6); g.fill();
        g.fillColor = c(30, 40, 20);
        g.circle(-2.5, 9.5, 1.5); g.fill();
        g.circle(3.5, 9.5, 1.5); g.fill();
        g.fillColor = c(255, 255, 255, 220);
        g.circle(-3.2, 11, 0.8); g.fill();
        g.circle(2.8, 11, 0.8); g.fill();
        g.strokeColor = shade(tint, 0.5);
        g.lineWidth = 1.2;
        g.moveTo(-3, -8); g.lineTo(-9, -18); g.stroke();
        g.moveTo(3, -8); g.lineTo(9, -18); g.stroke();
        return;
    }
    if (kind === 'raven') {
        g.fillColor = tint;
        g.ellipse(0, 0, 12, 10); g.fill();
        g.fillColor = shade(tint, 1.15);
        g.ellipse(10, 3, 8, 6); g.fill();
        g.fillColor = c(40, 35, 30);
        poly(g, [16, 3, 28, 1, 16, -1]); g.fill();
        g.fillColor = c(220, 200, 80);
        g.circle(9, 5, 2.2); g.fill();
        g.fillColor = c(20, 10, 10);
        g.circle(9.5, 5, 1); g.fill();
        g.fillColor = shade(tint, 0.55);
        poly(g, [-10, -2, -22, -10, -8, -8]); g.fill();
        return;
    }
    // bat：毛团身 + 大耳 + 獠牙 + 红眼
    g.fillColor = tint;
    g.ellipse(0, 1, 10, 12); g.fill();
    g.fillColor = shade(tint, 1.25);
    g.ellipse(0, -2, 6, 6); g.fill();
    fillPoly(g, shade(tint, 0.8), [-7, 9, -10, 22, -2, 12]);
    fillPoly(g, shade(tint, 0.8), [7, 9, 10, 22, 2, 12]);
    fillPoly(g, c(255, 200, 200, 200), [-7, 10, -8.5, 18, -3.5, 12]);
    fillPoly(g, c(255, 200, 200, 200), [7, 10, 8.5, 18, 3.5, 12]);
    dot(g, c(255, 70, 60), -3.5, 5, 2.2); dot(g, c(255, 70, 60), 3.5, 5, 2.2);
    dot(g, c(20, 5, 10), -3.5, 5, 1); dot(g, c(20, 5, 10), 3.5, 5, 1);
    g.fillColor = c(40, 16, 30);
    g.ellipse(0, -1, 4, 1.6); g.fill();
    g.fillColor = c(255, 255, 255, 230);
    poly(g, [-3, -1, -1.5, -1, -2.2, -5]); g.fill();
    poly(g, [1.5, -1, 3, -1, 2.2, -5]); g.fill();
    g.fillColor = shade(tint, 0.7);
    poly(g, [-5, -10, -3, -18, -1, -11]); g.fill();
    poly(g, [5, -10, 3, -18, 1, -11]); g.fill();
}

// ── 动画器 ───────────────────────────────────────────────────────

const FLAP_RATE: Readonly<Record<string, number>> = {
    bat: 14, mosquito: 26, moth: 7, raven: 9, dragon: 5, jelly: 4,
};

@ccclass('EnemyRigAnimator')
export class EnemyRigAnimator extends Component {
    kind = 'bone';
    s = 1;
    layout: BipedLayout | null = null;
    biped: BipedParts | null = null;
    flyer: FlyerParts | null = null;

    private _t = Math.random() * 10;
    private _phase = Math.random() * Math.PI * 2;
    private _blend = 0;

    update(dt: number) {
        this._t += dt;
        const motion = this.node.parent?.getComponent(EnemyMotion);
        const moving = motion?.moving ?? false;
        const punch = motion?.punch ?? 0;
        const wind = motion?.wind ?? 0;
        const s = this.s;

        if (this.flyer) {
            const rate = (FLAP_RATE[this.kind] ?? 10) * (moving ? 1.35 : 1);
            this._phase += dt * rate;
            const flap = Math.sin(this._phase);
            const f = this.flyer;
            // 前翅在 +x 展开，后翅在 -x：同一个 flap 值让两翅同时上下
            const amp = this.kind === 'dragon' ? 26 : 32;
            f.wingFront.angle = flap * amp - punch * 20;
            f.wingBack.angle = -flap * amp + punch * 20;
            const spread = 1 + Math.max(0, flap) * 0.08;
            f.wingFront.setScale(s * spread, s, 1);
            f.wingBack.setScale(s * spread, s, 1);
            f.core.setPosition(0, -flap * 1.5 * s, 0);
            f.shadow.setScale(s * (0.9 + flap * 0.05), s * (0.9 + flap * 0.05), 1);
            if (f.tail) {
                // 尾巴滞后摆 + 蓄力时上翘
                f.tail.angle = Math.sin(this._phase - 1.2) * 9 + wind * 14;
                f.tail.setPosition(-18 * s, (-4 - flap * 1.2) * s, 0);
            }
            if (f.head) {
                // 颈头随扑翼点头；蓄力时后仰，喷吐时前探
                const pk = Math.sin(Math.min(1, punch) * Math.PI);
                f.head.angle = -flap * 4 + wind * 18 - pk * 22;
                f.head.setPosition((14 + pk * 5) * s, (4 - flap * 1.2 + wind * 2) * s, 0);
            }
            return;
        }

        const p = this.biped;
        const L = this.layout ?? LAYOUT.bone;
        if (!p) return;
        if (moving) {
            this._phase += dt * enemyRunRate(this.kind);
            this._blend = Math.min(1, this._blend + dt * 8);
        } else {
            this._blend = Math.max(0, this._blend - dt * 6);
            this._phase += dt * enemyRunRate(this.kind) * this._blend * 0.5;
        }
        const step = Math.sin(this._phase) * this._blend;
        const idle = Math.sin(this._t * 2.2);
        // #151 腿摆幅度下调：步伐仍清晰，整体不再甩成摇晃
        const swing = L.heavy ? 12 : 18;

        // 悬浮怪：无腿，整体上下漂 + 摆动
        const floatY = L.float ? Math.sin(this._t * 2.6) * 1.6 * s : 0;
        const hunch = this.kind === 'archer' ? 8 : this.kind === 'bone' ? 4 : 0;

        if (!L.float) {
            p.legFront.angle = step * swing;
            p.legFront.setPosition(L.legX * s, (L.legY + Math.max(0, step) * 2.2) * s, 0);
            p.legBack.angle = -step * swing;
            p.legBack.setPosition(-L.legX * s, (L.legY + Math.max(0, -step) * 2.2) * s, 0);
        }

        const bob = Math.abs(step) * 1.1 * s + floatY;
        p.torso.angle = step * 1.8 - wind * 5 - hunch + (L.float ? idle * 1.2 : 0);
        p.torso.setPosition(0, L.torsoY * s + bob, 0);
        p.head.angle = -step * 1.2 + idle * 0.9 * (1 - this._blend) - wind * 4 - hunch * 0.6;
        p.head.setPosition(hunch * 0.3 * s, L.headY * s + bob, 0);

        p.armBack.angle = step * swing * 0.75 + idle * 1.2 + wind * 14;
        p.armBack.setPosition(-L.armX * s, L.armY * s + bob, 0);

        // 前臂：蓄力抬起 → 出击劈下；平时反向摆
        const pk = Math.sin(Math.min(1, punch) * Math.PI);
        let armAng = -step * swing * 0.8 - idle * 2;
        if (wind > 0) armAng = 70 * wind;
        if (punch > 0) armAng = 70 * (1 - pk) - 60 * pk;
        p.armFront.angle = armAng;
        p.armFront.setPosition(L.armX * s, L.armY * s + bob, 0);

        p.shadow.setScale(s * (1 - Math.abs(step) * 0.08), s * (1 - Math.abs(step) * 0.12), 1);
    }
}
