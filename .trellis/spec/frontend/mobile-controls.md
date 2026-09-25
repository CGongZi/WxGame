/**
 * Mobile touch controls (landscape)
 *
 * Left half: movement joystick (virtual pad).
 * Right half: attack button + aim pad.
 *   - Tap / hold: attack
 *   - Hold: continuous fire at weapon cooldown
 *   - Drag while held: update attack direction in real time
 *
 * Move dead zone: `moveDeadZone` × maxRadius (default 0.16). Inside → zero input.
 * Outside → direction × depth (0..1) so PlayerController can scale moveSpeed.
 * Aim dead zone: `aimDeadZone` pixels (default 12) before setAimDir updates.
 *
 * Aim priority: attack-pad setAimDir > recent mouse aim > move-pad setJoystickDir fallback.
 * Move pad must call WeaponController.setJoystickDir (NOT setAimDir), or _aimPadActive
 * sticks and blocks true attack-pad priority.
 * Mouse aim uses Camera.screenToWorld (not hardcoded 667,375) so it works when
 * alignCanvasWithScreen is false / preview size ≠ design resolution.
 * Mouse move is NOT blocked by _joyActive — PC WASD + mouse must aim freely.
 *
 * Lobby state: both pads hidden.
 * Playing state: pads **always visible** at bottom corners; touch relocates to finger,
 * release returns to rest (do not hide). Touch→local via UITransform.convertToNodeSpaceAR.
 * **Move pad visuals**: scene JoystickBg/Thumb historically had UITransform only — paint
 * Graphics at runtime (`_ensureMovePadVisual`) or the left pad is invisible while left-half
 * touch still moves the player (feels like “rubbing the screen”).
 * Soft-aim blend ≤0.08 while attack-pad dragging (指哪打哪).
 * **HUD bottom band** (WeaponBar ≈ y −230…−280 + Hotbar ≈ −280…−370, |x|<280):
 * JoystickController must ignore these touches so bag/potion/weapon-switch taps
 * are not stolen as move/attack.
 * **Skill button** (HUDManager `SKILL_BTN_X/Y` = 340,−120, painted r=47, hit r=60): JoystickController
 * `_hitsCombatHud` must exclude it too. Placed inward/above attack pad so WeChat safe-area does not clip it.
 * Dash/blink skills move the player ONLY through `WorldBridge.tryMove` (camera iron rule).
 * Skill kinds (SkillDefs): dash / bash / nova / volley / blink / spin / cone (facing fan) / ward (shield + slow).
 * `slow: [mul, sec]` on a def applies `applySlow` to every hit enemy.
 * **Every HUD click handler** (hotbar, bag, weapon bar, skill) goes through `HUDManager._tapOnce()`:
 * one mouse click fires both TOUCH_END and MOUSE_UP in Cocos 3.x.
 * **Weapon switch (mobile):** tap center WeaponBar to `cycleNext()` owned weapons.
 * PC still has 1–9 / Q·E for debug.
 * GameFlow is a module singleton — reset to lobby on scene load (Player.onLoad)
 * before HUD/LobbyUI, or restart leaves isPlaying sticky.
 *
 * PC debug: WASD + mouse aim; shipping UX is dual-pad.
 */
export {};
