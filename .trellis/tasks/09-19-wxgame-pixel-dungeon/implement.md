# 执行计划 — WxGame 像素地牢探险

## 前置准备（执行前确认）

- [ ] Cocos Creator 3.8 已安装（https://www.cocos.com/creator）
- [ ] 微信开发者工具已安装（https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html）
- [ ] 微信小游戏 AppID 已申请（https://mp.weixin.qq.com）

---

## Phase 1 — Cocos 项目初始化（M1 第1天）

### 步骤 1.1：创建 Cocos 项目
```bash
# 在 Cocos Creator 中：
# File → New Project → Empty(2D) → 路径选 E:\WxGame\game → 名称 WxGame
```
目标目录结构：`E:\WxGame\game\` 为 Cocos 项目根

### 步骤 1.2：配置微信小游戏发布
```
Cocos Creator 菜单：Project → Build → 平台选 WeChat Mini Game
AppID 填入微信申请的 ID
```

### 步骤 1.3：搭建目录骨架
按 `spec/frontend/directory-structure.md` 创建所有目录

### 步骤 1.4：引入核心配置文件
- `core/GameConfig.ts`：所有常量
- `core/types.ts`：所有类型定义
- `core/EventBus.ts`：全局事件
- `core/GameManager.ts`：单例管理器

---

## Phase 2 — 核心系统实现（M1 第2-7天）

### 步骤 2.1：玩家控制器
- `scripts/game/player/PlayerController.ts`
- `scripts/game/player/JoystickController.ts`
- 虚拟摇杆（左移动，右攻击方向）
- WASD 键盘支持（开发期调试用）

### 步骤 2.2：基础攻击系统
- `scripts/game/weapon/WeaponBase.ts`（抽象基类）
- `scripts/game/weapon/SwordWeapon.ts`（近战实现）
- 攻击 CD 计时，命中检测

### 步骤 2.3：怪物 AI
- `scripts/game/enemy/EnemyBase.ts`（基类）
- `scripts/game/enemy/MeleeEnemy.ts`（追击型）
- 状态机：IDLE → CHASE → ATTACK → STUNNED

### 步骤 2.4：HP 系统
- `scripts/game/player/PlayerStats.ts`
- `scripts/game/enemy/EnemyStats.ts`
- HUD：血条（`scripts/game/ui/HUDPanel.ts`）

### 步骤 2.5：碰撞层配置
```
Layer 配置（Cocos Project Settings）：
  Player: layer 1
  Enemy: layer 2
  PlayerBullet: layer 3
  EnemyBullet: layer 4
  Wall: layer 5
  Item: layer 6
碰撞矩阵：Player↔Enemy、Player↔EnemyBullet、PlayerBullet↔Enemy
```

---

## Phase 3 — 地牢系统（M2 第1-5天）

### 步骤 3.1：制作房间模板
- 安装 Tiled Map Editor
- 制作 10 个战斗房间模板（TMX 格式）
- 制作 2 个宝箱房间、1 个商店房间、1 个 Boss 房间

### 步骤 3.2：地牢生成器
- `scripts/game/dungeon/DungeonGenerator.ts`
- 网格布局算法，保证通路连通
- 生成房间序列（含随机 seed 支持调试）

### 步骤 3.3：房间管理器
- `scripts/game/dungeon/RoomManager.ts`
- 房间加载/卸载（只保留当前+相邻房间）
- 相机切换动画

### 步骤 3.4：门/出口系统
- 触碰门边缘 → 检查房间是否清空 → 过渡到下一房间
- 锁门/开门视觉反馈

---

## Phase 4 — 装备&经济系统（M3 第1-5天）

### 步骤 4.1：掉落系统
- `scripts/game/item/DropSystem.ts`
- 加权随机算法
- ItemDrop Prefab（可拾取的地面物品）

### 步骤 4.2：武器扩展
- `scripts/game/weapon/BowWeapon.ts`（远程）
- 子弹对象池（`scripts/game/weapon/BulletPool.ts`）

### 步骤 4.3：背包系统
- 最多 4 格背包
- 拾取/切换武器逻辑
- `scripts/game/ui/InventoryPanel.ts`

### 步骤 4.4：商店系统
- `scripts/game/dungeon/ShopRoom.ts`
- 金币消耗购买，随机3件商品

---

## Phase 5 — Boss 战（M2 第6-7天）

### Boss 实现
- `scripts/game/enemy/BossEnemy.ts`
- 血条单独 UI（全屏顶部）
- 2阶段攻击模式
- 必掉稀有武器

---

## Phase 6 — 美术资产整合（M4）

### 步骤 6.1：下载 Kenney 素材
```
下载地址：https://kenney.nl/assets/tiny-dungeon
下载地址：https://kenney.nl/assets/dungeon-tileset-ii
解压到：E:\WxGame\game\assets\textures\
```

### 步骤 6.2：图集打包
- Cocos Creator 内置 Atlas 打包
- 分组：角色集、怪物集、UI集、地图集

### 步骤 6.3：音频集成
- BFXR：生成攻击/受击/死亡/拾取音效 → 导出 MP3
- BeepBox：导出探索&Boss BGM → MP3

---

## Phase 7 — 微信接入（M5 第1-3天）

### 步骤 7.1：微信登录
```typescript
// wechat/AuthService.ts
wx.login({ success: (res) => { /* 获取 code */ } });
```

### 步骤 7.2：排行榜（开放数据域）
- 创建 `open-data/` 子目录
- `open-data/index.js`：处理分数更新和排行榜渲染

### 步骤 7.3：激励视频广告
```typescript
// wechat/AdService.ts — 复活流程
```

### 步骤 7.4：分享卡片
```typescript
wx.showShareMenu({ withShareTicket: true });
```

---

## Phase 8 — 测试&发布（M5 第4-7天）

### 性能测试
- [ ] 微信开发者工具 Performance Panel：确认 60FPS
- [ ] 真机调试：iPhone 12 + 小米 Redmi Note 10
- [ ] 包大小检查：`Build → 查看 dist/ 大小`

### 提审清单
- [ ] 游戏名称/图标/截图准备
- [ ] 隐私协议页面
- [ ] 用户数据说明
- [ ] 提交微信审核（审核周期 1-3 个工作日）

---

## 验证命令

```bash
# 构建检查
# Cocos Creator: Project → Build (WeChat Mini Game)
# 检查 build/wechat-mini-game/ 目录大小

# 真机预览
# 微信开发者工具 → 导入 build/wechat-mini-game/ → 真机调试
```

## 风险点

| 风险 | 概率 | 应对 |
|------|------|------|
| 主包超4MB | 中 | 提前做分包，纹理压缩 |
| 微信审核被拒 | 低 | 提前读审核规范，无血腥内容 |
| 低端机帧率不足 | 中 | 对象池+Draw Call 控制 |
| 排行榜开放数据域复杂 | 中 | MVP 先不做，v1.1 上 |
