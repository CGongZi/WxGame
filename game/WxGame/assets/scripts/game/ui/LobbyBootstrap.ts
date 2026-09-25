import { _decorator, Component, profiler } from 'cc';
import { GameFlow } from '../../core/GameFlow';
import { AudioManager } from '../../core/AudioManager';
import { DungeonManager } from '../dungeon/DungeonManager';
import { LobbyUI } from './LobbyUI';
import { BootLoading } from './BootLoading';
import { OpeningIntro } from './OpeningIntro';
import { NewbieGuide } from './NewbieGuide';

const { ccclass } = _decorator;

/**
 * LobbyBootstrap —— 挂在 Canvas，保证冷启动一定弹出主界面
 * 流程：BootLoading → OpeningIntro（可跳过）→ LobbyUI →（首次）NewbieGuide
 */
@ccclass('LobbyBootstrap')
export class LobbyBootstrap extends Component {
    private _booted = false;

    start() {
        const hide = () => { try { profiler.hideStats(); } catch { /* ignore */ } };
        hide();
        this.scheduleOnce(hide, 0.2);
        this.scheduleOnce(hide, 1);
        AudioManager.ensure();
        this.scheduleOnce(() => this._ensure(), 0);
        this.scheduleOnce(() => this._ensure(), 0.15);
        this.scheduleOnce(() => this._ensure(), 0.4);
    }

    private _ensure() {
        if (this._booted) return;
        if (!GameFlow.isLobby) return;
        if (!this.node?.isValid) return;

        this._booted = true;
        BootLoading.whenReady(this.node, () => {
            if (!this.node?.isValid) return;
            if (!GameFlow.isLobby) return;
            if (this.node.getChildByName('LobbyUI')) return;
            OpeningIntro.play(this.node, () => this._showLobby());
        });
    }

    private _showLobby() {
        if (!this.node?.isValid) return;
        if (!GameFlow.isLobby) return;
        if (this.node.getChildByName('LobbyUI')) return;
        try {
            console.log('[LobbyBootstrap] 开场结束，弹出主界面');
            LobbyUI.show(this.node, () => {
                const dm = this.node.getComponent(DungeonManager);
                if (dm) dm.restartRun();
                else this.node.addComponent(DungeonManager);
            });
            // 大厅出来后再叠新手引导（不挡 LobbyUI 首次布局）
            this.scheduleOnce(() => {
                if (!this.node?.isValid || !GameFlow.isLobby) return;
                NewbieGuide.maybeShow(this.node);
            }, 0.35);
        } catch (e) {
            console.error('[LobbyBootstrap] LobbyUI 失败', e);
            this._booted = false;
        }
    }
}
