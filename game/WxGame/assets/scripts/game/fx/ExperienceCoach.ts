import { find } from 'cc';
import { eventBus, GameEvents } from '../../core/EventBus';
import { GameFlow, FlowEvents } from '../../core/GameFlow';
import { PlayerStats } from '../../core/PlayerStats';
import { RunBag } from '../item/RunBag';
import { ConfigStore } from '../../core/ConfigStore';

/**
 * ExperienceCoach —— 局内轻量教练（制作人体验波）
 * 关键节点提示，不打断操作；冷却防刷屏。
 */
export class ExperienceCoach {
    private static _wired = false;
    private static _flags = {
        firstKill: false,
        lowHp: false,
        firstPotion: false,
        firstClear: false,
        firstWeapon: false,
        moveHint: false,
        shrineHint: false,
    };
    private static _lowHpCd = 0;

    static ensure() {
        if (ExperienceCoach._wired) return;
        ExperienceCoach._wired = true;
        eventBus.on(GameEvents.ENEMY_KILLED, ExperienceCoach._onKill, ExperienceCoach);
        eventBus.on(GameEvents.ROOM_CLEARED, ExperienceCoach._onClear, ExperienceCoach);
        eventBus.on(GameEvents.FLOOR_STARTED, ExperienceCoach._onFloor, ExperienceCoach);
        eventBus.on(GameEvents.WEAPON_CHANGED, ExperienceCoach._onWeapon, ExperienceCoach);
        eventBus.on(GameEvents.BAG_CHANGED, ExperienceCoach._onBag, ExperienceCoach);
        eventBus.on(GameEvents.PLAYER_HP_CHANGED, ExperienceCoach._onHp, ExperienceCoach);
        eventBus.on(FlowEvents.STATE, ExperienceCoach._onFlow, ExperienceCoach);
        eventBus.on('skill-cast', ExperienceCoach._onSkill, ExperienceCoach);
    }

    private static _skillTipped = false;

    private static _onSkill(d: { name?: string }) {
        if (!GameFlow.isPlaying || ExperienceCoach._skillTipped) return;
        ExperienceCoach._skillTipped = true;
        ExperienceCoach._tip(`${d?.name ?? '技能'}！冷却好后右下钮会亮起`, 0.6);
    }

    private static _onFlow(d: { state: string }) {
        if (d.state === 'lobby') {
            ExperienceCoach._flags = {
                firstKill: false,
                lowHp: false,
                firstPotion: false,
                firstClear: false,
                firstWeapon: false,
                moveHint: false,
                shrineHint: false,
            };
            ExperienceCoach._lowHpCd = 0;
            ExperienceCoach._skillTipped = false;
        }
        if (d.state === 'playing' && !ExperienceCoach._flags.moveHint) {
            ExperienceCoach._flags.moveHint = true;
            ExperienceCoach._tip('左移右攻 · 右下技能 · 探索神龛可赐福', 0.8);
        }
    }

    private static _onFloor(d: { floor?: number; roomIndex?: number }) {
        if (!GameFlow.isPlaying) return;
        if ((d.roomIndex ?? 0) === 0 && (d.floor ?? 1) === 1) {
            ExperienceCoach._tip('靠近发光物会自动吸入 · 清怪找传送门', 1.6);
        }
    }

    private static _onKill() {
        if (!GameFlow.isPlaying) return;
        if (ExperienceCoach._flags.firstKill) return;
        ExperienceCoach._flags.firstKill = true;
        ExperienceCoach._tip('击杀掉落金币/道具 · 走进即可拾取', 0.2);
    }

    private static _onClear() {
        if (!GameFlow.isPlaying) return;
        if (ExperienceCoach._flags.firstClear) return;
        ExperienceCoach._flags.firstClear = true;
        ExperienceCoach._tip('清房完成 · 先逛商店再进传送门', 0.35);
    }

    private static _onWeapon() {
        if (!GameFlow.isPlaying) return;
        if (ExperienceCoach._flags.firstWeapon) return;
        ExperienceCoach._flags.firstWeapon = true;
        ExperienceCoach._tip('点底部武器栏可切换已拥有武器', 0.15);
    }

    private static _onBag() {
        if (!GameFlow.isPlaying) return;
        if (ExperienceCoach._flags.firstPotion) return;
        const hasHeal = RunBag.slots().some(s => {
            const def = ConfigStore.item(s.id);
            return def?.kind === 'heal';
        });
        if (!hasHeal) return;
        ExperienceCoach._flags.firstPotion = true;
        ExperienceCoach._tip('点底栏药水格即可回复 · 低血时格子会闪', 0.1);
    }

    private static _onHp(d: { current: number; max: number }) {
        if (!GameFlow.isPlaying) return;
        const now = Date.now() / 1000;
        if (now < ExperienceCoach._lowHpCd) return;
        const ratio = d.max > 0 ? d.current / d.max : 1;
        if (ratio > 0.38) return;
        const hasHeal = RunBag.slots().some(s => ConfigStore.item(s.id)?.kind === 'heal');
        ExperienceCoach._lowHpCd = now + 12;
        ExperienceCoach._tip(hasHeal ? '❤ 血量偏低 · 点底栏治疗药水！' : '❤ 血量偏低 · 用技能拉开距离，找 ❤ 掉落', 0);
    }

    private static _tip(text: string, delay: number) {
        const fire = () => {
            if (!GameFlow.isPlaying) return;
            eventBus.emit('show-tip', { text });
        };
        if (delay <= 0) {
            fire();
            return;
        }
        const hud = find('Canvas/HUD');
        const comp = hud?.getComponent('HUDManager') as
            { scheduleOnce?: (cb: () => void, t: number) => void } | null;
        if (comp?.scheduleOnce) comp.scheduleOnce(fire, delay);
        else setTimeout(fire, delay * 1000);
    }

    /** HUD：是否应高亮治疗格 */
    static shouldPulseHeal(): boolean {
        if (!GameFlow.isPlaying) return false;
        const max = PlayerStats.I.get('maxHp');
        if (max <= 0) return false;
        return PlayerStats.I.hp / max <= 0.38;
    }
}
