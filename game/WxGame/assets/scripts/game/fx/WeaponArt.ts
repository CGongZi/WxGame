import { Color, Graphics, Node, UITransform, Label } from 'cc';
import { getWeapon, type WeaponType } from '../weapon/WeaponController';
import { clearWeaponPixel } from './WeaponPixelArt';

/**
 * #182 每把武器独立剪影（禁止「同轮廓换色」）。
 * 图鉴 / 商店 / 拾取 / HUD 共用。
 */
export function drawWeaponGlyph(g: Graphics, id: WeaponType, size = 36) {
    clearWeaponPixel(g.node);
    const s = size / 36;
    g.fillColor = rarityGlow(id);
    g.circle(0, 2 * s, 15 * s); g.fill();

    switch (id) {
        case 'sword': drawSword(g, s); break;
        case 'dagger': drawDaggerPair(g, s); break;
        case 'bow': drawWoodBow(g, s); break;
        case 'wand': drawArcaneWand(g, s); break;
        case 'spear': drawSpear(g, s); break;
        case 'axe': drawBattleAxe(g, s); break;
        case 'hammer': drawWarHammer(g, s); break;
        case 'crossbow': drawCrossbow(g, s); break;
        case 'shuriken': drawShuriken(g, s); break;
        case 'frost': drawFrostStaff(g, s); break;
        case 'holy_blade': drawHolyBlade(g, s); break;
        case 'shadow_daggers': drawShadowDaggers(g, s); break;
        case 'dragon_fang': drawDragonFang(g, s); break;
        case 'blood_cleaver': drawBloodCleaver(g, s); break;
        case 'earth_staff': drawEarthStaff(g, s); break;
        case 'storm_rod': drawStormRod(g, s); break;
        case 'sunblade': drawSunblade(g, s); break;
        case 'venom_bow': drawVenomBow(g, s); break;
        case 'glacier_orb': drawGlacierOrb(g, s); break;
        case 'ward_glaive': drawWardGlaive(g, s); break;
        case 'venom_vials': drawVenomVials(g, s); break;
        case 'void_edge': drawVoidEdge(g, s); break;
        case 'solar_scepter': drawSolarScepter(g, s); break;
        case 'starfall_bow': drawStarfallBow(g, s); break;
        case 'scatter_gun': drawScatterGun(g, s); break;
        case 'saw_disc': drawSawDisc(g, s); break;
        case 'thunder_lance': drawThunderLance(g, s); break;
        case 'chain_whip': drawChainWhip(g, s); break;
        case 'boomerang': drawBoomerang(g, s); break;
        case 'flame_flask': drawFlameFlask(g, s); break;
        case 'claymore': drawClaymore(g, s); break;
        case 'rail_cannon': drawRailCannon(g, s); break;
        case 'prism_rod': drawPrismRod(g, s); break;
        default: drawSword(g, s); break;
    }
}

export function attachWeaponLabel(parent: Node, id: WeaponType, y = -28) {
    const def = getWeapon(id);
    const name = new Node('Name');
    name.setParent(parent);
    name.setPosition(0, y, 0);
    name.addComponent(UITransform).setContentSize(100, 18);
    const lbl = name.addComponent(Label);
    lbl.string = `${def.emoji} ${def.name}`;
    lbl.fontSize = 12;
    lbl.color = new Color(240, 230, 200, 255);
}

function rarityGlow(id: string): Color {
    try {
        const r = getWeapon(id as WeaponType).rarity;
        if (r === 'gold' || r === 'red') return new Color(255, 200, 80, 70);
        if (r === 'purple') return new Color(180, 100, 255, 60);
        if (r === 'blue') return new Color(80, 140, 255, 55);
        if (r === 'green') return new Color(80, 200, 120, 50);
    } catch { /* */ }
    return new Color(180, 170, 150, 40);
}

// ── 各武器独有剪影 ──────────────────────────────────────────────

