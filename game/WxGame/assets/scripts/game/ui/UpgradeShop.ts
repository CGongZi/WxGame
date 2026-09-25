import { Node, Label, Color, UITransform, Graphics, BlockInputEvents, find, tween, Vec3 } from 'cc';
import { eventBus, GameEvents } from '../../core/EventBus';
import { GameManager } from '../../core/GameManager';
import { PlayerController } from '../player/PlayerController';
import { WeaponController } from '../weapon/WeaponController';
import { PlayerStats } from '../../core/PlayerStats';
import { drawWeaponGlyph } from '../fx/WeaponArt';
import { drawItemGlyph } from '../fx/ItemArt';
import { GameFlow } from '../../core/GameFlow';
import { ConfigStore } from '../../core/ConfigStore';
import { AudioManager } from '../../core/AudioManager';
import { RunBag } from '../item/RunBag';
import { LootMagnet } from '../item/LootMagnet';
import { TalentPick } from './TalentPick';

type ThumbKind = 'heal' | 'heart' | 'atk' | 'def' | 'spd' | 'weapon' | 'crit' | 'armor' | 'luck';

interface OfferDef {
    id: string;
    title: string;
    desc: string;
    /** 首次购买基准价；之后按局内购买次数幂次涨价 */
    base: number;
    emoji: string;
    accent: Color;
    thumb: ThumbKind;
    /** 可重复购买（属性类）；false = 本局每种只卖一次 */
    repeat?: boolean;
    /** 动态价（回满血按缺口） */
    dynamicCost?: (pc: PlayerController) => number;
    apply: (pc: PlayerController, wc: WeaponController | null) => string;
}

interface PricedOffer extends OfferDef {
    cost: number;
    buys: number;
}

/** 局内金币（UpgradeShop / HUD 共用读写） */
export let runCoins = 0;

export function resetRunCoins() {
    runCoins = 0;
    UpgradeShop.resetRun();
}

eventBus.on(GameEvents.COIN_COLLECTED, (d: { amount?: number; total?: number }) => {
    if (d.total !== undefined) runCoins = d.total;
    else if (d.amount !== undefined) runCoins = Math.max(0, runCoins + d.amount);
});

/**
 * UpgradeShop —— 清怪后局内金店（#153 元气骑士式花币）
 * - 属性/补给可重复买，价格幂次上涨
 * - 买完不关店，可连买；花钱刷新货架
 * - 高价特货：回满血 / 护甲回满 / 暴击 / 磁吸 / 狂战药剂 …
 */
export class UpgradeShop {
    private static _open = false;
    /** 本局各商品已购次数 → 涨价 */
    private static _buys: Record<string, number> = {};
    /** 本局刷新次数 → 刷新费上涨 */
    private static _refreshN = 0;

    static get isOpen() { return UpgradeShop._open; }

    static resetRun() {
        UpgradeShop._buys = {};
        UpgradeShop._refreshN = 0;
    }

    static forceClose(canvas?: Node | null) {
        UpgradeShop._open = false;
        const host = canvas ?? find('Canvas');
        const n = host?.getChildByName('UpgradeShop');
        if (n?.isValid) n.destroy();
        if (!TalentPick.isOpen) GameFlow.setCombatFrozen(false);
    }

    /** 幂次涨价：第 0 次 = base，第 n 次 ≈ base × 1.55^n */
    static costOf(base: number, id: string): number {
        const n = UpgradeShop._buys[id] ?? 0;
        return Math.max(1, Math.round(base * Math.pow(1.55, n)));
    }

    static refreshCost(): number {
        return 30 + UpgradeShop._refreshN * 25;
    }

