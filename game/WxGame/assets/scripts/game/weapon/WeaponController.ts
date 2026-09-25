import { _decorator, Component, Node, Vec3, input, Input,
         EventKeyboard, KeyCode, EventMouse, Graphics, UITransform,
         Color, tween, find, Camera, view, UIOpacity } from 'cc';
import { EnemyRegistry, type CombatEnemy } from '../enemy/EnemyRegistry';
import { resolveMode, arcHits, thrustHits, beamCast, knockEnemy, splashAt, type ModeParams } from './WeaponModes';
import { BulletPool } from './BulletPool';
import { eventBus, GameEvents } from '../../core/EventBus';
import { WorldBridge } from '../dungeon/WorldBridge';
import { PlayerStats } from '../../core/PlayerStats';
import { GameFlow, FlowEvents } from '../../core/GameFlow';
import { GameManager } from '../../core/GameManager';
import { getCharacter } from '../../core/CharacterData';
import { ConfigStore } from '../../core/ConfigStore';
import { IdleBreath } from '../fx/IdleBreath';
import { WeaponHand } from '../fx/WeaponHand';
import { bodyStrikeMul, swingForWeapon } from '../fx/MotionTables';
import { PlayerController } from '../player/PlayerController';
import { CombatVfx } from '../fx/CombatVfx';
import { AudioManager } from '../../core/AudioManager';
import { Haptic } from '../../core/Haptic';

const { ccclass, property } = _decorator;

// ── 武器定义 ────────────────────────────────────────────────

export type WeaponType = string;

export function isWeaponType(id: string): boolean {
    return !!id && ConfigStore.weapon(id) != null;
}

export interface WeaponDef {
    id:            WeaponType;
    name:          string;
    emoji:         string;
    type:          'melee' | 'ranged';
    damage:        number;
    cooldown:      number;
    range:         number;
    // 近战
    coneHalf:      number;    // 扇形半角（度），默认 70
    multiHit:      number;    // 近战连击次数，1=单次
    // 远程
    bulletSpeed?:  number;
    bulletSize?:   number;
    bulletColor?:  Color;
    bulletShape?:  'ball' | 'arrow' | 'orb';
    piercing?:     boolean;   // 穿透（魔法杖）
    // #143 打法（缺省按 id 查 WeaponModes.MODE_BY_ID）
    fireMode?:     string;
    pellets?:      number;
    spreadDeg?:    number;
    burst?:        number;
    knockback?:    number;
    splash?:       number;
    bounce?:       number;
    slow?:         [number, number];
    description:   string;
    rarity?:       'white' | 'green' | 'blue' | 'purple' | 'gold' | 'red' | 'common' | 'rare' | 'epic';
    unlockFloor?:  number;
    dropWeight?:   number;
    /** @deprecated #156 不再限制装备 */
    ownerCharacterId?: string;
}

/** 当前配置包里的武器。局内升级改的是副本，不要改这里返回的对象。 */
export function getWeapon(id: WeaponType): WeaponDef {
    const found = ConfigStore.weapon(id);
    if (!found) throw new Error(`[Weapon] 配置缺少 ${id}`);
    return found;
}

// ── WeaponController ────────────────────────────────────────

@ccclass('WeaponController')
export class WeaponController extends Component {

    @property(Node)
    bulletLayer: Node = null!;

    private _weapon: WeaponDef = WeaponController._cloneDef('sword');
    private _cd = 0;
    private _mouseDir   = new Vec3(1, 0, 0);
    private _joyDir     = new Vec3(0, 0, 0);
    private _joyActive  = false;
    /** 右攻击盘长按连发 */
    private _holding = false;
    private _aimPadActive = false;
    private _cam: Camera | null = null;
    private _tmpScreen = new Vec3();
    private _tmpWorld = new Vec3();

    /** 局内最多携带两把（元气骑士式）；第三把替换当前装备 */
    static readonly SLOT_CAP = 2;

    /** 已拾取的武器背包（开局只有角色起始武） */
    private _owned: Set<WeaponType> = new Set(['sword']);
    /** 槽位顺序：用于切换；长度 ≤ SLOT_CAP */
    private _slots: WeaponType[] = ['sword'];
    /** 每把已拥有武器的可变副本（升级/掉落缩放改这里，不改配置包） */
    private _loadouts: Partial<Record<WeaponType, WeaponDef>> = {
        sword: WeaponController._cloneDef('sword'),
    };

    private static _cloneDef(id: WeaponType): WeaponDef {
        const src = getWeapon(id);
        return {
            ...src,
            bulletColor: src.bulletColor ? src.bulletColor.clone() : undefined,
        };
    }

    private _ensureLoadout(id: WeaponType): WeaponDef {
        let w = this._loadouts[id];
        if (!w) {
            w = WeaponController._cloneDef(id);
            this._loadouts[id] = w;
        }
        return w;
    }

    onLoad() {
        try {
            if (!this.bulletLayer) {
                // 子弹进 WorldLayer（或 BulletLayer），与敌人同一坐标系
                this.bulletLayer = find('Canvas/WorldLayer/BulletLayer')
                                ?? find('Canvas/WorldLayer')
                                ?? this.node.parent!;
            }
            this._weapon = this._ensureLoadout('sword');
            this._syncOwnedFromSave();
            this._refreshWeaponHUD();
            // 挂在 onLoad：死亡后 enabled=false 时仍能收到开战事件
            eventBus.on(FlowEvents.STATE, this._onFlowState, this);
        } catch (e) {
            // 避免配置包瞬时校验失败时把整场景反序列化打挂（编辑器 Load scene failed）
            console.error('[WeaponController] onLoad failed', e);
        }
    }

    onDestroy() {
        eventBus.off(FlowEvents.STATE, this._onFlowState, this);
    }

    /**
     * 局外预览用：只灌角色起始武，不把商店「解锁武器」塞进背包。
     * 局内开枪由 `_equipStarter` 重建。
     */
    private _syncOwnedFromSave() {
        const starter = this._starterWeapon() ?? 'sword';
        this._owned = new Set<WeaponType>([starter]);
        this._slots = [starter];
        const loadout = WeaponController._cloneDef(starter);
        this._loadouts = { [starter]: loadout };
        this._weapon = loadout;
    }

