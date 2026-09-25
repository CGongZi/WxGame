import { ConfigStore } from './ConfigStore';
import { StatBlock } from './PlayerStats';

export interface CharacterDef {
    id: string;
    name: string;
    emoji: string;
    desc: string;
    /** 0 = 初始可用；否则灵魂石解锁 */
    cost: number;
    /** 皮肤 id。大厅和局内按这个画剪影 */
    skinId: string;
    /** 开战默认装备，不要求商店已解锁 */
    /** 开局携带武器 id（#156：仅开局赠予，非「他人不可用」锁定） */
    exclusiveWeaponId: string;
    base: StatBlock;
}

/** 出战角色。数值来自当前配置包。 */
export function listCharacters(): readonly CharacterDef[] {
    return ConfigStore.characters();
}

export function getCharacter(id: string): CharacterDef | null {
    for (const c of ConfigStore.characters()) {
        if (c.id === id) return c;
    }
    return null;
}

export function defaultCharacter(): CharacterDef {
    return ConfigStore.characters()[0];
}
