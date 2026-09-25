import { ConfigStore } from './ConfigStore';
import type { ConfigStage } from './ConfigSchema';

/** 关卡表读写（读配置包；解锁态由调用方传入已通关列表） */
export function listStages(): readonly ConfigStage[] {
    return ConfigStore.stages();
}

export function getStage(id: string): ConfigStage | undefined {
    return ConfigStore.stage(id) ?? undefined;
}

export function isStageUnlocked(id: string, stagesCleared: readonly string[] = []): boolean {
    const stage = getStage(id);
    if (!stage) return false;
    if (!stage.unlockAfter) return true;
    return stagesCleared.indexOf(stage.unlockAfter) >= 0;
}

export function isStageCleared(id: string, stagesCleared: readonly string[] = []): boolean {
    return stagesCleared.indexOf(id) >= 0;
}

/** 下一关（按表顺序；需已解锁） */
export function nextStageId(
    currentId: string,
    stagesCleared: readonly string[] = [],
): string | null {
    const list = listStages();
    const idx = list.findIndex(s => s.id === currentId);
    if (idx < 0 || idx >= list.length - 1) return null;
    const next = list[idx + 1];
    if (!next) return null;
    // 通关当前关后下一关应解锁：cleared 含 current 即可
    const cleared = stagesCleared.indexOf(currentId) >= 0
        ? stagesCleared
        : [...stagesCleared, currentId];
    return isStageUnlocked(next.id, cleared) ? next.id : null;
}

export function stageBrief(s: ConfigStage): string {
    const rooms = s.roomsPerFloor ?? ConfigStore.dungeon().roomsPerFloor;
    const reward = s.rewardItemId
        ? ` · 补给×${s.rewardItemAmount ?? 1}`
        : '';
    return `${s.totalFloors}层×${rooms}房 · +${s.clearBonusSoul}魂${reward}`;
}
