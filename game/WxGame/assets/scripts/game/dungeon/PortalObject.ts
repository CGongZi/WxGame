import { _decorator, Component, Node, Graphics, UITransform,
         Color, tween, Vec3, Label } from 'cc';
import { eventBus, GameEvents } from '../../core/EventBus';
import { WorldBridge } from './WorldBridge';
import { CombatVfx } from '../fx/CombatVfx';

const { ccclass } = _decorator;

/**
 * PortalObject —— 清房后传送门
 * 出现：地裂光环 + 粒子爆散 + 旋臂成形
 * 待机：外环光柱 / 浮尘 / 脉冲（不改世界坐标）
 * 进入：吸入涡旋 → 坍缩隐藏 → 再发 ROOM_ENTERED
 */
@ccclass('PortalObject')
export class PortalObject extends Component {

    private _entered   = false;
    private _vanishing = false;
    private _radius    = 58;
    private _spinAngle = 0;
    private _g: Graphics | null = null;
    private _auraG: Graphics | null = null;
    private _pulseReady = false;
    private _spawnT = 0;
    private _beamNodes: Node[] = [];

    init(_playerNode: Node) {
        this._build();
        this._playAppear();
    }

    update(dt: number) {
        if (this._vanishing) {
            this._spinAngle += dt * 8;
            this._redrawCore();
            return;
        }
        if (this._entered) return;

        this._spinAngle += dt * 2.1;
        this._spawnT += dt;
        if (this._pulseReady) {
            const pulse = 1 + Math.sin(this._spinAngle * 2.2) * 0.05;
            this.node.setScale(pulse, pulse, 1);
        }
        this._redrawCore();
        this._redrawAura();
        this._tickBeams(dt);

        const dist = WorldBridge.distTo(this.node.position.x, this.node.position.y);
        if (dist > this._radius) return;

        this._entered = true;
        this._playVanish();
    }

    private _build() {
        const r = this._radius;
        this.node.addComponent(UITransform).setContentSize(r * 4, r * 4);

        // 底层光晕（不随主图 clear）
        const aura = new Node('Aura');
        aura.setParent(this.node);
        aura.setPosition(0, 0, 0);
        aura.addComponent(UITransform).setContentSize(r * 4, r * 4);
        this._auraG = aura.addComponent(Graphics);

        this._g = this.node.addComponent(Graphics);
        this._redrawCore();
        this._redrawAura();

        // 四根旋转光柱（子节点）
        for (let i = 0; i < 4; i++) {
            const b = new Node(`Beam_${i}`);
            b.setParent(this.node);
            b.addComponent(UITransform).setContentSize(12, r * 2.2);
            const g = b.addComponent(Graphics);
            g.fillColor = new Color(140, 220, 255, 90);
            g.rect(-3, 0, 6, r * 1.6); g.fill();
            g.fillColor = new Color(220, 250, 255, 160);
            g.rect(-1.5, 0, 3, r * 1.2); g.fill();
            this._beamNodes.push(b);
        }

        const lblNode = new Node('Label');
        lblNode.setParent(this.node);
        lblNode.setPosition(0, -r - 28, 0);
        lblNode.addComponent(UITransform).setContentSize(160, 24);
        const lbl = lblNode.addComponent(Label);
        lbl.string = '🌀 传送门';
        lbl.fontSize = 18;
        lbl.color = new Color(160, 220, 255, 230);
    }

    private _redrawCore() {
        if (!this._g) return;
        const g = this._g;
        const r = this._radius;
        const a = this._spinAngle;
        g.clear();

        // 外圈能量环
        g.strokeColor = new Color(80, 200, 255, 160);
        g.lineWidth = 3;
        g.circle(0, 0, r + 10); g.stroke();
        g.strokeColor = new Color(160, 120, 255, 120);
        g.lineWidth = 2;
        g.circle(0, 0, r + 18); g.stroke();

        // 多层核心
        g.fillColor = new Color(40, 30, 90, 200);
        g.circle(0, 0, r); g.fill();
        g.fillColor = new Color(60, 100, 220, 180);
        g.circle(0, 0, r - 10); g.fill();
        g.fillColor = new Color(120, 60, 220, 150);
        g.circle(0, 0, r - 22); g.fill();
        g.fillColor = new Color(220, 250, 255, 230);
        g.circle(0, 0, 12); g.fill();
        g.fillColor = new Color(255, 255, 255, 255);
        g.circle(0, 0, 5); g.fill();

        // 旋转弧臂
        for (let i = 0; i < 4; i++) {
            const start = a + (i * Math.PI * 2) / 4;
            g.lineWidth = 5;
            g.strokeColor = new Color(100, 230, 255, 210);
            g.arc(0, 0, r - 6, start, start + Math.PI * 0.45, false);
            g.stroke();
            g.lineWidth = 2;
            g.strokeColor = new Color(255, 255, 255, 160);
            g.arc(0, 0, r - 16, start + 0.2, start + Math.PI * 0.35, false);
            g.stroke();
        }

        // 轨道粒子
        for (let i = 0; i < 8; i++) {
            const pa = a * 1.6 + (i * Math.PI * 2) / 8;
            const rad = r - 8 + Math.sin(a * 3 + i) * 4;
            g.fillColor = new Color(180, 240, 255, 220);
            g.circle(Math.cos(pa) * rad, Math.sin(pa) * rad, 3.5); g.fill();
        }

        // 符文短线
        for (let i = 0; i < 6; i++) {
            const pa = -a * 0.7 + (i * Math.PI * 2) / 6;
            const x0 = Math.cos(pa) * (r + 6);
            const y0 = Math.sin(pa) * (r + 6);
            g.strokeColor = new Color(200, 180, 255, 180);
            g.lineWidth = 2;
            g.moveTo(x0, y0);
            g.lineTo(x0 + Math.cos(pa) * 10, y0 + Math.sin(pa) * 10);
            g.stroke();
        }
    }

