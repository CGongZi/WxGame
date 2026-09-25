import { Node } from 'cc';
import { EnemyRegistry, type CombatEnemy } from '../enemy/EnemyRegistry';
import { WorldBridge } from '../dungeon/WorldBridge';
import { DungeonLayout } from '../dungeon/DungeonLayout';
import type { WeaponDef } from './WeaponController';

/**
 * #143 武器「打法」——元气骑士式的武器分型（不只是数值不同）。
 *
 *  近战  slash   弧形挥砍（默认）
 *        thrust  直线突刺：细长矩形判定，穿透一排，击退
 *        heavy   重击：大弧 + 强击退 + 落点震荡波（hammer 追加 splash）
 *        flurry  连击：multiHit 次交替左右斩，最后一击 ×1.6
 *        wave    斩击 + 飞出一道剑气（子弹，伤害 60%）
 *  远程  bolt    单发（默认）
 *        spread  霰弹：pellets 发扇形
 *        burst   点射：burst 发连发（0.07s 间隔）
 *        bounce  弹墙：bounce 次反弹
 *        homing  追踪：自动拐向最近敌人
 *        beam    射线：瞬时直线，打到墙为止，路径上全部命中
 *        lob     投掷：落点 splash 半径溅射
 *
 * 配置缺省时按 id 查 MODE_BY_ID；CMS 老包不填也能玩。
 */
export type FireMode =
    | 'slash' | 'thrust' | 'heavy' | 'flurry' | 'wave'
    | 'bolt' | 'spread' | 'burst' | 'bounce' | 'homing' | 'beam' | 'lob';

export interface ModeParams {
    fireMode: FireMode;
    pellets: number;
    spreadDeg: number;
    burst: number;
    knockback: number;
    splash: number;
    bounce: number;
    slow: [number, number] | null;
}

const MODE_BY_ID: Record<string, Partial<ModeParams>> = {
    sword: { fireMode: 'slash', knockback: 14 },
    dagger: { fireMode: 'flurry' },
    spear: { fireMode: 'thrust', knockback: 30 },
    axe: { fireMode: 'heavy', knockback: 46 },
    hammer: { fireMode: 'heavy', knockback: 40, splash: 84 },
    holy_blade: { fireMode: 'wave', knockback: 18 },
    sunblade: { fireMode: 'wave', knockback: 14 },
    shadow_daggers: { fireMode: 'flurry' },
    void_edge: { fireMode: 'wave', knockback: 10 },
    blood_cleaver: { fireMode: 'heavy', knockback: 42, splash: 56 },
    ward_glaive: { fireMode: 'thrust', knockback: 36 },
    bow: { fireMode: 'bolt', knockback: 10 },
    crossbow: { fireMode: 'bolt', knockback: 34 },
    venom_bow: { fireMode: 'burst', burst: 3, slow: [0.75, 1.0] },
    starfall_bow: { fireMode: 'spread', pellets: 3, spreadDeg: 16 },
    shuriken: { fireMode: 'bounce', bounce: 3 },
    wand: { fireMode: 'bolt' },
    frost: { fireMode: 'burst', burst: 3, slow: [0.45, 1.6] },
    glacier_orb: { fireMode: 'lob', splash: 88, slow: [0.4, 1.8] },
    earth_staff: { fireMode: 'lob', splash: 90, knockback: 36 },
    storm_rod: { fireMode: 'beam' },
    solar_scepter: { fireMode: 'homing' },
    dragon_fang: { fireMode: 'lob', splash: 72 },
    venom_vials: { fireMode: 'lob', splash: 60, slow: [0.65, 1.2] },
    scatter_gun: { fireMode: 'spread', pellets: 5, spreadDeg: 34, knockback: 18 },
    saw_disc: { fireMode: 'bounce', bounce: 4 },
    thunder_lance: { fireMode: 'thrust', knockback: 44 },
    chain_whip: { fireMode: 'flurry' },
    boomerang: { fireMode: 'bounce', bounce: 3, knockback: 12 },
    flame_flask: { fireMode: 'lob', splash: 80, knockback: 20 },
    claymore: { fireMode: 'heavy', knockback: 48, splash: 60 },
    rail_cannon: { fireMode: 'beam', knockback: 28 },
    prism_rod: { fireMode: 'homing' },
};

export function resolveMode(def: WeaponDef): ModeParams {
    const d = MODE_BY_ID[def.id] ?? {};
    const fireMode: FireMode = (def.fireMode as FireMode | undefined)
        ?? d.fireMode
        ?? (def.type === 'melee' ? 'slash' : 'bolt');
    return {
        fireMode,
        pellets: def.pellets ?? d.pellets ?? 1,
        spreadDeg: def.spreadDeg ?? d.spreadDeg ?? 0,
        burst: def.burst ?? d.burst ?? 1,
        knockback: def.knockback ?? d.knockback ?? 0,
        splash: def.splash ?? d.splash ?? 0,
        bounce: def.bounce ?? d.bounce ?? 0,
        slow: def.slow ?? d.slow ?? null,
    };
}

/** 打法一句话（图鉴 / 拾取提示） */
export function modeLabel(m: FireMode): string {
    switch (m) {
        case 'slash': return '挥砍';
        case 'thrust': return '突刺·穿排';
        case 'heavy': return '重击·击退';
        case 'flurry': return '连击·终结';
        case 'wave': return '斩击·剑气';
        case 'bolt': return '单发';
        case 'spread': return '霰射';
        case 'burst': return '点射';
        case 'bounce': return '弹墙';
        case 'homing': return '追踪';
        case 'beam': return '射线';
        case 'lob': return '投掷·溅射';
    }
}

