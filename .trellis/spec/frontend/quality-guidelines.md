# 质量规范 — WxGame 微信小游戏

## 性能红线（移动端）

| 指标 | 目标 | 红线 |
|------|------|------|
| 帧率 | 60 FPS | ≥ 30 FPS（中端手机） |
| 启动时间 | ≤ 2s | ≤ 4s |
| 主包大小 | ≤ 3.5 MB | ≤ 4 MB |
| 内存占用 | ≤ 150 MB | ≤ 200 MB |
| Draw Call | ≤ 30/帧 | ≤ 50/帧 |

## 必须遵守的性能规范

### 1. 对象池（Object Pool）
所有频繁生成/销毁的对象**必须**使用对象池：
- 子弹/抛射物
- 掉落道具
- 伤害数字飘字
- 粒子节点

```typescript
// 正确：从对象池取
const bullet = BulletPool.instance.get();
// 错误：每次 instantiate
const bullet = instantiate(this.bulletPrefab); // ❌
```

### 2. 图集打包
- **所有 Sprite 必须合并到 Atlas**（减少 Draw Call）
- 每个 Atlas ≤ 2048×2048（避免超出 GPU 纹理限制）
- 同场景的 Sprite 放同一 Atlas

### 3. 音频
- BGM：单轨，切换时淡入淡出
- 音效：最多 4 路并发
- 格式：`.mp3`（微信支持），采样率 44100Hz

### 4. Update 优化
```typescript
// 禁止在 update 中：
// ❌ new 对象
// ❌ 字符串拼接
// ❌ find() 查找节点
// ❌ JSON.parse/stringify

// 正确：缓存引用
onLoad() {
    this._player = find('Canvas/Player').getComponent(PlayerController)!;
}
```

## 微信小游戏特有规范

### 分包策略
```
主包（≤4MB）：引擎 + 核心脚本 + 首屏资源
子包1（音频）：BGM 文件（预加载）
子包2（关卡）：地图 TMX 文件
```

### 适配规范
- 设计分辨率：`750 × 1334`（iPhone 8 逻辑分辨率）
- 适配模式：`SHOW_ALL`（保持比例，两侧留黑）
- 安全区适配：检测 `wx.getSystemInfoSync().safeArea`

### 广告接入
```typescript
// 激励视频：必须在用户点击后触发，不能自动播放
rewardedVideoAd.onClose((res) => {
    if (res?.isEnded) {
        // 给予奖励（复活）
        this.revivePlayer();
    }
});
```

## 代码规范

- TypeScript strict 模式开启
- 禁止 `any` 类型（用 `unknown` + 类型守卫）
- 组件引用必须在 `onLoad/start` 中初始化，不在构造器
- 魔法数字提取到 `core/GameConfig.ts`

## 测试要求

- 每个核心系统（地牢生成、战斗、掉落）需有手动测试场景
- 真机测试目标机型：iPhone 12、小米 Redmi Note 10