function drawSword(g: Graphics, s: number) {
    // 直剑：细刃 + 直护手 + 圆柄
    g.fillColor = new Color(200, 210, 225, 255);
    g.rect(-2 * s, -12 * s, 4 * s, 24 * s); g.fill();
    g.moveTo(-4 * s, 12 * s); g.lineTo(0, 18 * s); g.lineTo(4 * s, 12 * s); g.close(); g.fill();
    g.fillColor = new Color(150, 100, 40, 255);
    g.rect(-9 * s, -2 * s, 18 * s, 3.5 * s); g.fill();
    g.fillColor = new Color(90, 60, 30, 255);
    g.circle(0, -16 * s, 3.5 * s); g.fill();
}

function drawDaggerPair(g: Graphics, s: number) {
    // 双刃：交叉两把短匕（对称 X）
    g.fillColor = new Color(190, 205, 220, 255);
    g.moveTo(-12 * s, 14 * s); g.lineTo(-6 * s, -2 * s); g.lineTo(-10 * s, -12 * s); g.lineTo(-16 * s, 2 * s);
    g.close(); g.fill();
    g.moveTo(12 * s, 14 * s); g.lineTo(16 * s, 2 * s); g.lineTo(10 * s, -12 * s); g.lineTo(6 * s, -2 * s);
    g.close(); g.fill();
    g.fillColor = new Color(100, 70, 40, 255);
    g.rect(-14 * s, -1 * s, 7 * s, 2.5 * s); g.fill();
    g.rect(7 * s, -1 * s, 7 * s, 2.5 * s); g.fill();
}

function drawWoodBow(g: Graphics, s: number) {
    // 木弓：C 弧 + 弦 + 单箭
    g.strokeColor = new Color(130, 85, 40, 255);
    g.lineWidth = 3.2 * s;
    g.arc(0, 0, 14 * s, -1.15, 1.15, false); g.stroke();
    g.strokeColor = new Color(230, 220, 180, 255);
    g.lineWidth = 1.4 * s;
    g.moveTo(0, -12 * s); g.lineTo(0, 12 * s); g.stroke();
    g.fillColor = new Color(220, 190, 70, 255);
    g.moveTo(2 * s, 0); g.lineTo(16 * s, -2.5 * s); g.lineTo(16 * s, 2.5 * s); g.close(); g.fill();
    g.fillColor = new Color(160, 80, 40, 255);
    g.circle(0, -13 * s, 2 * s); g.fill();
    g.circle(0, 13 * s, 2 * s); g.fill();
}

function drawArcaneWand(g: Graphics, s: number) {
    // 魔法杖：弯杖 + 三棱水晶（非圆球）
    g.strokeColor = new Color(70, 40, 100, 255);
    g.lineWidth = 3 * s;
    g.moveTo(-6 * s, -16 * s); g.lineTo(2 * s, 4 * s); g.lineTo(8 * s, 8 * s); g.stroke();
    g.fillColor = new Color(180, 100, 255, 255);
    g.moveTo(8 * s, 18 * s); g.lineTo(16 * s, 10 * s); g.lineTo(8 * s, 4 * s); g.lineTo(0, 10 * s);
    g.close(); g.fill();
    g.fillColor = new Color(255, 220, 255, 220);
    g.circle(8 * s, 11 * s, 2.5 * s); g.fill();
}

function drawSpear(g: Graphics, s: number) {
    // 长矛：细杆 + 菱形矛头 + 穗
    g.fillColor = new Color(120, 85, 45, 255);
    g.rect(-1.2 * s, -18 * s, 2.4 * s, 30 * s); g.fill();
    g.fillColor = new Color(210, 215, 225, 255);
    g.moveTo(0, 16 * s); g.lineTo(5 * s, 4 * s); g.lineTo(0, 8 * s); g.lineTo(-5 * s, 4 * s);
    g.close(); g.fill();
    g.fillColor = new Color(180, 60, 50, 255);
    g.rect(-4 * s, -6 * s, 8 * s, 2 * s); g.fill();
}

