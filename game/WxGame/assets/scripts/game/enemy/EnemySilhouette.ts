import { Color, Graphics } from 'cc';
import { EnemyRig } from './EnemyRig';

/**
 * 每种怪一套轮廓。颜色只作主题染色，外形不共用圆角方块。
 * #126b：人形怪 / 飞行怪改走 EnemyRig 分部件小人（四肢/翅膀独立动），
 * 这里只剩圆团类（slime/wisp/specter/beetle/toad/crystal/fast/spider/snake/shroom）。
 * #180：UI/局内暂不用脚本像素（观感不如 Rig/剪影），保留 EnemyPixelArt 供日后精修。
 */
export function drawEnemySilhouette(g: Graphics, kind: string, tint: Color, size: number, animate = true) {
    g.clear();
    // 清掉曾挂的脚本像素，避免叠层
    const oldPx = g.node.getChildByName('Pixel');
    if (oldPx?.isValid) { oldPx.removeFromParent(); oldPx.destroy(); }
    if (EnemyRig.supports(kind)) {
        EnemyRig.mount(g.node, kind, tint, size, animate);
        return;
    }
    const s = size / 64;
    if (kind === 'fast') drawFast(g, tint, s);
    else if (kind === 'tank') drawTank(g, tint, s);
    else if (kind === 'archer') drawArcher(g, tint, s);
    else if (kind === 'wisp') drawWisp(g, tint, s);
    else if (kind === 'bat') drawBat(g, tint, s);
    else if (kind === 'beetle') drawBeetle(g, tint, s);
    else if (kind === 'toad') drawToad(g, tint, s);
    else if (kind === 'crystal') drawCrystal(g, tint, s);
    else if (kind === 'golem') drawGolem(g, tint, s);
    else if (kind === 'moth') drawMoth(g, tint, s);
    else if (kind === 'raven') drawRaven(g, tint, s);
    else if (kind === 'mosquito') drawMosquito(g, tint, s);
    else if (kind === 'mage') drawMage(g, tint, s);
    else if (kind === 'dragon') drawDragon(g, tint, s);
    else if (kind === 'specter') drawSpecter(g, tint, s);
    else if (kind === 'bone') drawBone(g, tint, s);
    else if (kind === 'boss') drawBoss(g, tint, s);
    else if (kind === 'spider') drawSpider(g, tint, s);
    else if (kind === 'snake') drawSnake(g, tint, s);
    else if (kind === 'shroom') drawShroom(g, tint, s);
    else if (kind === 'cog') drawCog(g, tint, s);
    else if (kind === 'spark') drawSpark(g, tint, s);
    else if (kind === 'puppet') drawPuppet(g, tint, s);
    else if (kind === 'drone') drawDrone(g, tint, s);
    else if (kind === 'wolf') drawWolf(g, tint, s);
    else if (kind === 'crab') drawCrab(g, tint, s);
    else drawSlime(g, tint, s);
}

/** 史莱姆：元气骑士式圆凝胶——对称胖团、大眼、笑嘴、顶高光、小手 */
function drawSlime(g: Graphics, tint: Color, s: number) {
    // 落地阴影
    g.fillColor = new Color(0, 0, 0, 55);
    g.ellipse(0, -20 * s, 20 * s, 5 * s); g.fill();

    // 主体：对称圆胖团（略扁）
    g.fillColor = shade(tint, 0.72);
    g.ellipse(0, -4 * s, 23 * s, 20 * s); g.fill();
    g.fillColor = new Color(tint.r, tint.g, tint.b, 255);
    g.ellipse(0, -2 * s, 21 * s, 18 * s); g.fill();

    // 肚皮浅色
    g.fillColor = shade(tint, 1.35);
    g.ellipse(0, -6 * s, 12 * s, 9 * s); g.fill();

    // 小手（左右对称）
    g.fillColor = shade(tint, 0.9);
    g.ellipse(-20 * s, -2 * s, 5 * s, 4 * s); g.fill();
    g.ellipse(20 * s, -2 * s, 5 * s, 4 * s); g.fill();

    // 大眼（对称、偏可爱）
    g.fillColor = new Color(255, 255, 255, 255);
    g.ellipse(-7 * s, 6 * s, 6 * s, 6.5 * s); g.fill();
    g.ellipse(7 * s, 6 * s, 6 * s, 6.5 * s); g.fill();
    g.fillColor = new Color(28, 36, 48, 255);
    g.circle(-6 * s, 5.5 * s, 3 * s); g.fill();
    g.circle(8 * s, 5.5 * s, 3 * s); g.fill();
    g.fillColor = new Color(255, 255, 255, 230);
    g.circle(-7.2 * s, 7 * s, 1.1 * s); g.fill();
    g.circle(6.8 * s, 7 * s, 1.1 * s); g.fill();

    // 笑嘴 + 两颗小牙
    g.strokeColor = shade(tint, 0.35);
    g.lineWidth = 2 * Math.max(1, s);
    g.moveTo(-6 * s, -4 * s);
    g.bezierCurveTo(-2 * s, -9 * s, 2 * s, -9 * s, 6 * s, -4 * s);
    g.stroke();
    g.fillColor = new Color(255, 255, 255, 235);
    g.moveTo(-3 * s, -5 * s); g.lineTo(-1.2 * s, -5 * s); g.lineTo(-2.1 * s, -7.2 * s); g.close(); g.fill();
    g.moveTo(1.2 * s, -5 * s); g.lineTo(3 * s, -5 * s); g.lineTo(2.1 * s, -7.2 * s); g.close(); g.fill();

    // 顶高光 + 小气泡
    g.fillColor = new Color(255, 255, 255, 130);
    g.ellipse(-6 * s, 12 * s, 7 * s, 3.5 * s); g.fill();
    g.fillColor = shade(tint, 1.45);
    g.circle(10 * s, 2 * s, 1.8 * s); g.fill();
    g.circle(-12 * s, -8 * s, 1.4 * s); g.fill();
}

/** 毒蛙：元气骑士式胖蛙——鼓眼头顶、宽嘴、后腿蓄力、斑点 */
function drawToad(g: Graphics, tint: Color, s: number) {
    // 落地阴影
    g.fillColor = new Color(0, 0, 0, 55);
    g.ellipse(0, -20 * s, 22 * s, 5 * s); g.fill();

    // 后腿（先画，在身体后）
    g.fillColor = shade(tint, 0.55);
    g.ellipse(-18 * s, -10 * s, 11 * s, 8 * s); g.fill();
    g.ellipse(18 * s, -10 * s, 11 * s, 8 * s); g.fill();
    // 脚掌
    g.fillColor = shade(tint, 0.4);
    g.ellipse(-20 * s, -17 * s, 9 * s, 3.5 * s); g.fill();
    g.ellipse(20 * s, -17 * s, 9 * s, 3.5 * s); g.fill();

    // 身体（圆胖腹）
    g.fillColor = shade(tint, 0.7);
    g.ellipse(0, -6 * s, 22 * s, 15 * s); g.fill();
    g.fillColor = new Color(tint.r, tint.g, tint.b, 255);
    g.ellipse(0, -4 * s, 20 * s, 14 * s); g.fill();

    // 肚皮
    g.fillColor = shade(tint, 1.4);
    g.ellipse(0, -7 * s, 11 * s, 8 * s); g.fill();

    // 前臂
    g.fillColor = shade(tint, 0.85);
    g.ellipse(-14 * s, -8 * s, 5 * s, 4 * s); g.fill();
    g.ellipse(14 * s, -8 * s, 5 * s, 4 * s); g.fill();

    // 头（略抬）
    g.fillColor = new Color(tint.r, tint.g, tint.b, 255);
    g.ellipse(0, 6 * s, 16 * s, 12 * s); g.fill();

    // 鼓眼（头顶两侧）
    g.fillColor = shade(tint, 0.95);
    g.circle(-9 * s, 16 * s, 6 * s); g.fill();
    g.circle(9 * s, 16 * s, 6 * s); g.fill();
    g.fillColor = new Color(255, 250, 210, 255);
    g.circle(-9 * s, 16.5 * s, 4.5 * s); g.fill();
    g.circle(9 * s, 16.5 * s, 4.5 * s); g.fill();
    g.fillColor = new Color(30, 50, 20, 255);
    g.circle(-8 * s, 16 * s, 2.4 * s); g.fill();
    g.circle(10 * s, 16 * s, 2.4 * s); g.fill();
    g.fillColor = new Color(255, 255, 255, 220);
    g.circle(-9 * s, 17.2 * s, 0.9 * s); g.fill();
    g.circle(9 * s, 17.2 * s, 0.9 * s); g.fill();

    // 宽嘴
    g.fillColor = shade(tint, 0.35);
    g.ellipse(0, 2 * s, 10 * s, 3.5 * s); g.fill();
    g.fillColor = new Color(180, 60, 70, 200);
    g.ellipse(0, 1.5 * s, 7 * s, 2 * s); g.fill();

    // 背斑
    g.fillColor = shade(tint, 0.45);
    g.circle(-7 * s, -2 * s, 3.2 * s); g.fill();
    g.circle(8 * s, -5 * s, 2.6 * s); g.fill();
    g.circle(2 * s, 8 * s, 2.2 * s); g.fill();

    // 顶高光
    g.fillColor = new Color(255, 255, 255, 90);
    g.ellipse(-4 * s, 10 * s, 5 * s, 2.5 * s); g.fill();
}

