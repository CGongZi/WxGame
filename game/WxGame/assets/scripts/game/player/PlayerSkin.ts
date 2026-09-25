import { Color, Graphics } from 'cc';

/**
 * 精致程序剪影（Phase H 前）。三套职业轮廓独立，带高光/装备细节。
 * 正式像素贴图仍留 Phase H。
 */
export function drawPlayerSkin(g: Graphics, skinId: string) {
    g.clear();
    if (skinId === 'ranger') drawRanger(g);
    else if (skinId === 'mage') drawMage(g);
    else if (skinId === 'paladin') drawPaladin(g);
    else if (skinId === 'assassin') drawAssassin(g);
    else if (skinId === 'dragonkin') drawDragonkin(g);
    else if (skinId === 'berserker') drawBerserker(g);
    else if (skinId === 'geomancer') drawGeomancer(g);
    else if (skinId === 'stormcaller') drawStormcaller(g);
    else if (skinId === 'cryomancer') drawCryomancer(g);
    else if (skinId === 'warden') drawWarden(g);
    else if (skinId === 'plague') drawPlague(g);
    else if (skinId === 'voidwalker') drawVoidwalker(g);
    else if (skinId === 'sunpriest') drawSunpriest(g);
    else drawKnight(g);
}

function drawKnight(g: Graphics) {
    // 地面阴影
    g.fillColor = new Color(0, 0, 0, 50);
    g.ellipse(0, -30, 22, 7); g.fill();
    // 披风
    g.fillColor = new Color(30, 70, 160, 255);
    g.moveTo(-6, 8); g.lineTo(-26, -8); g.lineTo(-22, -28); g.lineTo(4, -20); g.close(); g.fill();
    g.fillColor = new Color(50, 100, 190, 180);
    g.moveTo(-4, 4); g.lineTo(-18, -6); g.lineTo(-16, -22); g.lineTo(2, -14); g.close(); g.fill();
    // 护甲躯干
    g.fillColor = new Color(70, 140, 230, 255);
    g.roundRect(-16, -22, 32, 36, 6); g.fill();
    g.fillColor = new Color(40, 100, 200, 255);
    g.roundRect(-12, -16, 24, 12, 3); g.fill();
    // 胸甲十字 + 铆钉
    g.fillColor = new Color(220, 200, 120, 255);
    g.rect(-2, -10, 4, 14); g.fill();
    g.rect(-7, -4, 14, 3); g.fill();
    g.fillColor = new Color(255, 240, 180, 200);
    g.circle(-10, -8, 1.5); g.fill();
    g.circle(10, -8, 1.5); g.fill();
    // 肩甲
    g.fillColor = new Color(180, 200, 230, 255);
    g.circle(-16, 10, 8); g.fill();
    g.circle(16, 10, 8); g.fill();
    g.fillColor = new Color(120, 160, 210, 255);
    g.circle(-16, 10, 4); g.fill();
    g.circle(16, 10, 4); g.fill();
    g.fillColor = new Color(240, 230, 180, 220);
    g.circle(-16, 10, 2); g.fill();
    g.circle(16, 10, 2); g.fill();
    // 头盔
    g.fillColor = new Color(50, 110, 210, 255);
    g.roundRect(-14, 12, 28, 18, 5); g.fill();
    g.fillColor = new Color(20, 60, 140, 255);
    g.rect(-14, 18, 28, 5); g.fill();
    // 羽饰双层
    g.fillColor = new Color(180, 40, 40, 255);
    g.moveTo(0, 28); g.lineTo(5, 40); g.lineTo(-5, 40); g.close(); g.fill();
    g.fillColor = new Color(220, 60, 60, 255);
    g.moveTo(0, 30); g.lineTo(4, 42); g.lineTo(-4, 42); g.close(); g.fill();
    // 面甲缝
    g.fillColor = new Color(200, 230, 255, 255);
    g.roundRect(-10, 20, 8, 3, 1); g.fill();
    g.roundRect(2, 20, 8, 3, 1); g.fill();
    g.fillColor = new Color(255, 255, 255, 90);
    g.roundRect(-8, 14, 16, 3, 1); g.fill();
    // 盾
    g.fillColor = new Color(60, 100, 180, 255);
    g.moveTo(-28, 6); g.lineTo(-36, -4); g.lineTo(-32, -18); g.lineTo(-20, -16); g.lineTo(-18, 2);
    g.close(); g.fill();
    g.fillColor = new Color(220, 180, 60, 255);
    g.circle(-27, -6, 4); g.fill();
    // 剑
    g.fillColor = new Color(210, 220, 235, 255);
    g.rect(18, -24, 4, 34); g.fill();
    g.moveTo(16, 12); g.lineTo(20, 22); g.lineTo(24, 12); g.close(); g.fill();
    g.fillColor = new Color(160, 110, 40, 255);
    g.rect(14, -2, 12, 4); g.fill();
    // 护胫 + 靴
    g.fillColor = new Color(90, 130, 190, 255);
    g.roundRect(-14, -26, 10, 8, 2); g.fill();
    g.roundRect(4, -26, 10, 8, 2); g.fill();
    g.fillColor = new Color(30, 50, 90, 255);
    g.roundRect(-14, -32, 10, 8, 2); g.fill();
    g.roundRect(4, -32, 10, 8, 2); g.fill();
}

