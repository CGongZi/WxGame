# 后端/数据规范 — WxGame

## 说明

WxGame 是**纯客户端微信小游戏**，无服务端。"后端"指：
- 微信云开发（WeChat Cloud Base）— 用于排行榜持久化（可选）
- 本地数据文件（JSON 配置表）

## 游戏数据配置表（`assets/data/`）

```
assets/data/
├── weapons.json        # 所有武器定义
├── enemies.json        # 所有怪物定义
├── items.json          # 道具/装备定义
├── rooms.json          # 房间模板配置
├── shop.json           # 商店商品池
└── gameconfig.json     # 全局平衡参数
```

### 配置加载方式

```typescript
// utils/DataLoader.ts
export class DataLoader {
    private static _cache = new Map<string, unknown>();

    static async load<T>(name: string): Promise<T> {
        if (this._cache.has(name)) return this._cache.get(name) as T;
        const json = await resources.loadAsync(`data/${name}`, JsonAsset);
        const data = json.json as T;
        this._cache.set(name, data);
        return data;
    }
}
// 用法：const weapons = await DataLoader.load<WeaponData[]>('weapons');
```

## 微信云开发（排行榜）

仅在用户授权后使用，数据库集合：

| 集合 | 字段 | 说明 |
|------|------|------|
| `scores` | `openid, score, floor, date` | 玩家最高分 |

排行榜优先用**微信开放数据域**方案（不需要云开发）。

## JSON 配置规范

- 数值使用合理单位（像素、秒、点）
- 字符串 ID 唯一，kebab-case：`"sword-basic"`
- 新增字段必须有默认值（向后兼容）