/** 疾行者：元气骑士式影犬——圆胖躯干、大耳、蹬腿残影、大眼亮瞳 */
function drawFast(g: Graphics, tint: Color, s: number) {
    g.fillColor = new Color(0, 0, 0, 50);
    g.ellipse(2 * s, -18 * s, 20 * s, 5 * s); g.fill();

    // 速度残影（淡）
    g.fillColor = new Color(tint.r, tint.g, tint.b, 55);
    g.ellipse(-18 * s, -4 * s, 12 * s, 7 * s); g.fill();
    g.fillColor = new Color(tint.r, tint.g, tint.b, 100);
    g.ellipse(-10 * s, -3 * s, 12 * s, 8 * s); g.fill();

    // 尾巴
    g.fillColor = shade(tint, 0.65);
    g.ellipse(-20 * s, 2 * s, 8 * s, 5 * s); g.fill();

    // 后腿蹬地
    g.fillColor = shade(tint, 0.55);
    g.ellipse(-8 * s, -12 * s, 6 * s, 8 * s); g.fill();
    g.ellipse(4 * s, -14 * s, 5 * s, 7 * s); g.fill();
    // 前腿
    g.ellipse(12 * s, -12 * s, 5 * s, 7 * s); g.fill();
    g.ellipse(18 * s, -10 * s, 4.5 * s, 6 * s); g.fill();

    // 身体（圆胖）
    g.fillColor = shade(tint, 0.75);
    g.ellipse(2 * s, -2 * s, 18 * s, 12 * s); g.fill();
    g.fillColor = new Color(tint.r, tint.g, tint.b, 255);
    g.ellipse(4 * s, 0, 16 * s, 11 * s); g.fill();
    g.fillColor = shade(tint, 1.35);
    g.ellipse(4 * s, -4 * s, 9 * s, 6 * s); g.fill();

    // 头
    g.fillColor = new Color(tint.r, tint.g, tint.b, 255);
    g.ellipse(16 * s, 6 * s, 11 * s, 10 * s); g.fill();
    // 大耳
    g.fillColor = shade(tint, 0.7);
    g.ellipse(10 * s, 16 * s, 4 * s, 7 * s); g.fill();
    g.ellipse(20 * s, 16 * s, 4 * s, 7 * s); g.fill();
    g.fillColor = shade(tint, 1.2);
    g.ellipse(10 * s, 15 * s, 2 * s, 4 * s); g.fill();
    g.ellipse(20 * s, 15 * s, 2 * s, 4 * s); g.fill();

    // 口鼻
    g.fillColor = shade(tint, 1.15);
    g.ellipse(24 * s, 4 * s, 5 * s, 4 * s); g.fill();
    g.fillColor = shade(tint, 0.4);
    g.ellipse(26 * s, 3 * s, 2 * s, 1.5 * s); g.fill();

    // 大眼
    g.fillColor = new Color(255, 255, 255, 255);
    g.ellipse(14 * s, 8 * s, 4.5 * s, 5 * s); g.fill();
    g.ellipse(22 * s, 8 * s, 4.5 * s, 5 * s); g.fill();
    g.fillColor = new Color(255, 220, 80, 255);
    g.circle(15 * s, 7.5 * s, 2.2 * s); g.fill();
    g.circle(23 * s, 7.5 * s, 2.2 * s); g.fill();
    g.fillColor = new Color(30, 20, 10, 255);
    g.circle(15.5 * s, 7 * s, 1.2 * s); g.fill();
    g.circle(23.5 * s, 7 * s, 1.2 * s); g.fill();
    g.fillColor = new Color(255, 255, 255, 220);
    g.circle(14.5 * s, 9 * s, 0.9 * s); g.fill();
    g.circle(22.5 * s, 9 * s, 0.9 * s); g.fill();
}

function drawTank(g: Graphics, tint: Color, s: number) {
    g.fillColor = shade(tint, 0.7);
    g.roundRect(-20 * s, -18 * s, 40 * s, 36 * s, 6 * s); g.fill();
    g.fillColor = new Color(tint.r, tint.g, tint.b, 255);
    g.roundRect(-14 * s, -12 * s, 28 * s, 22 * s, 4 * s); g.fill();
    g.fillColor = new Color(220, 180, 70, 255);
    g.moveTo(-16 * s, 16 * s); g.lineTo(-8 * s, 30 * s); g.lineTo(0, 16 * s); g.close(); g.fill();
    g.moveTo(16 * s, 16 * s); g.lineTo(8 * s, 30 * s); g.lineTo(0, 16 * s); g.close(); g.fill();
    g.fillColor = new Color(40, 20, 20, 255);
    g.rect(-16 * s, -2 * s, 32 * s, 4 * s); g.fill();
    g.fillColor = new Color(255, 220, 180, 255);
    g.circle(-6 * s, 4 * s, 3 * s); g.fill();
    g.circle(6 * s, 4 * s, 3 * s); g.fill();
}

function drawArcher(g: Graphics, tint: Color, s: number) {
    g.fillColor = new Color(tint.r, tint.g, tint.b, 255);
    g.moveTo(0, 24 * s);
    g.lineTo(16 * s, 4 * s);
    g.lineTo(14 * s, -22 * s);
    g.lineTo(-14 * s, -22 * s);
    g.lineTo(-16 * s, 4 * s);
    g.close(); g.fill();
    g.fillColor = shade(tint, 0.65);
    g.moveTo(0, 26 * s);
    g.lineTo(10 * s, 8 * s);
    g.lineTo(-10 * s, 8 * s);
    g.close(); g.fill();
    g.fillColor = new Color(255, 230, 190, 255);
    g.circle(-4 * s, 6 * s, 2 * s); g.fill();
    g.circle(4 * s, 6 * s, 2 * s); g.fill();
    g.strokeColor = new Color(110, 70, 30, 255);
    g.lineWidth = 3;
    g.arc(16 * s, -2 * s, 16 * s, -1.1, 1.1, false); g.stroke();
    g.strokeColor = new Color(230, 220, 180, 255);
    g.moveTo(16 * s, -16 * s); g.lineTo(16 * s, 12 * s); g.stroke();
}