/** #182 特殊属性短标签（图鉴第二行） */
export function weaponTraitTags(def: WeaponDef): string {
    const m = resolveMode(def);
    const tags: string[] = [];
    if (def.piercing) tags.push('穿透');
    if (m.splash && m.splash > 0) tags.push(`溅射${Math.round(m.splash)}`);
    if (m.slow) tags.push(`减速×${m.slow[0]}`);
    if (m.bounce && m.bounce > 0) tags.push(`弹墙${m.bounce}`);
    if (m.pellets && m.pellets > 1) tags.push(`${m.pellets}弹`);
    if (m.burst && m.burst > 1) tags.push(`${m.burst}连`);
    if (m.knockback && m.knockback >= 30) tags.push('强击退');
    if (m.fireMode === 'homing') tags.push('追踪');
    if (m.fireMode === 'beam') tags.push('瞬发');
    return tags.length ? tags.join(' · ') : '无额外特效';
}

// ── 判定 ─────────────────────────────────────────────────────

/**
 * 弧形挥砍命中（修「刀打不到人」）：
 *  - 距离按「到敌人边缘」算（减 collideRadius），大体型贴脸不再漏；
 *  - 贴身 ≤ 46px 无视扇角（刀就在身边，怎么挥都刮到）；
 *  - 其余按扇形半角。
 */
export function arcHits(px: number, py: number, dirX: number, dirY: number, range: number, coneHalfDeg: number): CombatEnemy[] {
    const cosHalf = Math.cos((coneHalfDeg * Math.PI) / 180);
    const out: CombatEnemy[] = [];
    for (const e of EnemyRegistry.getInRange(px, py, range + 40)) {
        const ex = e.node.position.x - px;
        const ey = e.node.position.y - py;
        const len = Math.hypot(ex, ey);
        const edge = len - (e.collideRadius ?? 22);
        if (edge > range) continue;
        if (len < 46) { out.push(e); continue; }
        const dot = (ex / len) * dirX + (ey / len) * dirY;
        if (dot >= cosHalf) out.push(e);
    }
    return out;
}

/** 直线突刺：玩家沿 dir 长 range、半宽 halfW 的胶囊，命中全部 */
export function thrustHits(px: number, py: number, dirX: number, dirY: number, range: number, halfW = 30): CombatEnemy[] {
    const out: CombatEnemy[] = [];
    for (const e of EnemyRegistry.getInRange(px, py, range + 40)) {
        const ex = e.node.position.x - px;
        const ey = e.node.position.y - py;
        const along = ex * dirX + ey * dirY;
        if (along < -10 || along > range) continue;
        const side = Math.abs(ex * dirY - ey * dirX);
        if (side <= halfW + (e.collideRadius ?? 22)) out.push(e);
    }
    return out;
}

/** 射线：从玩家沿 dir 走到墙 / 射程，返回终点与路径上敌人 */
export function beamCast(px: number, py: number, dirX: number, dirY: number, range: number, halfW = 24): { endX: number; endY: number; hits: CombatEnemy[] } {
    const step = 12;
    let x = px;
    let y = py;
    let traveled = 0;
    while (traveled < range) {
        const nx = x + dirX * step;
        const ny = y + dirY * step;
        if (WorldBridge.hitsObstacle(nx, ny, 6)) break;
        if (Math.abs(nx) > WorldBridge.boundX || Math.abs(ny) > WorldBridge.boundY) break;
        x = nx; y = ny; traveled += step;
    }
    const hits = thrustHits(px, py, dirX, dirY, traveled, halfW);
    return { endX: x, endY: y, hits };
}

/** 击退：不改怪的 AI，只借 WorldBridge 让它挪一步（撞墙即停）；Boss 只吃 30% */
export function knockEnemy(e: CombatEnemy, dirX: number, dirY: number, force: number) {
    if (force <= 0 || !e?.isValid || e.isDead || e.neutral) return;
    const n = e.node;
    const isBoss = !!n.getComponent('BossEnemy');
    const flying = !!(n.getComponent('WispEnemy') || n.getComponent('DragonEnemy'));
    const f = isBoss ? force * 0.3 : force;
    const r = e.collideRadius ?? 22;
    const tx = n.position.x + dirX * f;
    const ty = n.position.y + dirY * f;
    if (flying) WorldBridge.enemyFlyStep(n, tx, ty, r);
    else WorldBridge.enemyStep(n, tx, ty, r);
}

/** 溅射：圆内全部受伤（含中立木箱），可选减速 */
export function splashAt(x: number, y: number, radius: number, dmg: number, slow: [number, number] | null, exclude?: CombatEnemy) {
    for (const e of EnemyRegistry.getInRange(x, y, radius, true)) {
        if (e === exclude) continue;
        e.takeDamage(dmg);
        if (slow) e.applySlow?.(slow[0], slow[1]);
    }
}

/** 落点吸到可站地板（投掷物别炸进墙里） */
export function snapFloor(x: number, y: number): { x: number; y: number } {
    const L = DungeonLayout.current;
    if (!L) return { x, y };
    if (L.isTerrainWalkable(DungeonLayout.colOf(x), DungeonLayout.rowOf(y))) return { x, y };
    return L.nearestFloor(x, y);
}

export function isValidParent(n: Node | null | undefined): n is Node {
    return !!n?.isValid;
}
