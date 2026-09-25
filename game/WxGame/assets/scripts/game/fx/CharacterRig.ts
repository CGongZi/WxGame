import { _decorator, Component, Node, Graphics, UITransform, Color } from 'cc';
import { gaitForSkin } from './MotionTables';
import { IdleBreath } from './IdleBreath';

const { ccclass } = _decorator;

/**
 * CharacterRig —— 有四肢的程序小人（#126）
 *
 * Body 下挂一个 `Rig` 容器，内含：Shadow / Cape / Back / ArmBack / LegBack / Torso / LegFront / Head / ArmFront。
 * 每个部件是独立 Graphics 节点，围绕自己的关节 pivot 旋转；RigAnimator 按步伐表驱动：
 *   走：双腿交替摆 + 抬脚、双臂反向摆、躯干微倾、头反向稳
 *   待机：呼吸（躯干缩放）+ 头微点 + 披风飘
 *   持武：前臂始终指向 Body/WeaponIcon（WeaponHand 挥击时手臂跟着伸）
 * 只改部件本地 transform；Body 的整体挤压仍由 IdleBreath 负责；Player 世界坐标不碰。
 */

export type HeadStyle = 'helm' | 'hood' | 'hat' | 'crown' | 'mask' | 'horns' | 'wild' | 'hoodMask';
export type TorsoStyle = 'plate' | 'robe' | 'cloak' | 'leather' | 'scales' | 'bare';

export interface HeroRigDef {
    skin: Color;
    hair: Color;
    primary: Color;
    secondary: Color;
    accent: Color;
    metal: Color;
    boots: Color;
    eyes: Color;
    head: HeadStyle;
    torso: TorsoStyle;
    cape: boolean;
    capeColor?: Color;
    back: 'none' | 'quiver' | 'shield';
    /** 法系：手心发光 */
    glow?: Color;
}

const c = (r: number, g: number, b: number, a = 255) => new Color(r, g, b, a);
const SKIN = c(235, 205, 170);
const EYES = c(40, 30, 20);