/** 幽魂：一团鬼火——外焰 / 内焰 / 骷髅面孔，火舌向上翻卷，下端拖尾 */
function drawWisp(g: Graphics, tint: Color, s: number) {
    g.fillColor = new Color(tint.r, tint.g, tint.b, 55);
    g.circle(0, 2 * s, 24 * s); g.fill();
    // 外焰
    g.fillColor = new Color(tint.r, tint.g, tint.b, 190);
    g.moveTo(0, -22 * s);
    g.bezierCurveTo(-14 * s, -14 * s, -20 * s, 4 * s, -12 * s, 12 * s);
    g.lineTo(-8 * s, 6 * s); g.lineTo(-6 * s, 18 * s); g.lineTo(-2 * s, 10 * s);
    g.lineTo(0, 24 * s); g.lineTo(3 * s, 10 * s); g.lineTo(7 * s, 19 * s); g.lineTo(8 * s, 6 * s);
    g.lineTo(12 * s, 12 * s);
    g.bezierCurveTo(20 * s, 4 * s, 14 * s, -14 * s, 0, -22 * s);
    g.close(); g.fill();
    // 内焰
    g.fillColor = shade(tint, 1.4);
    g.moveTo(0, -14 * s);
    g.bezierCurveTo(-8 * s, -8 * s, -10 * s, 4 * s, -4 * s, 10 * s);
    g.lineTo(0, 14 * s); g.lineTo(4 * s, 10 * s);
    g.bezierCurveTo(10 * s, 4 * s, 8 * s, -8 * s, 0, -14 * s);
    g.close(); g.fill();
    // 骷髅面：黑眼窝 + 嘴
    g.fillColor = new Color(20, 24, 40, 255);
    g.ellipse(-4 * s, 2 * s, 3 * s, 3.5 * s); g.fill();
    g.ellipse(4 * s, 2 * s, 3 * s, 3.5 * s); g.fill();
    g.ellipse(0, -6 * s, 3.5 * s, 1.6 * s); g.fill();
    g.fillColor = new Color(255, 255, 255, 220);
    g.circle(-4 * s, 3 * s, 1 * s); g.fill();
    g.circle(4 * s, 3 * s, 1 * s); g.fill();
}

/** 蝙蝠：翼展剪影，与幽魂圆球区分 */
function drawBat(g: Graphics, tint: Color, s: number) {
    g.fillColor = shade(tint, 0.55);
    g.moveTo(0, 4 * s);
    g.lineTo(-32 * s, 18 * s); g.lineTo(-28 * s, 2 * s); g.lineTo(-18 * s, 10 * s);
    g.lineTo(-8 * s, -2 * s); g.close(); g.fill();
    g.moveTo(0, 4 * s);
    g.lineTo(32 * s, 18 * s); g.lineTo(28 * s, 2 * s); g.lineTo(18 * s, 10 * s);
    g.lineTo(8 * s, -2 * s); g.close(); g.fill();
    g.fillColor = new Color(tint.r, tint.g, tint.b, 255);
    g.ellipse(0, 2 * s, 10 * s, 12 * s); g.fill();
    g.fillColor = new Color(255, 220, 180, 255);
    g.circle(-3 * s, 4 * s, 2.2 * s); g.fill();
    g.circle(4 * s, 4 * s, 2.2 * s); g.fill();
    g.fillColor = new Color(20, 10, 30, 255);
    g.circle(-3 * s, 4 * s, 1 * s); g.fill();
    g.circle(4 * s, 4 * s, 1 * s); g.fill();
    g.fillColor = shade(tint, 0.7);
    g.moveTo(-4 * s, -8 * s); g.lineTo(0, -16 * s); g.lineTo(4 * s, -8 * s); g.close(); g.fill();
    g.strokeColor = new Color(255, 255, 255, 100);
    g.lineWidth = 1.5;
    g.moveTo(-26 * s, 10 * s); g.lineTo(-12 * s, 4 * s); g.stroke();
    g.moveTo(26 * s, 10 * s); g.lineTo(12 * s, 4 * s); g.stroke();
}

/** 甲虫：贴地甲壳 + 短足，与史莱姆区分 */
function drawBeetle(g: Graphics, tint: Color, s: number) {
    g.fillColor = shade(tint, 0.5);
    g.ellipse(0, -6 * s, 26 * s, 14 * s); g.fill();
    g.fillColor = new Color(tint.r, tint.g, tint.b, 255);
    g.ellipse(0, -2 * s, 22 * s, 12 * s); g.fill();
    g.fillColor = shade(tint, 1.15);
    g.ellipse(-2 * s, 2 * s, 10 * s, 7 * s); g.fill();
    // 甲缝
    g.strokeColor = shade(tint, 0.35);
    g.lineWidth = 2;
    g.moveTo(0, 8 * s); g.lineTo(0, -14 * s); g.stroke();
    g.fillColor = new Color(255, 230, 120, 255);
    g.circle(-6 * s, 4 * s, 2.5 * s); g.fill();
    g.circle(6 * s, 4 * s, 2.5 * s); g.fill();
    g.fillColor = new Color(20, 20, 10, 255);
    g.circle(-6 * s, 4 * s, 1.2 * s); g.fill();
    g.circle(6 * s, 4 * s, 1.2 * s); g.fill();
    // 六足
    g.strokeColor = shade(tint, 0.4);
    g.lineWidth = 2.5;
    for (const side of [-1, 1]) {
        g.moveTo(side * 16 * s, -4 * s); g.lineTo(side * 24 * s, -14 * s); g.stroke();
        g.moveTo(side * 12 * s, -8 * s); g.lineTo(side * 20 * s, -18 * s); g.stroke();
        g.moveTo(side * 8 * s, -10 * s); g.lineTo(side * 14 * s, -20 * s); g.stroke();
    }
}

/** 晶爬：棱角晶体躯干，与坦克圆盾区分 */
function drawCrystal(g: Graphics, tint: Color, s: number) {
    g.fillColor = shade(tint, 0.5);
    g.moveTo(0, 26 * s); g.lineTo(18 * s, 8 * s); g.lineTo(14 * s, -18 * s);
    g.lineTo(-14 * s, -18 * s); g.lineTo(-18 * s, 8 * s); g.close(); g.fill();
    g.fillColor = new Color(tint.r, tint.g, tint.b, 255);
    g.moveTo(0, 18 * s); g.lineTo(12 * s, 4 * s); g.lineTo(8 * s, -12 * s);
    g.lineTo(-8 * s, -12 * s); g.lineTo(-12 * s, 4 * s); g.close(); g.fill();
    g.fillColor = shade(tint, 1.35);
    g.moveTo(-2 * s, 10 * s); g.lineTo(6 * s, 2 * s); g.lineTo(2 * s, -4 * s);
    g.lineTo(-6 * s, 2 * s); g.close(); g.fill();
    g.fillColor = new Color(255, 255, 255, 200);
    g.circle(-4 * s, 6 * s, 2 * s); g.fill();
    g.circle(5 * s, 4 * s, 1.5 * s); g.fill();
    // 短晶足
    g.strokeColor = shade(tint, 0.75);
    g.lineWidth = 3;
    g.moveTo(-10 * s, -12 * s); g.lineTo(-16 * s, -22 * s); g.stroke();
    g.moveTo(10 * s, -12 * s); g.lineTo(16 * s, -22 * s); g.stroke();
    g.moveTo(0, -14 * s); g.lineTo(0, -24 * s); g.stroke();
}

/** 石偶：块状石身 + 符文眼，与坦克肩甲区分 */
function drawGolem(g: Graphics, tint: Color, s: number) {
    g.fillColor = shade(tint, 0.55);
    g.roundRect(-22 * s, -20 * s, 44 * s, 40 * s, 4 * s); g.fill();
    g.fillColor = new Color(tint.r, tint.g, tint.b, 255);
    g.roundRect(-16 * s, -14 * s, 32 * s, 28 * s, 3 * s); g.fill();
    // 石缝
    g.strokeColor = shade(tint, 0.35);
    g.lineWidth = 2;
    g.moveTo(-8 * s, 10 * s); g.lineTo(-4 * s, -12 * s); g.stroke();
    g.moveTo(6 * s, 12 * s); g.lineTo(10 * s, -10 * s); g.stroke();
    g.fillColor = new Color(120, 220, 255, 255);
    g.circle(-6 * s, 6 * s, 3.5 * s); g.fill();
    g.circle(8 * s, 6 * s, 3.5 * s); g.fill();
    g.fillColor = new Color(20, 40, 60, 255);
    g.circle(-6 * s, 6 * s, 1.5 * s); g.fill();
    g.circle(8 * s, 6 * s, 1.5 * s); g.fill();
    // 石臂
    g.fillColor = shade(tint, 0.7);
    g.roundRect(-28 * s, -6 * s, 10 * s, 18 * s, 3 * s); g.fill();
    g.roundRect(18 * s, -6 * s, 10 * s, 18 * s, 3 * s); g.fill();
}