    static show(canvas: Node) {
        if (UpgradeShop._open) return;
        UpgradeShop._open = true;
        GameFlow.setCombatFrozen(true);

        const gmCoins = GameManager.instance?.runState.coins;
        if (gmCoins !== undefined) runCoins = gmCoins;

        const player = find('Canvas/Player');
        const pc = player?.getComponent(PlayerController) ?? null;
        const wc = player?.getComponent(WeaponController) ?? null;
        if (!pc) {
            UpgradeShop._open = false;
            TalentPick.show(canvas);
            return;
        }

        const root = new Node('UpgradeShop');
        root.setParent(canvas);
        root.setPosition(0, 0, 0);
        root.setSiblingIndex(9998);
        root.addComponent(UITransform).setContentSize(1334, 750);
        root.addComponent(BlockInputEvents);

        const bg = root.addComponent(Graphics);
        bg.fillColor = new Color(8, 6, 4, 175);
        bg.rect(-667, -375, 1334, 750); bg.fill();

        const panel = new Node('Panel');
        panel.setParent(root);
        panel.setPosition(0, 20, 0);
        panel.setScale(0.85, 0.85, 1);
        panel.addComponent(UITransform).setContentSize(820, 460);
        const pg = panel.addComponent(Graphics);
        pg.fillColor = new Color(24, 18, 14, 248);
        pg.roundRect(-410, -230, 820, 460, 18); pg.fill();
        pg.strokeColor = new Color(210, 160, 70, 220);
        pg.lineWidth = 2.5;
        pg.roundRect(-410, -230, 820, 460, 18); pg.stroke();
        pg.strokeColor = new Color(255, 220, 150, 40);
        pg.lineWidth = 1;
        pg.roundRect(-398, -218, 796, 436, 14); pg.stroke();
        // 顶栏：标题带给足高度，字不再被裁
        pg.fillColor = new Color(200, 140, 50, 45);
        pg.roundRect(-390, 175, 780, 42, 10); pg.fill();

        tween(panel).to(0.22, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();

        UpgradeShop._label(panel, '清怪金店', 0, 196, 22, new Color(255, 228, 160, 255), 700);
        const coinLbl = UpgradeShop._label(panel, `🪙 ${runCoins}`, 0, 168, 14, new Color(210, 180, 130, 255), 700);
        UpgradeShop._label(
            panel,
            '点卡片购买 · 刷新换货 · 跳过进天赋',
            0, 144, 12, new Color(150, 130, 110, 255), 700,
        );

        const offers = UpgradeShop._rollOffers(pc);
        UpgradeShop._mountCards(panel, offers, pc, wc, canvas, root, coinLbl);

        const refreshCost = UpgradeShop.refreshCost();
        const refresh = UpgradeShop._btn(
            panel, `刷新货架 🪙${refreshCost}`, -150, -198, 220, 34,
            new Color(55, 70, 90, 255),
        );
        refresh.on(Node.EventType.TOUCH_END, () => {
            if (runCoins < refreshCost) {
                eventBus.emit('show-tip', { text: '❌ 金币不足，无法刷新' });
                return;
            }
            if (!UpgradeShop._spend(refreshCost)) {
                eventBus.emit('show-tip', { text: '❌ 金币不足' });
                return;
            }
            UpgradeShop._refreshN++;
            AudioManager.playUi();
            eventBus.emit('show-tip', { text: `🔄 货架刷新 · 下次刷新 🪙${UpgradeShop.refreshCost()}` });
            if (root.isValid) root.destroy();
            UpgradeShop._open = false;
            UpgradeShop.show(canvas);
        });

        const skip = UpgradeShop._btn(panel, '跳过 → 天赋觉醒', 150, -198, 220, 34,
            new Color(50, 40, 28, 255));
        skip.on(Node.EventType.TOUCH_END, () => {
            AudioManager.playUi();
            root.destroy();
            UpgradeShop._open = false;
            TalentPick.show(canvas);
        });
    }

    private static _spend(cost: number): boolean {
        const gm = GameManager.instance;
        if (gm) {
            if (!gm.spendCoins(cost)) return false;
            runCoins = gm.runState.coins;
            eventBus.emit(GameEvents.COIN_COLLECTED, { total: runCoins });
            return true;
        }
        if (runCoins < cost) return false;
        eventBus.emit(GameEvents.COIN_COLLECTED, { amount: -cost });
        return true;
    }

    private static _pool(): OfferDef[] {
        return [
            {
                id: 'heal', title: '急救绷带', desc: '立刻回 50 血', base: 22, emoji: '❤',
                accent: new Color(220, 80, 100, 255), thumb: 'heal', repeat: true,
                apply: (p) => { p.heal(50); return '回血 50'; },
            },
            {
                id: 'full_heal', title: '急救箱', desc: '回满生命', base: 40, emoji: '➕',
                accent: new Color(255, 90, 120, 255), thumb: 'heal', repeat: true,
                dynamicCost: (p) => {
                    const miss = Math.max(0, Math.round(p.maxHp - p.currentHp));
                    return Math.max(28, 18 + Math.round(miss * 0.55));
                },
                apply: (p) => {
                    const miss = Math.max(0, Math.round(p.maxHp - p.currentHp));
                    p.heal(9999);
                    return miss > 0 ? `回满（补 ${miss}）` : '已满血';
                },
            },
            {
                id: 'armor', title: '护甲抛光', desc: '护甲立刻回满', base: 36, emoji: '⛨',
                accent: new Color(200, 210, 230, 255), thumb: 'armor', repeat: true,
                apply: () => { PlayerStats.I.refillArmor(); return '护甲回满'; },
            },
            {
                id: 'maxhp', title: '生命之心', desc: '生命上限 +25', base: 38, emoji: '💗',
                accent: new Color(255, 120, 160, 255), thumb: 'heart', repeat: true,
                apply: (p) => { p.addMaxHp(25); return '上限 +25'; },
            },
            {
                id: 'atk', title: '锋锐药剂', desc: '攻击 +10', base: 35, emoji: '⚔',
                accent: new Color(255, 180, 80, 255), thumb: 'atk', repeat: true,
                apply: () => { PlayerStats.I.addBonus({ atk: 10 }); return '攻击 +10'; },
            },
            {
                id: 'def', title: '铁皮药剂', desc: '防御 +4 · 抬甲上限', base: 32, emoji: '🛡',
                accent: new Color(160, 190, 220, 255), thumb: 'def', repeat: true,
                apply: () => { PlayerStats.I.addBonus({ def: 4 }); return '防御 +4'; },
            },
            {
                id: 'spd', title: '疾风药剂', desc: '移速 +22', base: 30, emoji: '💨',
                accent: new Color(120, 200, 160, 255), thumb: 'spd', repeat: true,
                apply: () => { PlayerStats.I.addBonus({ moveSpeed: 22 }); return '移速 +22'; },
            },
            {
                id: 'crit', title: '鹰眼药剂', desc: '暴击率 +6%', base: 48, emoji: '🎯',
                accent: new Color(255, 210, 100, 255), thumb: 'crit', repeat: true,
                apply: () => {
                    PlayerStats.I.addBonus({ critChance: 0.06 });
                    return '暴击 +6%';
                },
            },
            {
                id: 'fury', title: '狂战药剂', desc: '18 秒内攻速感·强攻', base: 42, emoji: '🔥',
                accent: new Color(255, 100, 60, 255), thumb: 'atk', repeat: true,
                apply: (p) => {
                    const host = p as unknown as { scheduleOnce: (cb: () => void, t: number) => void };
                    PlayerStats.I.addTimedBonus({ atk: 18, moveSpeed: 28 }, 18, host);
                    return '狂战 18 秒！';
                },
            },
            {
                id: 'wpn', title: '武器精炼', desc: '当前武器伤害↑', base: 40, emoji: '✨',
                accent: new Color(210, 170, 90, 255), thumb: 'weapon', repeat: true,
                apply: (_p, w) => w?.upgradeCurrent() ?? '无武器',
            },
            {
                id: 'wpn_master', title: '武器精通', desc: '大强化 · 伤害↑↑', base: 75, emoji: '⚔',
                accent: new Color(255, 200, 80, 255), thumb: 'weapon', repeat: true,
                apply: (_p, w) => w?.upgradeCurrent({
                    damage: Math.max(8, Math.round((w.currentWeapon.damage ?? 20) * 0.32)),
                    cooldownMul: 0.9,
                }) ?? '无武器',
            },
            {
                id: 'magnet', title: '磁引卷轴', desc: '25 秒全图吸物', base: 34, emoji: '🧲',
                accent: new Color(180, 140, 255, 255), thumb: 'luck', repeat: true,
                apply: () => { LootMagnet.activate(25); return '磁力开启 25 秒'; },
            },
            {
                id: 'bag_hp', title: '药水补给', desc: '治疗药水入包', base: 18, emoji: '🧪',
                accent: new Color(100, 200, 140, 255), thumb: 'heal', repeat: true,
                apply: () => RunBag.tryAdd('potion_hp', 1) ? '药水入包' : '背包已满',
            },
            {
                id: 'bag_bomb', title: '爆弹补给', desc: '爆裂弹入包', base: 20, emoji: '💣',
                accent: new Color(255, 140, 80, 255), thumb: 'atk', repeat: true,
                apply: () => RunBag.tryAdd('bomb', 1) ? '爆弹入包' : '背包已满',
            },
            {
                id: 'bag_rage', title: '狂暴补给', desc: '狂暴药入包', base: 24, emoji: '🍶',
                accent: new Color(220, 100, 80, 255), thumb: 'atk', repeat: true,
                apply: () => RunBag.tryAdd('potion_rage', 1) ? '狂暴入包' : '背包已满',
            },
            {
                id: 'bag_shield', title: '护盾补给', desc: '护盾药水入包', base: 26, emoji: '🛡',
                accent: new Color(120, 190, 255, 255), thumb: 'def', repeat: true,
                apply: () => RunBag.tryAdd('potion_shield', 1) ? '护盾入包' : '背包已满',
            },
            {
                id: 'bag_frost', title: '冰弹补给', desc: '冰霜弹入包', base: 22, emoji: '❄',
                accent: new Color(150, 220, 255, 255), thumb: 'atk', repeat: true,
                apply: () => RunBag.tryAdd('frost_bomb', 1) ? '冰弹入包' : '背包已满',
            },
            {
                id: 'bag_elite', title: '精英补给包', desc: '药×2 + 爆弹', base: 55, emoji: '📦',
                accent: new Color(230, 190, 100, 255), thumb: 'luck', repeat: true,
                apply: () => {
                    const a = RunBag.tryAdd('potion_hp', 1);
                    const b = RunBag.tryAdd('potion_shield', 1);
                    const c = RunBag.tryAdd('bomb', 1);
                    if (!a && !b && !c) return '背包已满';
                    return '补给入包';
                },
            },
        ];
    }

    private static _rollOffers(pc: PlayerController): PricedOffer[] {
        const pool = UpgradeShop._pool();
        const want = Math.max(3, Math.min(5, ConfigStore.economy().shopItemCount + 1));
        const shuffled = pool.slice();
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = t;
        }
        // 优先露出高价特货里抽 1 张，避免整排都是便宜货
        const premiumIds = new Set(['full_heal', 'armor', 'crit', 'wpn_master', 'fury', 'bag_elite', 'magnet']);
        const premium = shuffled.filter(o => premiumIds.has(o.id));
        const normal = shuffled.filter(o => !premiumIds.has(o.id));
        const picked: OfferDef[] = [];
        if (premium.length > 0 && Math.random() < 0.85) {
            picked.push(premium[Math.floor(Math.random() * Math.min(3, premium.length))]!);
        }
        for (const o of normal) {
            if (picked.length >= want) break;
            if (picked.some(x => x.id === o.id)) continue;
            picked.push(o);
        }
        for (const o of premium) {
            if (picked.length >= want) break;
            if (picked.some(x => x.id === o.id)) continue;
            picked.push(o);
        }
        // 治疗保底
        if (!picked.some(o => o.id === 'heal' || o.id === 'full_heal' || o.id === 'bag_hp')) {
            const heal = pool.find(o => o.id === 'heal');
            if (heal) picked[picked.length - 1] = heal;
        }

        return picked.slice(0, want).map(o => {
            const buys = UpgradeShop._buys[o.id] ?? 0;
            const baseCost = o.dynamicCost ? o.dynamicCost(pc) : o.base;
            const cost = o.dynamicCost
                ? Math.max(1, Math.round(baseCost * Math.pow(1.35, buys)))
                : UpgradeShop.costOf(o.base, o.id);
            return { ...o, cost, buys };
        });
    }

