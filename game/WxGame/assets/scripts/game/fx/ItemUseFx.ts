import { Color, find, Graphics, Node, tween, UITransform, Vec3 } from 'cc';
import type { ConfigItem } from '../../core/ConfigSchema';
import { PlayerStats } from '../../core/PlayerStats';
import { DungeonLayout } from '../dungeon/DungeonLayout';
import { WorldBridge } from '../dungeon/WorldBridge';
import { EnemyRegistry } from '../enemy/EnemyRegistry';
import { CombatVfx } from '../fx/CombatVfx';
import { drawItemGlyph } from '../fx/ItemArt';
import { AudioManager } from '../../core/AudioManager';
import { IdleBreath } from '../fx/IdleBreath';
import { WeaponController } from '../weapon/WeaponController';

/**
 * 道具使用 / 投掷动效（只动 WorldLayer / Body 子节点，不改 Player 世界坐标）。
 */
export class ItemUseFx {
    /** 朝瞄准方向抛物线投掷炸弹，落地再爆炸 */
    static throwBomb(
        amount: number,
        _scheduler: { scheduleOnce: (cb: () => void, t: number) => void },
        variant: 'fire' | 'frost' = 'fire',
    ): string {
        const parent = WorldBridge.worldLayer;
        const ox = WorldBridge.x;
        const oy = WorldBridge.y;
        const dir = ItemUseFx._aim();
        const dist = 160;
        const tx = ox + dir.x * dist;
        const ty = oy + dir.y * dist;

        ItemUseFx._playerStrike(dir.x, dir.y);
        AudioManager.playItem('throw');

        if (!parent?.isValid) {
            return ItemUseFx._explode(ox, oy, amount, variant);
        }

        const bomb = new Node('ThrownBomb');
        bomb.setParent(parent);
        bomb.setPosition(ox, oy, 0);
        bomb.addComponent(UITransform).setContentSize(36, 36);
        const g = bomb.addComponent(Graphics);
        // 简易炸弹剪影
        g.fillColor = variant === 'frost' ? new Color(120, 190, 240, 255) : new Color(40, 40, 45, 255);
        g.circle(0, -2, 12); g.fill();
        g.fillColor = new Color(255, 180, 60, 255);
        g.rect(-2, 8, 4, 8); g.fill();
        g.fillColor = new Color(255, 80, 40, 255);
        g.circle(0, 16, 3); g.fill();

        // 轨迹火花
        CombatVfx.burst(parent, ox, oy, new Color(255, 160, 60, 220), 5);

        const mid = new Vec3(
            (ox + tx) * 0.5 + dir.y * 28,
            (oy + ty) * 0.5 + Math.abs(dir.x) * 36 + 40,
            0,
        );
        tween(bomb)
            .to(0.18, { position: mid, scale: new Vec3(1.15, 1.15, 1) }, { easing: 'backOut' })
            .to(0.16, { position: new Vec3(tx, ty, 0), scale: new Vec3(0.95, 0.95, 1) }, { easing: 'quadIn' })
            .call(() => {
                if (!bomb.isValid) return;
                bomb.destroy();
                ItemUseFx._explode(tx, ty, amount, variant);
            })
            .start();

        return variant === 'frost' ? '❄ 投掷冰霜弹！' : '💣 投掷爆裂弹！';
    }

    private static _explode(x: number, y: number, amount: number, variant: 'fire' | 'frost' = 'fire'): string {
        // #154 投掷伤害随层数/攻击成长，不再固定小数
        const floor = DungeonLayout.current?.floor ?? 1;
        const scaled = Math.round(amount + PlayerStats.I.get('atk') * 0.55 + floor * 5);
        const radius = variant === 'frost' ? 175 : 155;
        const hits = EnemyRegistry.getInRange(x, y, radius);
        hits.forEach(e => {
            e.takeDamage(scaled);
            if (variant === 'frost') e.applySlow?.(0.4, 3.5);
        });
        const parent = WorldBridge.worldLayer;
        const main = variant === 'frost' ? new Color(140, 210, 255, 220) : new Color(255, 120, 40, 220);
        const spark = variant === 'frost' ? new Color(220, 245, 255, 255) : new Color(255, 200, 80, 255);
        if (parent?.isValid) {
            CombatVfx.deathBurst(parent, x, y, variant === 'frost' ? 'crystal' : 'bomb');
            CombatVfx.ringPulse(parent, x, y, main, 20, 0.4);
            CombatVfx.burst(parent, x, y, spark, 12);
        }
        CombatVfx.shakeWorld(variant === 'frost' ? 10 : 16);
        AudioManager.playItem('bomb');
        return variant === 'frost'
            ? `❄ 冰爆！${hits.length} 个敌人减速`
            : `💣 爆裂！命中 ${hits.length} 个`;
    }

    /** 喝药 / 卷轴：Body 闪光 + 环 */
    static useConsumable(it: ConfigItem) {
        const parent = WorldBridge.worldLayer;
        const x = WorldBridge.x;
        const y = WorldBridge.y;
        const col = it.kind === 'heal'
            ? new Color(80, 230, 120, 230)
            : it.id === 'potion_rage'
                ? new Color(255, 100, 80, 230)
                : it.id === 'scroll_haste'
                    ? new Color(120, 220, 255, 230)
                    : it.id === 'amulet'
                        ? new Color(200, 180, 100, 230)
                        : new Color(180, 160, 255, 230);

        ItemUseFx._playerPulse();
        if (parent?.isValid) {
            CombatVfx.ringPulse(parent, x, y, col, 16, 0.36);
            CombatVfx.burst(parent, x, y, col, 8);
            // 飘起的小图标
            const icon = new Node('UseIcon');
            icon.setParent(parent);
            icon.setPosition(x, y + 20, 0);
            icon.addComponent(UITransform).setContentSize(40, 40);
            drawItemGlyph(icon.addComponent(Graphics), it, 32);
            tween(icon)
                .to(0.45, {
                    position: new Vec3(x, y + 70, 0),
                    scale: new Vec3(0.4, 0.4, 1),
                }, { easing: 'quadOut' })
                .call(() => { if (icon.isValid) icon.destroy(); })
                .start();
        }
        AudioManager.playItem(it.kind === 'heal' ? 'heal' : 'buff');
    }

    static useCompass() {
        const parent = WorldBridge.worldLayer;
        if (parent?.isValid) {
            CombatVfx.ringPulse(
                parent, WorldBridge.x, WorldBridge.y,
                new Color(100, 200, 255, 200), 22, 0.5,
            );
        }
        AudioManager.playItem('buff');
    }

    private static _aim(): { x: number; y: number } {
        const player = find('Canvas/Player');
        const wc = player?.getComponent(WeaponController);
        if (wc) {
            const d = wc.getAimDir();
            const len = Math.sqrt(d.x * d.x + d.y * d.y) || 1;
            return { x: d.x / len, y: d.y / len };
        }
        const sx = player?.scale?.x ?? 1;
        return { x: sx >= 0 ? 1 : -1, y: 0 };
    }

    private static _playerStrike(dx: number, dy: number) {
        const body = find('Canvas/Player/Body');
        body?.getComponent(IdleBreath)?.strike(dx, dy);
    }

    private static _playerPulse() {
        const body = find('Canvas/Player/Body');
        const breath = body?.getComponent(IdleBreath);
        if (!breath) return;
        breath.baseScale = 1.2;
        breath.scheduleOnce(() => {
            if (breath.isValid) breath.baseScale = 1;
        }, 0.2);
    }
}