/** 飞蛾：宽翅慢扑，与蝙蝠尖翼区分 */
function drawMoth(g: Graphics, tint: Color, s: number) {
    g.fillColor = shade(tint, 0.6);
    g.ellipse(-16 * s, 4 * s, 18 * s, 12 * s); g.fill();
    g.ellipse(16 * s, 4 * s, 18 * s, 12 * s); g.fill();
    g.fillColor = new Color(tint.r, tint.g, tint.b, 220);
    g.ellipse(-14 * s, 6 * s, 10 * s, 7 * s); g.fill();
    g.ellipse(14 * s, 6 * s, 10 * s, 7 * s); g.fill();
    g.fillColor = new Color(tint.r, tint.g, tint.b, 255);
    g.ellipse(0, 0, 8 * s, 14 * s); g.fill();
    g.fillColor = new Color(255, 240, 180, 255);
    g.circle(-2 * s, 6 * s, 2 * s); g.fill();
    g.circle(3 * s, 6 * s, 2 * s); g.fill();
    g.fillColor = new Color(40, 20, 10, 255);
    g.circle(-2 * s, 6 * s, 0.9 * s); g.fill();
    g.circle(3 * s, 6 * s, 0.9 * s); g.fill();
    // 触角
    g.strokeColor = shade(tint, 0.4);
    g.lineWidth = 1.5;
    g.moveTo(-2 * s, 12 * s); g.lineTo(-8 * s, 20 * s); g.stroke();
    g.moveTo(2 * s, 12 * s); g.lineTo(8 * s, 20 * s); g.stroke();
}

/** 渡鸦：宽翼尖喙，比蝙蝠更沉 */
function drawRaven(g: Graphics, tint: Color, s: number) {
    g.fillColor = shade(tint, 0.45);
    g.moveTo(-6 * s, 4 * s); g.lineTo(-36 * s, 14 * s); g.lineTo(-28 * s, -6 * s); g.lineTo(-8 * s, -2 * s);
    g.close(); g.fill();
    g.moveTo(6 * s, 4 * s); g.lineTo(36 * s, 14 * s); g.lineTo(28 * s, -6 * s); g.lineTo(8 * s, -2 * s);
    g.close(); g.fill();
    g.fillColor = new Color(tint.r, tint.g, tint.b, 255);
    g.ellipse(0, 0, 12 * s, 10 * s); g.fill();
    g.fillColor = shade(tint, 1.15);
    g.ellipse(10 * s, 2 * s, 8 * s, 6 * s); g.fill();
    // 尖喙
    g.fillColor = new Color(40, 35, 30, 255);
    g.moveTo(16 * s, 2 * s); g.lineTo(28 * s, 0); g.lineTo(16 * s, -2 * s);
    g.close(); g.fill();
    g.fillColor = new Color(220, 200, 80, 255);
    g.circle(8 * s, 4 * s, 2.2 * s); g.fill();
    g.fillColor = new Color(20, 10, 10, 255);
    g.circle(8.5 * s, 4 * s, 1 * s); g.fill();
    // 尾羽
    g.fillColor = shade(tint, 0.55);
    g.moveTo(-10 * s, -2 * s); g.lineTo(-22 * s, -10 * s); g.lineTo(-8 * s, -8 * s);
    g.close(); g.fill();
}

/** 蚊蚋：胖肚细喙、大翅、大眼——告别火柴人 */
function drawMosquito(g: Graphics, tint: Color, s: number) {
    g.fillColor = new Color(0, 0, 0, 40);
    g.ellipse(0, -16 * s, 12 * s, 4 * s); g.fill();

    // 翅（半透明大片）
    g.fillColor = new Color(220, 245, 220, 130);
    g.ellipse(-14 * s, 8 * s, 14 * s, 7 * s); g.fill();
    g.ellipse(14 * s, 8 * s, 14 * s, 7 * s); g.fill();
    g.strokeColor = new Color(255, 255, 255, 100);
    g.lineWidth = 1.2 * s;
    g.moveTo(-4 * s, 6 * s); g.lineTo(-22 * s, 10 * s); g.stroke();
    g.moveTo(4 * s, 6 * s); g.lineTo(22 * s, 10 * s); g.stroke();

    // 肚（圆胖）
    g.fillColor = shade(tint, 0.75);
    g.ellipse(0, -4 * s, 9 * s, 12 * s); g.fill();
    g.fillColor = new Color(tint.r, tint.g, tint.b, 255);
    g.ellipse(0, -2 * s, 8 * s, 11 * s); g.fill();
    g.fillColor = shade(tint, 1.3);
    g.ellipse(0, -6 * s, 5 * s, 6 * s); g.fill();

    // 头
    g.fillColor = shade(tint, 0.9);
    g.circle(0, 10 * s, 7 * s); g.fill();
    // 触角
    g.strokeColor = shade(tint, 0.45);
    g.lineWidth = 1.5 * s;
    g.moveTo(-2 * s, 15 * s); g.lineTo(-8 * s, 22 * s); g.stroke();
    g.moveTo(2 * s, 15 * s); g.lineTo(8 * s, 22 * s); g.stroke();
    // 喙
    g.fillColor = shade(tint, 0.4);
    g.moveTo(-1.5 * s, 14 * s); g.lineTo(0, 24 * s); g.lineTo(1.5 * s, 14 * s); g.close(); g.fill();

    // 大眼
    g.fillColor = new Color(255, 255, 200, 255);
    g.ellipse(-3.5 * s, 10 * s, 3.5 * s, 4 * s); g.fill();
    g.ellipse(3.5 * s, 10 * s, 3.5 * s, 4 * s); g.fill();
    g.fillColor = new Color(40, 50, 20, 255);
    g.circle(-3 * s, 9.5 * s, 1.6 * s); g.fill();
    g.circle(4 * s, 9.5 * s, 1.6 * s); g.fill();
    g.fillColor = new Color(255, 255, 255, 220);
    g.circle(-3.8 * s, 11 * s, 0.8 * s); g.fill();
    g.circle(3.2 * s, 11 * s, 0.8 * s); g.fill();

    // 细腿
    g.strokeColor = shade(tint, 0.5);
    g.lineWidth = 1.4 * s;
    for (const side of [-1, 1]) {
        g.moveTo(side * 4 * s, -8 * s); g.lineTo(side * 12 * s, -18 * s); g.stroke();
        g.moveTo(side * 2 * s, -10 * s); g.lineTo(side * 8 * s, -20 * s); g.stroke();
    }
}

function drawDragon(g: Graphics, tint: Color, s: number) {
    // 翼
    g.fillColor = shade(tint, 0.55);
    g.moveTo(-8 * s, 6 * s); g.lineTo(-40 * s, 18 * s); g.lineTo(-34 * s, -8 * s); g.lineTo(-10 * s, -2 * s);
    g.close(); g.fill();
    g.moveTo(8 * s, 6 * s); g.lineTo(40 * s, 18 * s); g.lineTo(34 * s, -8 * s); g.lineTo(10 * s, -2 * s);
    g.close(); g.fill();
    g.fillColor = new Color(255, 160, 60, 120);
    g.moveTo(-12 * s, 4 * s); g.lineTo(-30 * s, 12 * s); g.lineTo(-26 * s, -2 * s); g.close(); g.fill();
    g.moveTo(12 * s, 4 * s); g.lineTo(30 * s, 12 * s); g.lineTo(26 * s, -2 * s); g.close(); g.fill();
    // 躯干
    g.fillColor = new Color(tint.r, tint.g, tint.b, 255);
    g.ellipse(0, -2 * s, 20 * s, 16 * s); g.fill();
    g.fillColor = shade(tint, 1.2);
    g.ellipse(0, 2 * s, 12 * s, 8 * s); g.fill();
    // 头 + 角
    g.fillColor = shade(tint, 0.85);
    g.ellipse(18 * s, 8 * s, 12 * s, 10 * s); g.fill();
    g.fillColor = new Color(240, 200, 80, 255);
    g.moveTo(14 * s, 16 * s); g.lineTo(10 * s, 28 * s); g.lineTo(18 * s, 18 * s); g.close(); g.fill();
    g.moveTo(22 * s, 16 * s); g.lineTo(28 * s, 28 * s); g.lineTo(24 * s, 16 * s); g.close(); g.fill();
    // 眼火
    g.fillColor = new Color(255, 240, 120, 255);
    g.circle(22 * s, 10 * s, 2.5 * s); g.fill();
    g.fillColor = new Color(40, 10, 10, 255);
    g.circle(22.5 * s, 10 * s, 1.1 * s); g.fill();
    // 尾
    g.fillColor = shade(tint, 0.7);
    g.moveTo(-16 * s, -6 * s); g.lineTo(-36 * s, -14 * s); g.lineTo(-20 * s, 2 * s); g.close(); g.fill();
    // 爪
    g.fillColor = shade(tint, 0.45);
    g.roundRect(-14 * s, -20 * s, 8 * s, 8 * s, 2 * s); g.fill();
    g.roundRect(4 * s, -20 * s, 8 * s, 8 * s, 2 * s); g.fill();
}

