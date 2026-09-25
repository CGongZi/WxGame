import { Node, Color, UITransform, tween, Vec3, Label, find } from 'cc';
import { eventBus, GameEvents } from '../../core/EventBus';
import { WorldBridge } from '../dungeon/WorldBridge';
import { CombatVfx } from './CombatVfx';
import { GameFlow } from '../../core/GameFlow';
import { Haptic } from '../../core/Haptic';

/**
 * RunJuice —— 局内节奏反馈（连杀 / 清房 / 拾取闪光）
 * 特效挂 WorldLayer；不改 Player 世界坐标 / Camera / ViewZoom。
 */
export class RunJuice {
    private static _wired = false;
    private static _streak = 0;
    private static _lastKillAt = 0;
    private static readonly STREAK_GAP = 2.2;

    static ensure() {
        if (RunJuice._wired) return;
        RunJuice._wired = true;
        eventBus.on(GameEvents.ENEMY_KILLED, RunJuice._onKill, RunJuice);
        eventBus.on(GameEvents.ROOM_CLEARED, RunJuice._onRoomCleared, RunJuice);
        eventBus.on(GameEvents.FLOOR_STARTED, RunJuice._onFloor, RunJuice);
    }

    private static _onFloor() {
        RunJuice._streak = 0;
        RunJuice._lastKillAt = 0;
    }

    private static _onKill(_d: { enemyId?: string; coins?: number }) {
        if (!GameFlow.isPlaying) return;
        const now = Date.now() / 1000;
        if (now - RunJuice._lastKillAt > RunJuice.STREAK_GAP) RunJuice._streak = 0;
        RunJuice._lastKillAt = now;
        RunJuice._streak++;

        const parent = WorldBridge.worldLayer;
        if (parent?.isValid) {
            CombatVfx.ringPulse(parent, WorldBridge.x, WorldBridge.y,
                new Color(255, 230, 120, 200), 28, 0.22);
        }
        if (RunJuice._streak === 1) Haptic.light();
        else if (RunJuice._streak >= 3) Haptic.heavy();
        else Haptic.light();

        if (RunJuice._streak >= 2) {
            const label = RunJuice._streak >= 5 ? `🔥 ${RunJuice._streak} 连杀！`
                : RunJuice._streak >= 3 ? `⚡ ${RunJuice._streak} 连击`
                : `✨ 连杀 ×${RunJuice._streak}`;
            eventBus.emit('show-tip', { text: label });
            if (parent?.isValid && RunJuice._streak >= 3) {
                CombatVfx.burst(parent, WorldBridge.x, WorldBridge.y,
                    new Color(255, 180, 60, 255), 6 + Math.min(6, RunJuice._streak));
                RunJuice._floatStreak(parent, RunJuice._streak);
            }
        }
    }

    private static _onRoomCleared() {
        const parent = WorldBridge.worldLayer;
        if (parent?.isValid) {
            CombatVfx.ringPulse(parent, WorldBridge.x, WorldBridge.y,
                new Color(120, 230, 255, 230), 40, 0.55);
            CombatVfx.ringPulse(parent, WorldBridge.x, WorldBridge.y,
                new Color(255, 220, 100, 180), 70, 0.7);
            CombatVfx.burst(parent, WorldBridge.x, WorldBridge.y,
                new Color(255, 240, 160, 255), 12);
            CombatVfx.shakeWorld(10);
            Haptic.heavy();
            // 延迟朝传送门打信标（走 DungeonManager.schedule，避免裸 setTimeout）
            const dm = find('Canvas')?.getComponent('DungeonManager') as {
                scheduleOnce?: (fn: () => void, delay: number) => void;
            } | null;
            dm?.scheduleOnce?.(() => RunJuice._portalBeacon(), 0.4);
            dm?.scheduleOnce?.(() => RunJuice._portalBeacon(), 1.4);
        }
        RunJuice._streak = 0;
    }

    private static _portalBeacon() {
        const parent = WorldBridge.worldLayer;
        if (!parent?.isValid) return;
        const portal = parent.getChildByName('Portal');
        if (!portal?.isValid) return;
        CombatVfx.ringPulse(parent, portal.position.x, portal.position.y,
            new Color(100, 220, 255, 220), 36, 0.5);
        CombatVfx.burst(parent, portal.position.x, portal.position.y,
            new Color(140, 230, 255, 255), 6);
    }

    private static _floatStreak(parent: Node, n: number) {
        const node = new Node('StreakFx');
        node.setParent(parent);
        node.setPosition(WorldBridge.x, WorldBridge.y + 48, 0);
        node.addComponent(UITransform).setContentSize(80, 28);
        const lbl = node.addComponent(Label);
        lbl.string = `×${n}`;
        lbl.fontSize = 22 + Math.min(10, n);
        lbl.color = new Color(255, 220, 80, 255);
        tween(node)
            .to(0.55, {
                position: new Vec3(WorldBridge.x, WorldBridge.y + 110, 0),
                scale: new Vec3(1.3, 1.3, 1),
            }, { easing: 'quadOut' })
            .call(() => { if (node.isValid) node.destroy(); })
            .start();
    }
}
