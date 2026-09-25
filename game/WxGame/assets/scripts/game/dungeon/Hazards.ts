import { Node } from 'cc';
import { DungeonLayout } from './DungeonLayout';
import { SpikeTrap } from './hazards/SpikeTrap';
import { PressurePlate } from './hazards/PressurePlate';
import { WallTurret } from './hazards/WallTurret';
import { BreakableCrate } from './hazards/BreakableCrate';
import { Torch } from './hazards/Torch';
import { TerrainHazardTicker } from './hazards/TerrainHazardTicker';
import { ShrineObject } from './hazards/ShrineObject';

export { Hazards } from './hazards/HazardUtil';

/**
 * 地牢机关入口（#125）。各机关组件在 `dungeon/hazards/` 一文件一组件（Cocos 硬限制：
 * 一个脚本只能有一个 Component）。全部挂 WorldLayer 子节点（名字前缀 Hazard_），
 * FloorRenderer 换房时按前缀清理。
 */
export function spawnHazards(worldLayer: Node, L: DungeonLayout) {
    let idx = 0;
    for (const f of L.features) {
        if (f.kind === 'prop') continue; // 主题装饰由 FloorRenderer 画
        const x = DungeonLayout.tileX(f.c);
        const y = DungeonLayout.tileY(f.r);
        const n = new Node(`Hazard_${f.kind}_${idx++}`);
        n.layer = worldLayer.layer;
        n.setParent(worldLayer);
        n.setPosition(x, y, 0);
        switch (f.kind) {
            case 'spike': n.addComponent(SpikeTrap).init((f.c * 0.37 + f.r * 0.61) % 2.4); break;
            case 'plate': n.addComponent(PressurePlate).init(false); break;
            case 'trap_plate': n.addComponent(PressurePlate).init(true); break;
            case 'turret': n.addComponent(WallTurret).init(f.dir ?? 0); break;
            case 'crate': n.addComponent(BreakableCrate).init(); break;
            case 'torch': n.addComponent(Torch).init(); break;
            case 'shrine': n.addComponent(ShrineObject).init(); break;
        }
    }
    const ticker = new Node('Hazard_Ticker');
    ticker.setParent(worldLayer);
    ticker.addComponent(TerrainHazardTicker);
}
