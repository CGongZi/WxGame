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
- **一个 .ts 文件只能有一个 `@ccclass` Component 子类**（Cocos 硬限制，tsc 不报；违规会 `[Scene] Each script can have at most one Component` 并让整包脚本 Missing class）。多个组件拆到子目录一文件一组件，公共静态工具放无组件的 `*Util.ts`；非 Component 的普通 class 可与一个 Component 同文件（如 `CharacterRig` + `RigAnimator`）
- **一个 Node 只能有一个 UIRenderer**（Graphics / Label / Sprite 互斥）：同节点 `addComponent(Graphics)` 再 `addComponent(Label)` 只会画出一个（#134 背包钮空棕块）。文字一律挂子节点
- **`makeLabel` / `_lbl` 都是单行 CLAMP 盒**（高 = 字号 + 10~14）：塞 `\n` 多行、或名字超宽触发自动换行，整段会被裁成空白（#146 商店 7 字长名、#147 模式卡说明）。多行拆多个 Label；可能超宽的名字用 `Overflow.SHRINK` + `enableWrapText = false`
- **根节点朝向用 `CombatFace`**（#148）：美术默认朝右；追击/瞄准按 dx 翻 `scale.x`。受击弹一下必须 `CombatFace.pulse`，禁止裸写 `setScale(1.15,1.15,1)` / `setScale(1,1,1)`——会把朝左抹成朝右。挤压动画只动 Body，不碰根节点符号
- **掉落在尸体旁**（#149）：`LootDrop` 落地先宽限期再磁吸；落点 `nearestFloor`；不要一 spawn 就被 320 磁吸瞬移到玩家脚边
- **角色缩略图 / 立绘统一 `CharacterRig.mount`**，不要混用 `drawPlayerSkin` 旧剪影，否则同一界面上下不一致
- 新建 .ts / 目录必须配 `.meta`（typescript / directory importer，唯一 uuid）；**不要用 PowerShell `Set-Content` 改含中文/emoji 的源文件**（默认 ANSI 编码会写坏 UTF-8）

## 测试要求

- 每个核心系统（地牢生成、战斗、掉落）需有手动测试场景
- 真机测试目标机型：iPhone 12、小米 Redmi Note 10

## Lobby overlay + BlockInput（壳层）

局外全屏遮罩（`TalentTree` / `SoulShop` / `SettingsPanel` / `CodexUI` / `CharacterSelect` / `LoadoutUI` / `RankBoard`）都挂 `BlockInputEvents`。关闭用「先 `active=false` 再延迟 destroy」避免点穿「开始」；因此：

1. **`reset()` 必须销毁孤儿根节点**（`_root` 或 `find('Canvas/<Name>')`），不能只清 `_open` 标志——否则 HUD/Lobby 壳层 reset 后遮罩仍挡点击。
2. **`show()` 若发现同名残留且 `!_open`，先 destroy 再重建**——关闭动画窗口期内二次打开会否则被旧节点挡住。
3. **`LobbyUI.doStart` 须同时守卫** `TalentTree.isOpen | SoulShop.isOpen | SettingsPanel.isOpen | CodexUI.isOpen | CharacterSelect.isOpen | LoadoutUI.isOpen | RankBoard.isOpen | NewbieGuide.isOpen | LobbyBag.isOpen`（`BlockInputEvents` 挡触摸，挡不了全局 `KEY_DOWN`）。
4. **`LobbyUI.reset()` 须调用各 overlay 的 `reset()`**（含 `CodexUI`、`CharacterSelect`、`LoadoutUI`、`RankBoard`、`LobbyBag`），避免孤儿 BlockInput。
5. **CodexUI / RankBoard / Settings 返回钮只绑 `TOUCH_END`**（勿同时绑 `MOUSE_UP`，桌面预览会双触发）；切页先 `removeFromParent` 再 `destroy`，避免叠旧 List。
6. **备战优先**：大厅侧栏入口为 `LoadoutUI`（备战）；`CharacterSelect` 仍保留 `reset/isOpen` 以防旧路径残留，新流程以备战选角+选武为准。

## Soft return vs `loadScene`

Death and clear use **`LobbyReturn.go`** (soft return) — do **not** `director.loadScene('Game')` for「回主界面」. Soft return must:

1. Scrub enemies / portal / `ThemeAmbient` / active `BulletLayer` + bolt pools / `CombatVfx`
2. `AudioManager.stopBgm()` + `GameFlow.setLobby()`
3. Panel tween-out → `LobbyUI.show` (side bars slide in; same as cold lobby)
4. Soul tip after slide-in — never inside `onPlay`

