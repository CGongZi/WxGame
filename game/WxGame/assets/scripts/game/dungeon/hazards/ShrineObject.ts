import { _decorator, Component, Graphics, UITransform, Color, find } from 'cc';
import { MAP_TILE } from '../MapConstants';
import { GameFlow } from '../../../core/GameFlow';
import { eventBus } from '../../../core/EventBus';
import { Haptic } from '../../../core/Haptic';
import { CombatVfx } from '../../fx/CombatVfx';
import { Hazards } from './HazardUtil';
import { BuffPick } from '../../ui/BuffPick';

const { ccclass } = _decorator;

/** #167 神龛：靠近交互 → 三选一增益（每座一次） */
@ccclass('ShrineObject')
export class ShrineObject extends Component {
    private _g: Graphics | null = null;
    private _used = false;
    private _t = 0;

    init() {
        this.node.addComponent(UITransform).setContentSize(MAP_TILE * 1.2, MAP_TILE * 1.4);
        this._g = this.node.addComponent(Graphics);
        this._paint(false);
    }

    update(dt: number) {
        if (this._used || !GameFlow.isPlaying || GameFlow.isCombatFrozen) return;
        if (BuffPick.isOpen) return;
        this._t += dt;
        this._paint(Math.floor(this._t * 4) % 2 === 1);
        if (!Hazards.playerNear(this.node.position.x, this.node.position.y, 36)) return;
        this._used = true;
        this._paint(false, true);
        this._open();
    }

    private _open() {
        const parent = this.node.parent;
        const x = this.node.position.x;
        const y = this.node.position.y;
        if (parent?.isValid) {
            CombatVfx.ringPulse(parent, x, y, new Color(255, 200, 90, 220), 28, 0.45);
            CombatVfx.burst(parent, x, y, new Color(255, 220, 140, 255), 10);
        }
        Haptic.heavy();
        eventBus.emit('show-tip', { text: '⛩ 神龛回应了你…' });
        const canvas = find('Canvas');
        if (canvas) BuffPick.show(canvas);
    }

    private _paint(glow: boolean, sunk = false) {
        const g = this._g;
        if (!g) return;
        g.clear();
        const base = sunk ? new Color(50, 40, 60, 255) : new Color(70, 55, 90, 255);
        const rim = glow ? new Color(255, 210, 100, 255) : new Color(200, 160, 70, 255);
        g.fillColor = base;
        g.roundRect(-22, -18, 44, 28, 6); g.fill();
        g.fillColor = rim;
        g.moveTo(0, 36); g.lineTo(18, 8); g.lineTo(-18, 8); g.close(); g.fill();
        g.fillColor = new Color(255, 240, 180, glow ? 220 : 140);
        g.circle(0, 16, 5); g.fill();
        if (!sunk) {
            g.strokeColor = new Color(255, 255, 255, 90);
            g.lineWidth = 1.5;
            g.circle(0, 0, 26); g.stroke();
        }
    }
}
