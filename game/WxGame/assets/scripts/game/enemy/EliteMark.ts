import { _decorator, Component, Node, Graphics, UITransform, Color, Label } from 'cc';
import { eventBus } from '../../core/EventBus';
import { GameFlow } from '../../core/GameFlow';
import { DropTables } from '../item/DropTables';
import { CombatVfx } from '../fx/CombatVfx';
import { Haptic } from '../../core/Haptic';
import type { CombatEnemy } from './EnemyRegistry';

const { ccclass } = _decorator;

/**
 * EliteMark —— 精英怪标记（#122）
 * 视觉：金色光环 + 👑（挂子节点，不改怪物逻辑坐标）；死亡额外掉落（读 drops.elite）。
 * 任何怪物类都可套用：只依赖 CombatEnemy.isDead。
 */
@ccclass('EliteMark')
export class EliteMark extends Component {
    /** 场上存活精英数（HUD 目标条读取） */
    static alive = 0;

    private _enemy: CombatEnemy | null = null;
    private _aura: Node | null = null;
    private _t = 0;
    private _counted = false;

    static mark(node: Node, enemy: CombatEnemy, size: number) {
        if (node.getComponent(EliteMark)) return;
        const m = node.addComponent(EliteMark);
        m._enemy = enemy;
        m._build(size);
        EliteMark.alive++;
        m._counted = true;
    }

    private _build(size: number) {
        const r = size * 0.62;
        const aura = new Node('EliteAura');
        aura.setParent(this.node);
        aura.setSiblingIndex(0);
        aura.setPosition(0, -size * 0.05, 0);
        aura.addComponent(UITransform).setContentSize(r * 2 + 8, r * 2 + 8);
        const g = aura.addComponent(Graphics);
        g.fillColor = new Color(255, 200, 80, 40);
        g.circle(0, 0, r); g.fill();
        g.strokeColor = new Color(255, 215, 90, 210);
        g.lineWidth = 3;
        g.circle(0, 0, r); g.stroke();
        g.strokeColor = new Color(255, 240, 160, 120);
        g.lineWidth = 1.5;
        g.circle(0, 0, r + 6); g.stroke();
        this._aura = aura;

        const crown = new Node('EliteCrown');
        crown.setParent(this.node);
        crown.setPosition(0, size * 0.62, 0);
        crown.addComponent(UITransform).setContentSize(40, 24);
        const lbl = crown.addComponent(Label);
        lbl.string = '👑';
        lbl.fontSize = 18;
        lbl.horizontalAlign = 1;

        const tag = new Node('EliteTag');
        tag.setParent(this.node);
        tag.setPosition(0, size * 0.62 + 18, 0);
        tag.addComponent(UITransform).setContentSize(60, 16);
        const tl = tag.addComponent(Label);
        tl.string = '精英';
        tl.fontSize = 11;
        tl.color = new Color(255, 220, 120, 255);
        tl.horizontalAlign = 1;

        // 体型略放大（视觉子节点缩放，不改逻辑坐标）
        const body = this.node.getChildByName('Body');
        if (body) {
            const s = body.scale;
            body.setScale(s.x * 1.18, s.y * 1.18, s.z);
        }
    }

    update(dt: number) {
        if (!this._aura?.isValid) return;
        this._t += dt;
        const p = 1 + Math.sin(this._t * 3.4) * 0.07;
        this._aura.setScale(p, p, 1);
    }

    onDestroy() {
        if (this._counted) {
            this._counted = false;
            EliteMark.alive = Math.max(0, EliteMark.alive - 1);
        }
        if (!this._enemy?.isDead || !GameFlow.isPlaying) return;
        const parent = this.node.parent;
        if (!parent?.isValid) return;
        const x = this.node.position.x;
        const y = this.node.position.y;
        DropTables.rollOnKill(parent, x, y, 'elite');
        CombatVfx.ringPulse(parent, x, y, new Color(255, 210, 90, 230), 30, 0.5);
        CombatVfx.burst(parent, x, y, new Color(255, 230, 140, 255), 14);
        Haptic.heavy();
        eventBus.emit('show-tip', { text: '👑 精英击破 · 掉落丰厚！' });
    }
}