    private static _bagItemOf(id: string): string | null {
        if (id === 'bag_hp') return 'potion_hp';
        if (id === 'bag_bomb') return 'bomb';
        if (id === 'bag_rage') return 'potion_rage';
        if (id === 'bag_shield') return 'potion_shield';
        if (id === 'bag_frost') return 'frost_bomb';
        return null;
    }

    private static _mountCards(
        panel: Node,
        offers: PricedOffer[],
        pc: PlayerController,
        wc: WeaponController | null,
        canvas: Node,
        root: Node,
        coinLbl: Node,
    ) {
        const cardW = 148;
        const cardH = 210;
        const gap = 12;
        const span = offers.length * cardW + (offers.length - 1) * gap;
        offers.forEach((o, i) => {
            const x = -span / 2 + cardW / 2 + i * (cardW + gap);
            const cell = new Node(o.id);
            cell.setParent(panel);
            cell.setPosition(x, 0, 0);
            cell.addComponent(UITransform).setContentSize(cardW, cardH);
            const cg = cell.addComponent(Graphics);
            cg.fillColor = new Color(36, 28, 20, 255);
            cg.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 12); cg.fill();
            cg.strokeColor = new Color(o.accent.r, o.accent.g, o.accent.b, 180);
            cg.lineWidth = 2;
            cg.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 12); cg.stroke();
            cg.fillColor = new Color(255, 220, 160, 18);
            cg.roundRect(-cardW / 2 + 8, cardH / 2 - 28, cardW - 16, 16, 6); cg.fill();

            const thumb = new Node('Thumb');
            thumb.setParent(cell);
            thumb.setPosition(0, 52, 0);
            thumb.addComponent(UITransform).setContentSize(72, 72);
            UpgradeShop._drawThumb(thumb.addComponent(Graphics), o, wc);

            UpgradeShop._label(cell, o.title, 0, -4, 14, new Color(255, 245, 230, 255), cardW - 12);
            UpgradeShop._label(cell, o.desc, 0, -24, 10, new Color(170, 150, 125, 255), cardW - 12);
            const priceTag = o.buys > 0 ? `🪙 ${o.cost} ·×${o.buys + 1}` : `🪙 ${o.cost}`;
            UpgradeShop._label(cell, priceTag, 0, -46, 13, o.accent, cardW - 12);

            const buy = UpgradeShop._btn(cell, '购买', 0, -78, 96, 28, new Color(90, 60, 30, 255));
            buy.on(Node.EventType.TOUCH_END, () => {
                if (runCoins < o.cost) {
                    eventBus.emit('show-tip', { text: '❌ 金币不足' });
                    return;
                }
                const bagItem = UpgradeShop._bagItemOf(o.id);
                if (bagItem && !RunBag.canAdd(bagItem, 1)) {
                    eventBus.emit('show-tip', { text: '❌ 背包已满' });
                    return;
                }
                if (o.id === 'bag_elite') {
                    if (!RunBag.canAdd('potion_hp', 1) && !RunBag.canAdd('bomb', 1)) {
                        eventBus.emit('show-tip', { text: '❌ 背包已满' });
                        return;
                    }
                }
                if (!UpgradeShop._spend(o.cost)) {
                    eventBus.emit('show-tip', { text: '❌ 金币不足' });
                    return;
                }
                AudioManager.playUi();
                const msg = o.apply(pc, wc);
                if (msg === '背包已满') {
                    // 理论上已预检；若仍失败则退款
                    const gm = GameManager.instance;
                    if (gm) gm.addCoins(o.cost);
                    eventBus.emit('show-tip', { text: '❌ 背包已满' });
                    return;
                }
                UpgradeShop._buys[o.id] = (UpgradeShop._buys[o.id] ?? 0) + 1;
                eventBus.emit('show-tip', { text: `✅ ${msg}` });
                const lbl = coinLbl.getComponent(Label);
                if (lbl) lbl.string = `🪙 ${runCoins}`;
                tween(cell).to(0.1, { scale: new Vec3(1.06, 1.06, 1) })
                    .to(0.1, { scale: new Vec3(0.92, 0.92, 1) })
                    .call(() => {
                        // 买完刷新货架（价格按次数抬升，文案不提）
                        if (root.isValid) root.destroy();
                        UpgradeShop._open = false;
                        UpgradeShop.show(canvas);
                    }).start();
            });
        });
    }

    private static _drawThumb(g: Graphics, o: OfferDef, wc: WeaponController | null) {
        g.fillColor = new Color(28, 20, 14, 255);
        g.circle(0, 0, 32); g.fill();
        g.strokeColor = new Color(o.accent.r, o.accent.g, o.accent.b, 160);
        g.lineWidth = 2;
        g.circle(0, 0, 32); g.stroke();
        if (o.thumb === 'weapon' && wc) {
            drawWeaponGlyph(g, wc.currentWeapon.id, 34);
            return;
        }
        // #179 补给类用局内同一套道具剪影，不用 emoji
        const bagId = UpgradeShop._bagItemOf(o.id);
        if (bagId) {
            const it = ConfigStore.item(bagId);
            if (it) { drawItemGlyph(g, it, 28); return; }
        }
        if (o.id === 'bag_elite') {
            const it = ConfigStore.item('potion_hp');
            if (it) { drawItemGlyph(g, it, 26); return; }
        }
        if (o.thumb === 'heal') {
            g.fillColor = new Color(255, 70, 100, 255);
            g.circle(-6, 4, 9); g.fill(); g.circle(6, 4, 9); g.fill();
            g.moveTo(-14, 2); g.lineTo(0, -14); g.lineTo(14, 2); g.close(); g.fill();
        } else if (o.thumb === 'heart') {
            g.fillColor = new Color(255, 120, 160, 255);
            g.circle(0, 2, 14); g.fill();
            g.fillColor = new Color(255, 220, 230, 255);
            g.circle(-4, 6, 4); g.fill();
        } else if (o.thumb === 'def' || o.thumb === 'armor') {
            g.fillColor = o.thumb === 'armor'
                ? new Color(210, 220, 235, 255)
                : new Color(140, 170, 200, 255);
            g.moveTo(0, 16); g.lineTo(14, 8); g.lineTo(12, -6);
            g.lineTo(0, -16); g.lineTo(-12, -6); g.lineTo(-14, 8); g.close(); g.fill();
        } else if (o.thumb === 'spd') {
            g.fillColor = new Color(100, 210, 160, 255);
            g.moveTo(-12, 10); g.lineTo(14, 0); g.lineTo(-12, -10); g.lineTo(-6, 0); g.close(); g.fill();
        } else if (o.thumb === 'crit') {
            g.fillColor = new Color(255, 220, 100, 255);
            g.circle(0, 0, 10); g.fill();
            g.strokeColor = new Color(255, 160, 40, 255);
            g.lineWidth = 2;
            g.moveTo(0, 18); g.lineTo(0, -18); g.moveTo(-18, 0); g.lineTo(18, 0); g.stroke();
        } else if (o.thumb === 'luck') {
            g.fillColor = new Color(180, 140, 255, 255);
            g.circle(0, 2, 12); g.fill();
            g.fillColor = new Color(240, 220, 255, 255);
            g.circle(-4, 6, 3); g.fill();
        } else {
            g.fillColor = new Color(255, 180, 70, 255);
            g.moveTo(0, 14); g.lineTo(10, -4); g.lineTo(4, -4); g.lineTo(8, -14);
            g.lineTo(-10, 2); g.lineTo(-4, 2); g.close(); g.fill();
        }
    }

    private static _label(parent: Node, text: string, x: number, y: number,
                          size: number, color: Color, width = 220) {
        const n = new Node('L');
        n.setParent(parent);
        n.setPosition(x, y, 0);
        // #160 高度按字号留足，避免中文被 CLAMP 裁掉上半截；宽可传入
        n.addComponent(UITransform).setContentSize(width, Math.ceil(size * 1.55));
        const lbl = n.addComponent(Label);
        lbl.string = text;
        lbl.fontSize = size;
        lbl.color = color;
        lbl.horizontalAlign = 1;
        lbl.verticalAlign = 1;
        lbl.overflow = Label.Overflow.CLAMP;
        return n;
    }

    private static _btn(parent: Node, text: string, x: number, y: number,
                        w: number, h: number, color: Color): Node {
        const n = new Node('B');
        n.setParent(parent);
        n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(w, h);
        const g = n.addComponent(Graphics);
        g.fillColor = color;
        g.roundRect(-w / 2, -h / 2, w, h, 8); g.fill();
        g.strokeColor = new Color(210, 160, 70, 120);
        g.lineWidth = 1.5;
        g.roundRect(-w / 2, -h / 2, w, h, 8); g.stroke();
        UpgradeShop._label(n, text, 0, 0, 13, new Color(255, 250, 235, 255), w - 16);
        return n;
    }
}