export const HERO_RIGS: Readonly<Record<string, HeroRigDef>> = {
    knight: { skin: SKIN, hair: c(120, 80, 40), primary: c(70, 140, 230), secondary: c(40, 100, 200), accent: c(220, 200, 120), metal: c(180, 200, 230), boots: c(30, 50, 90), eyes: c(200, 230, 255), head: 'helm', torso: 'plate', cape: true, capeColor: c(30, 70, 160), back: 'shield' },
    ranger: { skin: SKIN, hair: c(90, 60, 30), primary: c(48, 140, 70), secondary: c(28, 90, 48), accent: c(180, 160, 100), metal: c(160, 160, 170), boots: c(40, 70, 35), eyes: EYES, head: 'hood', torso: 'leather', cape: false, back: 'quiver' },
    mage: { skin: c(240, 220, 255), hair: c(200, 160, 255), primary: c(120, 70, 200), secondary: c(70, 30, 130), accent: c(220, 180, 255), metal: c(200, 160, 255), boots: c(50, 20, 90), eyes: c(80, 50, 120), head: 'hat', torso: 'robe', cape: false, back: 'none', glow: c(200, 140, 255) },
    paladin: { skin: SKIN, hair: c(230, 200, 120), primary: c(220, 180, 70), secondary: c(180, 140, 50), accent: c(255, 255, 255), metal: c(240, 220, 160), boots: c(40, 50, 80), eyes: c(255, 240, 200), head: 'helm', torso: 'plate', cape: true, capeColor: c(200, 190, 140), back: 'shield' },
    assassin: { skin: c(220, 200, 190), hair: c(30, 20, 40), primary: c(40, 28, 60), secondary: c(60, 30, 90), accent: c(180, 60, 220), metal: c(200, 210, 230), boots: c(20, 10, 30), eyes: c(180, 60, 220), head: 'hoodMask', torso: 'leather', cape: true, capeColor: c(20, 12, 30), back: 'none' },
    dragonkin: { skin: c(180, 60, 45), hair: c(240, 200, 80), primary: c(160, 50, 40), secondary: c(120, 30, 30), accent: c(240, 200, 80), metal: c(255, 140, 40), boots: c(40, 20, 20), eyes: c(255, 220, 80), head: 'horns', torso: 'scales', cape: false, back: 'none' },
    berserker: { skin: c(220, 170, 140), hair: c(200, 60, 50), primary: c(180, 90, 70), secondary: c(90, 20, 25), accent: c(200, 60, 50), metal: c(90, 60, 40), boots: c(40, 20, 20), eyes: c(255, 220, 180), head: 'wild', torso: 'bare', cape: true, capeColor: c(90, 20, 25), back: 'none' },
    geomancer: { skin: c(210, 190, 160), hair: c(90, 80, 70), primary: c(120, 100, 80), secondary: c(70, 60, 50), accent: c(200, 170, 90), metal: c(90, 80, 70), boots: c(50, 40, 30), eyes: c(230, 200, 120), head: 'helm', torso: 'robe', cape: false, back: 'none', glow: c(230, 200, 120) },
    stormcaller: { skin: c(200, 240, 255), hair: c(220, 250, 255), primary: c(80, 160, 210), secondary: c(40, 90, 140), accent: c(220, 250, 255), metal: c(180, 200, 220), boots: c(30, 50, 80), eyes: c(40, 80, 120), head: 'hood', torso: 'robe', cape: false, back: 'none', glow: c(120, 220, 255) },
    cryomancer: { skin: c(220, 240, 255), hair: c(200, 240, 255), primary: c(180, 230, 255), secondary: c(120, 180, 220), accent: c(255, 255, 255), metal: c(160, 200, 230), boots: c(50, 80, 110), eyes: c(90, 140, 180), head: 'crown', torso: 'robe', cape: false, back: 'none', glow: c(140, 220, 255) },
    warden: { skin: SKIN, hair: c(60, 50, 40), primary: c(90, 120, 150), secondary: c(50, 70, 90), accent: c(200, 180, 100), metal: c(160, 180, 200), boots: c(40, 50, 60), eyes: c(220, 200, 150), head: 'helm', torso: 'plate', cape: true, capeColor: c(50, 70, 90), back: 'none' },
    plague: { skin: c(180, 200, 160), hair: c(30, 50, 35), primary: c(70, 140, 80), secondary: c(40, 90, 50), accent: c(120, 220, 100), metal: c(80, 50, 40), boots: c(30, 45, 30), eyes: c(180, 220, 160), head: 'mask', torso: 'cloak', cape: false, back: 'none', glow: c(100, 220, 80) },
    voidwalker: { skin: c(150, 130, 180), hair: c(40, 20, 70), primary: c(55, 35, 90), secondary: c(40, 20, 70), accent: c(160, 100, 255), metal: c(120, 80, 200), boots: c(30, 20, 45), eyes: c(180, 120, 255), head: 'mask', torso: 'cloak', cape: true, capeColor: c(90, 40, 160), back: 'none' },
    sunpriest: { skin: c(240, 210, 170), hair: c(255, 220, 100), primary: c(240, 190, 80), secondary: c(180, 120, 40), accent: c(255, 240, 160), metal: c(200, 140, 40), boots: c(90, 60, 30), eyes: c(255, 250, 220), head: 'crown', torso: 'robe', cape: false, back: 'none', glow: c(255, 220, 100) },
};

export function heroRigFor(skinId: string): HeroRigDef {
    return HERO_RIGS[skinId] ?? HERO_RIGS.knight;
}

function shade(col: Color, mul: number, a = 255): Color {
    const n = (v: number) => Math.max(0, Math.min(255, Math.round(v * mul)));
    return new Color(n(col.r), n(col.g), n(col.b), a);
}

// ── 骨架常量（Body 本地，脚底 ≈ -32） ──────────────────────────────
const HIP_Y = -12;
const LEG_X = 6;
const SHOULDER_X = 13;
const SHOULDER_Y = 8;
const NECK_Y = 12;
const ARM_LEN = 14;

