/**
 * 全局事件总线
 * 组件间通信用这里，避免直接引用耦合
 *
 * 用法：
 *   import { eventBus, GameEvents } from '../core/EventBus';
 *   // 发送
 *   eventBus.emit(GameEvents.ENEMY_KILLED, { enemyId: 'slime', coins: 3 });
 *   // 监听（记得在 onDestroy 取消！）
 *   eventBus.on(GameEvents.ENEMY_KILLED, this.onEnemyKilled, this);
 *   // 取消
 *   eventBus.off(GameEvents.ENEMY_KILLED, this.onEnemyKilled, this);
 */
import { EventTarget } from 'cc';

export const GameEvents = {
    // 玩家
    PLAYER_HP_CHANGED:    'player-hp-changed',
    PLAYER_DIED:          'player-died',
    PLAYER_REVIVED:       'player-revived',
    PLAYER_ATTACKED:      'player-attacked',

    // 战斗
    ENEMY_KILLED:         'enemy-killed',
    ENEMY_DAMAGED:        'enemy-damaged',
    DAMAGE_DEALT:         'damage-dealt',    // 显示伤害数字

    // 道具/武器
    WEAPON_EQUIPPED:      'weapon-equipped',
    WEAPON_CHANGED:       'weapon-changed',
    ITEM_PICKED:          'item-picked',
    COIN_COLLECTED:       'coin-collected',
    BAG_CHANGED:          'bag-changed',

    // 地牢
    ROOM_CLEARED:         'room-cleared',
    ROOM_ENTERED:         'room-entered',
    FLOOR_STARTED:        'floor-started',
    FLOOR_CLEARED:        'floor-cleared',
    GAME_CLEARED:         'game-cleared',    // 通关（打完第5层Boss）

    // UI
    SHOW_PAUSE_MENU:      'show-pause-menu',
    HIDE_PAUSE_MENU:      'hide-pause-menu',
    SHOW_GAME_OVER:       'show-game-over',
    SHOW_RESULT:          'show-result',

    // 系统
    AUDIO_SETTINGS_CHANGED: 'audio-settings-changed',
} as const;

export type GameEventType = typeof GameEvents[keyof typeof GameEvents];

export const eventBus = new EventTarget();
