import { Node, Graphics, Color, UITransform, tween, Vec3 } from 'cc';
import { WorldBridge } from '../dungeon/WorldBridge';

/**
 * 轻量战斗特效（命中火花 / 死亡爆散 / 受击抖动 / 弹道拖尾）
 * Q7：在场粒子有上限；Fx / Trail 走短池回收，超预算优先丢弃拖尾。
 */
export class CombatVfx {
    private static _alive = 0;
    private static readonly MAX_ALIVE = 72;
    private static readonly POOL_CAP = 56;
    private static _free: Node[] = [];

    /** 回大厅 / 切场景时清空池 */
    static clear() {
        for (const n of CombatVfx._free) {
            if (n?.isValid) n.destroy();
        }
        CombatVfx._free = [];
        CombatVfx._alive = 0;
    }

    /** 近战刀光弧（像素风短条扇扫） */
    static slashArc(
        parent: Node, x: number, y: number,
        dirX: number, dirY: number, color: Color, radius = 42,
    ) {
        if (!parent?.isValid) return;
        const n = CombatVfx._acquire(parent, 'SlashArc', radius * 3, true);
        if (!n) return;
        n.setPosition(x, y, 0);
        n.setScale(1, 1, 1);
        n.angle = (Math.atan2(dirY, dirX) * 180) / Math.PI;
        const g = n.getComponent(Graphics)!;
        g.clear();
        const col = new Color(color.r, color.g, color.b, 220);
        g.strokeColor = col;
        g.lineWidth = 4;
        g.arc(0, 0, radius, -0.7, 0.85, false); g.stroke();
        g.strokeColor = new Color(255, 255, 255, 160);
        g.lineWidth = 2;
        g.arc(0, 0, radius - 3, -0.55, 0.7, false); g.stroke();
        // 刀尖星点
        g.fillColor = new Color(255, 255, 255, 230);
        const tip = radius * 0.95;
        g.circle(Math.cos(0.2) * tip, Math.sin(0.2) * tip, 3); g.fill();
        tween(n)
            .to(0.16, { scale: new Vec3(1.15, 1.15, 1) }, { easing: 'quadOut' })
            .to(0.12, { scale: new Vec3(0.2, 0.2, 1) }, { easing: 'quadIn' })
            .call(() => CombatVfx._release(n))
            .start();
        CombatVfx.burst(parent, x + dirX * radius * 0.6, y + dirY * radius * 0.6, color, 5);
    }

