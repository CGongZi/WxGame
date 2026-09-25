import { _decorator, Component, Node, find } from 'cc';
import { WeaponController, WeaponType, getWeapon } from './WeaponController';
import { WeaponPickup } from './WeaponPickup';
import { ItemPickup } from '../item/ItemPickup';
import { ConfigStore } from '../../core/ConfigStore';
import { eventBus, GameEvents } from '../../core/EventBus';
import { FlowEvents } from '../../core/GameFlow';
import { DungeonManager } from '../dungeon/DungeonManager';
import { DungeonLayout } from '../dungeon/DungeonLayout';
import { rollDropRarity, scaleDropWeapon } from './WeaponRarity';

const { ccclass, property } = _decorator;

const SPOTS: Array<[number, number]> = [
    [-180, 200], [200, -180], [-100, -280], [260, 160], [40, 240], [-260, 40],
];
const ITEM_SPOTS: Array<[number, number]> = [
    [120, 180], [-220, -120], [180, 40], [-40, 260],
];

/**
 * 武器/道具落点：优先非起始厅刷点，且远离出生点。
 * 旧逻辑 `nearestFloor` 失败会回到 (0,0)，换层瞬间磁吸 → 自动换武。
 */
function placeAwayFromSpawn(i: number, spots: Array<[number, number]>): [number, number] {
    const L = DungeonLayout.current;
    const [fx, fy] = spots[i % spots.length];
    if (!L) return [fx, fy];
    const pts = L.spawnPoints(Math.max(i + 1, spots.length));
    if (pts[i] && Math.hypot(pts[i][0], pts[i][1]) >= 280) return pts[i];
    const p = L.nearestFloor(fx, fy, 420);
    if (Math.hypot(p.x, p.y) >= 220) return [p.x, p.y];
    // 再退一步：环上找远离原点的地板
    for (let k = 0; k < 8; k++) {
        const a = (i * 0.9 + k * 0.78);
        const q = L.nearestFloor(Math.cos(a) * 720, Math.sin(a) * 420, 360);
        if (Math.hypot(q.x, q.y) >= 280) return [q.x, q.y];
    }
    return [fx, fy];
}

/**
 * 按层刷武器掉落（#156）：层数越高稀有度越高、伤害越强；不刷开局武（dropWeight:0）。
 */
@ccclass('WeaponSpawner')
export class WeaponSpawner extends Component {

    @property(Node)
    playerNode: Node = null!;

    @property(Node)
    weaponControllerNode: Node = null!;

    private _ctrl: WeaponController | null = null;

    onLoad() {
        if (!this.playerNode) {
            this.playerNode = find('Canvas/Player') as Node;
        }
        if (!this.weaponControllerNode) {
            this.weaponControllerNode = this.playerNode;
        }
        this._ctrl = this.weaponControllerNode?.getComponent(WeaponController) ?? null;
        if (!this._ctrl) {
            console.warn('[WeaponSpawner] 找不到 WeaponController，请挂到 Player 上');
        }
        eventBus.on(GameEvents.FLOOR_STARTED, this._onFloorStarted, this);
        eventBus.on(FlowEvents.STATE, this._onFlow, this);
        this._clearPickups();
    }

    onDestroy() {
        eventBus.off(GameEvents.FLOOR_STARTED, this._onFloorStarted, this);
        eventBus.off(FlowEvents.STATE, this._onFlow, this);
    }

    private _onFlow(d: { state: string }) {
        if (d.state === 'lobby') this._clearPickups();
    }

    private _onFloorStarted(data: { floor: number; roomIndex: number }) {
        if (!this._ctrl) {
            this._ctrl = this.weaponControllerNode?.getComponent(WeaponController) ?? null;
        }
        this._clearPickups();
        const floor = data?.floor ?? DungeonManager.progress.floor ?? 1;
        const roomIndex = data?.roomIndex ?? 0;
        if (this._ctrl) {
            const ids = pickRoomWeapons(this._ctrl, floor, roomIndex);
            ids.forEach((id, i) => {
                const [x, y] = placeAwayFromSpawn(i, SPOTS);
                const tier = rollDropRarity(floor);
                const scaled = scaleDropWeapon(getWeapon(id), floor, tier);
                const n = new Node(`Pickup_${id}`);
                n.setParent(this.node);
                n.setPosition(x, y, 0);
                n.addComponent(WeaponPickup).init(id, this.playerNode, this._ctrl!, scaled);
            });
            if (ids.length > 0) {
                console.log(`[WeaponSpawner] 第${floor}层刷出: ${ids.join(',')}`);
            }
        }
        const items = pickRoomItems(floor, roomIndex);
        items.forEach((id, i) => {
            const [x, y] = placeAwayFromSpawn(i, ITEM_SPOTS);
            ItemPickup.spawn(this.node, x, y, id);
        });
        if (items.length > 0) {
            console.log(`[WeaponSpawner] 道具: ${items.join(',')}`);
        }
    }