    /** 角色开局武器：存档角色的 exclusiveWeaponId（起始武，非锁定） */
    private _starterWeapon(): WeaponType | null {
        const id = GameManager.instance?.selectedCharacterId;
        const raw = id ? getCharacter(id)?.exclusiveWeaponId : null;
        if (raw && isWeaponType(raw)) return raw;
        const pick = GameManager.instance?.selectedWeaponId;
        if (pick && isWeaponType(pick)) return pick;
        return null;
    }

    private _equipStarter() {
        const starter = this._starterWeapon() ?? 'sword';
        this._owned = new Set([starter]);
        this._slots = [starter];
        this._loadouts = { [starter]: WeaponController._cloneDef(starter) };
        this._weapon = this._loadouts[starter]!;
        this._cd = 0;
        try { GameManager.instance?.unlockCodexWeapon(starter); } catch {}
        eventBus.emit('weapon-changed', { id: starter, emoji: this._weapon.emoji });
    }

    /** 大厅购武 / 死亡后再开局：重新启用并灌入存档解锁 */
    private _onFlowState(d: { state: string }) {
        if (d.state !== 'playing') return;
        if (!this.enabled) this.enabled = true;
        this._syncOwnedFromSave();
        this._equipStarter();
        this._refreshWeaponHUD();
    }

    onEnable() {
        // 局内勿再 sync：会丢掉本局拾取并把当前武打回存档 starter
        if (!GameFlow.isPlaying) this._syncOwnedFromSave();
        input.on(Input.EventType.KEY_DOWN,   this._onKey,       this);
        input.on(Input.EventType.MOUSE_DOWN, this._onMouseDown, this);
        input.on(Input.EventType.MOUSE_MOVE, this._onMouseMove, this);
        // 玩家死亡时自动关闭武器
        eventBus.on(GameEvents.PLAYER_DIED, this._onPlayerDied, this);
    }

    onDisable() {
        input.off(Input.EventType.KEY_DOWN,   this._onKey,       this);
        input.off(Input.EventType.MOUSE_DOWN, this._onMouseDown, this);
        input.off(Input.EventType.MOUSE_MOVE, this._onMouseMove, this);
        eventBus.off(GameEvents.PLAYER_DIED, this._onPlayerDied, this);
    }

    private _onPlayerDied() {
        this._holding = false;
        this.enabled = false;
    }

    update(dt: number) {
        if (this._cd > 0) this._cd -= dt;
        this._tickSweep(dt);
        // 按住开火 / 拖瞄准盘时朝向跟瞄准，避免「边走边打倒着射」
        if (this._holding || this._aimPadActive) {
            const dir = this._aimDir();
            this.node.getComponent(PlayerController)?.faceToward(dir.x);
        }
        // 长按连续攻击
        if (this._holding && this._cd <= 0) this._tryAttack();
    }

    /** 移动摇杆方向（仅作攻击方向兜底，攻击盘优先） */
    setJoystickDir(x: number, y: number) {
        this._joyDir.set(x, y, 0);
        this._joyActive = (Math.abs(x) > 0.05 || Math.abs(y) > 0.05);
        if (this._joyActive && !this._aimPadActive) this._mouseDir.set(x, y, 0);
    }

    /** 右侧攻击轮盘瞄准 */
    setAimDir(x: number, y: number) {
        this._aimPadActive = true;
        this._mouseDir.set(x, y, 0);
    }

    startHoldAttack() {
        this._holding = true;
        this._tryAttack();
    }

    stopHoldAttack() {
        this._holding = false;
        this._aimPadActive = false;
    }

    /**
     * 拾取武器（#156 / #161）：
     * - 未满 2 槽：加入并装备 → true
     * - 已有同 id：强化 → true
     * - 已满：不自动替换，返回 false（由 UI 选要放下的那把）
     */
    equipWeapon(id: WeaponType, scaled?: WeaponDef): boolean {
        const incoming = scaled
            ? {
                ...scaled,
                bulletColor: scaled.bulletColor ? scaled.bulletColor.clone() : undefined,
            }
            : WeaponController._cloneDef(id);

        if (this._owned.has(id)) {
            const cur = this._ensureLoadout(id);
            cur.damage = Math.max(cur.damage, incoming.damage);
            if (incoming.rarity) cur.rarity = incoming.rarity;
            this._weapon = cur;
            this._cd = 0;
            this._refreshWeaponHUD();
            try { GameManager.instance?.unlockCodexWeapon(id); } catch {}
            eventBus.emit('show-tip', { text: `⬆ ${cur.emoji} ${cur.name} 强化` });
            this._punchIcon();
            return true;
        }

        if (this._slots.length >= WeaponController.SLOT_CAP) {
            return false;
        }

        this._commitEquip(id, incoming, null);
        return true;
    }

    /** 当前槽位武器副本（供替换 UI） */
    slotWeapons(): WeaponDef[] {
        return this._slots
            .filter(id => this._owned.has(id))
            .map(id => this._ensureLoadout(id));
    }

    get isFull(): boolean {
        return this._slots.length >= WeaponController.SLOT_CAP;
    }

    /**
     * #161 玩家选定要放下的槽位后：换上新武。
     */
    replaceOwned(oldId: WeaponType, incoming: WeaponDef) {
        if (!this._owned.has(oldId)) return;
        const copy = {
            ...incoming,
            bulletColor: incoming.bulletColor ? incoming.bulletColor.clone() : undefined,
        };
        this._owned.delete(oldId);
        this._slots = this._slots.filter(x => x !== oldId);
        delete this._loadouts[oldId];
        this._commitEquip(copy.id, copy, oldId);
    }

    private _commitEquip(id: WeaponType, incoming: WeaponDef, replaced: WeaponType | null) {
        this._owned.add(id);
        if (this._slots.indexOf(id) < 0) this._slots.push(id);
        this._loadouts[id] = incoming;
        this._weapon = incoming;
        this._cd = 0;
        this._refreshWeaponHUD();
        try { GameManager.instance?.unlockCodexWeapon(id); } catch {}
        this._punchIcon();
        this._attackPose(1, 0);
        const host = this.node.parent ?? this.node;
        CombatVfx.ringPulse(
            host,
            WorldBridge.screenX,
            WorldBridge.screenY,
            this._weapon.type === 'melee'
                ? new Color(255, 210, 120, 220)
                : new Color(140, 210, 255, 220),
            18,
            0.28,
        );
        const tip = replaced
            ? `⇄ 放下 ${getWeapon(replaced).name} · 装备 ${this._weapon.name}`
            : `${this._weapon.emoji} ${this._weapon.name}`;
        eventBus.emit('show-tip', { text: tip });
        console.log(`[Weapon] 装备：${this._weapon.name}${replaced ? `（替换 ${replaced}）` : ''}`);
    }