function drawRanger(g: Graphics) {
    g.fillColor = new Color(0, 0, 0, 45);
    g.ellipse(0, -30, 18, 6); g.fill();
    // 斗篷多层
    g.fillColor = new Color(28, 90, 48, 255);
    g.moveTo(0, 26); g.lineTo(20, 4); g.lineTo(22, -28); g.lineTo(-22, -28); g.lineTo(-20, 4);
    g.close(); g.fill();
    g.fillColor = new Color(48, 140, 70, 255);
    g.moveTo(0, 18); g.lineTo(14, 0); g.lineTo(12, -18); g.lineTo(-12, -18); g.lineTo(-14, 0);
    g.close(); g.fill();
    // 披风内衬
    g.fillColor = new Color(90, 50, 30, 200);
    g.moveTo(0, 10); g.lineTo(8, -6); g.lineTo(6, -20); g.lineTo(-6, -20); g.lineTo(-8, -6);
    g.close(); g.fill();
    // 兜帽
    g.fillColor = new Color(22, 80, 42, 255);
    g.moveTo(0, 34); g.lineTo(16, 14); g.lineTo(-16, 14); g.close(); g.fill();
    g.fillColor = new Color(18, 55, 30, 255);
    g.ellipse(0, 12, 12, 8); g.fill();
    // 脸
    g.fillColor = new Color(235, 210, 170, 255);
    g.circle(0, 10, 7); g.fill();
    g.fillColor = new Color(40, 30, 20, 255);
    g.circle(-3, 11, 1.5); g.fill();
    g.circle(3, 11, 1.5); g.fill();
    // 面罩斜纹
    g.strokeColor = new Color(30, 70, 40, 180);
    g.lineWidth = 1.5;
    g.moveTo(-6, 6); g.lineTo(6, 8); g.stroke();
    // 箭袋
    g.fillColor = new Color(90, 55, 25, 255);
    g.roundRect(-24, -8, 8, 18, 2); g.fill();
    g.fillColor = new Color(180, 160, 100, 255);
    g.rect(-22, 6, 2, 10); g.fill();
    g.rect(-20, 8, 2, 8); g.fill();
    g.rect(-18, 7, 2, 9); g.fill();
    // 腰带短刀
    g.fillColor = new Color(160, 160, 170, 255);
    g.rect(10, -10, 3, 12); g.fill();
    g.fillColor = new Color(120, 80, 40, 255);
    g.rect(8, -2, 7, 3); g.fill();
    // 弓
    g.strokeColor = new Color(110, 70, 30, 255);
    g.lineWidth = 3.5;
    g.arc(18, -2, 18, -1.2, 1.2, false); g.stroke();
    g.strokeColor = new Color(230, 220, 180, 220);
    g.lineWidth = 1.5;
    g.moveTo(18, -18); g.lineTo(18, 14); g.stroke();
    // 靴
    g.fillColor = new Color(40, 70, 35, 255);
    g.roundRect(-12, -30, 9, 7, 2); g.fill();
    g.roundRect(3, -30, 9, 7, 2); g.fill();
}

