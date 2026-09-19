# 目录结构规范 — WxGame 像素地牢

## 项目根目录（Cocos Creator 3.8）

```
WxGame/
├── assets/
│   ├── scenes/            # 场景文件
│   │   ├── Main.scene     # 主菜单
│   │   ├── Game.scene     # 游戏主场景
│   │   └── Loading.scene  # 加载场景
│   ├── scripts/           # TypeScript 源码（核心）
│   │   ├── core/          # 引擎核心（游戏管理器、事件系统）
│   │   ├── game/          # 游戏逻辑
│   │   │   ├── player/    # 玩家相关
│   │   │   ├── enemy/     # 怪物相关
│   │   │   ├── weapon/    # 武器系统
│   │   │   ├── dungeon/   # 地牢生成
│   │   │   ├── item/      # 道具/装备
│   │   │   └── ui/        # 游戏内 UI
│   │   ├── wechat/        # 微信 SDK 适配层
│   │   └── utils/         # 工具函数
│   ├── resources/         # 动态加载资源（resources.load）
│   │   ├── prefabs/       # 预制体
│   │   │   ├── enemies/
│   │   │   ├── weapons/
│   │   │   ├── items/
│   │   │   └── ui/
│   │   ├── tilemaps/      # Tiled 地图文件 (.tmx)
│   │   └── audio/         # 音频资源
│   ├── textures/          # 静态纹理（Sprite Atlas）
│   │   ├── characters/    # 角色像素图
│   │   ├── enemies/       # 怪物像素图
│   │   ├── tiles/         # 地板/墙壁瓦片
│   │   ├── weapons/       # 武器图标
│   │   ├── ui/            # UI 元素
│   │   └── effects/       # 粒子/特效纹理
│   └── audio/
│       ├── bgm/           # 背景音乐（.mp3）
│       └── sfx/           # 音效（.mp3/.wav）
├── extensions/            # Cocos 编辑器扩展（可选）
└── project.json           # 项目配置
```

## 命名约定

- **场景文件**：PascalCase（`GameMain.scene`）
- **TypeScript 类**：PascalCase（`PlayerController.ts`）
- **TypeScript 函数/变量**：camelCase（`getPlayerHp()`）
- **常量**：SCREAMING_SNAKE_CASE（`MAX_DUNGEON_FLOORS = 5`）
- **Prefab 文件**：PascalCase + 类型后缀（`EnemySlime.prefab`）
- **纹理图集**：snake_case（`player_sprites.plist`）
- **音频文件**：snake_case（`bgm_dungeon_01.mp3`）

## 文件组织原则

1. **按功能模块分组**，而非按文件类型（scripts/game/ 而非 scripts/）
2. **每个脚本只负责一件事**（单一职责）
3. **预制体与脚本配对**：`EnemySlime.prefab` 对应 `EnemySlime.ts`
4. **resources/ 只放需要动态加载的资源**，静态资源放 textures/
