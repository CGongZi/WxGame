# 状态管理规范 — WxGame

## 状态分层

| 层级 | 存储位置 | 生命周期 | 示例 |
|------|---------|---------|------|
| **全局持久** | `wx.setStorageSync` | 跨局保留 | 最高分、解锁角色 |
| **局内状态** | `GameManager` 单例 | 一局游戏 | 当前层数、金币、装备 |
| **组件状态** | Component 私有属性 | 组件生命周期 | 当前动画、CD 计时 |
| **UI 状态** | UIPanel 组件 | 面板开关 | 是否显示暂停菜单 |

## 游戏局内状态结构

```typescript
// core/GameState.ts
export interface RunState {
    floor: number;          // 当前层（1-5）
    coins: number;          // 本局金币
    playerHp: number;
    playerMaxHp: number;
    equippedWeapon: WeaponData | null;
    inventory: ItemData[];  // 背包（最多 4 格）
    killCount: number;
    startTime: number;      // 用于结算时间
}

export interface PlayerProgress {
    highestFloor: number;   // 历史最高层
    totalKills: number;
    totalRuns: number;
    bestTime: number;       // 最快通关时间（秒）
    unlockedItems: string[]; // 解锁的道具 ID
}
```

## 本地存档（微信）

```typescript
// wechat/StorageService.ts
export class StorageService {
    static save(progress: PlayerProgress): void {
        wx.setStorageSync('playerProgress', JSON.stringify(progress));
    }

    static load(): PlayerProgress {
        try {
            const data = wx.getStorageSync('playerProgress');
            return data ? JSON.parse(data) : DEFAULT_PROGRESS;
        } catch {
            return DEFAULT_PROGRESS;
        }
    }
}
```

## 状态变更规则

1. **局内状态只通过 `GameManager.instance.updateState()` 修改**，不散落各处
2. **持久状态只在局结束时写入**（不频繁 IO）
3. **UI 响应状态变更**：监听 `EventBus` 事件，不轮询
4. **禁止跨组件直接修改他人私有状态**

## 微信开放数据域（排行榜）

```typescript
// wechat/OpenDataService.ts
// 主域 → 开放数据域单向传消息
wx.getOpenDataContext().postMessage({
    event: 'UPDATE_SCORE',
    score: finalScore,
    floor: clearedFloor,
});
```

排行榜逻辑在 `open-data/` 独立域内运行，与主游戏逻辑隔离。