function drawMage(g: Graphics) {
    g.fillColor = new Color(0, 0, 0, 45);
    g.ellipse(0, -30, 20, 6); g.fill();
    // 长袍褶
    g.fillColor = new Color(70, 30, 130, 255);
    g.moveTo(0, 10); g.lineTo(26, -28); g.lineTo(-26, -28); g.close(); g.fill();
    g.fillColor = new Color(120, 70, 200, 255);
    g.moveTo(0, 6); g.lineTo(16, -22); g.lineTo(-16, -22); g.close(); g.fill();
    g.fillColor = new Color(160, 120, 230, 120);
    g.moveTo(0, 0); g.lineTo(8, -18); g.lineTo(-8, -18); g.close(); g.fill();
    // 星纹
    g.fillColor = new Color(220, 180, 255, 200);
    g.circle(-6, -10, 2); g.fill();
    g.circle(5, -14, 1.5); g.fill();
    g.circle(0, -6, 1.8); g.fill();
    // 尖帽
    g.fillColor = new Color(90, 40, 160, 255);
    g.moveTo(0, 42); g.lineTo(14, 14); g.lineTo(-14, 14); g.close(); g.fill();
    g.fillColor = new Color(200, 160, 255, 255);
    g.circle(0, 38, 3); g.fill();
    g.fillColor = new Color(50, 20, 90, 255);
    g.roundRect(-15, 10, 30, 7, 3); g.fill();
    // 帽檐星
    g.fillColor = new Color(255, 220, 120, 255);
    g.circle(-10, 13, 2); g.fill();
    g.circle(10, 13, 2); g.fill();
    // 脸
    g.fillColor = new Color(240, 220, 255, 255);
    g.circle(0, 4, 6); g.fill();
    g.fillColor = new Color(80, 50, 120, 255);
    g.circle(-2.5, 5, 1.4); g.fill();
    g.circle(2.5, 5, 1.4); g.fill();
    // 法杖 + 球
    g.strokeColor = new Color(90, 60, 35, 255);
    g.lineWidth = 3;
    g.moveTo(12, -24); g.lineTo(20, 8); g.stroke();
    g.fillColor = new Color(160, 80, 255, 80);
    g.circle(22, 14, 12); g.fill();
    g.fillColor = new Color(200, 140, 255, 255);
    g.circle(22, 14, 7); g.fill();
    g.fillColor = new Color(255, 255, 255, 200);
    g.circle(20, 16, 2.5); g.fill();
    // 腰间符文卷
    g.fillColor = new Color(200, 180, 120, 255);
    g.roundRect(-18, -8, 8, 12, 1); g.fill();
    g.fillColor = new Color(120, 60, 180, 255);
    g.rect(-16, -4, 4, 2); g.fill();
}