function drawBattleAxe(g: Graphics, s: number) {
    // 巨斧：单侧大斧刃（非对称）
    g.fillColor = new Color(100, 70, 35, 255);
    g.rect(-2 * s, -16 * s, 4 * s, 26 * s); g.fill();
    g.fillColor = new Color(170, 175, 185, 255);
    g.moveTo(0, 12 * s); g.lineTo(16 * s, 16 * s); g.lineTo(14 * s, 2 * s); g.lineTo(2 * s, 0);
    g.close(); g.fill();
    g.fillColor = new Color(90, 95, 105, 255);
    g.moveTo(2 * s, 10 * s); g.lineTo(12 * s, 12 * s); g.lineTo(11 * s, 4 * s); g.lineTo(2 * s, 2 * s);
    g.close(); g.fill();
}

function drawWarHammer(g: Graphics, s: number) {
    // 战锤：短柄 + 方锤头 + 钉刺
    g.fillColor = new Color(90, 65, 35, 255);
    g.rect(-2 * s, -16 * s, 4 * s, 22 * s); g.fill();
    g.fillColor = new Color(130, 140, 150, 255);
    g.roundRect(-12 * s, 2 * s, 24 * s, 14 * s, 2 * s); g.fill();
    g.fillColor = new Color(200, 210, 220, 255);
    g.rect(-4 * s, 14 * s, 3 * s, 4 * s); g.fill();
    g.rect(1 * s, 14 * s, 3 * s, 4 * s); g.fill();
    g.rect(-9 * s, 6 * s, 3 * s, 3 * s); g.fill();
    g.rect(6 * s, 6 * s, 3 * s, 3 * s); g.fill();
}

function drawCrossbow(g: Graphics, s: number) {
    // 重弩：横臂 + 机匣 + 短弩矢
    g.fillColor = new Color(100, 70, 40, 255);
    g.roundRect(-14 * s, -3 * s, 28 * s, 5 * s, 2 * s); g.fill();
    g.fillColor = new Color(70, 55, 40, 255);
    g.rect(-4 * s, -12 * s, 8 * s, 16 * s); g.fill();
    g.fillColor = new Color(200, 210, 230, 255);
    g.moveTo(0, 4 * s); g.lineTo(0, 18 * s); g.lineTo(3 * s, 10 * s); g.close(); g.fill();
    g.strokeColor = new Color(220, 200, 160, 255);
    g.lineWidth = 1.5 * s;
    g.moveTo(-12 * s, -1 * s); g.lineTo(12 * s, -1 * s); g.stroke();
}

function drawShuriken(g: Graphics, s: number) {
    // 手里剑：四尖星 + 中孔
    g.fillColor = new Color(200, 210, 225, 255);
    for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 - Math.PI / 2;
        const a1 = a + Math.PI / 8;
        const a2 = a - Math.PI / 8;
        g.moveTo(0, 0);
        g.lineTo(Math.cos(a1) * 6 * s, Math.sin(a1) * 6 * s);
        g.lineTo(Math.cos(a) * 15 * s, Math.sin(a) * 15 * s);
        g.lineTo(Math.cos(a2) * 6 * s, Math.sin(a2) * 6 * s);
        g.close(); g.fill();
    }
    g.fillColor = new Color(40, 40, 50, 255);
    g.circle(0, 0, 3 * s); g.fill();
}

function drawFrostStaff(g: Graphics, s: number) {
    // 冰杖：直杆 + 六角冰晶冠（非圆）
    g.fillColor = new Color(160, 200, 230, 255);
    g.rect(-1.5 * s, -16 * s, 3 * s, 26 * s); g.fill();
    g.fillColor = new Color(180, 240, 255, 255);
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.moveTo(0, 10 * s);
        g.lineTo(Math.cos(a) * 10 * s, 10 * s + Math.sin(a) * 10 * s);
        g.lineTo(Math.cos(a + 0.5) * 4 * s, 10 * s + Math.sin(a + 0.5) * 4 * s);
        g.close(); g.fill();
    }
    g.fillColor = new Color(255, 255, 255, 230);
    g.circle(0, 10 * s, 3 * s); g.fill();
}

