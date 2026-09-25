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
  - 默认配置包（离线可玩）
  - 第1层必要素材

音频子包（异步加载）：
  - 所有 BGM（~3MB）

关卡 / 资源子包或 CDN：
  - 第2-5层与扩展贴图
  - CMS 发布的远程配置包（可选）
```

---

## 壳层场景流（完整游戏门面）

```
Boot（Loading / 登录）
  → Intro（开场动画，可跳过，可选）
  → Lobby 主界面（同场景）
       · 中央：主角展示
       · 底中：开始游戏
       · 左右：配置按钮
       · 摇杆隐藏，不刷怪开战
  → 点「开始游戏」
       · 侧栏滑出屏外 + 底栏消退
       · 摇杆/轮盘出现
       · Playing 态：可操控开玩
  → 结算 → 反向动画回 Lobby
```

### 主界面 → 开战 UX（用户确认 2026-09-21）

| 状态 | 主角 | 侧栏/底栏 | 摇杆 |
|------|------|-----------|------|
| Lobby | 中央可见，展示/待机 | 显示 | 隐藏 |
| 过渡 | 仍在场 | 滑出/消退 | 开始出现 |
| Playing | 可操控 | 在屏外 | 显示（左移动 / 右攻击） |

### 手机操作（用户确认 2026-09-21）

- **左**：移动虚拟摇杆（轮盘）
- **右**：攻击按钮；可拖动控制攻击方向；**长按连续攻击**，连发期间轮盘仍可改方向
- Lobby 隐藏双盘；开战过渡后显示

大厅侧栏按钮最低集：角色、图鉴（**武器 | 地图 | 怪兽** 三页）、天赋、商店、设置、排行榜（可占位）、分享。
---

## 配置驱动 + 内容后台（CMS）

### 配置包契约（客户端唯一内容源）

```ts
// 示意 — 正式字段以 progress-plan Phase K / M 落地为准
interface GameConfigPack {
  version: number;          // 单调递增
  publishedAt: string;
  characters: CharacterDef[];
  weapons: WeaponDef[];
  enemies: EnemyDef[];      // 含 mapThemeIds[] 或由 biomeSpawn 引用
  mapThemes: MapThemeDef[]; // 地板/障碍/氛围/层段权重
  biomeSpawn: BiomeSpawnTable[]; // themeId → 怪池权重 / 精英 / Boss
  floors: FloorDef[];
  items: ItemDef[];
  talents: TalentDef[];
  drops: DropTableDef[];
  economy: EconomyDef;
  codex?: { maps: CodexEntry[]; enemies: CodexEntry[] }; // 文案/排序
  meta?: { minClientVersion?: string };
}

interface MapThemeDef {
  id: string;
  name: string;
  floorColors: { dark: string; light: string; edge: string };
  obstacles: Array<{ shape: string; radius: number; countRange: [number, number] }>;
  floorMin?: number;
  floorMax?: number;
  weight: number;
}

interface BiomeSpawnTable {
  themeId: string;
  trash: Array<{ enemyId: string; weight: number }>;
  elite?: Array<{ enemyId: string; weight: number }>;
  boss?: Array<{ enemyId: string; weight: number }>;
}
```

### 换层流程（与 Phase M 对齐）

```
进层 / 进房
  → rollTheme(floor, weights, antiRepeat)
  → rebuildTerrain(theme)
  → spawnFrom(biomeSpawn[theme.id])
  → 首次遭遇 → SaveData.codex 解锁地图/怪
```

### 客户端加载顺序

1. `ConfigStore.loadBuiltin()`（`BuiltinPack`，提审包必带，保证离线可玩）
2. 可选 `ConfigRemote.tryFetchAndApply()` — 仅当 `PACK_URL` 非空 **且** `LOCK_REMOTE === false`
3. 远程 `version <=` 当前包 → `unchanged`（不降级、不 `tryApply`）
4. 网络 / 校验失败 → `failed`，保持当前包 + tip，**不阻断进大厅**
5. 默认 `PACK_URL === ''`、`LOCK_REMOTE === false`（空 URL 即离线/提审安全）；联调用 `configure({ url })`，发审可打 `LOCK_REMOTE = true`

正式字段与 API 草图见 `.trellis/spec/frontend/cms-contract.md`（与 `ConfigSchema.ts` 对齐，禁止后台另写一套）。

### 后台模块（独立 `admin/` — K7 骨架 + K8/K9 mock）

| 模块 | 能力 | 状态 |
|------|------|------|
| Contract | Schema SSOT + validate smoke + API stub | ✅ K7 |
| Auth | 管理员登录（Bearer mock） | ✅ K8 mock |
| CRUD | 角色/武器/怪/… JSON 编辑 + GET/PATCH | ✅ K9 mock |
| Upload | 贴图/音效/JSON → 对象存储 | K10 |
| Publish | Schema 校验 → 打配置包 → 本地制品 / latest | ✅ K11 mock（真 CDN 仍可换） |
| Rollback | 按 version 回滚 | K12 |
| Audit | 操作日志 | K12 |
| Client URL | `ConfigRemote.PACK_URL` + version skip + `LOCK_REMOTE` | ✅ K13 |
| E2E | 改武器 → publish → latest；客户端 `configure` 冷启动可 apply | ✅ K14 CMS `smoke:k14` + `ConfigRemote` 路径（局内伤害手测另做；非真 CDN/签名生产） |

### 联调验收

- 后台把某武器 `damage` 从 20 改为 35 并发布 → 客户端拉新包 → 局内实际伤害变化；离线仍可用旧内置包开战。
- 后台新增地图主题 + 绑定怪池并发布 → 换层能随到该主题且怪不越界。

### 与现有代码迁移

当前硬编码点（需逐步迁入 Config）：
- `TalentData.ts` / 武器常量 / `DungeonManager`+`BIOME_SPAWN_TABLES` 主题刷怪 / `FloorRenderer` 色板 / `GameConfig.ts` 数值
- 迁移策略：先 Schema + 把现有表导出为 default pack（含 1 个默认 `mapTheme`）→ Phase M 扩主题 → 再接 CMS 发版
