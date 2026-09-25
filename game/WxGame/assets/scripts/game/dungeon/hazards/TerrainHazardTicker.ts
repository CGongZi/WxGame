import { _decorator, Component, Color } from 'cc';
import { WorldBridge } from '../WorldBridge';
import { DungeonLayout } from '../DungeonLayout';
import { GameFlow } from '../../../core/GameFlow';
import { eventBus } from '../../../core/EventBus';
import { CombatVfx } from '../../fx/CombatVfx';
import { EnemyRegistry } from '../../enemy/EnemyRegistry';
import { Hazards } from './HazardUtil';

const { ccclass } = _decorator;

/**
 * 熔岩 / 毒沼踩踏伤害：每 0.4s 查一次玩家所在格。
 * #140 机关不认主：地面怪站在熔岩 / 毒沼上同样掉血（1.5 倍），飞行怪免疫。
 */
@ccclass('TerrainHazardTicker')
export class TerrainHazardTicker extends Component {
    private _acc = 0;
    private _clock = 0;

    update(dt: number) {
        if (!GameFlow.isPlaying) return;
        this._acc += dt;
        if (this._acc < 0.4) return;
        this._acc = 0;
        const L = DungeonLayout.current;
        if (!L) return;
        const poison = L.hazardTint === 'poison';
        const parent = WorldBridge.worldLayer;
        const col = poison ? new Color(120, 220, 90, 255) : new Color(255, 140, 40, 255);

        if (L.isLavaAt(WorldBridge.x, WorldBridge.y)) {
            Hazards.hurt(
                Hazards.floorDmg(poison ? 2 : 3),
                poison ? 'poison' : 'lava',
                poison ? '☠ 毒沼腐蚀，快离开绿水' : '🔥 熔岩灼烫，别站在红地上',
            );
            if (parent?.isValid) CombatVfx.burst(parent, WorldBridge.x, WorldBridge.y - 20, col, 4);
        }

        // 怪踩危险地形（#141：只打醒着的怪，每怪 1s 一跳）
        let hitAny = false;
        this._clock += 0.4;
        for (const e of EnemyRegistry.getAlive()) {
            const p = e.node.position;
            if (!L.isLavaAt(p.x, p.y) || !Hazards.canHurtEnemy(e, this._clock)) continue;
            e.takeDamage(Hazards.floorDmg(poison ? 2 : 3));
            if (parent?.isValid) CombatVfx.burst(parent, p.x, p.y - 16, col, 3);
            hitAny = true;
        }
        if (hitAny && !Hazards.tipped('terrain_enemy')) {
            eventBus.emit('show-tip', { text: poison ? '☠ 怪站毒沼也会中毒 · 把它们引进绿水' : '🔥 怪踩熔岩也会烧 · 绕着红地打' });
        }
    }
}