function drawHolyBlade(g: Graphics, s: number) {
    // 圣光巨刃：宽刃 + 金十字护手 + 光环
    g.fillColor = new Color(255, 245, 200, 255);
    g.rect(-4 * s, -14 * s, 8 * s, 26 * s); g.fill();
    g.moveTo(-8 * s, 12 * s); g.lineTo(0, 20 * s); g.lineTo(8 * s, 12 * s); g.close(); g.fill();
    g.fillColor = new Color(255, 210, 80, 255);
    g.rect(-12 * s, -3 * s, 24 * s, 4 * s); g.fill();
    g.rect(-2 * s, -8 * s, 4 * s, 14 * s); g.fill();
    g.fillColor = new Color(255, 255, 220, 140);
    g.circle(0, 6 * s, 7 * s); g.fill();
}

function drawShadowDaggers(g: Graphics, s: number) {
    // 影舞双匕：弯曲影刃，一长一短错位
    g.fillColor = new Color(90, 50, 130, 255);
    g.moveTo(-10 * s, 14 * s); g.lineTo(-2 * s, 2 * s); g.lineTo(-8 * s, -14 * s); g.lineTo(-16 * s, -2 * s);
    g.close(); g.fill();
    g.fillColor = new Color(160, 100, 220, 255);
    g.moveTo(14 * s, 10 * s); g.lineTo(8 * s, -2 * s); g.lineTo(12 * s, -12 * s); g.lineTo(18 * s, 0);
    g.close(); g.fill();
    g.fillColor = new Color(40, 20, 60, 255);
    g.rect(-14 * s, -1 * s, 8 * s, 2.5 * s); g.fill();
    g.rect(8 * s, -1 * s, 6 * s, 2.5 * s); g.fill();
}

function drawDragonFang(g: Graphics, s: number) {
    // 龙牙戟：戟杆 + 弯月龙牙刃 + 火核
    g.fillColor = new Color(80, 40, 25, 255);
    g.rect(-1.5 * s, -16 * s, 3 * s, 28 * s); g.fill();
    g.fillColor = new Color(255, 120, 50, 255);
    g.moveTo(0, 14 * s); g.lineTo(14 * s, 6 * s); g.lineTo(4 * s, 2 * s); g.lineTo(10 * s, -4 * s);
    g.lineTo(0, 4 * s); g.lineTo(-4 * s, 8 * s); g.close(); g.fill();
    g.fillColor = new Color(255, 220, 80, 255);
    g.circle(2 * s, 8 * s, 3 * s); g.fill();
}

function drawBloodCleaver(g: Graphics, s: number) {
    // 血劈巨斧：双刃斧 + 血滴
    g.fillColor = new Color(70, 30, 25, 255);
    g.rect(-2 * s, -14 * s, 4 * s, 22 * s); g.fill();
    g.fillColor = new Color(180, 50, 50, 255);
    g.moveTo(-2 * s, 12 * s); g.lineTo(-16 * s, 16 * s); g.lineTo(-14 * s, 0); g.lineTo(-2 * s, 2 * s);
    g.close(); g.fill();
    g.moveTo(2 * s, 12 * s); g.lineTo(16 * s, 16 * s); g.lineTo(14 * s, 0); g.lineTo(2 * s, 2 * s);
    g.close(); g.fill();
    g.fillColor = new Color(255, 80, 80, 255);
    g.circle(-8 * s, -6 * s, 2.5 * s); g.fill();
}

function drawEarthStaff(g: Graphics, s: number) {
    // 岩晶杖：粗石柱 + 三角晶簇
    g.fillColor = new Color(120, 95, 60, 255);
    g.roundRect(-3 * s, -16 * s, 6 * s, 24 * s, 2 * s); g.fill();
    g.fillColor = new Color(200, 160, 90, 255);
    g.moveTo(0, 18 * s); g.lineTo(8 * s, 6 * s); g.lineTo(0, 10 * s); g.lineTo(-8 * s, 6 * s);
    g.close(); g.fill();
    g.fillColor = new Color(160, 120, 60, 255);
    g.moveTo(-6 * s, 8 * s); g.lineTo(-2 * s, 0); g.lineTo(-10 * s, 0); g.close(); g.fill();
    g.moveTo(6 * s, 8 * s); g.lineTo(10 * s, 0); g.lineTo(2 * s, 0); g.close(); g.fill();
}