function drawMage(g: Graphics, tint: Color, s: number) {
    g.fillColor = shade(tint, 0.55);
    g.moveTo(-18 * s, -18 * s); g.lineTo(18 * s, -18 * s); g.lineTo(10 * s, 8 * s); g.lineTo(-10 * s, 8 * s);
    g.close(); g.fill();
    g.fillColor = new Color(tint.r, tint.g, tint.b, 255);
    g.circle(0, 10 * s, 12 * s); g.fill();
    g.fillColor = new Color(255, 230, 200, 255);
    g.circle(-4 * s, 12 * s, 2.5 * s); g.fill();
    g.circle(5 * s, 12 * s, 2.5 * s); g.fill();
    g.fillColor = shade(tint, 0.8);
    g.moveTo(-14 * s, 18 * s); g.lineTo(0, 34 * s); g.lineTo(14 * s, 18 * s); g.close(); g.fill();
    g.strokeColor = new Color(220, 180, 255, 255);
    g.lineWidth = 3;
    g.moveTo(14 * s, -4 * s); g.lineTo(26 * s, 10 * s); g.stroke();
    g.fillColor = new Color(200, 120, 255, 255);
    g.circle(26 * s, 12 * s, 5 * s); g.fill();
}

/** 幽灵：半透裹尸布——圆颅、下摆撕成飘带、空洞眼窝与张开的嘴、两只伸出的鬼手 */
function drawSpecter(g: Graphics, tint: Color, s: number) {
    g.fillColor = new Color(tint.r, tint.g, tint.b, 70);
    g.circle(0, 0, 24 * s); g.fill();
    // 身：圆颅 + 飘带下摆
    g.fillColor = new Color(tint.r, tint.g, tint.b, 175);
    g.moveTo(-14 * s, 8 * s);
    g.bezierCurveTo(-14 * s, 26 * s, 14 * s, 26 * s, 14 * s, 8 * s);
    g.lineTo(15 * s, -10 * s); g.lineTo(10 * s, -22 * s); g.lineTo(6 * s, -12 * s);
    g.lineTo(2 * s, -26 * s); g.lineTo(-3 * s, -13 * s); g.lineTo(-8 * s, -24 * s); g.lineTo(-11 * s, -10 * s);
    g.lineTo(-15 * s, -8 * s);
    g.close(); g.fill();
    g.fillColor = new Color(255, 255, 255, 45);
    g.ellipse(-4 * s, 12 * s, 6 * s, 8 * s); g.fill();
    // 鬼手
    g.fillColor = new Color(tint.r, tint.g, tint.b, 190);
    g.ellipse(-20 * s, -2 * s, 5 * s, 3.5 * s); g.fill();
    g.ellipse(20 * s, -2 * s, 5 * s, 3.5 * s); g.fill();
    g.strokeColor = new Color(tint.r, tint.g, tint.b, 220);
    g.lineWidth = 1.5 * s;
    for (const side of [-1, 1]) {
        for (const dy of [-2, 0, 2]) { g.moveTo(side * 22 * s, dy * s); g.lineTo(side * 28 * s, (dy * 1.5 - 1) * s); g.stroke(); }
    }
    // 空洞眼 + 嘴
    g.fillColor = new Color(10, 12, 24, 255);
    g.ellipse(-5 * s, 10 * s, 3.4 * s, 4.5 * s); g.fill();
    g.ellipse(5 * s, 10 * s, 3.4 * s, 4.5 * s); g.fill();
    g.ellipse(0, 0, 3 * s, 4.5 * s); g.fill();
    g.fillColor = shade(tint, 1.6);
    g.circle(-5 * s, 9 * s, 1.2 * s); g.fill();
    g.circle(5 * s, 9 * s, 1.2 * s); g.fill();
}

function drawBone(g: Graphics, tint: Color, s: number) {
    g.fillColor = shade(tint, 0.75);
    g.roundRect(-10 * s, -18 * s, 20 * s, 28 * s, 3 * s); g.fill();
    g.fillColor = new Color(tint.r, tint.g, tint.b, 255);
    g.circle(0, 12 * s, 11 * s); g.fill();
    g.fillColor = new Color(30, 25, 20, 255);
    g.circle(-4 * s, 13 * s, 2.5 * s); g.fill();
    g.circle(5 * s, 13 * s, 2.5 * s); g.fill();
    g.roundRect(-5 * s, 6 * s, 10 * s, 3 * s, 1 * s); g.fill();
    g.fillColor = shade(tint, 0.9);
    g.rect(-16 * s, -4 * s, 8 * s, 4 * s); g.fill();
    g.rect(8 * s, -4 * s, 8 * s, 4 * s); g.fill();
    g.roundRect(-12 * s, -26 * s, 8 * s, 10 * s, 2 * s); g.fill();
    g.roundRect(4 * s, -26 * s, 8 * s, 10 * s, 2 * s); g.fill();
}

function drawBoss(g: Graphics, tint: Color, s: number) {
    // 盾形躯干 + 肩甲 + 王冠，不再是圆角大方块
    g.fillColor = shade(tint, 0.55);
    g.moveTo(-28 * s, 8 * s); g.lineTo(-32 * s, -8 * s); g.lineTo(-18 * s, -28 * s);
    g.lineTo(18 * s, -28 * s); g.lineTo(32 * s, -8 * s); g.lineTo(28 * s, 8 * s);
    g.lineTo(16 * s, 22 * s); g.lineTo(-16 * s, 22 * s); g.close(); g.fill();
    g.fillColor = new Color(tint.r, tint.g, tint.b, 255);
    g.moveTo(-20 * s, 4 * s); g.lineTo(-22 * s, -10 * s); g.lineTo(-12 * s, -22 * s);
    g.lineTo(12 * s, -22 * s); g.lineTo(22 * s, -10 * s); g.lineTo(20 * s, 4 * s);
    g.lineTo(10 * s, 14 * s); g.lineTo(-10 * s, 14 * s); g.close(); g.fill();
    g.fillColor = new Color(255, 210, 70, 255);
    g.moveTo(-16 * s, 20 * s); g.lineTo(-10 * s, 34 * s); g.lineTo(-4 * s, 22 * s);
    g.lineTo(0, 36 * s); g.lineTo(4 * s, 22 * s); g.lineTo(10 * s, 34 * s); g.lineTo(16 * s, 20 * s);
    g.close(); g.fill();
    g.fillColor = new Color(255, 255, 255, 230);
    g.circle(-8 * s, 2 * s, 5 * s); g.fill();
    g.circle(8 * s, 2 * s, 5 * s); g.fill();
    g.fillColor = new Color(20, 0, 30, 255);
    g.circle(-7 * s, 1 * s, 2.5 * s); g.fill();
    g.circle(9 * s, 1 * s, 2.5 * s); g.fill();
}

