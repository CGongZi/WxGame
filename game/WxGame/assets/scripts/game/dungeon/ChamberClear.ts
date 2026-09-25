import { Color } from 'cc';
import { DungeonLayout } from './DungeonLayout';
import { WorldBridge } from './WorldBridge';
import { PlayerStats } from '../../core/PlayerStats';
import { eventBus } from '../../core/EventBus';
import { Haptic } from '../../core/Haptic';
import { CombatVfx } from '../fx/CombatVfx';
import { LootDrop } from '../item/LootDrop';
import { DropTables } from '../item/DropTables';
import type { CombatEnemy } from '../enemy/EnemyRegistry';

/**
 * #140 厅室肃清奖励（本作特色节奏）——
 * 每只怪记住"出生厅"；该厅所有怪死光的一瞬：护甲立刻回满 + 厅中央喷金币 + 提示。
 * 与整房清空（传送门 / 商店）是两层节奏：厅级小奖励让"一厅一厅推进"有正反馈，
 * 同时护甲回满鼓励玩家主动清厅而不是一路跑到 Boss。
 * Boss 厅不发（Boss 死亡走 ROOM_CLEARED 大奖励）。
 */
export class ChamberClear {
    private static _origin = new Map<CombatEnemy, number>();
    private static _cleared = new Set<number>();
    private static _acc = 0;

    static reset() {
        ChamberClear._origin.clear();
        ChamberClear._cleared.clear();
        ChamberClear._acc = 0;
    }

    /** 刷怪时登记出生厅（无布局 / 起始厅 / Boss 厅不登记） */
    static track(enemy: CombatEnemy | null, x: number, y: number) {
        const L = DungeonLayout.current;
        if (!enemy || !L) return;
        const idx = L.chamberIndexAt(x, y);
        if (idx < 0) return;
        const ch = L.chambers[idx];
        if (!ch || ch.kind === 'start' || ch.kind === 'boss') return;
        ChamberClear._origin.set(enemy, idx);
    }

    /** FloorRenderer.lateUpdate 每帧调用；内部 0.25s 轮询一次 */
    static tick(dt: number) {
        ChamberClear._acc += dt;
        if (ChamberClear._acc < 0.25) return;
        ChamberClear._acc = 0;
        const L = DungeonLayout.current;
        if (!L || ChamberClear._origin.size === 0) return;

        const alive = new Map<number, number>();
        const total = new Map<number, number>();
        for (const [e, idx] of ChamberClear._origin) {
            total.set(idx, (total.get(idx) ?? 0) + 1);
            if (e.isValid && !e.isDead) alive.set(idx, (alive.get(idx) ?? 0) + 1);
        }
        for (const [idx, n] of total) {
            if (n <= 0 || ChamberClear._cleared.has(idx)) continue;
            if ((alive.get(idx) ?? 0) > 0) continue;
            ChamberClear._cleared.add(idx);
            ChamberClear._reward(L, idx, n);
        }
    }

    private static _reward(L: DungeonLayout, idx: number, killed: number) {
        const ch = L.chambers[idx];
        const parent = WorldBridge.worldLayer;
        PlayerStats.I.refillArmor();
        const challenge = ch?.kind === 'challenge';
        const coins = Math.min(challenge ? 16 : 12, (challenge ? 4 : 2) + Math.floor(killed * 0.8) + Math.floor(L.floor * 0.5));
        if (parent?.isValid && ch) {
            const cx = DungeonLayout.tileX(ch.cx);
            const cy = DungeonLayout.tileY(ch.cy);
            // 金币按环形喷在厅中央附近的地板上
            const piles = Math.min(4, coins);
            for (let i = 0; i < piles; i++) {
                const a = (i / piles) * Math.PI * 2 + Math.random() * 0.6;
                const p = L.nearestFloor(cx + Math.cos(a) * 60, cy + Math.sin(a) * 40);
                const amount = Math.floor(coins / piles) + (i < coins % piles ? 1 : 0);
                if (amount > 0) LootDrop.spawn(parent, p.x, p.y, 'coin', amount, 0);
            }
            CombatVfx.ringPulse(parent, cx, cy, new Color(255, 225, 120, 200), 40, 0.5);
            CombatVfx.ringPulse(parent, WorldBridge.x, WorldBridge.y, new Color(210, 220, 235, 220), 22, 0.32);
            if (challenge) DropTables.rollOnKill(parent, cx, cy, 'elite');
        }
        Haptic.light();
        eventBus.emit('show-tip', {
            text: challenge
                ? `⛩ 挑战肃清 · ⛨ 护甲回满 · 🪙 +${coins} · 额外战利品`
                : `⚔ 厅室肃清 · ⛨ 护甲回满 · 🪙 +${coins}`,
        });
    }
}