function drawStormRod(g: Graphics, s: number) {
    // 唤雷杖：金属杆 + 分叉电弧头
    g.fillColor = new Color(70, 90, 110, 255);
    g.rect(-1.5 * s, -16 * s, 3 * s, 26 * s); g.fill();
    g.strokeColor = new Color(140, 230, 255, 255);
    g.lineWidth = 2 * s;
    g.moveTo(0, 10 * s); g.lineTo(-8 * s, 18 * s); g.stroke();
    g.moveTo(0, 10 * s); g.lineTo(8 * s, 18 * s); g.stroke();
    g.moveTo(-4 * s, 12 * s); g.lineTo(4 * s, 16 * s); g.stroke();
    g.fillColor = new Color(255, 255, 255, 255);
    g.circle(0, 10 * s, 3 * s); g.fill();
}

function drawSunblade(g: Graphics, s: number) {
    // 曜金长剑：细长金刃 + 日轮护手
    g.fillColor = new Color(255, 200, 80, 255);
    g.rect(-2.5 * s, -14 * s, 5 * s, 26 * s); g.fill();
    g.moveTo(-5 * s, 12 * s); g.lineTo(0, 18 * s); g.lineTo(5 * s, 12 * s); g.close(); g.fill();
    g.fillColor = new Color(255, 160, 40, 255);
    g.circle(0, -2 * s, 7 * s); g.fill();
    g.fillColor = new Color(255, 240, 180, 255);
    g.circle(0, -2 * s, 3.5 * s); g.fill();
    // 日芒
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.fillColor = new Color(255, 220, 100, 200);
        g.moveTo(Math.cos(a) * 7 * s, -2 * s + Math.sin(a) * 7 * s);
        g.lineTo(Math.cos(a) * 11 * s, -2 * s + Math.sin(a) * 11 * s);
        g.lineTo(Math.cos(a + 0.2) * 7 * s, -2 * s + Math.sin(a + 0.2) * 7 * s);
        g.close(); g.fill();
    }
}

function drawVenomBow(g: Graphics, s: number) {
    // 毒藤弓：藤蔓缠绕弧 + 毒液箭
    g.strokeColor = new Color(50, 110, 40, 255);
    g.lineWidth = 3.5 * s;
    g.arc(0, 0, 14 * s, -1.2, 1.2, false); g.stroke();
    g.strokeColor = new Color(100, 200, 80, 255);
    g.lineWidth = 1.5 * s;
    g.moveTo(2 * s, -10 * s); g.lineTo(-2 * s, 0); g.lineTo(2 * s, 10 * s); g.stroke();
    g.fillColor = new Color(140, 255, 90, 255);
    g.moveTo(2 * s, 0); g.lineTo(15 * s, -3 * s); g.lineTo(15 * s, 3 * s); g.close(); g.fill();
    g.fillColor = new Color(60, 160, 50, 255);
    g.circle(-2 * s, 6 * s, 2.5 * s); g.fill();
    g.circle(-2 * s, -6 * s, 2.5 * s); g.fill();
}

function drawGlacierOrb(g: Graphics, s: number) {
    // 冰晶球：悬浮多面体冰球（无杖杆）
    g.fillColor = new Color(100, 180, 230, 100);
    g.circle(0, 0, 14 * s); g.fill();
    g.fillColor = new Color(160, 230, 255, 255);
    g.moveTo(0, 12 * s); g.lineTo(10 * s, 2 * s); g.lineTo(6 * s, -10 * s);
    g.lineTo(-6 * s, -10 * s); g.lineTo(-10 * s, 2 * s); g.close(); g.fill();
    g.fillColor = new Color(255, 255, 255, 220);
    g.moveTo(0, 8 * s); g.lineTo(5 * s, 0); g.lineTo(0, -4 * s); g.lineTo(-5 * s, 0);
    g.close(); g.fill();
}