/** 蜘蛛：圆腹 + 八腿关节 + 螯牙 + 多眼 */
function drawSpider(g: Graphics, tint: Color, s: number) {
    g.fillColor = new Color(0, 0, 0, 50);
    g.ellipse(0, -18 * s, 16 * s, 5 * s); g.fill();
    // 八腿（折线）
    g.strokeColor = shade(tint, 0.55);
    g.lineWidth = 2.2 * s;
    const legs: [number, number, number, number, number, number][] = [
        [-8, -2, -22, 6, -28, -8], [8, -2, 22, 6, 28, -8],
        [-10, 2, -24, 10, -30, 0], [10, 2, 24, 10, 30, 0],
        [-6, 6, -18, 14, -22, 4], [6, 6, 18, 14, 22, 4],
        [-4, -6, -16, -2, -24, -14], [4, -6, 16, -2, 24, -14],
    ];
    for (const L of legs) {
        g.moveTo(L[0] * s, L[1] * s); g.lineTo(L[2] * s, L[3] * s); g.lineTo(L[4] * s, L[5] * s); g.stroke();
    }
    // 腹
    g.fillColor = shade(tint, 0.7);
    g.ellipse(-2 * s, -2 * s, 14 * s, 11 * s); g.fill();
    g.fillColor = new Color(tint.r, tint.g, tint.b, 255);
    g.ellipse(6 * s, 2 * s, 10 * s, 9 * s); g.fill();
    // 斑纹
    g.fillColor = shade(tint, 0.45);
    g.ellipse(4 * s, 4 * s, 4 * s, 3 * s); g.fill();
    g.ellipse(8 * s, -2 * s, 3 * s, 2.5 * s); g.fill();
    // 头 + 螯
    g.fillColor = shade(tint, 0.85);
    g.ellipse(14 * s, 2 * s, 6 * s, 5 * s); g.fill();
    g.fillColor = shade(tint, 0.5);
    g.moveTo(18 * s, 0); g.lineTo(24 * s, -4 * s); g.lineTo(20 * s, 2 * s); g.close(); g.fill();
    g.moveTo(18 * s, 4 * s); g.lineTo(24 * s, 8 * s); g.lineTo(20 * s, 4 * s); g.close(); g.fill();
    // 多眼红光
    g.fillColor = new Color(255, 60, 40, 255);
    for (const [x, y] of [[12, 5], [15, 6], [12, -1], [15, 0]] as const) {
        g.circle(x * s, y * s, 1.3 * s); g.fill();
    }
}

/** 毒蛇：分段蜿蜒 + 鳞 + 叉舌 */
function drawSnake(g: Graphics, tint: Color, s: number) {
    g.fillColor = new Color(0, 0, 0, 45);
    g.ellipse(-4 * s, -16 * s, 18 * s, 5 * s); g.fill();
    const segs = [
        [-18, -4, 7], [-10, 2, 8], [-2, -2, 8.5], [6, 4, 8], [14, 0, 7.5],
    ] as const;
    for (let i = 0; i < segs.length; i++) {
        const [x, y, r] = segs[i];
        g.fillColor = shade(tint, i % 2 === 0 ? 0.85 : 1.05);
        g.ellipse(x * s, y * s, r * s, (r * 0.72) * s); g.fill();
        g.fillColor = shade(tint, 0.55);
        g.ellipse(x * s, (y + 2) * s, (r * 0.35) * s, 1.5 * s); g.fill();
    }
    // 头
    g.fillColor = shade(tint, 1.15);
    g.ellipse(22 * s, 2 * s, 8 * s, 6.5 * s); g.fill();
    g.fillColor = new Color(255, 240, 80, 255);
    g.ellipse(24 * s, 4 * s, 2.2 * s, 1.6 * s); g.fill();
    g.fillColor = new Color(20, 30, 10, 255);
    g.circle(24.5 * s, 4 * s, 0.9 * s); g.fill();
    // 叉舌
    g.strokeColor = new Color(220, 50, 50, 255);
    g.lineWidth = 1.4 * s;
    g.moveTo(28 * s, 1 * s); g.lineTo(34 * s, 0); g.stroke();
    g.moveTo(34 * s, 0); g.lineTo(36 * s, 3 * s); g.stroke();
    g.moveTo(34 * s, 0); g.lineTo(36 * s, -3 * s); g.stroke();
}

/** 蘑菇怪：圆柄笑脸 + 斑点大菌盖 */
function drawShroom(g: Graphics, tint: Color, s: number) {
    g.fillColor = new Color(0, 0, 0, 50);
    g.ellipse(0, -18 * s, 14 * s, 5 * s); g.fill();

    g.fillColor = shade(tint, 1.35);
    g.roundRect(-8 * s, -16 * s, 16 * s, 24 * s, 7 * s); g.fill();
    g.fillColor = shade(tint, 1.5);
    g.ellipse(0, -6 * s, 7 * s, 8 * s); g.fill();

    g.fillColor = shade(tint, 0.65);
    g.ellipse(0, 10 * s, 24 * s, 14 * s); g.fill();
    g.fillColor = new Color(tint.r, tint.g, tint.b, 255);
    g.ellipse(0, 14 * s, 22 * s, 11 * s); g.fill();
    g.fillColor = new Color(255, 248, 230, 230);
    g.circle(-9 * s, 14 * s, 4 * s); g.fill();
    g.circle(7 * s, 18 * s, 3.2 * s); g.fill();
    g.circle(11 * s, 10 * s, 2.6 * s); g.fill();
    g.circle(-2 * s, 8 * s, 2.4 * s); g.fill();
    g.fillColor = new Color(255, 255, 255, 100);
    g.ellipse(-4 * s, 18 * s, 8 * s, 3 * s); g.fill();

    g.fillColor = new Color(255, 255, 255, 255);
    g.ellipse(-4.5 * s, -2 * s, 4 * s, 4.5 * s); g.fill();
    g.ellipse(4.5 * s, -2 * s, 4 * s, 4.5 * s); g.fill();
    g.fillColor = new Color(40, 28, 20, 255);
    g.circle(-3.8 * s, -2.5 * s, 2 * s); g.fill();
    g.circle(5.2 * s, -2.5 * s, 2 * s); g.fill();
    g.fillColor = new Color(255, 255, 255, 220);
    g.circle(-4.8 * s, -1 * s, 0.9 * s); g.fill();
    g.circle(4.2 * s, -1 * s, 0.9 * s); g.fill();
    g.strokeColor = shade(tint, 0.45);
    g.lineWidth = 1.8 * s;
    g.moveTo(-4 * s, -9 * s);
    g.bezierCurveTo(-1 * s, -12 * s, 1 * s, -12 * s, 4 * s, -9 * s);
    g.stroke();
}

/** 齿轮怪：咬合黄铜齿轮 + 中心笑脸 */
function drawCog(g: Graphics, tint: Color, s: number) {
    g.fillColor = new Color(0, 0, 0, 50);
    g.ellipse(0, -18 * s, 18 * s, 5 * s); g.fill();

    const R = 15 * s;
    g.fillColor = shade(tint, 0.55);
    for (let i = 0; i < 8; i++) {
        const a0 = (i / 8) * Math.PI * 2 - 0.12;
        const a1 = ((i + 0.45) / 8) * Math.PI * 2;
        const a2 = ((i + 1) / 8) * Math.PI * 2 - 0.12;
        if (i === 0) g.moveTo(Math.cos(a0) * R, Math.sin(a0) * R);
        g.lineTo(Math.cos(a1) * R * 1.32, Math.sin(a1) * R * 1.32);
        g.lineTo(Math.cos(a2) * R, Math.sin(a2) * R);
    }
    g.close(); g.fill();

    g.fillColor = new Color(tint.r, tint.g, tint.b, 255);
    g.circle(0, 0, 12 * s); g.fill();
    g.fillColor = shade(tint, 1.25);
    g.circle(0, 0, 9 * s); g.fill();
    g.fillColor = shade(tint, 0.4);
    g.circle(0, 0, 3.5 * s); g.fill();
    g.fillColor = shade(tint, 1.1);
    g.circle(0, 0, 2 * s); g.fill();

    g.fillColor = new Color(255, 255, 255, 255);
    g.ellipse(-4.5 * s, 2 * s, 4 * s, 4.5 * s); g.fill();
    g.ellipse(4.5 * s, 2 * s, 4 * s, 4.5 * s); g.fill();
    g.fillColor = new Color(255, 200, 60, 255);
    g.circle(-4 * s, 1.5 * s, 2 * s); g.fill();
    g.circle(5 * s, 1.5 * s, 2 * s); g.fill();
    g.fillColor = new Color(30, 20, 10, 255);
    g.circle(-3.5 * s, 1 * s, 1.1 * s); g.fill();
    g.circle(5.5 * s, 1 * s, 1.1 * s); g.fill();
    g.fillColor = new Color(255, 255, 255, 220);
    g.circle(-5 * s, 3 * s, 0.8 * s); g.fill();
    g.circle(4 * s, 3 * s, 0.8 * s); g.fill();
    g.strokeColor = shade(tint, 0.35);
    g.lineWidth = 1.6 * s;
    g.moveTo(-3 * s, -4 * s);
    g.bezierCurveTo(-1 * s, -6.5 * s, 1 * s, -6.5 * s, 3 * s, -4 * s);
    g.stroke();
}