    /** 技能施放主特效：多层环 + 星芒 */
    static skillCast(parent: Node, x: number, y: number, color: Color, kind: string) {
        if (!parent?.isValid) return;
        CombatVfx.ringPulse(parent, x, y, color, kind === 'nova' || kind === 'spin' ? 28 : 18, 0.36);
        CombatVfx.ringPulse(parent, x, y, new Color(255, 255, 255, 140), 12, 0.22);
        const n = CombatVfx._acquire(parent, 'SkillStar', 48, true);
        if (!n) {
            CombatVfx.burst(parent, x, y, color, 10);
            return;
        }
        n.setPosition(x, y, 0);
        n.setScale(0.4, 0.4, 1);
        const g = n.getComponent(Graphics)!;
        g.clear();
        g.fillColor = new Color(color.r, color.g, color.b, 230);
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            g.moveTo(0, 0);
            g.lineTo(Math.cos(a) * 6, Math.sin(a) * 6);
            g.lineTo(Math.cos(a + 0.2) * 18, Math.sin(a + 0.2) * 18);
            g.close(); g.fill();
        }
        g.fillColor = new Color(255, 255, 255, 220);
        g.circle(0, 0, 4); g.fill();
        tween(n)
            .to(0.2, { scale: new Vec3(1.3, 1.3, 1), angle: 40 }, { easing: 'quadOut' })
            .to(0.18, { scale: new Vec3(0.1, 0.1, 1), angle: 80 }, { easing: 'quadIn' })
            .call(() => CombatVfx._release(n))
            .start();
        CombatVfx.burst(parent, x, y, color, kind === 'nova' ? 14 : 8);
    }

    /** 通用圆形爆散 */
    static burst(parent: Node, x: number, y: number, color: Color, count = 8) {
        CombatVfx._spray(parent, x, y, color, count, 'dot');
    }

    /** 按怪种死亡：形状与色调不同，避免全员同一种小圆点 */
    static deathBurst(parent: Node, x: number, y: number, kind: string) {
        const style = CombatVfx._deathStyle(kind);
        CombatVfx._spray(parent, x, y, style.color, style.count, style.shape, style.dist);
        if (style.ring) CombatVfx._ring(parent, x, y, style.color);
    }

    /** 受击：短促闪白（挂视觉子节点，不改世界坐标） */
    static hitFlash(body: Node | null | undefined) {
        if (!body?.isValid) return;
        const flash = CombatVfx._acquire(body, 'HitFlash', 40);
        if (!flash) return;
        flash.setPosition(0, 0, 0);
        flash.setScale(1, 1, 1);
        const fg = flash.getComponent(Graphics)!;
        fg.clear();
        fg.fillColor = new Color(255, 255, 255, 160);
        fg.circle(0, 0, 18); fg.fill();
        tween(flash)
            .to(0.12, { scale: new Vec3(1.4, 1.4, 1) })
            .call(() => CombatVfx._release(flash))
            .start();
    }

    /**
     * 冲锋/射击预警：细线 + 淡锥，可读但不抢画面（#163）
     * 挂 WorldLayer，不改 Player / 怪世界坐标
     */
    static chargeWarn(parent: Node, x: number, y: number, dirX: number, dirY: number, len = 220) {
        if (!parent?.isValid) return;
        // 预警较重要：强制占一席（必要时挤掉空闲池）
        const n = CombatVfx._acquire(parent, 'ChargeWarn', len + 40, true);
        if (!n) return;
        n.setPosition(x, y, 0);
        n.setScale(1, 1, 1);
        const g = n.getComponent(Graphics)!;
        g.clear();
        const ang = Math.atan2(dirY, dirX);
        const tipX = Math.cos(ang) * len;
        const tipY = Math.sin(ang) * len;
        // 淡锥：半角很窄，透明度低，避免「实心红楔」
        const half = 0.09;
        const lx = Math.cos(ang - half) * len * 0.92;
        const ly = Math.sin(ang - half) * len * 0.92;
        const rx = Math.cos(ang + half) * len * 0.92;
        const ry = Math.sin(ang + half) * len * 0.92;
        g.fillColor = new Color(255, 90, 70, 38);
        g.moveTo(0, 0); g.lineTo(lx, ly); g.lineTo(rx, ry); g.close(); g.fill();
        // 中心细线 + 略亮描边
        g.lineWidth = 1.6;
        g.strokeColor = new Color(255, 140, 100, 90);
        g.moveTo(0, 0); g.lineTo(tipX, tipY); g.stroke();
        g.lineWidth = 2.2;
        g.strokeColor = new Color(255, 70, 55, 130);
        g.moveTo(0, 0); g.lineTo(tipX, tipY); g.stroke();
        // 原点小环，不再铺大红盘
        g.strokeColor = new Color(255, 100, 80, 100);
        g.lineWidth = 1.5;
        g.circle(0, 0, 10); g.stroke();
        g.fillColor = new Color(255, 90, 70, 28);
        g.circle(0, 0, 6); g.fill();
        tween(n)
            .to(0.32, { scale: new Vec3(1.02, 1.02, 1) })
            .to(0.1, { scale: new Vec3(0.35, 0.35, 1) })
            .call(() => CombatVfx._release(n))
            .start();
    }

    /** 弹道拖尾：预算紧时直接跳过（最高频） */
    static trailDot(parent: Node, x: number, y: number, color: Color, size = 4) {
        if (!parent?.isValid) return;
        if (CombatVfx._alive >= CombatVfx.MAX_ALIVE * 0.85) return;
        const n = CombatVfx._acquire(parent, 'Trail', size * 2);
        if (!n) return;
        n.setPosition(x, y, 0);
        n.setScale(1, 1, 1);
        const g = n.getComponent(Graphics)!;
        g.clear();
        g.fillColor = new Color(color.r, color.g, color.b, 160);
        g.circle(0, 0, size); g.fill();
        tween(n)
            .to(0.22, { scale: new Vec3(0.1, 0.1, 1) }, { easing: 'quadOut' })
            .call(() => CombatVfx._release(n))
            .start();
    }

    /** 受击时抖一下 WorldLayer，再立刻对齐回正确滚动位置 */
    static shakeWorld(intensity = 10) {
        const wl = WorldBridge.worldLayer;
        if (!wl?.isValid) return;
        const baseX = -WorldBridge.camX;
        const baseY = -WorldBridge.camY;
        wl.setPosition(baseX + (Math.random() - 0.5) * intensity,
                       baseY + (Math.random() - 0.5) * intensity, 0);
        tween(wl)
            .to(0.08, { position: new Vec3(baseX, baseY, 0) })
            .call(() => {
                if (wl.isValid) wl.setPosition(-WorldBridge.camX, -WorldBridge.camY, 0);
            })
            .start();
    }

    private static _deathStyle(kind: string): {
        color: Color; count: number; shape: 'dot' | 'slash' | 'shard' | 'spark';
        dist: number; ring: boolean;
    } {
        switch (kind) {
            case 'slime':
                return { color: new Color(90, 200, 90, 255), count: 7, shape: 'dot', dist: 34, ring: false };
            case 'fast':
                return { color: new Color(80, 210, 240, 255), count: 9, shape: 'slash', dist: 48, ring: false };
            case 'tank':
                return { color: new Color(200, 90, 70, 255), count: 10, shape: 'shard', dist: 40, ring: true };
            case 'archer':
                return { color: new Color(255, 160, 70, 255), count: 8, shape: 'slash', dist: 42, ring: false };
            case 'wisp':
                return { color: new Color(170, 220, 255, 255), count: 10, shape: 'spark', dist: 50, ring: true };
            case 'bat':
                return { color: new Color(140, 90, 180, 255), count: 9, shape: 'slash', dist: 44, ring: false };
            case 'beetle':
                return { color: new Color(140, 100, 50, 255), count: 8, shape: 'shard', dist: 36, ring: true };
            case 'toad':
                return { color: new Color(70, 190, 90, 255), count: 9, shape: 'dot', dist: 40, ring: false };
            case 'crystal':
                return { color: new Color(170, 230, 255, 255), count: 11, shape: 'shard', dist: 48, ring: true };
            case 'golem':
                return { color: new Color(150, 140, 160, 255), count: 10, shape: 'shard', dist: 42, ring: true };
            case 'moth':
                return { color: new Color(230, 190, 100, 255), count: 8, shape: 'spark', dist: 40, ring: false };
            case 'raven':
                return { color: new Color(70, 70, 95, 255), count: 9, shape: 'slash', dist: 46, ring: false };
            case 'mosquito':
                return { color: new Color(90, 190, 70, 255), count: 8, shape: 'spark', dist: 38, ring: false };
            case 'specter':
                return { color: new Color(200, 230, 255, 255), count: 11, shape: 'spark', dist: 52, ring: true };
            case 'bone':
                return { color: new Color(240, 230, 200, 255), count: 10, shape: 'shard', dist: 44, ring: true };
            case 'mage':
                return { color: new Color(180, 100, 255, 255), count: 9, shape: 'spark', dist: 46, ring: true };
            case 'dragon':
                return { color: new Color(255, 90, 40, 255), count: 13, shape: 'spark', dist: 58, ring: true };
            case 'bomb':
                return { color: new Color(255, 160, 40, 255), count: 14, shape: 'shard', dist: 64, ring: true };
            case 'boss':
                return { color: new Color(255, 210, 80, 255), count: 14, shape: 'shard', dist: 70, ring: true };
            default:
                return { color: new Color(200, 200, 200, 255), count: 6, shape: 'dot', dist: 32, ring: false };
        }
    }

    private static _spray(
        parent: Node, x: number, y: number, color: Color, count: number,
        shape: 'dot' | 'slash' | 'shard' | 'spark', distMul = 36,
    ) {
        if (!parent?.isValid) return;
        const room = Math.max(0, CombatVfx.MAX_ALIVE - CombatVfx._alive);
        const nCount = Math.min(count, Math.max(2, Math.floor(room * 0.35)));
        for (let i = 0; i < nCount; i++) {
            const a = (Math.PI * 2 * i) / nCount + Math.random() * 0.35;
            const dist = distMul * 0.7 + Math.random() * distMul * 0.5;
            const n = CombatVfx._acquire(parent, 'Fx', 14);
            if (!n) break;
            n.setPosition(x, y, 0);
            n.setScale(1, 1, 1);
            n.angle = 0;
            const g = n.getComponent(Graphics)!;
            g.clear();
            g.fillColor = new Color(color.r, color.g, color.b, 230);
            if (shape === 'slash') {
                g.rect(-1, -6, 2, 12); g.fill();
                n.angle = (a * 180) / Math.PI;
            } else if (shape === 'shard') {
                g.moveTo(0, 7); g.lineTo(5, -5); g.lineTo(-5, -5); g.close(); g.fill();
            } else if (shape === 'spark') {
                g.circle(0, 0, 2.5); g.fill();
                g.strokeColor = new Color(255, 255, 255, 180);
                g.lineWidth = 1.5;
                g.moveTo(-5, 0); g.lineTo(5, 0); g.stroke();
                g.moveTo(0, -5); g.lineTo(0, 5); g.stroke();
            } else {
                g.circle(0, 0, 3 + Math.random() * 3); g.fill();
            }
            tween(n)
                .to(0.34, {
                    position: new Vec3(x + Math.cos(a) * dist, y + Math.sin(a) * dist, 0),
                    scale: new Vec3(0.05, 0.05, 1),
                }, { easing: 'quadOut' })
                .call(() => CombatVfx._release(n))
                .start();
        }
    }

    /** 可调半径的扩散光环（清房 / 连杀 / 拾取） */
    static ringPulse(parent: Node, x: number, y: number, color: Color, startR = 14, duration = 0.32) {
        if (!parent?.isValid) return;
        const n = CombatVfx._acquire(parent, 'RingPulse', startR * 6);
        if (!n) return;
        n.setPosition(x, y, 0);
        n.setScale(1, 1, 1);
        const g = n.getComponent(Graphics)!;
        g.clear();
        g.strokeColor = new Color(color.r, color.g, color.b, color.a);
        g.lineWidth = 4;
        g.circle(0, 0, startR); g.stroke();
        const grow = 2.6 + startR / 40;
        tween(n)
            .to(duration, { scale: new Vec3(grow, grow, 1) }, { easing: 'quadOut' })
            .call(() => CombatVfx._release(n))
            .start();
    }

    private static _ring(parent: Node, x: number, y: number, color: Color) {
        CombatVfx.ringPulse(parent, x, y, color, 12, 0.3);
    }

    private static _acquire(parent: Node, name: string, size: number, force = false): Node | null {
        if (!force && CombatVfx._alive >= CombatVfx.MAX_ALIVE && CombatVfx._free.length === 0) {
            return null;
        }
        let n = CombatVfx._free.pop();
        if (!n || !n.isValid) {
            n = new Node(name);
            n.addComponent(UITransform).setContentSize(size, size);
            n.addComponent(Graphics);
        } else {
            n.name = name;
            n.getComponent(UITransform)?.setContentSize(size, size);
        }
        tween(n).stop();
        n.active = true;
        n.setParent(parent);
        CombatVfx._alive++;
        return n;
    }

    private static _release(n: Node) {
        if (!n?.isValid) return;
        tween(n).stop();
        n.removeFromParent();
        n.active = false;
        n.angle = 0;
        CombatVfx._alive = Math.max(0, CombatVfx._alive - 1);
        if (CombatVfx._free.length < CombatVfx.POOL_CAP) {
            CombatVfx._free.push(n);
        } else {
            n.destroy();
        }
    }
}