function drawWardGlaive(g: Graphics, s: number) {
    // 守望戟：宽月牙刃 + 盾徽杆
    g.fillColor = new Color(70, 90, 110, 255);
    g.rect(-1.5 * s, -16 * s, 3 * s, 26 * s); g.fill();
    g.fillColor = new Color(180, 200, 220, 255);
    g.moveTo(0, 14 * s); g.lineTo(12 * s, 4 * s); g.lineTo(4 * s, 2 * s);
    g.lineTo(10 * s, -6 * s); g.lineTo(0, 0); g.lineTo(-4 * s, 6 * s); g.close(); g.fill();
    g.fillColor = new Color(120, 200, 180, 255);
    g.moveTo(0, -4 * s); g.lineTo(5 * s, -8 * s); g.lineTo(0, -14 * s); g.lineTo(-5 * s, -8 * s);
    g.close(); g.fill();
}

function drawVenomVials(g: Graphics, s: number) {
    // 毒瓶：两只倾斜小瓶 + 绿液
    g.fillColor = new Color(200, 220, 200, 255);
    g.roundRect(-14 * s, -6 * s, 10 * s, 16 * s, 2 * s); g.fill();
    g.roundRect(4 * s, -10 * s, 10 * s, 16 * s, 2 * s); g.fill();
    g.fillColor = new Color(80, 200, 70, 255);
    g.roundRect(-12 * s, -4 * s, 6 * s, 10 * s, 1 * s); g.fill();
    g.roundRect(6 * s, -8 * s, 6 * s, 10 * s, 1 * s); g.fill();
    g.fillColor = new Color(100, 80, 50, 255);
    g.rect(-12 * s, 8 * s, 6 * s, 3 * s); g.fill();
    g.rect(6 * s, 4 * s, 6 * s, 3 * s); g.fill();
}

function drawVoidEdge(g: Graphics, s: number) {
    // 虚空刃：单刃弯刀 + 裂隙紫痕（非双匕）
    g.fillColor = new Color(60, 30, 90, 255);
    g.moveTo(-4 * s, 16 * s); g.lineTo(10 * s, 4 * s); g.lineTo(6 * s, -14 * s);
    g.lineTo(-2 * s, -8 * s); g.lineTo(-8 * s, 4 * s); g.close(); g.fill();
    g.fillColor = new Color(180, 100, 255, 255);
    g.moveTo(-2 * s, 10 * s); g.lineTo(6 * s, 2 * s); g.lineTo(4 * s, -6 * s); g.lineTo(-4 * s, 2 * s);
    g.close(); g.fill();
    g.fillColor = new Color(30, 15, 50, 255);
    g.rect(-6 * s, -2 * s, 8 * s, 3 * s); g.fill();
    g.fillColor = new Color(200, 140, 255, 180);
    g.circle(8 * s, 8 * s, 3 * s); g.fill();
}

function drawSolarScepter(g: Graphics, s: number) {
    // 日轮杖：金杆 + 日轮环（非实心球）
    g.fillColor = new Color(180, 120, 40, 255);
    g.rect(-2 * s, -16 * s, 4 * s, 22 * s); g.fill();
    g.strokeColor = new Color(255, 200, 80, 255);
    g.lineWidth = 2.5 * s;
    g.circle(0, 10 * s, 9 * s); g.stroke();
    g.fillColor = new Color(255, 230, 120, 255);
    g.circle(0, 10 * s, 4 * s); g.fill();
    g.fillColor = new Color(255, 160, 40, 200);
    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.circle(Math.cos(a) * 9 * s, 10 * s + Math.sin(a) * 9 * s, 1.5 * s); g.fill();
    }
}