export interface RigParts {
    root: Node;
    shadow: Node;
    cape: Node | null;
    back: Node | null;
    armBack: Node;
    legBack: Node;
    torso: Node;
    legFront: Node;
    head: Node;
    armFront: Node;
}

export class CharacterRig {
    /**
     * 在 Body 下（重）建四肢小人（#180：回退脚本像素，用精致 Rig）。
     * `animate=false` 时冻结姿态（备战/图鉴/商店缩略静态展示）。
     */
    static mount(body: Node, skinId: string, animate = true): RigAnimator | null {
        // 清掉曾挂的脚本像素，避免与 Rig 叠层
        const oldPx = body.getChildByName('HeroPixel');
        if (oldPx?.isValid) { oldPx.removeFromParent(); oldPx.destroy(); }
        const old = body.getChildByName('Rig');
        if (old?.isValid) { old.removeFromParent(); old.destroy(); }
        // Body 自己的旧剪影清掉，避免叠层
        body.getComponent(Graphics)?.clear();

        const def = heroRigFor(skinId);
        const root = new Node('Rig');
        root.layer = body.layer;
        root.setParent(body);
        root.setSiblingIndex(0);
        root.setPosition(0, 0, 0);
        root.addComponent(UITransform).setContentSize(64, 80);

        const mk = (name: string, x: number, y: number, paint: (g: Graphics) => void) => {
            const n = new Node(name);
            n.layer = body.layer;
            n.setParent(root);
            n.setPosition(x, y, 0);
            n.addComponent(UITransform).setContentSize(40, 40);
            paint(n.addComponent(Graphics));
            return n;
        };

        const shadow = mk('Shadow', 0, -33, g => { g.fillColor = c(0, 0, 0, 55); g.ellipse(0, 0, 20, 6); g.fill(); });
        const cape = def.cape ? mk('Cape', 0, SHOULDER_Y + 2, g => paintCape(g, def)) : null;
        const back = def.back !== 'none' ? mk('Back', -12, 2, g => paintBack(g, def)) : null;
        const armBack = mk('ArmBack', -SHOULDER_X, SHOULDER_Y, g => paintArm(g, def, false));
        const legBack = mk('LegBack', -LEG_X, HIP_Y, g => paintLeg(g, def, false));
        const torso = mk('Torso', 0, HIP_Y, g => paintTorso(g, def));
        const legFront = mk('LegFront', LEG_X, HIP_Y, g => paintLeg(g, def, true));
        const head = mk('Head', 0, NECK_Y, g => paintHead(g, def));
        const armFront = mk('ArmFront', SHOULDER_X, SHOULDER_Y, g => paintArm(g, def, true));

        const anim = root.addComponent(RigAnimator);
        anim.skinId = skinId;
        anim.parts = { root, shadow, cape, back, armBack, legBack, torso, legFront, head, armFront };
        anim.enabled = animate;
        // 武器图标始终压在小人之上
        const icon = body.getChildByName('WeaponIcon');
        if (icon?.isValid) icon.setSiblingIndex(body.children.length - 1);
        return animate ? anim : null;
    }

    static animatorOf(body: Node | null | undefined): RigAnimator | null {
        return body?.getChildByName('Rig')?.getComponent(RigAnimator) ?? null;
    }
}

// ── 部件绘制 ─────────────────────────────────────────────────────

function paintLeg(g: Graphics, d: HeroRigDef, front: boolean) {
    const pants = front ? d.secondary : shade(d.secondary, 0.75);
    const boot = front ? d.boots : shade(d.boots, 0.75);
    g.fillColor = pants;
    g.roundRect(-4, -13, 8, 14, 3); g.fill();
    // 膝
    g.fillColor = shade(pants, 1.2);
    g.circle(0, -8, 3); g.fill();
    g.fillColor = boot;
    g.roundRect(-5, -21, 11, 9, 3); g.fill();
    g.fillColor = shade(boot, 1.5, 180);
    g.rect(-4, -14, 9, 2); g.fill();
}