function drawPaladin(g: Graphics) {
    g.fillColor = new Color(0, 0, 0, 50);
    g.ellipse(0, -30, 24, 7); g.fill();
    // 白金披风
    g.fillColor = new Color(200, 190, 140, 255);
    g.moveTo(-4, 8); g.lineTo(-28, -10); g.lineTo(-24, -30); g.lineTo(6, -18); g.close(); g.fill();
    // 金甲
    g.fillColor = new Color(220, 180, 70, 255);
    g.roundRect(-16, -20, 32, 34, 6); g.fill();
    g.fillColor = new Color(255, 230, 140, 255);
    g.roundRect(-10, -10, 20, 10, 3); g.fill();
    // 圣徽
    g.fillColor = new Color(255, 255, 255, 255);
    g.rect(-2, -6, 4, 12); g.fill();
    g.rect(-6, -2, 12, 3); g.fill();
    // 头盔羽冠
    g.fillColor = new Color(240, 220, 160, 255);
    g.roundRect(-14, 12, 28, 16, 5); g.fill();
    g.fillColor = new Color(255, 210, 80, 255);
    g.moveTo(0, 28); g.lineTo(5, 42); g.lineTo(-5, 42); g.close(); g.fill();
    // 巨盾
    g.fillColor = new Color(180, 160, 90, 255);
    g.moveTo(-30, 8); g.lineTo(-40, -2); g.lineTo(-36, -20); g.lineTo(-20, -16); g.close(); g.fill();
    g.fillColor = new Color(255, 250, 220, 255);
    g.circle(-30, -6, 5); g.fill();
    // 圣刃
    g.fillColor = new Color(255, 245, 200, 255);
    g.rect(18, -26, 5, 38); g.fill();
    g.fillColor = new Color(200, 150, 50, 255);
    g.rect(14, -2, 13, 4); g.fill();
    g.fillColor = new Color(40, 50, 80, 255);
    g.roundRect(-14, -32, 10, 8, 2); g.fill();
    g.roundRect(4, -32, 10, 8, 2); g.fill();
}

function drawAssassin(g: Graphics) {
    g.fillColor = new Color(0, 0, 0, 50);
    g.ellipse(0, -30, 16, 5); g.fill();
    // 黑紫斗篷
    g.fillColor = new Color(20, 12, 30, 255);
    g.moveTo(0, 24); g.lineTo(18, 0); g.lineTo(16, -28); g.lineTo(-16, -28); g.lineTo(-18, 0);
    g.close(); g.fill();
    g.fillColor = new Color(60, 30, 90, 220);
    g.moveTo(0, 14); g.lineTo(10, -4); g.lineTo(8, -20); g.lineTo(-8, -20); g.lineTo(-10, -4);
    g.close(); g.fill();
    // 面罩
    g.fillColor = new Color(30, 20, 40, 255);
    g.roundRect(-10, 4, 20, 14, 4); g.fill();
    g.fillColor = new Color(180, 60, 220, 255);
    g.rect(-8, 10, 6, 2); g.fill();
    g.rect(2, 10, 6, 2); g.fill();
    // 双匕
    g.fillColor = new Color(200, 210, 230, 255);
    g.rect(-26, -8, 3, 18); g.fill();
    g.rect(22, -6, 3, 16); g.fill();
    g.fillColor = new Color(100, 40, 140, 255);
    g.rect(-28, 2, 7, 3); g.fill();
    g.rect(20, 2, 7, 3); g.fill();
    // 靴
    g.fillColor = new Color(20, 10, 30, 255);
    g.roundRect(-12, -32, 8, 7, 2); g.fill();
    g.roundRect(4, -32, 8, 7, 2); g.fill();
}

function drawDragonkin(g: Graphics) {
    g.fillColor = new Color(0, 0, 0, 50);
    g.ellipse(0, -30, 22, 7); g.fill();
    // 鳞甲躯干
    g.fillColor = new Color(160, 50, 40, 255);
    g.roundRect(-16, -20, 32, 34, 7); g.fill();
    g.fillColor = new Color(220, 90, 50, 255);
    for (let i = 0; i < 3; i++) {
        g.ellipse(-6 + i * 6, -4 - i * 4, 5, 3); g.fill();
    }
    // 龙角
    g.fillColor = new Color(240, 200, 80, 255);
    g.moveTo(-10, 18); g.lineTo(-16, 36); g.lineTo(-4, 22); g.close(); g.fill();
    g.moveTo(10, 18); g.lineTo(16, 36); g.lineTo(4, 22); g.close(); g.fill();
    // 头
    g.fillColor = new Color(180, 60, 45, 255);
    g.roundRect(-12, 8, 24, 16, 5); g.fill();
    g.fillColor = new Color(255, 220, 80, 255);
    g.circle(-5, 16, 2.5); g.fill();
    g.circle(5, 16, 2.5); g.fill();
    // 翼膜
    g.fillColor = new Color(120, 30, 30, 200);
    g.moveTo(-16, 4); g.lineTo(-40, 10); g.lineTo(-34, -12); g.lineTo(-14, -6); g.close(); g.fill();
    g.moveTo(16, 4); g.lineTo(40, 10); g.lineTo(34, -12); g.lineTo(14, -6); g.close(); g.fill();
    // 龙牙戟
    g.fillColor = new Color(255, 140, 40, 255);
    g.rect(18, -22, 4, 30); g.fill();
    g.moveTo(16, 10); g.lineTo(20, 22); g.lineTo(24, 10); g.close(); g.fill();
    g.fillColor = new Color(40, 20, 20, 255);
    g.roundRect(-14, -32, 10, 8, 2); g.fill();
    g.roundRect(4, -32, 10, 8, 2); g.fill();
}

