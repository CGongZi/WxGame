/**
 * Tile dungeon + character rigs (#125 / #126)
 *
 * ── Layout (DungeonLayout.ts) ──
 * - Grid = MapConstants 80×40 × 48px, origin at grid centre. World coords / camera iron rule unchanged.
 * - One `DungeonLayout.build()` per room (DungeonManager._loadRoom, before FloorRenderer.applyTheme).
 *   Lobby has NO layout (`DungeonLayout.current === null`) → FloorRenderer falls back to the open field.
 *   FloorRenderer clears the layout on FlowEvents.STATE 'lobby'.
 * - Tiles: FLOOR / WALL / PIT / WATER / LAVA. Features: spike / plate / trap_plate / turret / crate / torch / prop.
 * - Start chamber always contains the origin and stays feature-free (player resets to 0,0 each room).
 * - Every chamber centre must be BFS-reachable from the start chamber (`_ensureConnected`), and any floor
 *   pocket unreachable from the start (with crates/props counted as blocked) is sealed to WALL (`_sealPockets`)
 *   — otherwise an enemy spawned inside can never be killed and the room never clears.
 *   Interior features keep a 2-tile free ring inside each chamber so corridor mouths never get blocked.
 * - Chamber shapes: rect / round (ellipse) / cross. Corridors always ≥3 tiles wide (`CORRIDOR_W`);
 *   long straight ones may be 5 wide with a centre pillar row. `_punch` carves the corridor into
 *   non-rect chambers until it reaches floor. Treasure corridors are 3 wide too (1-wide = 48px < player 52px).
 * - Patterns: pillars / pool / spikes / lanes / islands / ring (moat + 2 bridges + plate) / checker / crosswall / alcoves.
 * - `blocked[]`: crate & prop tiles. Placement rule `_canPlaceBlocker`: floor, not corridor, no blocker in the
 *   8-neighbourhood, not a 1-wide neck. `isWalkable` (BFS / LOS / steer) excludes blocked tiles; crates call
 *   `WorldBridge.removeObstacleAt` → `unblockAt` when broken. Prop obstacle radius is capped at 26 in layout mode.
 * - `chamberIndexAt`, `spawnPointsIn(chIdx, n)` (floor, 4-neighbours walkable, spaced), `chamberArea`,
 *   `revealAround` / `explored` / `exploredVersion` (minimap).
 *
 * ── Collision (WorldBridge) ──
 * - Ground bodies (player / enemyStep): WALL + PIT solid, plus circle obstacles.
 * - Tile tests clamp the body radius to `TILE_RADIUS_CAP = 20` (player 26 / big enemies 34 keep their
 *   radius only for circle obstacles and enemy↔enemy separation). Never raise the cap above 23 (half tile − 1).
 * - `enemyStep` slides perpendicular when both axes are blocked (corner / pillar un-stick).
 * - Flyers (enemyFlyStep): WALL only.
 * - Projectiles (hitsObstacle): WALL + circle obstacles (fly over pits / water).
 * - WATER slows (frost theme: speeds up) via `WorldBridge.terrainSpeedMul`.
 * - Enemies chase with `WorldBridge.steerToward(x, y)`: direct if line of sight, else BFS flow field
 *   (recomputed when the player changes tile or every 0.35s in `WorldBridge.tick`, called from FloorRenderer.lateUpdate).
 *   ALL approach movement (ground + flyers + kiters closing distance) must use steerToward, not raw (player - self).
 *
 * ── Aggro (EnemyAggro.ts, #129) ──
 * - Soul-Knight rule: enemies wake when the player is in their chamber, when their chamber is alerted
 *   (any enemy in it got hit / woke), when very close (range×0.55), or in range with line of sight.
 *   Awake never reverts. `EnemyAggro.reset()` on every `_loadRoom`. Every new enemy AI must gate its
 *   update on `EnemyAggro.shouldWake` and call `EnemyAggro.alert` in takeDamage.
 * - Kiters (archer / mage) only shoot with line of sight; otherwise they steer closer.
 *
 * ── Spawning (DungeonManager.fillChambers, #129) ──
 * - Per non-start/non-treasure chamber: `round(clamp(area/22, 2, 7) × floorMul × runCountMul)` enemies
 *   (boss chamber ≤3 adds). Encounter-template enemies fill first, then the theme biome pool; ≥2 kinds per
 *   chamber, ≥3 kinds per map. Positions from `spawnPointsIn`. `RoomConfig.scale/dmgScale` carried for this.
 *
 * ── Minimap (ui/MiniMapUI.ts, #131) ──
 * - HUD child `MiniMap` (top-left under HPPanel, 200×100 = 2.5px/tile). Draws only explored tiles
 *   (row-merged rects, repaint only when `exploredVersion` / current chamber changes). Markers 10Hz:
 *   player, alive enemies in explored tiles, Boss (purple), Portal node (green pulse), plates (gold).
 * - Never toggles its own `node.active` (HUDManager owns it via `_combatHud`); it hides its Tiles/Marks children.
 *
 * ── HUD proximity fade (#130) ──
 * - `HUDManager._fadeNearPlayer`: any node in `_fadeNodes` whose rect (+34px) contains the player's
 *   screen position fades to opacity 70. All clickable HUD handlers go through `_tapOnce()` (mouse click
 *   fires TOUCH_END + MOUSE_UP). Hotbar is also refreshed by a per-frame RunBag signature watchdog.
 *
 * ── Hazards (Hazards.ts + hazards/*.ts) ──
 * - One Component per file (Cocos limit): `hazards/SpikeTrap|PressurePlate|WallTurret|BreakableCrate|Torch|TerrainHazardTicker.ts`;
 *   shared statics in `hazards/HazardUtil.ts` (class `Hazards`, re-exported from `Hazards.ts` alongside `spawnHazards`).
 *   Components import `./HazardUtil`, never `../Hazards` (avoids import cycle).
 * - All hazard nodes live under WorldLayer with the `Hazard_` prefix (FloorRenderer._clearTerrainNodes removes them).
 * - Damage goes through `Hazards.hurt()` → PlayerController.takeDamage (respects i-frames / shield).
 * - Breakable crates implement CombatEnemy with `neutral: true`: hittable, but excluded from
 *   aliveCount / getAlive / soft-aim (`getInRange(..., false)`). Never count neutrals for room clear.
 *
 * ── Rigs (CharacterRig.ts / EnemyRig.ts) ──
 * - Hero: Body/Rig container with Shadow, Cape, Back, ArmBack, LegBack, Torso, LegFront, Head, ArmFront.
 *   `CharacterRig.mount(body, skinId)` rebuilds; RigAnimator reads `moving` from the IdleBreath on Body.
 *   WeaponIcon stays a direct Body child on top; the front arm aims at it (WeaponHand rest = 21,-2).
 * - Enemies: `drawEnemySilhouette` routes biped kinds (bone/archer/mage/tank/golem/boss/imp) and flyers
 *   (bat/raven/moth/mosquito/dragon/jelly) to `EnemyRig.mount`; blob kinds keep the silhouette painters
 *   (slime/fast/wisp/specter/beetle/toad/crystal/spider/snake/shroom).
 *   EnemyRigAnimator reads EnemyMotion.moving / punch / wind.
 * - Rig parts only touch their own local transform. Body squash stays in IdleBreath / EnemyMotion.
 *   Never move the Player node or WorldBridge for visuals.
 * - Monster art rule (#138): enemies must read as NON-human at a glance. Never reuse the hero palette
 *   (skin tones, round face + helmet), never give them the hero's proportions. Each kind has a hook:
 *   bone=skeleton ribs/skull, archer=green goblin ears/nose, mage=faceless hooded wraith (floats, no legs),
 *   tank=ogre barrel + tusks, golem=cyclops stone rune eye, boss=horned demon, imp=small horned demon;
 *   dragon is multi-part (tail + body + head + finger-boned wings); jelly uses tentacle "wings".
 *   Held weapons point UP/forward, never below the feet.
 * - Spawn pacing (#171): biome entries may set `floorMin`/`floorMax`; `pickBiomeSpawn(theme, floor)`
 *   filters so early floors do not exhaust rare kinds (dragon/golem/imp/mage often floor 2–3+).
 * - Pixel sprites (#172): when `EnemyPixelData` has a kind, `drawEnemySilhouette` mounts a NEAREST
 *   `Sprite` via `EnemyPixelArt` before Rig/blob painters. Regenerate with `tools/pixel-gen/gen_enemies.py`.
 *   PNGs also land in `tools/pixelorama/exports/` for optional Pixelorama touch-ups.
 *
 * ── Archetypes (#142, DungeonLayout.archetype) ──
 * - `archetypeFor(themeId)`: ruins=rooms, cave=cavern, swamp=marsh, ice=lake, sky=islands, volcano=rivers,
 *   abyss=maze, necropolis=crypt. Each has its own `_genX()`; `_generate` only owns the common tail
 *   (origin clean → `_ensureConnected` → `_sealPockets` → `_fixCenter`). New themes MUST pick or add an
 *   archetype — never ship a theme that only changes the palette.
 * - Every archetype still produces `chambers` (spawn / aggro / minimap / ChamberClear depend on them).
 *   Open maps use virtual rect partitions; set `spawnMul` (0 = no spawn, <1 = sparse). `fillChambers` reads it.
 * - islands: `_voidTile = PIT`, all WALL → PIT BEFORE decorating (torch / turret / alcove need WALL).
 *   FloorRenderer paints one void backdrop and skips deep PIT tiles for that archetype.
 * - cavern: shape 'blob' + `_tunnel = 'wiggly'` (`_carveTunnel`). maze/crypt carve with `_setCorridor`
 *   then delete chamber cells from `_corridor` so crates can be placed inside.
 * - Stress-test any generator change with a Node harness (transpile DungeonLayout + MapConstants, 8 themes ×
 *   ≥150 seeds): origin floor, all chamber centres reachable + floor, spawnPointsIn ≥1 for spawnMul>0,
 *   bossPoint floor, spike/plate/crate/prop features on floor. Target 0 bad layouts.
 *
 * ── Hazards vs enemies (#140/#141 "机关不认主") ──
 * - SpikeTrap (up) and TerrainHazardTicker (lava / poison) also damage ground enemies, gated by
 *   `Hazards.canHurtEnemy(e, now)`: not neutral, not flyer, chamber alerted (asleep enemies are immune),
 *   per-enemy 1.0s cooldown. Spikes 1.5× floor dmg, terrain 1×. Enemy flow field (`_bfsEnemy`) treats
 *   LAVA as +6 cost so pathing avoids it; only straight-line chase crosses it. Never let hazards kill
 *   enemies that have not engaged the player. One-shot tips via `Hazards.tipped(key)`.
 *
 * ── Weapon modes (#143, weapon/WeaponModes.ts) ──
 * - `resolveMode(def)` → `{ fireMode, pellets, spreadDeg, burst, knockback, splash, bounce, slow }`; config
 *   fields optional, fallback `MODE_BY_ID`. New weapon = add config row + MODE_BY_ID entry + WeaponArt glyph
 *   + MotionTables swing. Melee hit tests: `arcHits` (edge distance, ≤46px ignores cone) / `thrustHits`
 *   (capsule); WeaponController keeps a 0.1s `_sweep` window after each swing. Swing VFX nodes only rotate
 *   RELATIVE to the aim (the Graphics is already drawn along the aim angle) — do not add the aim angle twice.
 * - Bullet extras: bounce (reflects off `hitsObstacle`, clears hit set), homing (≤4.5 rad/s toward nearest),
 *   splash (explode on hit / range end), knockback via `knockEnemy` (Boss 30%), slow → `applySlow`.
 *
 * ── Enemy big moves (#144, SlimeEnemy) ──
 * - beetle: chase → windup 0.55s (`CombatVfx.chargeWarn`) → dash 4.2× speed 0.4s via `enemyStep`; hitting
 *   the player = 1.4× dmg, hitting a wall = self-stun 0.8s. toad: windup 0.38s → 0.45s leap to the player's
 *   position at takeoff (snapped to floor), landing ring 74px = 1.2× dmg; not interruptible mid-air.
 *   Body local transform is owned by EnemyMotion every frame — air-time is sold with root scale, not Body y.
 * - Chamber clear (`ChamberClear.ts`, static): DungeonManager registers each spawned enemy's origin chamber
 *   (`track`, skips start/boss chambers); FloorRenderer.lateUpdate calls `tick` while playing (0.25s poll).
 *   When a chamber's enemies are all dead → `PlayerStats.refillArmor()` + coin burst at the chamber centre
 *   + tip. `reset()` must run BEFORE `_clearEnemies()` on room change so destroyed nodes don't fire it.
 *
 * ── Armor layer (#139, PlayerStats) ──
 * - Absorb chain: shield (item / ward, no regen) → armor (regen) → hp. Always `PlayerStats.absorbHit(dmg)`,
 *   never subtract shield/armor by hand. `armorMax = 18 + def×2 + maxHp×6%`; regen 30%/s after 3s no-hit
 *   (`tickArmor(dt)` from PlayerController.update); `refillArmor()` on new floor + chamber clear.
 * - HUD reads `hp-changed` payload `{ current, max, shield, armor, armorMax }`; armor is the 6-segment bar.
 */
export {};