function paintArm(g: Graphics, d: HeroRigDef, front: boolean) {
    const sleeve = d.torso === 'bare' ? d.skin : (front ? d.primary : shade(d.primary, 0.72));
    // 肩甲
    if (d.torso === 'plate' || d.torso === 'scales') {
        g.fillColor = front ? d.metal : shade(d.metal, 0.75);
        g.circle(0, 0, 6.5); g.fill();
        g.fillColor = d.accent;
        g.circle(0, 0, 2.2); g.fill();
    }
    g.fillColor = sleeve;
    g.roundRect(-3.5, -ARM_LEN, 7, ARM_LEN, 3); g.fill();
    // 袖口 / 护腕
    g.fillColor = d.torso === 'bare' ? d.metal : shade(sleeve, 0.7);
    g.rect(-3.5, -ARM_LEN + 1, 7, 2.5); g.fill();
    // 手
    g.fillColor = d.glow ? shade(d.glow, 0.9) : (d.torso === 'plate' ? d.metal : d.skin);
    g.circle(0, -ARM_LEN - 2, 4); g.fill();
    if (d.glow && front) {
        g.fillColor = new Color(d.glow.r, d.glow.g, d.glow.b, 90);
        g.circle(0, -ARM_LEN - 2, 7); g.fill();
        g.fillColor = c(255, 255, 255, 200);
        g.circle(-1, -ARM_LEN - 1, 1.5); g.fill();
    }
}

function paintTorso(g: Graphics, d: HeroRigDef) {
    // 从髋部 (0,0) 往上画到肩 (≈ 22)
    switch (d.torso) {
        case 'robe':
            g.fillColor = d.secondary;
            g.moveTo(-17, -6); g.lineTo(17, -6); g.lineTo(12, 22); g.lineTo(-12, 22); g.close(); g.fill();
            g.fillColor = d.primary;
            g.moveTo(-11, -4); g.lineTo(11, -4); g.lineTo(8, 20); g.lineTo(-8, 20); g.close(); g.fill();
            g.fillColor = d.accent;
            g.rect(-1.5, 0, 3, 18); g.fill();
            g.circle(-5, 8, 1.6); g.fill();
            g.circle(5, 12, 1.6); g.fill();
            break;
        case 'cloak':
            g.fillColor = d.secondary;
            g.moveTo(-16, -4); g.lineTo(16, -4); g.lineTo(13, 22); g.lineTo(-13, 22); g.close(); g.fill();
            g.fillColor = d.primary;
            g.roundRect(-10, 0, 20, 21, 4); g.fill();
            g.fillColor = d.accent;
            g.rect(-1.5, 4, 3, 12); g.fill();
            // 领
            g.fillColor = shade(d.secondary, 1.3);
            g.moveTo(-12, 18); g.lineTo(0, 12); g.lineTo(12, 18); g.lineTo(0, 24); g.close(); g.fill();
            break;
        case 'leather':
            g.fillColor = d.primary;
            g.roundRect(-12, 0, 24, 22, 5); g.fill();
            g.fillColor = d.secondary;
            g.roundRect(-9, 3, 18, 8, 2); g.fill();
            // 腰带 + 扣
            g.fillColor = shade(d.boots, 1.2);
            g.rect(-12, 1, 24, 4); g.fill();
            g.fillColor = d.accent;
            g.rect(-2, 1, 4, 4); g.fill();
            // 斜挎带
            g.strokeColor = shade(d.boots, 1.3);
            g.lineWidth = 3;
            g.moveTo(-10, 20); g.lineTo(10, 4); g.stroke();
            break;
        case 'scales':
            g.fillColor = d.secondary;
            g.roundRect(-14, 0, 28, 23, 6); g.fill();
            g.fillColor = d.primary;
            for (let r = 0; r < 3; r++) for (let i = -1; i <= 1; i++) {
                g.ellipse(i * 8 + (r % 2) * 4, 4 + r * 6, 4.5, 3); g.fill();
            }
            g.fillColor = d.accent;
            g.rect(-14, 0, 28, 3); g.fill();
            break;
        case 'bare':
            g.fillColor = d.skin;
            g.roundRect(-13, 0, 26, 22, 6); g.fill();
            g.fillColor = shade(d.skin, 0.8);
            g.rect(-7, 12, 14, 2); g.fill();
            g.circle(-5, 16, 1.5); g.fill(); g.circle(5, 16, 1.5); g.fill();
            // 伤疤 + 皮带
            g.strokeColor = d.accent;
            g.lineWidth = 2;
            g.moveTo(-5, 6); g.lineTo(6, 16); g.stroke();
            g.fillColor = d.metal;
            g.rect(-13, 0, 26, 4); g.fill();
            break;
        default: // plate
            g.fillColor = d.primary;
            g.roundRect(-14, 0, 28, 23, 6); g.fill();
            g.fillColor = d.secondary;
            g.roundRect(-10, 3, 20, 9, 3); g.fill();
            g.fillColor = d.metal;
            g.rect(-14, 0, 28, 3); g.fill();
            // 胸徽
            g.fillColor = d.accent;
            g.rect(-1.5, 6, 3, 12); g.fill();
            g.rect(-5, 11, 10, 2.5); g.fill();
            g.fillColor = c(255, 255, 255, 150);
            g.circle(-9, 16, 1.3); g.fill(); g.circle(9, 16, 1.3); g.fill();
            break;
    }
}