function drawBerserker(g: Graphics) {
    g.fillColor = new Color(0, 0, 0, 50);
    g.ellipse(0, -30, 22, 7); g.fill();
    // 碎披风
    g.fillColor = new Color(90, 20, 25, 255);
    g.moveTo(-4, 10); g.lineTo(-30, -4); g.lineTo(-22, -30); g.lineTo(2, -18); g.close(); g.fill();
    g.fillColor = new Color(140, 40, 40, 200);
    g.moveTo(2, 8); g.lineTo(26, -8); g.lineTo(18, -28); g.lineTo(-2, -14); g.close(); g.fill();
    // 裸甲胸肌轮廓
    g.fillColor = new Color(180, 90, 70, 255);
    g.roundRect(-14, -18, 28, 32, 6); g.fill();
    g.fillColor = new Color(120, 40, 35, 255);
    g.rect(-8, -6, 16, 4); g.fill();
    // 伤疤
    g.strokeColor = new Color(90, 20, 20, 220);
    g.lineWidth = 2;
    g.moveTo(-6, 4); g.lineTo(8, -8); g.stroke();
    // 乱发头盔
    g.fillColor = new Color(50, 30, 30, 255);
    g.roundRect(-13, 10, 26, 16, 5); g.fill();
    g.fillColor = new Color(200, 60, 50, 255);
    g.moveTo(-8, 24); g.lineTo(-14, 36); g.lineTo(-2, 26); g.close(); g.fill();
    g.moveTo(6, 24); g.lineTo(14, 38); g.lineTo(2, 26); g.close(); g.fill();
    g.fillColor = new Color(255, 220, 180, 255);
    g.circle(-4, 16, 2); g.fill();
    g.circle(4, 16, 2); g.fill();
    // 血劈巨斧
    g.fillColor = new Color(90, 60, 40, 255);
    g.rect(16, -18, 4, 28); g.fill();
    g.fillColor = new Color(180, 40, 40, 255);
    g.moveTo(12, 12); g.lineTo(28, 4); g.lineTo(30, 16); g.lineTo(14, 20); g.close(); g.fill();
    g.fillColor = new Color(255, 120, 100, 180);
    g.circle(22, 10, 4); g.fill();
    g.fillColor = new Color(40, 20, 20, 255);
    g.roundRect(-14, -32, 10, 8, 2); g.fill();
    g.roundRect(4, -32, 10, 8, 2); g.fill();
}

