/**
 * 开放世界摄像机 / 坐标铁律
 *
 * 禁止再引入第二套跟随（CameraFollow / 用 Player.position 当世界坐标）。
 *
 * 唯一正确模型：
 * 1. WorldBridge.x/y —— 玩家逻辑世界坐标（敌人/子弹/拾取只认这个）
 * 2. camX/camY —— 摄像机焦点，钳在地图内：
 *      |cam| ≤ mapHalf - viewHalf，避免滚出地图露出虚空
 * 3. WorldLayer.position = (-camX, -camY)
 * 4. Player 节点本地 = (x - camX, y - camY)
 *      · 地图中部：≈ (0,0)，视觉居中
 *      · 贴边：角色移向屏幕边缘，世界停滚
 * 5. Camera 永远在 Canvas 本地 (0,0)
 * 6. 读玩家世界位置一律用 WorldBridge.x/y，禁止用 Player.node.position
 *
 * ── 视角高度（orthoHeight）──
 * 唯一入口：`ViewZoom`（`game/camera/ViewZoom.ts`）。
 * - 大厅 LOBBY_ORTHO（略近，突出主角）
 * - 开战 PLAY_ORTHO（#166=340，真机可读；旧 470 人/底栏过小）；与 Lobby 按钮滑出同期 tween
 * - 改高度时必须同步 `WorldBridge.setViewHalf(w,h)`，否则贴边钳制会错
 * - FloorRenderer 每帧钉死到 `ViewZoom.targetOrtho`（tween 中不抢改）
 * 禁止：别处直接改 Camera.orthoHeight、或写死 375。
 *
 * ── 换层 FadeLayer ──
 * 遮罩矩形必须按当前/开战 ortho 铺满可见区域（见 DungeonManager._fadeCover）。
 * 禁止写死 1334×750（±375）：开战 ortho 变化时四周会露旧图。
 */
export {};
