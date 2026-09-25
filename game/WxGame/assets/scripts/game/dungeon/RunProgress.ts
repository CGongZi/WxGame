/**
 * 局内层/房进度快照（零依赖）。
 * 供道具/UI 读取，避免 ItemEffects → DungeonManager → GameManager 环依赖。
 */
export const RunProgress = {
    floor: 1,
    roomIndex: 0,
    roomInFloor: 1,
    themeId: 'cave',
};

export function resetRunProgress() {
    RunProgress.floor = 1;
    RunProgress.roomIndex = 0;
    RunProgress.roomInFloor = 1;
    RunProgress.themeId = 'cave';
}

export function writeRunProgress(p: {
    floor: number;
    roomIndex: number;
    roomInFloor: number;
    themeId: string;
}) {
    RunProgress.floor = p.floor;
    RunProgress.roomIndex = p.roomIndex;
    RunProgress.roomInFloor = p.roomInFloor;
    RunProgress.themeId = p.themeId;
}