function drawGeomancer(g: Graphics) {
    g.fillColor = new Color(0, 0, 0, 50);
    g.ellipse(0, -30, 22, 7); g.fill();
    // 石板披风
    g.fillColor = new Color(70, 60, 50, 255);
    g.moveTo(0, 12); g.lineTo(24, -8); g.lineTo(18, -30); g.lineTo(-18, -30); g.lineTo(-24, -8);
    g.close(); g.fill();
    g.fillColor = new Color(120, 100, 80, 255);
    g.roundRect(-14, -16, 28, 30, 5); g.fill();
    // 岩纹
    g.fillColor = new Color(180, 150, 100, 200);
    g.rect(-8, -4, 16, 3); g.fill();
    g.rect(-6, 4, 12, 2); g.fill();
    // 浮空符石
    g.fillColor = new Color(200, 170, 90, 220);
    g.circle(-22, 8, 5); g.fill();
    g.circle(22, 6, 4); g.fill();
    g.circle(-18, -10, 3.5); g.fill();
    // 石盔
    g.fillColor = new Color(90, 80, 70, 255);
    g.roundRect(-12, 10, 24, 16, 4); g.fill();
    g.fillColor = new Color(40, 35, 30, 255);
    g.rect(-10, 16, 8, 3); g.fill();
    g.rect(2, 16, 8, 3); g.fill();
    // 岩晶杖
    g.strokeColor = new Color(100, 80, 50, 255);
    g.lineWidth = 3.5;
    g.moveTo(10, -24); g.lineTo(18, 10); g.stroke();
    g.fillColor = new Color(200, 160, 80, 255);
    g.moveTo(18, 14); g.lineTo(26, 22); g.lineTo(14, 24); g.close(); g.fill();
    g.fillColor = new Color(255, 230, 160, 180);
    g.circle(18, 18, 4); g.fill();
    g.fillColor = new Color(50, 40, 30, 255);
    g.roundRect(-14, -32, 10, 8, 2); g.fill();
    g.roundRect(4, -32, 10, 8, 2); g.fill();
}

function drawStormcaller(g: Graphics) {
    g.fillColor = new Color(0, 0, 0, 45);
    g.ellipse(0, -30, 18, 6); g.fill();
    // 风袍
    g.fillColor = new Color(40, 90, 140, 255);
    g.moveTo(0, 20); g.lineTo(22, -2); g.lineTo(16, -30); g.lineTo(-16, -30); g.lineTo(-22, -2);
    g.close(); g.fill();
    g.fillColor = new Color(80, 160, 210, 220);
    g.moveTo(0, 10); g.lineTo(12, -6); g.lineTo(8, -22); g.lineTo(-8, -22); g.lineTo(-12, -6);
    g.close(); g.fill();
    // 闪电纹
    g.fillColor = new Color(220, 250, 255, 230);
    g.moveTo(-4, 2); g.lineTo(2, -4); g.lineTo(-2, -4); g.lineTo(4, -12); g.lineTo(-6, -2);
    g.lineTo(0, -2); g.close(); g.fill();
    // 风帽
    g.fillColor = new Color(50, 110, 160, 255);
    g.moveTo(0, 36); g.lineTo(14, 14); g.lineTo(-14, 14); g.close(); g.fill();
    g.fillColor = new Color(200, 240, 255, 255);
    g.circle(0, 8, 6); g.fill();
    g.fillColor = new Color(40, 80, 120, 255);
    g.circle(-2.5, 9, 1.4); g.fill();
    g.circle(2.5, 9, 1.4); g.fill();
    // 雷杖
    g.strokeColor = new Color(180, 200, 220, 255);
    g.lineWidth = 2.5;
    g.moveTo(14, -22); g.lineTo(20, 12); g.stroke();
    g.fillColor = new Color(120, 220, 255, 100);
    g.circle(22, 18, 10); g.fill();
    g.fillColor = new Color(200, 250, 255, 255);
    g.circle(22, 18, 5); g.fill();
    g.fillColor = new Color(255, 255, 255, 220);
    g.moveTo(22, 26); g.lineTo(24, 18); g.lineTo(20, 18); g.close(); g.fill();
    g.fillColor = new Color(30, 50, 80, 255);
    g.roundRect(-12, -32, 9, 7, 2); g.fill();
    g.roundRect(3, -32, 9, 7, 2); g.fill();
}