## Module statics after `loadScene`

Cocos `director.loadScene` does **not** reset JS module statics. Soft return avoids reload, but cold boot / rare full reload still need:

1. **Theme** — call `ThemeRuntime.resetRun()` in `DungeonManager.onLoad` / `restartRun` / first Playing spawn (otherwise floor theme cache from the previous run sticks).
2. **View** — `FloorRenderer` must `ViewZoom.snapLobby()` on viewport setup; ortho drift fixes must call `ViewZoom.applyOrtho` (keeps `WorldBridge.setViewHalf` in sync).
3. **Flow** — `PlayerController.onLoad` resets `GameFlow` to lobby.
4. **Combat** — enemy / bullet `update` must no-op when `!GameFlow.isPlaying` so lobby never chases/shoots if nodes linger.
5. **Room briefing** — while `GameFlow.isCombatFrozen`, player move/attack and enemy AI must no-op; release only after the board slides out (or lobby/forceClose).

## Player-facing copy (feel first)

Product goal: simple fun, rich toys — **in-run HUD** avoids spreadsheet strips.

1. **Lobby / 养成面板例外**：天赋树、永久商店强化、图鉴武器数值 **必须展示具体数字**（如 `攻击 +5/级`、`已生效 攻击 +5`），禁止只用「刀更锋利 / 体感变强」语感词。
2. Prefer verbs/icons in **combat tip / clear-shop flavor** (`🚪 找传送门`) over live ATK/DEF/SPD strips on HUD.
3. Tip channel is for **state changes** (boss room, portal, theme enter) — not every damage tick.
4. In-run shops may keep short fantasy titles, but apply logic still uses numeric deltas; lobby talent UI reads effects via `TalentData.format*`.

## Lobby overlays vs ViewZoom

Lobby chrome and **all** fullscreen overlays share the Canvas Camera. With `LOBBY_ORTHO=235`, keep panels inside `OverlaySafe` (`UiChrome`: max ≈720×400). Prefer `makePanel` / `fitPanelSize`, and place title/back via `overlayChromeY(panelH)` so children stay within ±panelH/2 (do not reuse 430-era Y coords after clamp). Lists: use `mountScrollArea` — build child named `view` (+ Mask) then add ScrollView and set `content` only; **never assign `scroll.view`** (getter-only in Cocos 3). Close with `softClose` + `lobby-input-lock` and `bindPress` / TOUCH_END `propagationStopped`. Lobby hero uses `IdleBreath.restScale≈1.85` so silhouette fills ~half the center ring diameter (camera zoom alone does not change hero/ring ratio).

**Flat chrome (2026-09-24):** `paintWarmPanel` / chips / buttons are **single fill + thin stroke** — no gold bevel, dual borders, drop shadow, or top shine strips. Codex gallery width/height must fit inside the panel (detail ≈250px, grid ≈390px); compute gallery Y from tab bottom → back-button top so cells never clip the return CTA. `overlayChromeY.titleY` uses `hh - 34` so titles keep top padding (not flush to panel edge).

## Actor motion (Body children only)

Procedural action lives on **visual child nodes**, never by moving `Player` world position or breaking WorldBridge / ViewZoom:

1. **`IdleBreath`** (hero Body) — idle breath vs **discrete walk plant/hop**, three-phase strike (windup→lunge→recover), hit flinch. Set `moving` + `moveDirX/Y` from `PlayerController`.
2. **`EnemyMotion`** (enemy Body) — soft idle only when `moving=false`; chase/fly sets `moving=true` for hop/wing/lunge. Attack uses `windup` / `strike` / `flinch`.
3. **`WeaponHand`** (hero Body) — drives `Body/WeaponIcon` carry bob + slash/thrust/bow/staff per `MotionTables.SWING_BY_WEAPON`.
4. Params by id in **`MotionTables`** (`skinId` / `weaponId` / `motionKind`) — no color/size if-stacks for gait.

Sprite frame packs remain Phase H; until then these procedural poses must read as real actions, not whole-body jitter.

## Hard cadence (non-negotiable)

Every development slice on this game **must** finish as:

1. **Develop** the scoped change  
2. **Check** (sanity / Trellis check as appropriate)  
3. **Edit milestones** in `progress-plan.md` + `prd.md`  

Do not start the next slice until checkboxes for the finished work are updated. Cursor rule: `.cursor/rules/dev-check-milestone.mdc`.
