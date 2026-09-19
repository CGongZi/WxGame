# 技术设计 — WxGame 像素地牢探险

## 架构总览

```
┌─────────────────────────────────────────────────────┐
│                   Cocos Creator 3.8                  │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ GameMgr  │  │EventBus  │  │   AudioManager    │  │
│  │(单例/跨场景)│  │(全局事件)│  │(BGM+SFX)         │  │
│  └──────────┘  └──────────┘  └───────────────────┘  │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │              Game Scene                         │ │
│  │  ┌─────────┐ ┌──────────┐ ┌────────────────┐   │ │
│  │  │ Player  │ │EnemyGroup│ │ DungeonManager  │   │ │
│  │  │Controller│ │  (池)   │ │(地牢/房间生成)   │   │ │
│  │  └─────────┘ └──────────┘ └────────────────┘   │ │
│  │  ┌─────────┐ ┌──────────┐ ┌────────────────┐   │ │
│  │  │ Weapon  │ │ItemSystem│ │    HUD/UI       │   │ │
│  │  │ Manager │ │(掉落/背包)│ │                │   │ │
│  │  └─────────┘ └──────────┘ └────────────────┘   │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │           WeChat Adapter Layer                  │ │
│  │  StorageService | AdService | ShareService      │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

## 核心系统设计

### 1. 地牢生成（DungeonGenerator）

**算法**：预制房间模板 + BSP 随机拼接

```
Floor Layout（5层，每层5-8房间）:
  Start Room → [Combat Room x2-4] → [Treasure/Shop x0-1] → Boss Room
                          ↑ 随机连接 ↑
```

**房间坐标系**：网格坐标（不是像素），每格 = 1 个房间
**过渡方式**：相机滑动到新房间（不加载新场景）

### 2. 战斗系统

**攻击判定**：  
- 近战：圆形碰撞区域，单帧检测  
- 远程：Rigidbody 抛射物，OnTriggerEnter2D 回调

**伤害计算**：
```
实际伤害 = 武器伤害 * (1 - 防御系数) + 随机浮动[-10%, +10%]
暴击：15% 概率 * 1.5倍
```

**怪物 AI 状态机**：
```
IDLE → (感知到玩家) → CHASE → (进入攻击范围) → ATTACK → CHASE ...
                                                        ↘ (受到攻击) → HIT_STUN
```

### 3. 武器系统

每把武器是独立 Prefab，挂 `WeaponBase` 基类组件：
```typescript
abstract class WeaponBase extends Component {
    abstract attack(direction: Vec2): void;
    abstract get attackCooldown(): number;
}
class SwordWeapon extends WeaponBase { ... }
class BowWeapon extends WeaponBase { ... }
```

### 4. 掉落系统

**加权随机掉落**：
```
怪物死亡 → 查 dropTable → weightedRandom() → 实例化 ItemDrop prefab
宝箱开启 → 查 chest_loot 配置 → 保证至少1件武器
```

### 5. 虚拟摇杆

左侧摇杆：移动方向  
右侧区域点击/滑动：攻击方向  
技能按钮：右下角固定位置

## 关键数据流

```
用户触摸 → JoystickController → PlayerController.move(dir)
                              ↓
                    PhysicsSystem 移动角色
                              ↓
                    碰撞检测触发 → EnemyController.takeDamage()
                              ↓
                    Enemy HP ≤ 0 → eventBus.emit(ENEMY_KILLED)
                              ↓
                    DropSystem.spawnDrop() + GameState.killCount++
                              ↓
                    HUD 更新（监听 ENEMY_KILLED 事件）
```

## 资产清单

### 像素素材来源（免费 CC0）
- **Kenney Dungeon Tileset**：地板、墙壁、门
- **Kenney Tiny Dungeon**：角色、怪物精灵
- **OpenGameArt - Dungeon Tileset II**：补充素材

### 音频来源
- **BGM**：BeepBox 在线合成（像素风 chiptune）
  - 探索 BGM：轻快节奏 120BPM
  - Boss BGM：紧张感 150BPM
- **音效**：BFXR 生成
  - 攻击、受击、死亡、拾取、开门

## 分包方案

```
主包（≤4MB）：
  - Cocos 引擎（~2MB 压缩后）
  - 核心脚本
  - 第1层地图 + 角色素材

音频子包（异步加载）：
  - 所有 BGM（~3MB）

关卡子包（按需加载）：
  - 第2-5层地图数据
```
