import { _decorator, Component, Graphics, UITransform, Color } from 'cc';
import { eventBus, GameEvents } from '../../core/EventBus';
import { EnemyRegistry } from '../enemy/EnemyRegistry';
import { RoomBuilder } from './RoomBuilder';

const { ccclass } = _decorator;

/**
 * RoomController —— 当前房间状态
 * 挂到 Room 节点（RoomBuilder 会自动挂上）
 * 逻辑：有怪时封门 → 清完怪开门并发 ROOM_CLEARED
 */
@ccclass('RoomController')
export class RoomController extends Component {

    private _cleared = false;
    private _armed   = false;   // 等刷怪完成后再开始检测
    private _builder: RoomBuilder | null = null;

    /** 对外：门是否已开（PlayerController 用来放行门洞） */
    get isCleared() { return this._cleared; }

    onLoad() {
        this._builder = this.getComponent(RoomBuilder);
        // 开放世界模式下 RoomBuilder 不画墙，setDoorsOpen 为空操作

        eventBus.on(GameEvents.ENEMY_KILLED, this._onEnemyKilled, this);
    }

    start() {
        // 等 EnemySpawner 刷完（同帧/下一帧）
        this.scheduleOnce(() => {
            this._armed = true;
            this._checkClear('start');
        }, 0.15);
    }

    onDestroy() {
        eventBus.off(GameEvents.ENEMY_KILLED, this._onEnemyKilled, this);
    }

    private _onEnemyKilled() {
        // 死亡动画 0.5s 后才 destroy，这里立刻用 isDead 判断
        this.scheduleOnce(() => this._checkClear('kill'), 0);
    }

    private _checkClear(reason: string) {
        if (this._cleared || !this._armed) return;

        const alive = EnemyRegistry.aliveCount;
        console.log(`[Room] check(${reason}) alive=${alive}`);

        if (alive > 0) return;

        this._cleared = true;
        this._builder?.setDoorsOpen(true);
        eventBus.emit(GameEvents.ROOM_CLEARED, { roomId: 0 });
        console.log('[Room] 已清空！大门开启');
    }

    /** 多房间阶段用：进入新房时重置（DungeonManager 调用） */
    resetForNewRoom(hasEnemies: boolean) {
        this._cleared = !hasEnemies;
        this._armed   = false;
        this._builder?.setDoorsOpen(this._cleared);

        // 延迟 armed，等 DungeonManager 刷怪完成
        this.scheduleOnce(() => {
            this._armed = true;
            this._checkClear('newroom');
        }, 0.25);
    }
}
