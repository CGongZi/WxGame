# 组件（脚本）规范 — WxGame

## Cocos Creator 组件模式

所有游戏逻辑通过 **Component 脚本** 挂载到节点上。

### 标准脚本模板

```typescript
import { _decorator, Component, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('PlayerController')
export class PlayerController extends Component {

    // ── 序列化属性（Inspector 可见）──
    @property(Node)
    weaponNode: Node = null!;

    @property({ type: CCFloat, min: 0 })
    moveSpeed: number = 150;

    // ── 私有状态 ──
    private _hp: number = 0;
    private _isDead: boolean = false;

    // ── 生命周期 ──
    onLoad() {
        // 初始化，此时节点已激活，组件引用可用
        this._hp = GameConfig.PLAYER_BASE_HP;
    }

    start() {
        // 跨组件引用获取放这里（onLoad 之后）
    }

    update(dt: number) {
        // 每帧逻辑，保持轻量，复杂计算用 scheduleOnce
    }

    onDestroy() {
        // 清理事件监听，防内存泄漏
    }
}
```

### 关键约定

1. **`@ccclass` 名称 = 文件名**（避免序列化错误）
2. **`@property` 必须设默认值**，用 `null!` 标记非空引用
3. **私有属性前缀 `_`**：`_hp`、`_isDead`
4. **不在 `update()` 里做字符串拼接或 GC 操作**（移动端性能）
5. **事件监听必须在 `onDestroy` 中移除**

## 游戏管理器模式（单例）

```typescript
// core/GameManager.ts
@ccclass('GameManager')
export class GameManager extends Component {
    private static _instance: GameManager;

    static get instance(): GameManager {
        return GameManager._instance;
    }

    onLoad() {
        if (GameManager._instance) {
            this.destroy();
            return;
        }
        GameManager._instance = this;
        director.addPersistRootNode(this.node); // 跨场景保留
    }
}
```

## 事件通信

- **组件间通信**：优先用 `EventTarget` 或全局 `game/EventBus.ts`
- **禁止**直接持有其他组件引用跨模块通信（耦合）
- **父子节点**：可通过 `getComponent()` 直接访问

```typescript
// EventBus.ts
import { EventTarget } from 'cc';
export const GameEvents = {
    PLAYER_DIED: 'player-died',
    ENEMY_KILLED: 'enemy-killed',
    ITEM_PICKED: 'item-picked',
    FLOOR_CLEARED: 'floor-cleared',
};
export const eventBus = new EventTarget();
```

## UI 组件规范

- UI 脚本放 `scripts/game/ui/`
- 每个 UI 面板一个脚本：`HUDPanel.ts`、`PauseMenu.ts`
- 用 `UITransform`、`Widget` 做自适应，不硬编码像素坐标
- **微信小游戏安全区**：底部留 `34px`（iPhone 刘海屏）