function paintHead(g: Graphics, d: HeroRigDef) {
    // 颈 (0,0) → 脸中心 (0,9)
    g.fillColor = shade(d.skin, 0.85);
    g.rect(-3, -1, 6, 4); g.fill();
    const showFace = d.head !== 'mask' && d.head !== 'hoodMask';
    g.fillColor = d.skin;
    g.circle(0, 9, 9); g.fill();
    if (showFace) {
        g.fillColor = d.eyes;
        g.circle(-3.5, 9, 1.7); g.fill();
        g.circle(3.5, 9, 1.7); g.fill();
        g.fillColor = c(255, 255, 255, 200);
        g.circle(-3, 9.6, 0.6); g.fill(); g.circle(4, 9.6, 0.6); g.fill();
        g.fillColor = shade(d.skin, 0.75);
        g.rect(-2, 4.5, 4, 1); g.fill();
    }
    switch (d.head) {
        case 'helm':
            g.fillColor = d.metal;
            g.roundRect(-10.5, 8, 21, 12, 5); g.fill();
            g.fillColor = shade(d.metal, 0.7);
            g.rect(-10.5, 8, 21, 3); g.fill();
            // 面甲缝
            g.fillColor = d.eyes;
            g.roundRect(-7, 8.5, 5, 2, 1); g.fill(); g.roundRect(2, 8.5, 5, 2, 1); g.fill();
            // 羽饰
            g.fillColor = d.accent;
            g.moveTo(0, 19); g.lineTo(4, 30); g.lineTo(-4, 30); g.close(); g.fill();
            break;
        case 'hood':
            g.fillColor = d.secondary;
            g.moveTo(0, 26); g.lineTo(13, 8); g.lineTo(-13, 8); g.close(); g.fill();
            g.fillColor = shade(d.secondary, 0.75);
            g.ellipse(0, 6, 10, 5); g.fill();
            g.fillColor = d.skin;
            g.circle(0, 8, 6.5); g.fill();
            g.fillColor = d.eyes;
            g.circle(-2.6, 8.5, 1.3); g.fill(); g.circle(2.6, 8.5, 1.3); g.fill();
            break;
        case 'hoodMask':
            g.fillColor = d.secondary;
            g.moveTo(0, 26); g.lineTo(13, 8); g.lineTo(-13, 8); g.close(); g.fill();
            g.fillColor = shade(d.primary, 0.8);
            g.roundRect(-9, 3, 18, 12, 4); g.fill();
            g.fillColor = d.accent;
            g.rect(-7, 8, 5, 1.8); g.fill(); g.rect(2, 8, 5, 1.8); g.fill();
            break;
        case 'hat':
            g.fillColor = d.secondary;
            g.roundRect(-14, 14, 28, 5, 2); g.fill();
            g.fillColor = d.primary;
            g.moveTo(0, 40); g.lineTo(11, 16); g.lineTo(-11, 16); g.close(); g.fill();
            g.fillColor = d.accent;
            g.circle(0, 37, 2.5); g.fill();
            g.circle(-9, 16, 1.6); g.fill(); g.circle(9, 16, 1.6); g.fill();
            break;
        case 'crown':
            g.fillColor = d.hair;
            g.ellipse(0, 14, 9.5, 5); g.fill();
            g.fillColor = d.metal;
            g.roundRect(-9, 15, 18, 4, 1); g.fill();
            g.fillColor = d.accent;
            g.moveTo(-8, 19); g.lineTo(-5, 27); g.lineTo(-2, 19); g.close(); g.fill();
            g.moveTo(-2, 19); g.lineTo(0, 29); g.lineTo(2, 19); g.close(); g.fill();
            g.moveTo(2, 19); g.lineTo(5, 27); g.lineTo(8, 19); g.close(); g.fill();
            break;
        case 'mask':
            g.fillColor = d.secondary;
            g.roundRect(-10, 3, 20, 15, 5); g.fill();
            g.fillColor = d.accent;
            g.circle(-3.5, 10, 2.2); g.fill(); g.circle(3.5, 10, 2.2); g.fill();
            g.fillColor = shade(d.secondary, 1.3);
            g.rect(-10, 15, 20, 3); g.fill();
            break;
        case 'horns':
            g.fillColor = d.accent;
            g.moveTo(-7, 15); g.lineTo(-13, 28); g.lineTo(-3, 17); g.close(); g.fill();
            g.moveTo(7, 15); g.lineTo(13, 28); g.lineTo(3, 17); g.close(); g.fill();
            g.fillColor = shade(d.skin, 0.8);
            g.ellipse(0, 15, 9, 4); g.fill();
            break;
        case 'wild':
            g.fillColor = d.hair;
            g.moveTo(-9, 14); g.lineTo(-12, 26); g.lineTo(-4, 17); g.close(); g.fill();
            g.moveTo(-3, 16); g.lineTo(-1, 29); g.lineTo(3, 17); g.close(); g.fill();
            g.moveTo(5, 15); g.lineTo(11, 27); g.lineTo(9, 14); g.close(); g.fill();
            g.ellipse(0, 15, 9.5, 4); g.fill();
            break;
    }
}