    private _redrawAura() {
        if (!this._auraG) return;
        const g = this._auraG;
        const r = this._radius;
        const t = this._spawnT;
        g.clear();
        // 地面软光盘
        g.fillColor = new Color(60, 140, 255, 35 + Math.floor(Math.sin(t * 3) * 10));
        g.ellipse(0, -8, r * 1.5, r * 0.55); g.fill();
        g.fillColor = new Color(140, 80, 255, 25);
        g.ellipse(0, -6, r * 1.1, r * 0.4); g.fill();
        // 外扩散虚线环
        g.strokeColor = new Color(120, 220, 255, 50 + Math.floor(Math.sin(t * 2) * 20));
        g.lineWidth = 2;
        g.circle(0, 0, r + 28 + Math.sin(t * 2.5) * 4); g.stroke();
    }

    private _tickBeams(dt: number) {
        void dt;
        const r = this._radius;
        for (let i = 0; i < this._beamNodes.length; i++) {
            const b = this._beamNodes[i];
            if (!b?.isValid) continue;
            const ang = this._spinAngle + (i * Math.PI * 2) / 4;
            b.angle = (ang * 180) / Math.PI - 90;
            b.setPosition(Math.cos(ang) * (r * 0.15), Math.sin(ang) * (r * 0.15), 0);
            const flicker = 0.7 + Math.sin(this._spinAngle * 4 + i) * 0.3;
            b.setScale(flicker, 1, 1);
        }
    }

    /** 出现：世界层爆散 + 自身由小到大 + 地面环扩展 */
    private _playAppear() {
        const parent = this.node.parent;
        const x = this.node.position.x;
        const y = this.node.position.y;
        if (parent?.isValid) {
            CombatVfx.burst(parent, x, y, new Color(100, 200, 255, 255), 14);
            CombatVfx.burst(parent, x, y, new Color(180, 120, 255, 255), 8);
            CombatVfx.ringPulse(parent, x, y, new Color(120, 220, 255, 230), 24, 0.55);
            CombatVfx.ringPulse(parent, x, y, new Color(160, 100, 255, 180), 48, 0.75);
            // 落地冲击环（短促）
            this._spawnGroundRipple(parent, x, y);
        }

        this.node.setScale(0.05, 0.05, 1);
        this._pulseReady = false;
        tween(this.node)
            .to(0.28, { scale: new Vec3(1.35, 1.35, 1) }, { easing: 'backOut' })
            .to(0.18, { scale: new Vec3(0.92, 0.92, 1) })
            .to(0.12, { scale: new Vec3(1, 1, 1) })
            .call(() => { this._pulseReady = true; })
            .start();

        eventBus.emit('show-tip', { text: '🌀 传送门开启！' });
    }

    private _spawnGroundRipple(parent: Node, x: number, y: number) {
        const n = new Node('PortalRipple');
        n.setParent(parent);
        n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(200, 200);
        const g = n.addComponent(Graphics);
        g.strokeColor = new Color(100, 210, 255, 200);
        g.lineWidth = 5;
        g.ellipse(0, 0, 20, 10); g.stroke();
        tween(n)
            .to(0.55, { scale: new Vec3(4.5, 2.2, 1) }, { easing: 'quadOut' })
            .call(() => { if (n.isValid) n.destroy(); })
            .start();
    }

    /** 进入：加速旋转 + 吸入粒子 + 坍缩隐藏，再通知换层 */
    private _playVanish() {
        this._vanishing = true;
        this._pulseReady = false;
        const parent = this.node.parent;
        const x = this.node.position.x;
        const y = this.node.position.y;

        if (parent?.isValid) {
            CombatVfx.ringPulse(parent, x, y, new Color(255, 255, 255, 220), 30, 0.35);
            CombatVfx.burst(parent, x, y, new Color(180, 230, 255, 255), 16);
            CombatVfx.shakeWorld(10);
            this._spawnSuckDots(parent, x, y);
        }

        // 光柱收拢
        for (const b of this._beamNodes) {
            if (!b?.isValid) continue;
            tween(b).to(0.28, { scale: new Vec3(0.1, 0.2, 1) }).start();
        }

        tween(this.node)
            .to(0.22, { scale: new Vec3(1.4, 1.4, 1) }, { easing: 'sineOut' })
            .to(0.28, { scale: new Vec3(0.05, 0.05, 1) }, { easing: 'quadIn' })
            .call(() => {
                // 坍缩完成后再换层，让玩家看清隐藏特效
                eventBus.emit(GameEvents.ROOM_ENTERED, { direction: 'portal' });
                if (this.node.isValid) this.node.active = false;
            })
            .start();
    }

    private _spawnSuckDots(parent: Node, cx: number, cy: number) {
        for (let i = 0; i < 10; i++) {
            const ang = (Math.PI * 2 * i) / 10;
            const dist = 70 + Math.random() * 40;
            const n = new Node('Suck');
            n.setParent(parent);
            n.setPosition(cx + Math.cos(ang) * dist, cy + Math.sin(ang) * dist, 0);
            n.addComponent(UITransform).setContentSize(10, 10);
            const g = n.addComponent(Graphics);
            g.fillColor = new Color(160, 230, 255, 230);
            g.circle(0, 0, 3 + Math.random() * 2); g.fill();
            tween(n)
                .to(0.35, {
                    position: new Vec3(cx, cy, 0),
                    scale: new Vec3(0.1, 0.1, 1),
                }, { easing: 'quadIn' })
                .call(() => { if (n.isValid) n.destroy(); })
                .start();
        }
    }
}
