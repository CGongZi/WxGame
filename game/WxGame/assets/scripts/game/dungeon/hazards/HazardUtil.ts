import { Node, find } from 'cc';
import { WorldBridge } from '../WorldBridge';
import { DungeonLayout } from '../DungeonLayout';
import { GameFlow } from '../../../core/GameFlow';
import { eventBus } from '../../../core/EventBus';
import { PlayerController } from '../../player/PlayerController';
import type { CombatEnemy } from '../../enemy/EnemyRegistry';
import { EnemyAggro } from '../../enemy/EnemyAggro';

/**
 * æºå³å¬å±å·¥å·ï¼æ ç»ä»¶ï¼é¿åä¸åæºå³ç»ä»¶äºç¸ import æç¯ï¼ã
 * åªè¯» WorldBridge.x/yï¼ä¸æ¹ç©å®¶åæ ï¼ä¼¤å®³ç»ä¸èµ° PlayerController.takeDamageã
 */
export class Hazards {
    private static _tipped = new Set<string>();

    static player(): PlayerController | null {
        return find('Canvas/Player')?.getComponent(PlayerController) ?? null;
    }

    static hurt(amount: number, tipKey?: string, tipText?: string) {
        if (!GameFlow.isPlaying) return;
        const pc = Hazards.player();
        if (!pc || pc.isDead) return;
        pc.takeDamage(amount, { hazard: true });
        if (tipKey && tipText && !Hazards._tipped.has(tipKey)) {
            Hazards._tipped.add(tipKey);
            eventBus.emit('show-tip', { text: tipText });
        }
    }

    static resetTips() { Hazards._tipped.clear(); }

    /** ä¸æ¬¡æ§æç¤ºï¼é¦æ¬¡è¿å false å¹¶è®°ä¸ºå·²æç¤ºï¼ä¹åè¿å true */
    static tipped(key: string): boolean {
        if (Hazards._tipped.has(key)) return true;
        Hazards._tipped.add(key);
        return false;
    }

    /** é£è¡æªä¸åå°é¢æºå³ï¼å°åº / çå²© / æ¯æ²¼ï¼ */
    static isFlyer(e: CombatEnemy): boolean {
        const n = e.node;
        return !!(n?.isValid && (n.getComponent('WispEnemy') || n.getComponent('DragonEnemy')));
    }

    private static _enemyCd = new WeakMap<CombatEnemy, number>();

    /**
     * #141 æºå³å¯¹æªçé¨æ§ï¼åªæãéçãçå°é¢æªï¼æå¨åå·²åè­¦ / å¨èµ°å»éï¼ï¼
     * ä¸æ¯åªæªç¬ç« 1.0s å·å´ââå·å¨æºå³æçç¡æªä¸ä¼è¢«æºå³èªå·±ç£¨æ­»ã
     */
    static canHurtEnemy(e: CombatEnemy, now: number): boolean {
        if (!e?.isValid || e.isDead || e.neutral || Hazards.isFlyer(e)) return false;
        const p = e.node.position;
        const L = DungeonLayout.current;
        if (L && L.chamberIndexAt(p.x, p.y) >= 0 && !EnemyAggro.isAlerted(p.x, p.y)) return false;
        const last = Hazards._enemyCd.get(e) ?? -99;
        if (now - last < 1.0) return false;
        Hazards._enemyCd.set(e, now);
        return true;
    }

    static floorDmg(base: number): number {
        const f = DungeonLayout.current?.floor ?? 1;
        // #154 机关要咬得出血：基础抬高 + 层数成长（再经 hazard 穿防）
        return Math.round(base * 2.6 + f * 4.2 + 8);
    }

    /** æºå³å°åºçå¼©ç¢æ EnemyLayerï¼éæ¢æ¿ä¸èµ·æ¸ï¼ï¼æ¾ä¸å°åéå WorldLayer */
    static boltParent(fallback: Node): Node {
        const wl = WorldBridge.worldLayer;
        return wl?.getChildByName('EnemyLayer') ?? fallback;
    }

    static playerNear(x: number, y: number, r: number): boolean {
        const dx = WorldBridge.x - x;
        const dy = WorldBridge.y - y;
        return dx * dx + dy * dy < r * r;
    }
}