function paintCape(g: Graphics, d: HeroRigDef) {
    const col = d.capeColor ?? d.secondary;
    // 从肩 (0,0) 向下飘
    g.fillColor = shade(col, 0.8);
    g.moveTo(-12, 0); g.lineTo(12, 0); g.lineTo(15, -30); g.lineTo(4, -26); g.lineTo(-6, -32); g.lineTo(-15, -28); g.close(); g.fill();
    g.fillColor = col;
    g.moveTo(-9, -2); g.lineTo(9, -2); g.lineTo(11, -26); g.lineTo(0, -22); g.lineTo(-11, -27); g.close(); g.fill();
}

function paintBack(g: Graphics, d: HeroRigDef) {
    if (d.back === 'quiver') {
        g.fillColor = c(90, 55, 25);
        g.roundRect(-4, -6, 8, 20, 2); g.fill();
        g.fillColor = d.accent;
        g.rect(-2.5, 12, 1.6, 8); g.fill(); g.rect(0, 13, 1.6, 8); g.fill(); g.rect(2.5, 11, 1.6, 8); g.fill();
        return;
    }
    // 盾
    g.fillColor = shade(d.primary, 0.8);
    g.moveTo(-9, 10); g.lineTo(9, 10); g.lineTo(10, -4); g.lineTo(0, -12); g.lineTo(-10, -4); g.close(); g.fill();
    g.fillColor = d.metal;
    g.moveTo(-7, 8); g.lineTo(7, 8); g.lineTo(8, -3); g.lineTo(0, -9); g.lineTo(-8, -3); g.close(); g.fill();
    g.fillColor = d.accent;
    g.circle(0, 0, 3); g.fill();
}

// ── 动画器 ───────────────────────────────────────────────────────