    private _punchIcon() {
        const icon = this.node.getChildByName('Body')?.getChildByName('WeaponIcon')
            ?? this.node.getChildByName('WeaponIcon');
        if (!icon) return;
        icon.setScale(0.5, 0.5, 1);
        tween(icon)
            .to(0.14, { scale: new Vec3(1.35, 1.35, 1) }, { easing: 'backOut' })
            .to(0.1, { scale: new Vec3(1, 1, 1) })
            .start();
    }

    /** #156 任意角色可装备任意掉落武；保留 API 以免旧调用崩 */
    static canCurrentCharacterUse(_id: WeaponType): boolean {
        return true;
    }

    /** 局内升级当前武器（改 loadout 副本，不写配置包） */
    upgradeCurrent(opts: { damage?: number; cooldownMul?: number } = {}): string {
        const w = this._weapon;
        const dmgAdd = opts.damage ?? Math.max(3, Math.round(w.damage * 0.18));
        w.damage += dmgAdd;
        if (opts.cooldownMul) {
            w.cooldown = Math.max(0.12, w.cooldown * opts.cooldownMul);
        } else {
            w.cooldown = Math.max(0.12, w.cooldown * 0.94);
        }
        this._loadouts[w.id] = w;
        this._refreshWeaponHUD();
        return `${w.emoji} ${w.name} 伤害+${dmgAdd}`;
    }

    get currentWeapon() { return this._weapon; }
    isOwned(id: WeaponType) { return this._owned.has(id); }

    /** 当前可切换的已拥有武器（槽位顺序） */
    ownedUsableIds(): WeaponType[] {
        return this._slots.filter(id => this._owned.has(id));
    }

    /**
     * 手机主交互：点武器栏轮换下一把已拥有武器。
     * @returns 换到的武器名；只有一把时返回 null
     */
    cycleNext(): string | null {
        const owned = this.ownedUsableIds();
        if (owned.length < 2) return null;
        const cur = owned.indexOf(this._weapon.id);
        const next = owned[(cur + 1) % owned.length];
        this._selectOwned(next, true);
        return this._weapon.name;
    }

    /** 按列表下标装备（PC 数字键 / 将来武器托盘） */
    selectOwnedAt(index: number): boolean {
        const owned = this.ownedUsableIds();
        const id = owned[index];
        if (!id) return false;
        this._selectOwned(id, true);
        return true;
    }

    private _selectOwned(id: WeaponType, withFx: boolean) {
        if (this._weapon.id === id) {
            this._refreshWeaponHUD();
            return;
        }
        this._weapon = this._ensureLoadout(id);
        this._cd = 0;
        this._refreshWeaponHUD();
        if (!withFx) return;
        const icon = this.node.getChildByName('Body')?.getChildByName('WeaponIcon')
            ?? this.node.getChildByName('WeaponIcon');
        if (icon) {
            icon.setScale(0.55, 0.55, 1);
            tween(icon)
                .to(0.12, { scale: new Vec3(1.25, 1.25, 1) }, { easing: 'backOut' })
                .to(0.08, { scale: new Vec3(1, 1, 1) })
                .start();
        }
        this._attackPose(1, 0);
        eventBus.emit('show-tip', { text: `⇄ ${this._weapon.emoji} ${this._weapon.name}` });
        AudioManager.playUi();
    }

    /** @deprecated 改用 startHoldAttack；保留兼容 */
    tryAttackFromTouch() { this.startHoldAttack(); }

    // ── 输入 ─────────────────────────────────────────────────

    private _onKey(e: EventKeyboard) {
        if (!GameFlow.isPlaying) return;
        if (e.keyCode === KeyCode.SPACE || e.keyCode === KeyCode.KEY_J) {
            this._tryAttack();
        }
        // 数字键：按已拥有列表下标切枪（浏览器调试）
        if (e.keyCode >= KeyCode.DIGIT_1 && e.keyCode <= KeyCode.DIGIT_9) {
            this.selectOwnedAt(e.keyCode - KeyCode.DIGIT_1);
        }
        // Q / E 轮换（可选桌面快捷）
        if (e.keyCode === KeyCode.KEY_Q) this.cycleNext();
        if (e.keyCode === KeyCode.KEY_E) {
            const owned = this.ownedUsableIds();
            if (owned.length < 2) return;
            const cur = owned.indexOf(this._weapon.id);
            const prev = owned[(cur - 1 + owned.length) % owned.length];
            this._selectOwned(prev, true);
        }
    }

    private _onMouseDown(e: EventMouse) {
        if (!GameFlow.isPlaying) return;
        this._updateMouseAim(e);
        if (e.getButton() === 0) this._tryAttack();
    }

    private _onMouseMove(e: EventMouse) {
        if (!GameFlow.isPlaying) return;
        // 仅攻击盘占用时忽略鼠标；移动摇杆不再锁死鼠标（PC WASD+鼠标要可用）
        if (this._aimPadActive) return;
        this._updateMouseAim(e);
    }

