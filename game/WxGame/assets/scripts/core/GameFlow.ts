import { eventBus } from './EventBus';
import { find } from 'cc';

/** Lobby ↔ Playing 同场景状态 */
export type FlowState = 'lobby' | 'playing';

export const FlowEvents = {
    STATE: 'game-flow-state',
    /** 入场展板等：冻结移动/攻击/怪 AI，不改 Lobby/Playing */
    COMBAT_FREEZE: 'combat-freeze',
} as const;

/**
 * GameFlow —— 主界面 / 开战状态机（同场景）
 *
 * 战斗冻结是布尔开关（商店→天赋可连续 true 再一次 false，不能用引用计数）。
 * 若展板/面板异常销毁导致永久冻结，靠 ensureCombatThawed 看门狗解开。
 */
export class GameFlow {
    private static _state: FlowState = 'lobby';
    private static _combatFrozen = false;

    static get state() { return GameFlow._state; }
    static get isLobby() { return GameFlow._state === 'lobby'; }
    static get isPlaying() { return GameFlow._state === 'playing'; }
    /** 展板 / 过场：playing 但仍不可操作 */
    static get isCombatFrozen() { return GameFlow._combatFrozen; }

    static reset() {
        GameFlow._state = 'lobby';
        GameFlow._combatFrozen = false;
        eventBus.emit(FlowEvents.STATE, { state: GameFlow._state });
        eventBus.emit(FlowEvents.COMBAT_FREEZE, { frozen: false });
    }

    static setPlaying() {
        const wasPlaying = GameFlow._state === 'playing';
        GameFlow._state = 'playing';
        // 开战清冻结，防止上局展板/背包残留导致怪不追人
        if (GameFlow._combatFrozen) {
            GameFlow._combatFrozen = false;
            eventBus.emit(FlowEvents.COMBAT_FREEZE, { frozen: false });
        }
        if (!wasPlaying) {
            eventBus.emit(FlowEvents.STATE, { state: GameFlow._state });
        }
    }

    static setLobby() {
        if (GameFlow._state === 'lobby') {
            if (GameFlow._combatFrozen) {
                GameFlow._combatFrozen = false;
                eventBus.emit(FlowEvents.COMBAT_FREEZE, { frozen: false });
            }
            return;
        }
        GameFlow._state = 'lobby';
        GameFlow._combatFrozen = false;
        eventBus.emit(FlowEvents.STATE, { state: GameFlow._state });
        eventBus.emit(FlowEvents.COMBAT_FREEZE, { frozen: false });
    }

    static setCombatFrozen(v: boolean) {
        if (GameFlow._combatFrozen === v) return;
        GameFlow._combatFrozen = v;
        eventBus.emit(FlowEvents.COMBAT_FREEZE, { frozen: v });
    }

    /** 强制解冻（回大厅 / 展板兜底 / 看门狗） */
    static forceUnfreeze() {
        if (!GameFlow._combatFrozen) return;
        GameFlow._combatFrozen = false;
        eventBus.emit(FlowEvents.COMBAT_FREEZE, { frozen: false });
    }

    /**
     * 局内看门狗：playing 且没有任何冻结 UI，却仍冻着 → 强制解开。
     * 典型：展板 gen 错乱关闭未解冻 → 全图怪物停 AI。
     */
    static ensureCombatThawed() {
        if (!GameFlow.isPlaying) return;
        if (!GameFlow._combatFrozen) return;
        if (GameFlow._hasBlockingOverlay()) return;
        GameFlow.forceUnfreeze();
    }

    private static _hasBlockingOverlay(): boolean {
        const canvas = find('Canvas');
        if (!canvas?.isValid) return false;
        for (const c of canvas.children) {
            if (!c?.isValid || !c.active) continue;
            const n = c.name;
            if (n === 'RoomBriefingPanel' || n === 'BagPanel' || n === 'UpgradeShop'
                || n === 'TalentPick' || n === 'GameClearOverlay' || n === 'GameOverOverlay') {
                return true;
            }
        }
        return false;
    }
}