@ccclass('RigAnimator')
export class RigAnimator extends Component {
    skinId = 'knight';
    parts: RigParts | null = null;
    /** 由 PlayerController / 展示台每帧设置 */
    moving = false;
    moveDirX = 0;
    moveDirY = 0;

    private _t = Math.random() * 10;
    private _phase = 0;
    private _blend = 0;

    update(dt: number) {
        const p = this.parts;
        if (!p) return;
        this._t += dt;
        // 走/停以 Body 上的 IdleBreath 为准（PlayerController 只写它一处）
        const breath = this.node.parent?.getComponent(IdleBreath);
        if (breath) {
            this.moving = breath.moving && breath.kind === 'hero';
            this.moveDirX = breath.moveDirX;
            this.moveDirY = breath.moveDirY;
        }
        const gait = gaitForSkin(this.skinId);
        if (this.moving) {
            this._phase += dt * gait.foot;
            this._blend = Math.min(1, this._blend + dt * 8);
        } else {
            this._blend = Math.max(0, this._blend - dt * 6);
            // 停步时腿回中
            this._phase += dt * gait.foot * this._blend * 0.5;
        }
        const s = Math.sin(this._phase) * this._blend;
        const lift = Math.max(0, s);
        const liftB = Math.max(0, -s);
        const idle = Math.sin(this._t * gait.idle);

        // 腿：清晰交替摆，幅度克制（#151 不再 ±30° 甩到晃身子）
        p.legFront.angle = s * 18;
        p.legFront.setPosition(LEG_X, HIP_Y + lift * 2.5, 0);
        p.legBack.angle = -s * 18;
        p.legBack.setPosition(-LEG_X, HIP_Y + liftB * 2.5, 0);

        // 躯干：走时微倾 + 轻抬；待机呼吸
        const bob = Math.abs(s) * 1.2;
        p.torso.angle = s * 2 + idle * 0.5 * (1 - this._blend);
        p.torso.setPosition(0, HIP_Y + bob, 0);
        p.torso.setScale(1 + idle * 0.015 * (1 - this._blend), 1 + idle * 0.022 * (1 - this._blend), 1);

        // 头：反向稳住 + 待机微点
        p.head.angle = -s * 1.5 + idle * 0.8;
        p.head.setPosition(0, NECK_Y + bob + idle * 0.5 * (1 - this._blend), 0);

        // 后臂：与前腿同相反向摆
        p.armBack.angle = s * 16 + idle * 1.5;
        p.armBack.setPosition(-SHOULDER_X, SHOULDER_Y + bob, 0);

        // 前臂：有武器 → 指向武器握点；否则反向摆
        const body = this.node.parent;
        const icon = body?.getChildByName('WeaponIcon');
        p.armFront.setPosition(SHOULDER_X, SHOULDER_Y + bob, 0);
        if (icon?.isValid && icon.active) {
            const ip = icon.position;
            const dx = ip.x - SHOULDER_X;
            const dy = ip.y - (SHOULDER_Y + bob);
            const dist = Math.hypot(dx, dy) || 1;
            p.armFront.angle = Math.atan2(dx, -dy) * 180 / Math.PI;
            const stretch = Math.max(0.75, Math.min(1.45, dist / (ARM_LEN + 2)));
            p.armFront.setScale(1, stretch, 1);
        } else {
                    p.armFront.angle = -s * 16 - idle * 1.5;
            p.armFront.setScale(1, 1, 1);
        }

        // 披风：走时向后扬起并抖动，静止轻飘
        if (p.cape) {
            const trail = this._blend * (8 + Math.abs(Math.sin(this._phase * 2)) * 4);
            p.cape.angle = -trail - idle * 1.5;
            p.cape.setPosition(-2 - this._blend * 2, SHOULDER_Y + 2 + bob, 0);
        }
        if (p.back) p.back.setPosition(-12, 2 + bob, 0);

        // 影子随抬脚略缩
        p.shadow.setScale(1 - Math.abs(s) * 0.08, 1 - Math.abs(s) * 0.12, 1);
    }
}
