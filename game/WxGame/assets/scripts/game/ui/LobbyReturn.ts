import { Node, Vec3, tween, UIOpacity } from 'cc';
import { GameFlow } from '../../core/GameFlow';
import { AudioManager } from '../../core/AudioManager';
import { eventBus } from '../../core/EventBus';
import { DungeonManager } from '../dungeon/DungeonManager';
import { EnemyRegistry } from '../enemy/EnemyRegistry';
import { EnemyBoltPool } from '../enemy/EnemyBoltPool';
import { BulletPool } from '../weapon/BulletPool';
import { CombatVfx } from '../fx/CombatVfx';
import { GroundFlame } from '../fx/GroundFlame';
import { ThemeAmbient } from '../fx/ThemeAmbient';
import { LobbyUI } from './LobbyUI';
import { UpgradeShop } from './UpgradeShop';
import { FloorResult } from './FloorResult';
import { RoomBriefing } from './RoomBriefing';
import { BagPanel } from './BagPanel';
import { TalentPick } from './TalentPick';
import { WeaponReplaceUI } from './WeaponReplaceUI';
import { RunBag } from '../item/RunBag';
import { RunTalent } from '../item/RunTalent';
import { RunBuff } from '../item/RunBuff';
import { ViewZoom } from '../camera/ViewZoom';
import { BuffPick } from './BuffPick';

/**
 * LobbyReturn —— 结算/通关 → 大厅的统一软回
 * 清战斗残留 → 面板离场 → LobbyUI 侧栏滑入（对称开战退场）
 */
export class LobbyReturn {
    private static _busy = false;

    static get busy() { return LobbyReturn._busy; }

    /**
     * 关卡「下一关」：清战斗残留但保持 PLAY，不回大厅。
     * 调用前须已 beginStageRun（已灌入 RunBag）；此处不得 RunBag.reset。
     */
    static continuePlaying(canvas: Node, onReady?: () => void) {
        if (LobbyReturn._busy) return;
        LobbyReturn._busy = true;
        LobbyReturn._scrubWorld(canvas, { keepBag: true });
        GameFlow.setPlaying();
        try { ViewZoom.toPlay(); } catch { /* ignore */ }
        LobbyReturn._busy = false;
        try { onReady?.(); } catch (e) {
            console.error('[LobbyReturn] continuePlaying', e);
        }
    }

    /**
     * @param canvas Canvas
     * @param opts.panel 结算面板（先缩放出场再销毁）
     * @param opts.soulTip 回大厅后灵魂 tip
     * @param opts.onReady Lobby 显示后（通常 restartRun）
     */
    static go(
        canvas: Node,
        opts?: {
            panel?: Node | null;
            soulTip?: number;
            /** tip 文案；默认「本局折算灵魂石」 */
            soulTipLabel?: string;
            onReady?: () => void;
        },
    ) {
        if (LobbyReturn._busy) return;
        LobbyReturn._busy = true;

        const finish = () => {
            LobbyReturn._scrubWorld(canvas);
            GameFlow.setLobby();
            AudioManager.stopBgm();

            const soulTip = opts?.soulTip ?? 0;
            LobbyUI.show(canvas, () => {
                LobbyReturn._busy = false;
                try { opts?.onReady?.(); } catch (e) {
                    console.error('[LobbyReturn] onReady', e);
                }
            });
            if (soulTip > 0) {
                const label = opts?.soulTipLabel ?? `✦ 本局折算灵魂石 +${soulTip}`;
                const dm = canvas.getComponent(DungeonManager);
                const fire = () => eventBus.emit('show-tip', { text: label });
                if (dm) dm.scheduleOnce(fire, 0.42);
                else fire();
            }
        };

        const panel = opts?.panel;
        if (panel?.isValid) {
            const op = panel.getComponent(UIOpacity) ?? panel.addComponent(UIOpacity);
            op.opacity = 255;
            tween(panel)
                .to(0.18, { scale: new Vec3(0.85, 0.85, 1) }, { easing: 'quadIn' })
                .call(() => {
                    if (panel.isValid) panel.destroy();
                    finish();
                })
                .start();
            tween(op).to(0.18, { opacity: 0 }).start();
        } else {
            finish();
        }
    }

    private static _scrubWorld(canvas: Node, opts?: { keepBag?: boolean }) {
        UpgradeShop.forceClose(canvas);
        TalentPick.forceClose(canvas);
        BuffPick.forceClose(canvas);
        WeaponReplaceUI.forceClose(canvas);
        FloorResult.forceClose(canvas);
        RoomBriefing.forceClose(canvas);
        BagPanel.forceClose(canvas);
        // 下一关已 beginStageRun 灌包；回大厅才清空局内背包
        if (!opts?.keepBag) {
            RunBag.reset();
            RunTalent.reset();
            RunBuff.reset();
        }
        const dm = canvas.getComponent(DungeonManager);
        if (dm) dm.cancelFadeForLobby();
        else {
            const fade = canvas.getChildByName('FadeLayer');
            if (fade) fade.active = false;
        }

        EnemyRegistry.clear();
        EnemyBoltPool.clear();
        BulletPool.clear();
        CombatVfx.clear();

        const wl = canvas.getChildByName('WorldLayer');
        ThemeAmbient.clear(wl);
        const enemyLayer = wl?.getChildByName('EnemyLayer') ?? canvas.getChildByName('EnemyLayer');
        GroundFlame.clearAll(enemyLayer);
        GroundFlame.clearAll(wl);
        const scrubKids = (layer: Node | null | undefined) => {
            if (!layer) return;
            [...layer.children].forEach(c => { if (c.isValid) c.destroy(); });
        };
        scrubKids(enemyLayer);
        // BulletPool.clear 只清空闲池；活跃弹在 BulletLayer，软回须一并拆掉
        scrubKids(wl?.getChildByName('BulletLayer') ?? canvas.getChildByName('BulletLayer'));
        const portal = wl?.getChildByName('Portal') ?? canvas.getChildByName('Portal');
        if (portal?.isValid) portal.destroy();

        // 清掉可能残留的结算层
        for (const name of ['GameClear', 'GameOverPanel']) {
            const n = canvas.getChildByName(name);
            if (n?.isValid) n.destroy();
        }
    }
}