function drawCryomancer(g: Graphics) {
    g.fillColor = new Color(0, 0, 0, 45);
    g.ellipse(0, -30, 20, 6); g.fill();
    g.fillColor = new Color(120, 180, 220, 255);
    g.moveTo(0, 18); g.lineTo(22, -4); g.lineTo(16, -30); g.lineTo(-16, -30); g.lineTo(-22, -4);
    g.close(); g.fill();
    g.fillColor = new Color(180, 230, 255, 220);
    g.roundRect(-12, -14, 24, 26, 5); g.fill();
    g.fillColor = new Color(220, 250, 255, 200);
    g.circle(-18, 6, 4); g.fill();
    g.circle(18, 4, 5); g.fill();
    g.circle(-14, -12, 3); g.fill();
    g.fillColor = new Color(90, 140, 180, 255);
    g.roundRect(-11, 10, 22, 14, 4); g.fill();
    g.fillColor = new Color(200, 240, 255, 255);
    g.circle(-3, 16, 2); g.fill();
    g.circle(3, 16, 2); g.fill();
    g.strokeColor = new Color(160, 200, 230, 255);
    g.lineWidth = 3;
    g.moveTo(10, -22); g.lineTo(16, 8); g.stroke();
    g.fillColor = new Color(140, 220, 255, 255);
    g.circle(18, 14, 7); g.fill();
    g.fillColor = new Color(255, 255, 255, 200);
    g.circle(18, 14, 3); g.fill();
    g.fillColor = new Color(50, 80, 110, 255);
    g.roundRect(-14, -32, 10, 8, 2); g.fill();
    g.roundRect(4, -32, 10, 8, 2); g.fill();
}

function drawWarden(g: Graphics) {
    g.fillColor = new Color(0, 0, 0, 50);
    g.ellipse(0, -30, 22, 7); g.fill();
    g.fillColor = new Color(50, 70, 90, 255);
    g.moveTo(-8, 8); g.lineTo(-24, -10); g.lineTo(-18, -28); g.lineTo(2, -18); g.close(); g.fill();
    g.fillColor = new Color(90, 120, 150, 255);
    g.roundRect(-15, -20, 30, 34, 5); g.fill();
    g.fillColor = new Color(200, 180, 100, 255);
    g.rect(-2, -8, 4, 16); g.fill();
    g.rect(-8, -2, 16, 3); g.fill();
    g.fillColor = new Color(160, 180, 200, 255);
    g.circle(-16, 10, 7); g.fill();
    g.circle(16, 10, 7); g.fill();
    g.fillColor = new Color(70, 90, 110, 255);
    g.roundRect(-12, 12, 24, 14, 3); g.fill();
    g.fillColor = new Color(220, 200, 150, 255);
    g.rect(-8, 18, 16, 3); g.fill();
    g.fillColor = new Color(100, 70, 40, 255);
    g.rect(14, -26, 4, 36); g.fill();
    g.fillColor = new Color(190, 200, 220, 255);
    g.moveTo(16, 14); g.lineTo(28, 4); g.lineTo(22, 18); g.close(); g.fill();
    g.fillColor = new Color(40, 50, 60, 255);
    g.roundRect(-14, -32, 10, 8, 2); g.fill();
    g.roundRect(4, -32, 10, 8, 2); g.fill();
}

function drawPlague(g: Graphics) {
    g.fillColor = new Color(0, 0, 0, 45);
    g.ellipse(0, -30, 18, 6); g.fill();
    g.fillColor = new Color(40, 90, 50, 255);
    g.moveTo(0, 16); g.lineTo(20, -6); g.lineTo(14, -30); g.lineTo(-14, -30); g.lineTo(-20, -6);
    g.close(); g.fill();
    g.fillColor = new Color(70, 140, 80, 255);
    g.roundRect(-12, -16, 24, 28, 5); g.fill();
    g.fillColor = new Color(120, 220, 100, 200);
    g.circle(-6, 0, 4); g.fill();
    g.circle(5, -6, 3); g.fill();
    g.fillColor = new Color(30, 50, 35, 255);
    g.roundRect(-14, 10, 28, 16, 6); g.fill();
    g.fillColor = new Color(180, 220, 160, 255);
    g.circle(-4, 16, 3); g.fill();
    g.circle(5, 16, 2.5); g.fill();
    g.fillColor = new Color(80, 50, 40, 255);
    g.rect(12, -8, 6, 14); g.fill();
    g.fillColor = new Color(100, 220, 80, 255);
    g.circle(15, 8, 6); g.fill();
    g.fillColor = new Color(40, 80, 40, 255);
    g.circle(15, 8, 2.5); g.fill();
    g.fillColor = new Color(30, 45, 30, 255);
    g.roundRect(-12, -32, 9, 7, 2); g.fill();
    g.roundRect(3, -32, 9, 7, 2); g.fill();
}