function drawStarfallBow(g: Graphics, s: number) {
    // 星陨弓：金弧 + 三支星箭扇形
    g.strokeColor = new Color(180, 140, 50, 255);
    g.lineWidth = 3 * s;
    g.arc(0, 0, 13 * s, -1.1, 1.1, false); g.stroke();
    g.fillColor = new Color(255, 230, 120, 255);
    const tips = [[14, -6], [16, 0], [14, 6]];
    for (const [x, y] of tips) {
        g.moveTo(2 * s, 0); g.lineTo(x * s, (y - 2) * s); g.lineTo(x * s, (y + 2) * s); g.close(); g.fill();
    }
    g.fillColor = new Color(255, 255, 255, 255);
    g.circle(4 * s, 8 * s, 1.5 * s); g.fill();
    g.circle(-2 * s, -10 * s, 1.2 * s); g.fill();
}

function drawScatterGun(g: Graphics, s: number) {
    // 碎石铳：粗短管 + 木托 + 五粒散石示意
    g.fillColor = new Color(110, 70, 35, 255);
    g.roundRect(-16 * s, -8 * s, 14 * s, 10 * s, 2 * s); g.fill();
    g.fillColor = new Color(80, 85, 95, 255);
    g.roundRect(-4 * s, -4 * s, 18 * s, 8 * s, 2 * s); g.fill();
    g.fillColor = new Color(140, 145, 155, 255);
    g.moveTo(12 * s, -5 * s); g.lineTo(18 * s, -8 * s); g.lineTo(18 * s, 10 * s); g.lineTo(12 * s, 7 * s);
    g.close(); g.fill();
    g.fillColor = new Color(220, 200, 140, 255);
    [[10, 10], [14, 6], [16, 0], [14, -6], [10, -10]].forEach(([x, y]) => {
        g.circle(x * s, y * s, 1.8 * s); g.fill();
    });
}

function drawSawDisc(g: Graphics, s: number) {
    // 回旋锯：齿轮锯片
    g.fillColor = new Color(180, 190, 200, 255);
    const R = 13 * s;
    for (let i = 0; i < 10; i++) {
        const a0 = (i / 10) * Math.PI * 2;
        const a1 = ((i + 0.45) / 10) * Math.PI * 2;
        const a2 = ((i + 1) / 10) * Math.PI * 2;
        if (i === 0) g.moveTo(Math.cos(a0) * R, Math.sin(a0) * R);
        g.lineTo(Math.cos(a1) * R * 1.3, Math.sin(a1) * R * 1.3);
        g.lineTo(Math.cos(a2) * R, Math.sin(a2) * R);
    }
    g.close(); g.fill();
    g.fillColor = new Color(90, 100, 110, 255);
    g.circle(0, 0, 6 * s); g.fill();
    g.fillColor = new Color(40, 45, 50, 255);
    g.circle(0, 0, 2.5 * s); g.fill();
}

function drawThunderLance(g: Graphics, s: number) {
    // 雷枪：细长金属枪 + 电光矛尖
    g.fillColor = new Color(60, 70, 95, 255);
    g.rect(-1.2 * s, -18 * s, 2.4 * s, 32 * s); g.fill();
    g.fillColor = new Color(160, 230, 255, 255);
    g.moveTo(0, 16 * s); g.lineTo(4 * s, 6 * s); g.lineTo(0, 10 * s); g.lineTo(-4 * s, 6 * s);
    g.close(); g.fill();
    g.strokeColor = new Color(255, 255, 200, 255);
    g.lineWidth = 1.5 * s;
    g.moveTo(-3 * s, 2 * s); g.lineTo(1 * s, -4 * s); g.lineTo(-1 * s, -4 * s); g.lineTo(3 * s, -10 * s); g.stroke();
}