    private _clearPickups() {
        const kids = this.node.children.slice();
        for (const c of kids) {
            if (c.getComponent(WeaponPickup) || c.getComponent(ItemPickup)) c.destroy();
        }
    }
}

export function pickRoomWeapons(
    ctrl: { isOwned: (id: WeaponType) => boolean },
    floor: number,
    roomIndex: number,
): WeaponType[] {
    // 开局武 dropWeight=0；其余都可刷。已持有的也可再刷（拾取变强化）。
    const eligible = ConfigStore.weaponList().filter(w => {
        if (floor < (w.unlockFloor ?? 1)) return false;
        if (w.dropWeight !== undefined && w.dropWeight <= 0) return false;
        return true;
    });
    if (eligible.length === 0) return [];

    const isBoss = roomIndex % ConfigStore.dungeon().roomsPerFloor === ConfigStore.dungeon().roomsPerFloor - 1;
    // #156 掉落更密：每房至少 1，高层/Boss 更多
    let count = floor <= 1 ? 1 : floor <= 3 ? 2 : 3;
    if (isBoss) count = Math.min(eligible.length, count + 1);
    count = Math.min(count, eligible.length, SPOTS.length);

    const weighted = eligible.map((w) => {
        const rarity = w.rarity ?? 'white';
        const base = w.dropWeight
            ?? (rarity === 'red' || rarity === 'gold' ? 2
                : rarity === 'purple' || rarity === 'epic' ? 3
                : rarity === 'blue' || rarity === 'rare' ? 6
                : rarity === 'green' ? 8 : 10);
        const ownedBias = ctrl.isOwned(w.id as WeaponType) ? 0.45 : 1;
        const floorBias = 1 + Math.max(0, floor - (w.unlockFloor ?? 1)) * 0.08;
        return { id: w.id as WeaponType, weight: Math.max(0.05, base * floorBias * ownedBias) };
    });

    const picked: WeaponType[] = [];
    const pool = weighted.slice();
    for (let n = 0; n < count && pool.length > 0; n++) {
        const total = pool.reduce((s, p) => s + p.weight, 0);
        let r = Math.random() * total;
        let choice = 0;
        for (let i = 0; i < pool.length; i++) {
            r -= pool[i].weight;
            if (r <= 0) { choice = i; break; }
        }
        picked.push(pool[choice].id);
        pool.splice(choice, 1);
    }
    return picked;
}

export function pickRoomItems(floor: number, roomIndex: number): string[] {
    const all = ConfigStore.items();
    if (all.length === 0) return [];
    const isBoss = roomIndex % ConfigStore.dungeon().roomsPerFloor === ConfigStore.dungeon().roomsPerFloor - 1;
    let count = floor <= 1 ? (Math.random() < 0.7 ? 1 : 0) : (Math.random() < 0.85 ? 1 : 2);
    if (isBoss) count = Math.max(count, 1) + (Math.random() < 0.5 ? 1 : 0);
    count = Math.min(count, ITEM_SPOTS.length, all.length);
    const pool = all.slice();
    const out: string[] = [];
    for (let i = 0; i < count && pool.length > 0; i++) {
        const weights = pool.map(it => {
            if (it.kind === 'heal') return 3;
            if (it.id === 'bomb' && floor < 2) return 0.3;
            if (it.kind === 'buff') return 1.2 + floor * 0.15;
            return 1;
        });
        const total = weights.reduce((s, w) => s + w, 0);
        let r = Math.random() * total;
        let choice = 0;
        for (let j = 0; j < pool.length; j++) {
            r -= weights[j];
            if (r <= 0) { choice = j; break; }
        }
        out.push(pool[choice].id);
        pool.splice(choice, 1);
    }
    return out;
}