function drawVoidwalker(g: Graphics) {
    g.fillColor = new Color(0, 0, 0, 55);
    g.ellipse(0, -30, 18, 6); g.fill();
    // 裂隙披风
    g.fillColor = new Color(40, 20, 70, 255);
    g.moveTo(0, 20); g.lineTo(22, -4); g.lineTo(16, -30); g.lineTo(-16, -30); g.lineTo(-22, -4);
    g.close(); g.fill();
    g.fillColor = new Color(90, 40, 160, 200);
    g.moveTo(0, 10); g.lineTo(12, -8); g.lineTo(8, -22); g.lineTo(-8, -22); g.lineTo(-12, -8);
    g.close(); g.fill();
    // 躯干
    g.fillColor = new Color(55, 35, 90, 255);
    g.roundRect(-12, -16, 24, 28, 5); g.fill();
    g.fillColor = new Color(160, 100, 255, 180);
    g.rect(-2, -8, 4, 14); g.fill();
    // 面罩
    g.fillColor = new Color(25, 15, 40, 255);
    g.roundRect(-12, 10, 24, 14, 5); g.fill();
    g.fillColor = new Color(180, 120, 255, 255);
    g.circle(-4, 16, 2.5); g.fill();
    g.circle(5, 16, 2.5); g.fill();
    // 虚空刃
    g.fillColor = new Color(120, 80, 200, 255);
    g.rect(14, -22, 3, 30); g.fill();
    g.fillColor = new Color(220, 180, 255, 255);
    g.moveTo(12, 10); g.lineTo(16, 20); g.lineTo(20, 10); g.close(); g.fill();
    g.fillColor = new Color(30, 20, 45, 255);
    g.roundRect(-12, -32, 9, 7, 2); g.fill();
    g.roundRect(3, -32, 9, 7, 2); g.fill();
}

function drawSunpriest(g: Graphics) {
    g.fillColor = new Color(0, 0, 0, 50);
    g.ellipse(0, -30, 20, 7); g.fill();
    // 金袍
    g.fillColor = new Color(180, 120, 40, 255);
    g.moveTo(0, 18); g.lineTo(20, -2); g.lineTo(14, -30); g.lineTo(-14, -30); g.lineTo(-20, -2);
    g.close(); g.fill();
    g.fillColor = new Color(240, 190, 80, 255);
    g.roundRect(-13, -16, 26, 30, 6); g.fill();
    g.fillColor = new Color(255, 240, 160, 220);
    g.circle(0, -2, 6); g.fill();
    // 冠冕
    g.fillColor = new Color(200, 140, 40, 255);
    g.roundRect(-12, 12, 24, 12, 3); g.fill();
    g.fillColor = new Color(255, 220, 100, 255);
    g.moveTo(-8, 22); g.lineTo(-4, 32); g.lineTo(0, 22); g.close(); g.fill();
    g.moveTo(0, 22); g.lineTo(4, 34); g.lineTo(8, 22); g.close(); g.fill();
    g.fillColor = new Color(255, 250, 220, 255);
    g.circle(-3, 16, 2); g.fill();
    g.circle(4, 16, 2); g.fill();
    // 日轮杖
    g.fillColor = new Color(160, 100, 40, 255);
    g.rect(14, -26, 4, 36); g.fill();
    g.fillColor = new Color(255, 200, 60, 255);
    g.circle(16, 14, 8); g.fill();
    g.fillColor = new Color(255, 255, 200, 220);
    g.circle(16, 14, 4); g.fill();
    g.fillColor = new Color(90, 60, 30, 255);
    g.roundRect(-14, -32, 10, 8, 2); g.fill();
    g.roundRect(4, -32, 10, 8, 2); g.fill();
}