function drawChainWhip(g: Graphics, s: number) {
    g.fillColor = new Color(90, 70, 50, 255);
    g.circle(-2 * s, -12 * s, 3.5 * s); g.fill();
    g.strokeColor = new Color(160, 160, 170, 255);
    g.lineWidth = 2.4 * s;
    g.moveTo(0, -10 * s);
    g.bezierCurveTo(8 * s, -2 * s, 10 * s, 8 * s, 4 * s, 16 * s); g.stroke();
    g.fillColor = new Color(200, 80, 60, 255);
    g.circle(4 * s, 16 * s, 3 * s); g.fill();
    g.fillColor = new Color(180, 180, 190, 255);
    g.circle(2 * s, 2 * s, 2 * s); g.fill();
    g.circle(6 * s, 8 * s, 2 * s); g.fill();
}

function drawBoomerang(g: Graphics, s: number) {
    g.fillColor = new Color(170, 110, 50, 255);
    g.moveTo(-12 * s, 8 * s);
    g.bezierCurveTo(-4 * s, 16 * s, 8 * s, 14 * s, 14 * s, 4 * s);
    g.bezierCurveTo(8 * s, 8 * s, -2 * s, 6 * s, -8 * s, 0);
    g.close(); g.fill();
    g.fillColor = new Color(210, 150, 80, 255);
    g.moveTo(-10 * s, 6 * s);
    g.bezierCurveTo(-2 * s, 12 * s, 6 * s, 10 * s, 10 * s, 4 * s);
    g.bezierCurveTo(4 * s, 6 * s, -2 * s, 4 * s, -6 * s, 1 * s);
    g.close(); g.fill();
}

function drawFlameFlask(g: Graphics, s: number) {
    g.fillColor = new Color(80, 50, 40, 255);
    g.rect(-3 * s, 8 * s, 6 * s, 6 * s); g.fill();
    g.fillColor = new Color(200, 80, 40, 255);
    g.ellipse(0, -2 * s, 10 * s, 12 * s); g.fill();
    g.fillColor = new Color(255, 180, 60, 200);
    g.ellipse(0, -2 * s, 6 * s, 8 * s); g.fill();
    g.fillColor = new Color(255, 240, 120, 255);
    g.circle(-2 * s, 2 * s, 2 * s); g.fill();
}

function drawClaymore(g: Graphics, s: number) {
    g.fillColor = new Color(200, 210, 230, 255);
    g.rect(-3.5 * s, -10 * s, 7 * s, 26 * s); g.fill();
    g.moveTo(-5 * s, 16 * s); g.lineTo(0, 22 * s); g.lineTo(5 * s, 16 * s); g.close(); g.fill();
    g.fillColor = new Color(120, 80, 40, 255);
    g.rect(-12 * s, -4 * s, 24 * s, 4 * s); g.fill();
    g.fillColor = new Color(70, 50, 30, 255);
    g.rect(-2.5 * s, -16 * s, 5 * s, 12 * s); g.fill();
}

function drawRailCannon(g: Graphics, s: number) {
    g.fillColor = new Color(50, 60, 75, 255);
    g.roundRect(-14 * s, -5 * s, 22 * s, 10 * s, 2 * s); g.fill();
    g.fillColor = new Color(90, 110, 130, 255);
    g.rect(6 * s, -3 * s, 12 * s, 6 * s); g.fill();
    g.fillColor = new Color(80, 220, 255, 255);
    g.circle(16 * s, 0, 2.5 * s); g.fill();
    g.strokeColor = new Color(120, 240, 255, 200);
    g.lineWidth = 1.5 * s;
    g.moveTo(18 * s, 0); g.lineTo(26 * s, 0); g.stroke();
}

function drawPrismRod(g: Graphics, s: number) {
    g.fillColor = new Color(90, 60, 120, 255);
    g.rect(-1.5 * s, -14 * s, 3 * s, 24 * s); g.fill();
    g.fillColor = new Color(180, 120, 255, 255);
    g.moveTo(0, 14 * s); g.lineTo(6 * s, 4 * s); g.lineTo(0, 7 * s); g.lineTo(-6 * s, 4 * s);
    g.close(); g.fill();
    g.fillColor = new Color(255, 200, 255, 200);
    g.circle(0, 10 * s, 2 * s); g.fill();
}