    /** 玩家屏幕位置 → 鼠标方向（贴边时玩家不在正中心） */
    private _updateMouseAim(e: EventMouse) {
        if (!this._cam?.isValid) {
            this._cam = find('Canvas/Camera')?.getComponent(Camera) ?? null;
        }
        if (this._cam) {
            const sp = e.getLocation();
            this._tmpScreen.set(sp.x, sp.y, 0);
            this._cam.screenToWorld(this._tmpScreen, this._tmpWorld);
            // 瞄准原点 = 玩家视觉位置（中央为 0；贴边为 screenX/Y）
            const ox = this._cam.node.worldPosition.x + WorldBridge.screenX;
            const oy = this._cam.node.worldPosition.y + WorldBridge.screenY;
            const dx = this._tmpWorld.x - ox;
            const dy = this._tmpWorld.y - oy;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 2) this._mouseDir.set(dx / len, dy / len, 0);
            return;
        }
        const loc = e.getUILocation();
        const ds = view.getDesignResolutionSize();
        const dx = loc.x - (ds.width * 0.5 + WorldBridge.screenX);
        const dy = loc.y - (ds.height * 0.5 + WorldBridge.screenY);
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 5) this._mouseDir.set(dx / len, dy / len, 0);
    }

    // ── 攻击逻辑 ─────────────────────────────────────────────

    private _tryAttack() {
        if (!GameFlow.isPlaying || GameFlow.isCombatFrozen) return;
        if (this._cd > 0) return;
        this._cd = this._weapon.cooldown;

        if (this._weapon.type === 'melee') {
            this._doMelee();
        } else {
            this._doRanged();
        }
    }

    /** 供投掷道具等读取瞄准方向（不改 Player 世界坐标） */
    getAimDir(): Vec3 {
        return this._aimDir();
    }

    /**
     * 技能齐射：当前为远程武器时朝 (dx,dy) 扇形发 count 发；近战返回 0 由调用方退化。
     */
    castVolley(count: number, spreadDeg: number, dmgMul: number, dx: number, dy: number): number {
        if (this._weapon.type !== 'ranged' || !this.bulletLayer?.isValid) return 0;
        const base = Math.atan2(dy, dx);
        const n = Math.max(1, Math.floor(count));
        const spread = (spreadDeg * Math.PI) / 180;
        const { dmg } = PlayerStats.I.calcOutgoing(this._weapon.damage * dmgMul);
        const pos = new Vec3(WorldBridge.x, WorldBridge.y, 0);
        for (let i = 0; i < n; i++) {
            const t = n === 1 ? 0 : i / (n - 1) - 0.5;
            const a = base + t * spread;
            const dir = new Vec3(Math.cos(a), Math.sin(a), 0);
            const bullet = BulletPool.get(this.bulletLayer);
            bullet.init(pos, dir, {
                damage:   Math.max(1, Math.round(dmg)),
                speed:    (this._weapon.bulletSpeed ?? 400) * 1.1,
                range:    this._weapon.range,
                radius:   (this._weapon.bulletSize ?? 12) + 8,
                color:    this._weapon.bulletColor ?? new Color(255, 200, 50, 255),
                size:     this._weapon.bulletSize ?? 12,
                shape:    this._weapon.bulletShape ?? 'ball',
                piercing: this._weapon.piercing ?? false,
            }, this.node);
        }
        this._shootEffect(new Vec3(dx, dy, 0));
        this._attackPose(dx, dy);
        AudioManager.playWeapon(this._weapon.id);
        return n;
    }

    private _aimDir(): Vec3 {
        const m = this._mouseDir;
        const hasAim = m.x * m.x + m.y * m.y > 0.01;
        const base = hasAim
            ? new Vec3(m.x, m.y, 0).normalize()
            : new Vec3(this.node.scale.x >= 0 ? 1 : -1, 0, 0);
        // 手机软锁定：攻击盘拖拽时几乎不吸，便于指哪打哪；否则温和辅助
        const blend = this._aimPadActive && hasAim ? 0.08 : 0.55;
        return this._softAim(base, blend);
    }

    /** 制作人体感：近处敌人自动辅助瞄准，不改 Player 世界坐标 */
    private _softAim(base: Vec3, blend: number): Vec3 {
        const range = Math.max(160, this._weapon.range * 1.4);
        const list = EnemyRegistry.getInRange(WorldBridge.x, WorldBridge.y, range, false);
        if (list.length < 1) return base;

        let bestDx = 0;
        let bestDy = 0;
        let bestScore = -999;
        for (const e of list) {
            if (!e.node?.isValid || e.isDead) continue;
            const dx = e.node.position.x - WorldBridge.x;
            const dy = e.node.position.y - WorldBridge.y;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const ux = dx / len;
            const uy = dy / len;
            const dot = ux * base.x + uy * base.y;
            // 优先：准星方向一致 + 更近
            const score = dot * 2.4 - len / range;
            if (score > bestScore) {
                bestScore = score;
                bestDx = ux;
                bestDy = uy;
            }
        }
        if (bestScore < -0.35) return base;
        const out = new Vec3(
            base.x * (1 - blend) + bestDx * blend,
            base.y * (1 - blend) + bestDy * blend,
            0,
        );
        const len = Math.sqrt(out.x * out.x + out.y * out.y) || 1;
        out.x /= len;
        out.y /= len;
        return out;
    }

    // ── #143 近战：按打法分型 ─────────────────────────────────

    /** 近战扫击窗口：出刀后 0.1s 内每帧补判，走进刀光的怪也会挨打（修「打不到人」） */
    private _sweep: { left: number; dirX: number; dirY: number; hit: Set<CombatEnemy>; dmg: number; mode: ModeParams } | null = null;

    private _doMelee() {
        const posX = WorldBridge.x;
        const posY = WorldBridge.y;
        const dir  = this._aimDir();
        const w = this._weapon;
        const mode = resolveMode(w);
        const { dmg } = PlayerStats.I.calcOutgoing(w.damage);

        let hits: CombatEnemy[];
        switch (mode.fireMode) {
            case 'thrust':
                hits = thrustHits(posX, posY, dir.x, dir.y, w.range, 30);
                break;
            case 'heavy':
                hits = arcHits(posX, posY, dir.x, dir.y, w.range, Math.max(w.coneHalf, 95));
                break;
            default:
                hits = arcHits(posX, posY, dir.x, dir.y, w.range, w.coneHalf);
        }

        const hitSet = new Set<CombatEnemy>();
        const parent = WorldBridge.worldLayer;
        if (parent?.isValid) {
            const slashCol = w.type === 'melee'
                ? new Color(220, 230, 255, 230)
                : new Color(255, 220, 140, 230);
            CombatVfx.slashArc(parent, posX, posY, dir.x, dir.y, slashCol, Math.min(56, w.range * 0.55));
        }
        if (mode.fireMode === 'flurry') {
            // 连击：multiHit 次交替斩，最后一击 ×1.6；每一击 0.05s 间隔读得出「连」
            const n = Math.max(2, w.multiHit);
            const per = Math.max(1, Math.round(dmg / n));
            const targets = hits.slice(0, 6);
            for (let h = 0; h < n; h++) {
                const last = h === n - 1;
                const amount = last ? Math.round(per * 1.6) : per;
                const side = h % 2 === 0 ? 1 : -1;
                this.scheduleOnce(() => {
                    if (!GameFlow.isPlaying) return;
                    const live = h === 0 ? targets : arcHits(WorldBridge.x, WorldBridge.y, dir.x, dir.y, w.range, w.coneHalf).slice(0, 6);
                    for (const e of live) { e.takeDamage(amount); hitSet.add(e); if (last) knockEnemy(e, dir.x, dir.y, 14); }
                    this._flurrySlash(dir.x, dir.y, side, last);
                    if (live.length > 0) Haptic.light();
                }, h * 0.05);
            }
        } else {
            const per = mode.fireMode === 'heavy' && w.multiHit > 1 ? Math.ceil(dmg / w.multiHit) : dmg;
            const rounds = mode.fireMode === 'heavy' ? Math.max(1, w.multiHit) : 1;
            const targets = hits.slice(0, mode.fireMode === 'thrust' ? 8 : 6);
            for (let r = 0; r < rounds; r++) {
                for (const e of targets) {
                    e.takeDamage(per);
                    hitSet.add(e);
                }
            }
            for (const e of targets) knockEnemy(e, dir.x, dir.y, mode.knockback);
            // 重击：落点震荡波（hammer splash）+ 震屏
            if (mode.fireMode === 'heavy') {
                CombatVfx.shakeWorld(mode.splash > 0 ? 12 : 7);
                if (mode.splash > 0) {
                    const ix = posX + dir.x * w.range * 0.7;
                    const iy = posY + dir.y * w.range * 0.7;
                    splashAt(ix, iy, mode.splash, Math.round(dmg * 0.5), null);
                    const parent = WorldBridge.worldLayer;
                    if (parent?.isValid) {
                        CombatVfx.ringPulse(parent, ix, iy, new Color(220, 220, 240, 200), mode.splash * 0.4, 0.3);
                        CombatVfx.burst(parent, ix, iy, new Color(200, 200, 220, 255), 9);
                    }
                }
            }
            // 剑气：斩击附带一道飞行剑气（伤害 60%，穿透，射程 260）
            if (mode.fireMode === 'wave' && this.bulletLayer?.isValid) {
                const bullet = BulletPool.get(this.bulletLayer);
                const gold = w.id === 'sunblade' ? new Color(255, 200, 60, 255) : new Color(255, 240, 180, 255);
                bullet.init(new Vec3(posX + dir.x * 30, posY + dir.y * 30, 0), dir, {
                    damage: Math.max(1, Math.round(dmg * 0.6)), speed: 520, range: 260,
                    radius: 26, color: gold, size: 18, shape: 'ball', piercing: true, knockback: 10,
                }, this.node);
            }
            // 扫击窗口：接下来 0.1s 走进来的也算
            this._sweep = { left: 0.1, dirX: dir.x, dirY: dir.y, hit: hitSet, dmg: Math.round(per * 0.8), mode };
        }

        this._swingEffect(dir.x, dir.y);
        this._attackPose(dir.x, dir.y);
        AudioManager.playWeapon(w.id);
        if (hits.length > 0) Haptic.light();
        this._maybeBattleCry();
    }

    private _tickSweep(dt: number) {
        const s = this._sweep;
        if (!s) return;
        s.left -= dt;
        if (s.left <= 0) { this._sweep = null; return; }
        const w = this._weapon;
        const live = s.mode.fireMode === 'thrust'
            ? thrustHits(WorldBridge.x, WorldBridge.y, s.dirX, s.dirY, w.range, 30)
            : arcHits(WorldBridge.x, WorldBridge.y, s.dirX, s.dirY, w.range, w.coneHalf);
        for (const e of live) {
            if (s.hit.has(e)) continue;
            s.hit.add(e);
            e.takeDamage(s.dmg);
            knockEnemy(e, s.dirX, s.dirY, s.mode.knockback * 0.6);
        }
    }

    // ── #143 远程：按打法分型 ─────────────────────────────────

    private _doRanged() {
        const w = this._weapon;
        const mode = resolveMode(w);
        const dir = this._aimDir();
        const { dmg } = PlayerStats.I.calcOutgoing(w.damage);

        switch (mode.fireMode) {
            case 'spread': {
                const n = Math.max(2, mode.pellets);
                const spread = (Math.max(8, mode.spreadDeg) * Math.PI) / 180;
                const base = Math.atan2(dir.y, dir.x);
                const per = Math.max(1, Math.round(dmg * (n >= 5 ? 0.42 : 0.6)));
                for (let i = 0; i < n; i++) {
                    const t = i / (n - 1) - 0.5;
                    const a = base + t * spread + (Math.random() - 0.5) * 0.04;
                    this._fireOne(new Vec3(Math.cos(a), Math.sin(a), 0), per, mode, 0.9 + Math.random() * 0.2);
                }
                CombatVfx.shakeWorld(5);
                break;
            }
            case 'burst': {
                const n = Math.max(2, mode.burst);
                const per = Math.max(1, Math.round(dmg * 0.55));
                for (let i = 0; i < n; i++) {
                    this.scheduleOnce(() => {
                        if (!GameFlow.isPlaying) return;
                        const d = i === 0 ? dir : this._aimDir();
                        this._fireOne(d, per, mode, 1);
                        if (i > 0) { this._shootEffect(d); this._attackPose(d.x, d.y); }
                    }, i * 0.07);
                }
                break;
            }
            case 'beam': {
                const px = WorldBridge.x;
                const py = WorldBridge.y;
                const { endX, endY, hits } = beamCast(px, py, dir.x, dir.y, w.range, 22);
                for (const e of hits) {
                    e.takeDamage(dmg);
                    if (mode.slow) e.applySlow?.(mode.slow[0], mode.slow[1]);
                }
                this._beamEffect(px, py, endX, endY, w.bulletColor ?? new Color(120, 220, 255, 255));
                if (hits.length > 0) Haptic.light();
                break;
            }
            default:
                this._fireOne(dir, dmg, mode, 1);
        }

        this._shootEffect(dir);
        this._attackPose(dir.x, dir.y);
        AudioManager.playWeapon(w.id);
        this._maybeBattleCry();
    }

    private _fireOne(dir: Vec3, dmg: number, mode: ModeParams, speedMul: number) {
        if (!this.bulletLayer?.isValid) return;
        const w = this._weapon;
        const pos = new Vec3(WorldBridge.x, WorldBridge.y, 0);
        const bullet = BulletPool.get(this.bulletLayer);
        const lob = mode.fireMode === 'lob';
        bullet.init(pos, dir, {
            damage:   Math.max(1, Math.round(dmg)),
            speed:    (w.bulletSpeed ?? 400) * speedMul,
            // 投掷物：飞到「瞄准的落点」就炸——落点 = 最近敌人距离或射程
            range:    lob ? this._lobRange(dir, w.range) : w.range,
            radius:   (w.bulletSize ?? 12) + 8,
            color:    w.bulletColor ?? new Color(255, 200, 50, 255),
            size:     w.bulletSize ?? 12,
            shape:    w.bulletShape ?? 'ball',
            piercing: w.piercing ?? false,
            bounce:   mode.fireMode === 'bounce' ? mode.bounce : 0,
            homing:   mode.fireMode === 'homing',
            splash:   mode.splash,
            knockback: mode.knockback,
            slow:     mode.slow,
        }, this.node);
    }

    /** 投掷落点：准星方向上最近的敌人处（±），没有就打满射程 */
    private _lobRange(dir: Vec3, maxRange: number): number {
        const px = WorldBridge.x;
        const py = WorldBridge.y;
        let best = maxRange;
        for (const e of EnemyRegistry.getInRange(px, py, maxRange, false)) {
            const ex = e.node.position.x - px;
            const ey = e.node.position.y - py;
            const len = Math.hypot(ex, ey) || 1;
            const dot = (ex / len) * dir.x + (ey / len) * dir.y;
            if (dot > 0.92 && len < best) best = len;
        }
        return Math.max(80, best);
    }

    /** 射线：一条亮线 + 端点火花，0.12s 收细 */
    private _beamEffect(x0: number, y0: number, x1: number, y1: number, col: Color) {
        const parent = WorldBridge.worldLayer;
        if (!parent?.isValid) return;
        const n = new Node('Beam');
        n.setParent(parent);
        n.setPosition(0, 0, 0);
        n.addComponent(UITransform).setContentSize(10, 10);
        const g = n.addComponent(Graphics);
        g.lineWidth = 10;
        g.strokeColor = new Color(col.r, col.g, col.b, 110);
        g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
        g.lineWidth = 4;
        g.strokeColor = new Color(255, 255, 255, 240);
        g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
        // 电弧锯齿
        g.lineWidth = 2;
        g.strokeColor = new Color(col.r, col.g, col.b, 220);
        const len = Math.hypot(x1 - x0, y1 - y0);
        const ux = (x1 - x0) / (len || 1);
        const uy = (y1 - y0) / (len || 1);
        g.moveTo(x0, y0);
        for (let d = 24; d < len; d += 24) {
            const off = (Math.random() - 0.5) * 18;
            g.lineTo(x0 + ux * d - uy * off, y0 + uy * d + ux * off);
        }
        g.lineTo(x1, y1);
        g.stroke();
        CombatVfx.burst(parent, x1, y1, col, 8);
        CombatVfx.ringPulse(parent, x1, y1, col, 12, 0.2);
        const op = n.addComponent(UIOpacity);
        tween(op).to(0.14, { opacity: 0 }).call(() => { if (n.isValid) n.destroy(); }).start();
    }

    /** 连击的每一刀：短促斜斩光，左右交替，终结一刀更粗更亮 */
    private _flurrySlash(dirX: number, dirY: number, side: number, last: boolean) {
        const host = this.node.parent ?? this.node;
        const n = new Node('Flurry');
        n.setParent(host);
        n.setPosition(WorldBridge.screenX, WorldBridge.screenY, 0);
        n.addComponent(UITransform).setContentSize(200, 200);
        const g = n.addComponent(Graphics);
        const base = Math.atan2(dirY, dirX) + side * 0.45;
        const col = this._weapon.id === 'shadow_daggers' ? new Color(140, 90, 220, 250)
            : this._weapon.id === 'void_edge' ? new Color(120, 60, 200, 250)
            : new Color(150, 235, 255, 250);
        g.lineWidth = last ? 9 : 5;
        g.strokeColor = last ? new Color(255, 255, 255, 250) : col;
        g.arc(0, 0, last ? 78 : 62, base - 0.55, base + 0.55, false);
        g.stroke();
        if (last) {
            g.lineWidth = 3;
            g.strokeColor = col;
            g.arc(0, 0, 90, base - 0.4, base + 0.4, false);
            g.stroke();
        }
        n.angle = -side * 16;
        tween(n)
            .to(0.07, { angle: side * 20, scale: new Vec3(1.2, 1.2, 1) })
            .to(0.08, { scale: new Vec3(0.3, 0.3, 1) })
            .call(() => { if (n.isValid) n.destroy(); })
            .start();
    }

    /** Body 轻前倾 + 持武挥击（#162 突刺少抖身子） */
    private _attackPose(dx: number, dy: number) {
        this.node.getComponent(PlayerController)?.faceToward(dx);
        const body = this.node.getChildByName('Body');
        const kind = swingForWeapon(this._weapon.id).kind;
        body?.getComponent(IdleBreath)?.strike(dx, dy, bodyStrikeMul(kind));
        const hand = body?.getComponent(WeaponHand);
        if (hand) {
            hand.setWeapon(this._weapon.id);
            hand.play(dx, dy);
        }
    }

    /** 约 18% 概率喊一声，避免刷屏 */
    private _maybeBattleCry() {
        if (Math.random() > 0.18) return;
        try {
            const cid = GameManager.instance?.selectedCharacterId
                ?? GameManager.instance?.save?.selectedCharacter;
            if (cid) AudioManager.playVoice(cid);
        } catch { /* ignore */ }
    }

    // ── 视觉特效 ──────────────────────────────────────────────

    private _swingEffect(dirX = 1, dirY = 0) {
        // 挂在 Canvas（与 Player 同层），用屏幕坐标；不改 Player 世界坐标
        const host = this.node.parent ?? this.node;
        const arc = new Node('SwingArc');
        arc.setParent(host);
        arc.setPosition(WorldBridge.screenX, WorldBridge.screenY, 0);
        arc.addComponent(UITransform).setContentSize(260, 260);
        const g = arc.addComponent(Graphics);
        const base = Math.atan2(dirY, dirX);
        const id = this._weapon.id;
        const half = (this._weapon.coneHalf * Math.PI) / 180;

        if (id === 'spear' || id === 'ward_glaive' || id === 'thunder_lance') {
            const tip = id === 'ward_glaive'
                ? new Color(120, 200, 255, 250)
                : id === 'thunder_lance' ? new Color(170, 235, 255, 250)
                : new Color(255, 245, 200, 250);
            // 突刺光长 = 真实判定长度（读得出「能刺多远」）
            const L = this._weapon.range * 0.92;
            g.lineWidth = id === 'spear' ? 9 : 11;
            g.strokeColor = tip;
            g.moveTo(Math.cos(base) * 14, Math.sin(base) * 14);
            g.lineTo(Math.cos(base) * L, Math.sin(base) * L);
            g.stroke();
            g.lineWidth = 4;
            g.strokeColor = new Color(255, 255, 230, 140);
            for (const o of [-0.16, 0.16]) {
                const a = base + o;
                g.moveTo(Math.cos(a) * 18, Math.sin(a) * 18);
                g.lineTo(Math.cos(a) * L * 0.8, Math.sin(a) * L * 0.8);
                g.stroke();
            }
            // 枪尖闪光
            g.fillColor = new Color(255, 255, 255, 230);
            g.circle(Math.cos(base) * (L - 3), Math.sin(base) * (L - 3), id === 'spear' ? 6 : 7); g.fill();
            if (id === 'thunder_lance') {
                g.strokeColor = new Color(255, 255, 255, 230);
                g.lineWidth = 2.5;
                g.moveTo(Math.cos(base) * 30, Math.sin(base) * 30);
                for (let d = 50; d < L; d += 22) {
                    const off = (Math.random() - 0.5) * 16;
                    g.lineTo(Math.cos(base) * d - Math.sin(base) * off, Math.sin(base) * d + Math.cos(base) * off);
                }
                g.stroke();
            }
            if (id === 'ward_glaive') {
                g.strokeColor = new Color(80, 160, 220, 180);
                g.lineWidth = 2.5;
                g.arc(0, 0, 55, base - 0.7, base + 0.7, false);
                g.stroke();
            }
        } else if (id === 'dagger' || id === 'shadow_daggers') {
            const col = id === 'shadow_daggers'
                ? new Color(120, 80, 200, 250)
                : new Color(140, 230, 255, 250);
            for (const [off, alpha, len] of [[0, 250, 88], [0.55, 200, 74], [-0.4, 170, 62]] as const) {
                const a = base + off;
                g.lineWidth = id === 'shadow_daggers' ? 5 : 6;
                g.strokeColor = new Color(col.r, col.g, col.b, alpha);
                g.moveTo(Math.cos(a) * 14, Math.sin(a) * 14);
                g.lineTo(Math.cos(a) * len, Math.sin(a) * len);
                g.stroke();
                g.fillColor = new Color(220, 255, 255, alpha);
                g.circle(Math.cos(a) * len, Math.sin(a) * len, 4); g.fill();
            }
            if (id === 'shadow_daggers') {
                // 影刃：额外暗影弧
                g.lineWidth = 3;
                g.strokeColor = new Color(40, 20, 60, 180);
                g.arc(0, 0, 50, base - 0.9, base + 0.9, false);
                g.stroke();
            }
        } else if (id === 'holy_blade' || id === 'sunblade') {
            const gold = id === 'sunblade'
                ? new Color(255, 200, 60, 250)
                : new Color(255, 230, 140, 250);
            const R = 92;
            g.lineWidth = 14;
            g.strokeColor = gold;
            g.arc(0, 0, R, base - half * 0.95, base + half * 0.95, false);
            g.stroke();
            g.lineWidth = 4;
            g.strokeColor = new Color(255, 255, 255, 220);
            g.arc(0, 0, 64, base - half * 0.6, base + half * 0.6, false);
            g.stroke();
            // 圣光十字
            g.strokeColor = new Color(255, 255, 200, 200);
            g.lineWidth = 2.5;
            const cx = Math.cos(base) * 70;
            const cy = Math.sin(base) * 70;
            g.moveTo(cx - 10, cy); g.lineTo(cx + 10, cy); g.stroke();
            g.moveTo(cx, cy - 10); g.lineTo(cx, cy + 10); g.stroke();
            g.fillColor = new Color(gold.r, gold.g, gold.b, 50);
            g.moveTo(0, 0);
            for (let i = 0; i <= 10; i++) {
                const t = i / 10;
                const a = base - half * 0.95 + half * 1.9 * t;
                g.lineTo(Math.cos(a) * R, Math.sin(a) * R);
            }
            g.close();
            g.fill();
        } else if (id === 'dragon_fang') {
            const R = 100;
            g.lineWidth = 16;
            g.strokeColor = new Color(255, 100, 50, 250);
            g.arc(0, 0, R, base - half * 0.9, base + half * 0.9, false);
            g.stroke();
            g.lineWidth = 6;
            g.strokeColor = new Color(255, 200, 80, 200);
            g.arc(0, 0, 72, base - half * 0.55, base + half * 0.55, false);
            g.stroke();
            // 焰舌
            for (const o of [-0.35, 0, 0.35]) {
                const a = base + o;
                g.fillColor = new Color(255, 140 + Math.abs(o) * 80, 40, 200);
                g.circle(Math.cos(a) * R, Math.sin(a) * R, 7 - Math.abs(o) * 4); g.fill();
            }
        } else {
            const heavy = id === 'axe' || id === 'hammer' || id === 'blood_cleaver';
            const col = id === 'blood_cleaver' ? new Color(220, 50, 60, 240)
                : id === 'axe' ? new Color(255, 160, 70, 240)
                : id === 'hammer' ? new Color(190, 200, 230, 240)
                : new Color(230, 245, 255, 240);
            const R = heavy ? 96 : 86;
            g.lineWidth = heavy ? 18 : 12;
            g.strokeColor = col;
            g.arc(0, 0, R, base - half * 0.95, base + half * 0.95, false);
            g.stroke();
            g.lineWidth = 5;
            g.strokeColor = new Color(255, 255, 255, 210);
            g.arc(0, 0, heavy ? 68 : 60, base - half * 0.6, base + half * 0.6, false);
            g.stroke();
            g.fillColor = new Color(col.r, col.g, col.b, 45);
            g.moveTo(0, 0);
            for (let i = 0; i <= 10; i++) {
                const t = i / 10;
                const a = base - half * 0.95 + half * 1.9 * t;
                g.lineTo(Math.cos(a) * R, Math.sin(a) * R);
            }
            g.close();
            g.fill();
            // 刃尖星点
            for (const t of [0.15, 0.5, 0.85]) {
                const a = base - half * 0.9 + half * 1.8 * t;
                g.fillColor = new Color(255, 255, 255, 200);
                g.circle(Math.cos(a) * R, Math.sin(a) * R, heavy ? 5 : 3.5); g.fill();
            }
        }

        const icon = this.node.getChildByName('Body')?.getChildByName('WeaponIcon')
            ?? this.node.getChildByName('WeaponIcon');
        // 持武挥击已由 WeaponHand 驱动；这里只补刀光弧 tween
        if (icon && !this.node.getChildByName('Body')?.getComponent(WeaponHand)) {
            const ang = Math.atan2(dirY, dirX) * 180 / Math.PI;
            icon.angle = ang - 80;
            icon.setScale(1.15, 1.15, 1);
            tween(icon)
                .to(0.1, { angle: ang + 55, scale: new Vec3(1.35, 1.35, 1) })
                .to(0.1, { angle: 0, scale: new Vec3(1, 1, 1) })
                .start();
        }
        // 刀光：图形本身已画在瞄准方向上，节点只做「相对」扫动（之前叠加了一次瞄准角，
        // 朝左挥时刀光会转到反方向——这就是"刀打不到人"的视觉根源之一）
        const isThrust = id === 'spear' || id === 'ward_glaive' || id === 'thunder_lance';
        if (isThrust) {
            arc.angle = 0;
            arc.setScale(0.55, 1, 1);
            tween(arc)
                .to(0.06, { scale: new Vec3(1.08, 1, 1) })
                .to(0.12, { scale: new Vec3(1.08, 0.2, 1) })
                .call(() => { if (arc.isValid) arc.destroy(); })
                .start();
            return;
        }
        arc.angle = -32;
        tween(arc)
            .to(0.08, { angle: 28, scale: new Vec3(1.2, 1.2, 1) })
            .to(0.12, { scale: new Vec3(0.3, 0.3, 1) })
            .call(() => { if (arc.isValid) arc.destroy(); })
            .start();
    }

    private _shootEffect(dir: Vec3) {
        const host = this.node.parent ?? this.node;
        const flash = new Node('MuzzleFlash');
        flash.setParent(host);
        flash.setPosition(WorldBridge.screenX, WorldBridge.screenY, 0);
        flash.addComponent(UITransform).setContentSize(120, 120);
        const g = flash.addComponent(Graphics);
        const base = Math.atan2(dir.y, dir.x);
        const mx = Math.cos(base) * 42;
        const my = Math.sin(base) * 42;
        const id = this._weapon.id;

        if (id === 'wand' || id === 'frost' || id === 'earth_staff' || id === 'storm_rod' || id === 'glacier_orb') {
            const col = id === 'frost' || id === 'glacier_orb'
                ? new Color(140, 220, 255, 230)
                : id === 'earth_staff'
                    ? new Color(160, 140, 90, 230)
                    : id === 'storm_rod'
                        ? new Color(120, 200, 255, 230)
                        : new Color(200, 120, 255, 230);
            g.fillColor = new Color(col.r, col.g, col.b, 80);
            g.circle(mx, my, id === 'glacier_orb' ? 26 : 22); g.fill();
            g.fillColor = col;
            g.circle(mx, my, id === 'glacier_orb' ? 14 : 12); g.fill();
            g.fillColor = new Color(255, 255, 255, 230);
            g.circle(mx, my, 5); g.fill();
            // 十字星芒 / 雷纹
            g.strokeColor = new Color(255, 255, 255, 200);
            g.lineWidth = 2;
            g.moveTo(mx - 18, my); g.lineTo(mx + 18, my); g.stroke();
            g.moveTo(mx, my - 18); g.lineTo(mx, my + 18); g.stroke();
            if (id === 'storm_rod') {
                g.strokeColor = new Color(180, 230, 255, 220);
                g.lineWidth = 2.5;
                g.moveTo(mx - 8, my + 14); g.lineTo(mx + 2, my); g.lineTo(mx - 4, my); g.lineTo(mx + 8, my - 14);
                g.stroke();
            }
            if (id === 'glacier_orb') {
                g.strokeColor = new Color(180, 240, 255, 200);
                g.lineWidth = 2;
                g.circle(mx, my, 20); g.stroke();
            }
        } else if (id === 'shuriken') {
            g.fillColor = new Color(200, 210, 230, 220);
            for (let i = 0; i < 4; i++) {
                const a = base + (i * Math.PI) / 2;
                g.moveTo(mx, my);
                g.lineTo(mx + Math.cos(a) * 20, my + Math.sin(a) * 20);
                g.lineTo(mx + Math.cos(a + 0.4) * 8, my + Math.sin(a + 0.4) * 8);
                g.close(); g.fill();
            }
        } else {
            // 弓 / 弩 / 毒藤弓 / 毒瓶：尖焰枪口
            const tip = id === 'venom_bow' || id === 'venom_vials'
                ? new Color(120, 230, 100, 240)
                : new Color(255, 230, 140, 240);
            g.fillColor = new Color(tip.r, tip.g, tip.b, 90);
            g.circle(mx, my, id === 'venom_vials' ? 14 : 16); g.fill();
            g.strokeColor = tip;
            g.lineWidth = 4;
            g.moveTo(Math.cos(base) * 12, Math.sin(base) * 12);
            g.lineTo(Math.cos(base) * 56, Math.sin(base) * 56);
            g.stroke();
            g.strokeColor = new Color(255, 255, 220, 200);
            g.lineWidth = 2;
            for (const o of [-0.45, 0.45]) {
                g.moveTo(Math.cos(base + o) * 16, Math.sin(base + o) * 16);
                g.lineTo(Math.cos(base) * 50, Math.sin(base) * 50);
                g.stroke();
            }
            g.fillColor = new Color(255, 255, 255, 230);
            g.circle(mx + Math.cos(base) * 8, my + Math.sin(base) * 8, 4); g.fill();
            if (id === 'venom_vials') {
                g.fillColor = new Color(80, 200, 60, 180);
                g.circle(mx, my, 7); g.fill();
            }
        }

        const icon = this.node.getChildByName('WeaponIcon');
        if (icon) {
            const ang = (base * 180) / Math.PI;
            icon.angle = ang - 20;
            tween(icon)
                .to(0.08, { scale: new Vec3(1.2, 1.2, 1), angle: ang + 10 })
                .to(0.1, { scale: new Vec3(1, 1, 1), angle: 0 })
                .start();
        }

        tween(flash)
            .to(0.08, { scale: new Vec3(1.25, 1.25, 1) })
            .to(0.1, { scale: new Vec3(0.2, 0.2, 1) })
            .call(() => { if (flash.isValid) flash.destroy(); })
            .start();
    }

    private _refreshWeaponHUD() {
        eventBus.emit(GameEvents.WEAPON_CHANGED, {
            id:    this._weapon.id,
            name:  this._weapon.name,
            emoji: this._weapon.emoji,
            type:  this._weapon.type,
        });
    }
}