/** 电火花：发光圆核 + 闪电冠 + 大眼 */
function drawSpark(g: Graphics, tint: Color, s: number) {
    g.fillColor = new Color(tint.r, tint.g, tint.b, 55);
    g.circle(0, 2 * s, 20 * s); g.fill();
    g.fillColor = new Color(tint.r, tint.g, tint.b, 100);
    g.circle(0, 2 * s, 14 * s); g.fill();

    g.fillColor = shade(tint, 1.15);
    const bolts: [number, number, number, number, number, number][] = [
        [0, 14, 5, 22, -2, 18], [0, -8, -7, -18, 2, -14],
        [10, 4, 20, 8, 14, 0], [-10, 4, -20, 0, -14, 8],
    ];
    for (const b of bolts) {
        g.moveTo(b[0] * s, b[1] * s);
        g.lineTo(b[2] * s, b[3] * s);
        g.lineTo(b[4] * s, b[5] * s);
        g.close(); g.fill();
    }

    g.fillColor = new Color(255, 255, 230, 255);
    g.circle(0, 2 * s, 10 * s); g.fill();
    g.fillColor = new Color(tint.r, tint.g, tint.b, 255);
    g.circle(0, 2 * s, 7 * s); g.fill();

    g.fillColor = new Color(255, 255, 255, 255);
    g.ellipse(-3.5 * s, 4 * s, 3.8 * s, 4.2 * s); g.fill();
    g.ellipse(3.5 * s, 4 * s, 3.8 * s, 4.2 * s); g.fill();
    g.fillColor = new Color(40, 40, 20, 255);
    g.circle(-3 * s, 3.5 * s, 1.8 * s); g.fill();
    g.circle(4 * s, 3.5 * s, 1.8 * s); g.fill();
    g.fillColor = new Color(255, 255, 255, 230);
    g.circle(-3.8 * s, 5 * s, 0.8 * s); g.fill();
    g.circle(3.2 * s, 5 * s, 0.8 * s); g.fill();
}

/** 提线木偶：关节木娃 + 提线 + 画脸 */
function drawPuppet(g: Graphics, tint: Color, s: number) {
    g.fillColor = new Color(0, 0, 0, 45);
    g.ellipse(0, -20 * s, 12 * s, 4 * s); g.fill();

    g.strokeColor = new Color(210, 210, 220, 200);
    g.lineWidth = 1.3 * s;
    g.moveTo(-7 * s, 24 * s); g.lineTo(-6 * s, 12 * s); g.stroke();
    g.moveTo(7 * s, 24 * s); g.lineTo(6 * s, 12 * s); g.stroke();
    g.fillColor = new Color(180, 160, 120, 255);
    g.roundRect(-10 * s, 22 * s, 20 * s, 4 * s, 1 * s); g.fill();

    g.fillColor = shade(tint, 0.6);
    g.roundRect(-15 * s, -4 * s, 6 * s, 14 * s, 2.5 * s); g.fill();
    g.roundRect(9 * s, -4 * s, 6 * s, 14 * s, 2.5 * s); g.fill();
    g.roundRect(-8 * s, -18 * s, 6 * s, 12 * s, 2.5 * s); g.fill();
    g.roundRect(2 * s, -18 * s, 6 * s, 12 * s, 2.5 * s); g.fill();
    g.fillColor = shade(tint, 0.9);
    g.circle(-12 * s, 2 * s, 3 * s); g.fill();
    g.circle(12 * s, 2 * s, 3 * s); g.fill();
    g.circle(-5 * s, -10 * s, 2.8 * s); g.fill();
    g.circle(5 * s, -10 * s, 2.8 * s); g.fill();

    g.fillColor = shade(tint, 0.8);
    g.roundRect(-9 * s, -8 * s, 18 * s, 18 * s, 4 * s); g.fill();
    g.fillColor = new Color(tint.r, tint.g, tint.b, 255);
    g.roundRect(-7 * s, -6 * s, 14 * s, 14 * s, 3 * s); g.fill();

    g.fillColor = shade(tint, 1.05);
    g.circle(0, 12 * s, 9 * s); g.fill();
    g.fillColor = shade(tint, 1.25);
    g.ellipse(0, 10 * s, 5 * s, 4 * s); g.fill();

    g.fillColor = new Color(255, 255, 255, 255);
    g.ellipse(-3.5 * s, 13 * s, 3.5 * s, 4 * s); g.fill();
    g.ellipse(3.5 * s, 13 * s, 3.5 * s, 4 * s); g.fill();
    g.fillColor = new Color(50, 30, 20, 255);
    g.circle(-3 * s, 12.5 * s, 1.6 * s); g.fill();
    g.circle(4 * s, 12.5 * s, 1.6 * s); g.fill();
    g.fillColor = new Color(255, 255, 255, 220);
    g.circle(-3.8 * s, 14 * s, 0.7 * s); g.fill();
    g.circle(3.2 * s, 14 * s, 0.7 * s); g.fill();
    g.fillColor = new Color(240, 120, 110, 160);
    g.ellipse(-6 * s, 9 * s, 2 * s, 1.5 * s); g.fill();
    g.ellipse(6 * s, 9 * s, 2 * s, 1.5 * s); g.fill();
    g.strokeColor = shade(tint, 0.4);
    g.lineWidth = 1.5 * s;
    g.moveTo(-3 * s, 8 * s);
    g.bezierCurveTo(-1 * s, 6 * s, 1 * s, 6 * s, 3 * s, 8 * s);
    g.stroke();
}

/** 浮空机甲：圆舱 + 旋翼光环 + 面罩眼 */
function drawDrone(g: Graphics, tint: Color, s: number) {
    g.fillColor = new Color(0, 0, 0, 40);
    g.ellipse(0, -14 * s, 16 * s, 4 * s); g.fill();

    g.fillColor = shade(tint, 0.5);
    g.ellipse(-16 * s, 6 * s, 9 * s, 3.5 * s); g.fill();
    g.ellipse(16 * s, 6 * s, 9 * s, 3.5 * s); g.fill();
    g.fillColor = new Color(120, 220, 255, 100);
    g.ellipse(-16 * s, 6 * s, 6 * s, 2 * s); g.fill();
    g.ellipse(16 * s, 6 * s, 6 * s, 2 * s); g.fill();

    g.fillColor = shade(tint, 0.6);
    g.roundRect(-14 * s, -8 * s, 28 * s, 18 * s, 7 * s); g.fill();
    g.fillColor = new Color(tint.r, tint.g, tint.b, 255);
    g.roundRect(-12 * s, -6 * s, 24 * s, 14 * s, 6 * s); g.fill();

    g.fillColor = shade(tint, 1.25);
    g.ellipse(0, 2 * s, 9 * s, 6 * s); g.fill();
    g.fillColor = new Color(80, 220, 255, 200);
    g.ellipse(0, 2 * s, 7 * s, 4.5 * s); g.fill();

    g.fillColor = new Color(255, 255, 255, 255);
    g.ellipse(-3 * s, 3 * s, 2.8 * s, 3 * s); g.fill();
    g.ellipse(3 * s, 3 * s, 2.8 * s, 3 * s); g.fill();
    g.fillColor = new Color(20, 40, 60, 255);
    g.circle(-2.5 * s, 2.5 * s, 1.3 * s); g.fill();
    g.circle(3.5 * s, 2.5 * s, 1.3 * s); g.fill();

    g.fillColor = shade(tint, 0.4);
    g.roundRect(-4 * s, -12 * s, 8 * s, 5 * s, 2 * s); g.fill();
    g.fillColor = new Color(255, 180, 80, 230);
    g.circle(0, -12 * s, 2.5 * s); g.fill();
    g.fillColor = new Color(255, 255, 200, 200);
    g.circle(0, -12 * s, 1.2 * s); g.fill();
}

