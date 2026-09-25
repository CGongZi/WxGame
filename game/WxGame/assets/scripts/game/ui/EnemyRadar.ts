import { _decorator, Component, Node, Graphics, Color, UITransform, Layers, find } from 'cc';
import { EnemyRegistry } from '../enemy/EnemyRegistry';
import { WorldBridge } from '../dungeon/WorldBridge';
import { GameFlow } from '../../core/GameFlow';

const { ccclass } = _decorator;

/**
 * EnemyRadar —— 屏外怪方位 + 清房后传送门方位（R7）
 * 挂到 HUD 节点下即可
 */
@ccclass('EnemyRadar')
export class EnemyRadar extends Component {

    private _pool: Node[] = [];
    private _portalMarker: Node | null = null;
    private _portalNode: Node | null = null;
    private _portalScanCd = 0;
    private _portalPulse = 0;
    private _root: Node | null = null;

    private readonly MARGIN = 48;
    private readonly INSET = 80;

    onLoad() {
        const root = new Node('RadarRoot');
        root.layer = Layers.Enum.UI_2D;
        root.setParent(this.node);
        root.setPosition(0, 0, 0);
        root.addComponent(UITransform).setContentSize(1334, 750);
        this._root = root;
    }

    update() {
        if (!GameFlow.isPlaying || !this._root?.isValid) {
            this._hideAll();
            return;
        }
        this._refresh();
        this._refreshPortal();
    }

    private _refresh() {
        const alive = EnemyRegistry.getAlive();
        const hw = WorldBridge.viewHalfW - this.MARGIN;
        const hh = WorldBridge.viewHalfH - this.MARGIN;
        const inW = WorldBridge.viewHalfW - this.INSET;
        const inH = WorldBridge.viewHalfH - this.INSET;

        let used = 0;
        for (const e of alive) {
            if (!e.node?.isValid) continue;
            const sx = e.node.position.x - WorldBridge.camX;
            const sy = e.node.position.y - WorldBridge.camY;

            if (Math.abs(sx) <= inW && Math.abs(sy) <= inH) continue;

            const edge = this._clampToEdge(sx, sy, hw, hh);
            const ang = Math.atan2(sy, sx);
            const isBoss = e.node.name.toLowerCase().includes('boss');
            const marker = this._take(used++);
            marker.active = true;
            marker.setPosition(edge.x, edge.y, 0);
            marker.angle = ang * (180 / Math.PI);
            this._paint(marker, isBoss ? 'boss' : 'enemy');
        }

        for (let i = used; i < this._pool.length; i++) {
            this._pool[i].active = false;
        }
    }

    /** 清房后：屏外传送门用青箭头指引 */
    private _refreshPortal() {
        this._portalScanCd -= 0.016;
        if (this._portalScanCd <= 0 || !this._portalNode?.isValid) {
            this._portalScanCd = 0.35;
            this._portalNode = this._findPortal();
        }
        const portal = this._portalNode;
        if (!portal?.isValid || EnemyRegistry.aliveCount > 0) {
            if (this._portalMarker) this._portalMarker.active = false;
            return;
        }
        const sx = portal.position.x - WorldBridge.camX;
        const sy = portal.position.y - WorldBridge.camY;
        const inW = WorldBridge.viewHalfW - this.INSET;
        const inH = WorldBridge.viewHalfH - this.INSET;
        if (Math.abs(sx) <= inW && Math.abs(sy) <= inH) {
            if (this._portalMarker) this._portalMarker.active = false;
            return;
        }
        const hw = WorldBridge.viewHalfW - this.MARGIN;
        const hh = WorldBridge.viewHalfH - this.MARGIN;
        const edge = this._clampToEdge(sx, sy, hw, hh);
        const m = this._ensurePortalMarker();
        m.active = true;
        m.setPosition(edge.x, edge.y, 0);
        m.angle = Math.atan2(sy, sx) * (180 / Math.PI);
        this._portalPulse += 0.08;
        const s = 1 + Math.sin(this._portalPulse) * 0.18;
        m.setScale(s, s, 1);
        this._paint(m, 'portal');
    }

    private _findPortal(): Node | null {
        const wl = WorldBridge.worldLayer;
        const p = wl?.getChildByName('Portal')
            ?? find('Canvas/WorldLayer/Portal')
            ?? find('Canvas/Portal');
        return p?.isValid ? p : null;
    }

    private _ensurePortalMarker(): Node {
        if (this._portalMarker?.isValid) return this._portalMarker;
        const n = new Node('RadarPortal');
        n.layer = Layers.Enum.UI_2D;
        n.setParent(this._root!);
        n.addComponent(UITransform).setContentSize(40, 40);
        n.addComponent(Graphics);
        n.active = false;
        this._portalMarker = n;
        return n;
    }

    private _clampToEdge(dx: number, dy: number, hw: number, hh: number): { x: number; y: number } {
        const ax = Math.abs(dx);
        const ay = Math.abs(dy);
        if (ax < 0.001 && ay < 0.001) return { x: hw, y: 0 };
        const tx = ax > 0.001 ? hw / ax : Number.POSITIVE_INFINITY;
        const ty = ay > 0.001 ? hh / ay : Number.POSITIVE_INFINITY;
        const t = Math.min(tx, ty);
        return { x: dx * t, y: dy * t };
    }

    private _take(i: number): Node {
        while (this._pool.length <= i) {
            const n = new Node(`Radar_${this._pool.length}`);
            n.layer = Layers.Enum.UI_2D;
            n.setParent(this._root!);
            n.addComponent(UITransform).setContentSize(36, 36);
            n.addComponent(Graphics);
            n.active = false;
            this._pool.push(n);
        }
        return this._pool[i];
    }

    private _paint(n: Node, kind: 'enemy' | 'boss' | 'portal') {
        const g = n.getComponent(Graphics)!;
        g.clear();
        const col = kind === 'boss' ? new Color(255, 80, 80, 230)
            : kind === 'portal' ? new Color(100, 220, 255, 240)
            : new Color(255, 200, 80, 210);
        g.fillColor = col;
        g.moveTo(14, 0);
        g.lineTo(-10, 9);
        g.lineTo(-4, 0);
        g.lineTo(-10, -9);
        g.close();
        g.fill();
        g.strokeColor = new Color(255, 255, 255, 140);
        g.lineWidth = 1.5;
        g.moveTo(14, 0);
        g.lineTo(-10, 9);
        g.lineTo(-4, 0);
        g.lineTo(-10, -9);
        g.close();
        g.stroke();
        if (kind === 'portal') {
            g.fillColor = new Color(200, 255, 255, 200);
            g.circle(-2, 0, 3); g.fill();
        }
    }

    private _hideAll() {
        for (const n of this._pool) n.active = false;
        if (this._portalMarker) this._portalMarker.active = false;
    }
}
