# TypeScript 类型规范 — WxGame

## 核心游戏数据类型（`core/types.ts`）

```typescript
// ── 武器 ──
export type WeaponType = 'melee' | 'ranged' | 'magic';
export type Rarity = 'common' | 'rare' | 'epic';

export interface WeaponData {
    id: string;
    name: string;
    type: WeaponType;
    rarity: Rarity;
    damage: number;
    attackSpeed: number;   // 攻击间隔（秒）
    range: number;         // 攻击范围（像素）
    prefabPath: string;    // resources/ 相对路径
}

// ── 怪物 ──
export type EnemyType = 'melee' | 'ranged' | 'boss';

export interface EnemyData {
    id: string;
    type: EnemyType;
    hp: number;
    damage: number;
    speed: number;
    dropTable: DropEntry[];
    prefabPath: string;
}

export interface DropEntry {
    itemId: string;
    weight: number;        // 权重（加权随机）
}

// ── 道具 ──
export type ItemType = 'weapon' | 'consumable' | 'passive';

export interface ItemData {
    id: string;
    type: ItemType;
    name: string;
    description: string;
    rarity: Rarity;
    iconPath: string;
}

// ── 地牢 ──
export type RoomType = 'combat' | 'treasure' | 'shop' | 'boss' | 'start';

export interface RoomData {
    id: string;
    type: RoomType;
    templateId: string;    // Tiled 地图模板 ID
    enemies: EnemySpawnEntry[];
    exits: Direction[];
}

export type Direction = 'north' | 'south' | 'east' | 'west';
```

## 枚举 vs 联合类型

- **优先用字符串联合类型**（`'common' | 'rare'`），不用 enum（Tree-shaking 更好）
- 只在需要反向映射时用 `const enum`

## 泛型工具类型

```typescript
// 加权随机工具
export function weightedRandom<T extends { weight: number }>(items: T[]): T {
    const total = items.reduce((s, i) => s + i.weight, 0);
    let r = Math.random() * total;
    for (const item of items) {
        r -= item.weight;
        if (r <= 0) return item;
    }
    return items[items.length - 1];
}
```

## 微信 SDK 类型

- 安装 `@types/wechat-miniprogram`（dev dependency）
- 在 `wechat/` 目录下封装所有 `wx.*` 调用，主游戏逻辑不直接调用 `wx`