/** 灰狼：圆胖狼身 + 竖耳大眼 */
function drawWolf(g: Graphics, tint: Color, s: number) {
    g.fillColor = new Color(0, 0, 0, 50);
    g.ellipse(2 * s, -16 * s, 18 * s, 5 * s); g.fill();

    g.fillColor = shade(tint, 0.65);
    g.ellipse(-18 * s, 2 * s, 8 * s, 5 * s); g.fill();

    g.fillColor = shade(tint, 0.55);
    g.ellipse(-8 * s, -12 * s, 4.5 * s, 7 * s); g.fill();
    g.ellipse(2 * s, -13 * s, 4.5 * s, 7 * s); g.fill();
    g.ellipse(10 * s, -12 * s, 4 * s, 6.5 * s); g.fill();
    g.ellipse(16 * s, -11 * s, 4 * s, 6 * s); g.fill();

    g.fillColor = shade(tint, 0.8);
    g.ellipse(0, -2 * s, 17 * s, 11 * s); g.fill();
    g.fillColor = new Color(tint.r, tint.g, tint.b, 255);
    g.ellipse(2 * s, 0, 15 * s, 10 * s); g.fill();
    g.fillColor = shade(tint, 1.35);
    g.ellipse(2 * s, -4 * s, 8 * s, 5 * s); g.fill();

    g.fillColor = new Color(tint.r, tint.g, tint.b, 255);
    g.ellipse(14 * s, 6 * s, 10 * s, 9 * s); g.fill();
    g.fillColor = shade(tint, 0.7);
    g.moveTo(8 * s, 12 * s); g.lineTo(6 * s, 22 * s); g.lineTo(12 * s, 14 * s); g.close(); g.fill();
    g.moveTo(18 * s, 12 * s); g.lineTo(22 * s, 22 * s); g.lineTo(20 * s, 12 * s); g.close(); g.fill();
    g.fillColor = shade(tint, 1.2);
    g.moveTo(9 * s, 13 * s); g.lineTo(8 * s, 19 * s); g.lineTo(11 * s, 14 * s); g.close(); g.fill();
    g.moveTo(18.5 * s, 13 * s); g.lineTo(20 * s, 19 * s); g.lineTo(19.5 * s, 13 * s); g.close(); g.fill();

    g.fillColor = shade(tint, 1.15);
    g.ellipse(22 * s, 4 * s, 5 * s, 4 * s); g.fill();
    g.fillColor = shade(tint, 0.35);
    g.ellipse(24 * s, 3 * s, 2 * s, 1.4 * s); g.fill();

    g.fillColor = new Color(255, 255, 255, 255);
    g.ellipse(12 * s, 8 * s, 4 * s, 4.5 * s); g.fill();
    g.ellipse(19 * s, 8 * s, 4 * s, 4.5 * s); g.fill();
    g.fillColor = new Color(255, 210, 80, 255);
    g.circle(12.5 * s, 7.5 * s, 2 * s); g.fill();
    g.circle(19.5 * s, 7.5 * s, 2 * s); g.fill();
    g.fillColor = new Color(25, 15, 10, 255);
    g.circle(13 * s, 7 * s, 1.1 * s); g.fill();
    g.circle(20 * s, 7 * s, 1.1 * s); g.fill();
    g.fillColor = new Color(255, 255, 255, 220);
    g.circle(11.8 * s, 9 * s, 0.8 * s); g.fill();
    g.circle(18.8 * s, 9 * s, 0.8 * s); g.fill();
}

/** 巨蟹：圆壳 + 眼柄 + 大螯 */
function drawCrab(g: Graphics, tint: Color, s: number) {
    g.fillColor = new Color(0, 0, 0, 50);
    g.ellipse(0, -16 * s, 20 * s, 5 * s); g.fill();

    g.strokeColor = shade(tint, 0.45);
    g.lineWidth = 2.4 * s;
    for (const side of [-1, 1]) {
        g.moveTo(side * 10 * s, -6 * s); g.lineTo(side * 18 * s, -16 * s); g.stroke();
        g.moveTo(side * 4 * s, -8 * s); g.lineTo(side * 10 * s, -18 * s); g.stroke();
        g.moveTo(side * 14 * s, -2 * s); g.lineTo(side * 22 * s, -12 * s); g.stroke();
    }

    g.fillColor = shade(tint, 0.65);
    g.ellipse(0, -2 * s, 20 * s, 13 * s); g.fill();
    g.fillColor = new Color(tint.r, tint.g, tint.b, 255);
    g.ellipse(0, 0, 18 * s, 11 * s); g.fill();
    g.fillColor = shade(tint, 1.3);
    g.ellipse(0, 2 * s, 10 * s, 6 * s); g.fill();
    g.strokeColor = shade(tint, 0.5);
    g.lineWidth = 1.5 * s;
    g.moveTo(-8 * s, 4 * s); g.lineTo(-4 * s, -6 * s); g.stroke();
    g.moveTo(8 * s, 4 * s); g.lineTo(4 * s, -6 * s); g.stroke();

    g.fillColor = shade(tint, 0.75);
    g.ellipse(-22 * s, 6 * s, 8 * s, 6 * s); g.fill();
    g.ellipse(22 * s, 6 * s, 8 * s, 6 * s); g.fill();
    g.fillColor = shade(tint, 0.5);
    g.moveTo(-26 * s, 8 * s); g.lineTo(-32 * s, 14 * s); g.lineTo(-24 * s, 4 * s); g.close(); g.fill();
    g.moveTo(-26 * s, 4 * s); g.lineTo(-30 * s, -2 * s); g.lineTo(-22 * s, 4 * s); g.close(); g.fill();
    g.moveTo(26 * s, 8 * s); g.lineTo(32 * s, 14 * s); g.lineTo(24 * s, 4 * s); g.close(); g.fill();
    g.moveTo(26 * s, 4 * s); g.lineTo(30 * s, -2 * s); g.lineTo(22 * s, 4 * s); g.close(); g.fill();

    g.strokeColor = shade(tint, 0.7);
    g.lineWidth = 2.2 * s;
    g.moveTo(-5 * s, 8 * s); g.lineTo(-7 * s, 16 * s); g.stroke();
    g.moveTo(5 * s, 8 * s); g.lineTo(7 * s, 16 * s); g.stroke();
    g.fillColor = new Color(255, 255, 255, 255);
    g.circle(-7 * s, 17 * s, 4 * s); g.fill();
    g.circle(7 * s, 17 * s, 4 * s); g.fill();
    g.fillColor = new Color(40, 15, 15, 255);
    g.circle(-6.5 * s, 16.5 * s, 2 * s); g.fill();
    g.circle(7.5 * s, 16.5 * s, 2 * s); g.fill();
    g.fillColor = new Color(255, 255, 255, 220);
    g.circle(-7.5 * s, 18 * s, 0.9 * s); g.fill();
    g.circle(6.5 * s, 18 * s, 0.9 * s); g.fill();
}

function shade(c: Color, mul: number): Color {
    const n = (v: number) => Math.max(0, Math.min(255, Math.round(v * mul)));
    return new Color(n(c.r), n(c.g), n(c.b), 255);
}
