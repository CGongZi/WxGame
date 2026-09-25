import { _decorator, Component, Node, Vec3, input, Input,
         EventKeyboard, KeyCode, UITransform, Graphics, Label, tween, Tween, Color } from 'cc';
import { eventBus, GameEvents } from '../../core/EventBus';
import { WorldBridge } from '../dungeon/WorldBridge';
import { CombatVfx } from '../fx/CombatVfx';
import { IdleBreath } from '../fx/IdleBreath';
import { WeaponHand } from '../fx/WeaponHand';
import { CombatFace } from '../fx/CombatFace';
import { PlayerStats } from '../../core/PlayerStats';
import { GameManager } from '../../core/GameManager';
import { GameFlow, FlowEvents } from '../../core/GameFlow';
import { getCharacter, defaultCharacter } from '../../core/CharacterData';
import { CharacterRig } from '../fx/CharacterRig';
import { WeaponController, getWeapon, isWeaponType } from '../weapon/WeaponController';
import { drawWeaponGlyph } from '../fx/WeaponArt';
import { ThemeRuntime } from '../dungeon/MapThemes';
import { ThemeAmbient } from '../fx/ThemeAmbient';
import { AudioManager } from '../../core/AudioManager';
import { Haptic } from '../../core/Haptic';
import { PlayerSkill } from './PlayerSkill';

const { ccclass } = _decorator;

/**
 * PlayerController —— 逻辑坐标走 WorldBridge；视觉由边界钳制决定是否居中
 * HP / 移速 / 减伤 全部读 PlayerStats
 * 剪影画在 Body 子节点上；IdleBreath=步伐/出击，WeaponHand=持武挥击；根节点只朝向翻转
 */
@ccclass('PlayerController')
export class PlayerController extends Component {

    /** 大厅剪影相对中央双环：约占一半直径 */
    private static readonly LOBBY_BODY_SCALE = 2.05;

    private _keys = { up: false, down: false, left: false, right: false };
    private _joyDir = new Vec3();
    private _invincibleTimer = 0;
    private _isDead = false;
    private _transitioning = false;
    private _weaponEmoji = '🗡️';
    private _weaponIconLabel: Label | null = null;
    private _iceTipShown = false;
    private _tileTipShown = false;
    private _armorTipShown = false;
    private _facing = 1;
    private _breath: IdleBreath | null = null;
    private _hand: WeaponHand | null = null;

    onLoad() {
        // GameFlow 是模块单例，loadScene 后仍可能残留 playing —— 进场景先回 lobby
        GameFlow.reset();
        this.node.setPosition(0, 0, 0);
        WorldBridge.reset(0, 0);
        PlayerStats.I.resetForNewRun();
        // 兜底：若 GameManager 已就绪则灌回天赋（persist 跨场景时尤其需要）
        try { GameManager.instance?.refreshTalents(); } catch {}
        this._applyLobbyLook();
        this._emitHp();
        if (!this.node.getComponent(PlayerSkill)) this.node.addComponent(PlayerSkill);
        eventBus.on(GameEvents.WEAPON_CHANGED, this._onWeaponChanged, this);
        eventBus.on('character-changed', this._onCharacterChanged, this);
        eventBus.on(FlowEvents.STATE, this._onFlowState, this);
        eventBus.on('loot-heart', this._onLootHeart, this);
    }

    onDestroy() {
        eventBus.off(GameEvents.WEAPON_CHANGED, this._onWeaponChanged, this);
        eventBus.off('character-changed', this._onCharacterChanged, this);
        eventBus.off(FlowEvents.STATE, this._onFlowState, this);
        eventBus.off('loot-heart', this._onLootHeart, this);
    }

    onEnable() {
        input.on(Input.EventType.KEY_DOWN, this._onKeyDown, this);
        input.on(Input.EventType.KEY_UP,   this._onKeyUp,   this);
    }

    onDisable() {
        input.off(Input.EventType.KEY_DOWN, this._onKeyDown, this);
        input.off(Input.EventType.KEY_UP,   this._onKeyUp,   this);
    }

    update(dt: number) {
        // 贴边时允许离开屏幕中心；位置由 WorldBridge 同步
        WorldBridge.syncPlayerNode(this.node);

        if (this._isDead || this._transitioning) {
            if (this._breath) this._breath.moving = false;
            return;
        }
        if (!GameFlow.isPlaying || GameFlow.isCombatFrozen) {
            if (this._breath) this._breath.moving = false;
            return;
        }
        if (this._invincibleTimer > 0) {
            this._invincibleTimer -= dt;
            if (this._invincibleTimer <= 0) this._breath?.setInvuln(0);
        }
        // #139 护甲脱战回复
        PlayerStats.I.tickArmor(dt);

        const kx = (this._keys.right ? 1 : 0) - (this._keys.left ? 1 : 0);
        const ky = (this._keys.up ? 1 : 0) - (this._keys.down ? 1 : 0);
        const jLen = this._joyDir.x ** 2 + this._joyDir.y ** 2;
        const useJoy = jLen > 0.01;
        const dx = useJoy ? this._joyDir.x : kx;
        const dy = useJoy ? this._joyDir.y : ky;
        if (dx === 0 && dy === 0) {
            if (this._breath) {
                this._breath.moving = false;
                this._breath.moveDirX = 0;
                this._breath.moveDirY = 0;
            }
            return;
        }

        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 0.01) {
            if (this._breath) {
                this._breath.moving = false;
                this._breath.moveDirX = 0;
                this._breath.moveDirY = 0;
            }
            return;
        }
        // 摇杆模拟量：方向归一后按推杆深度缩放移速；键盘始终满速
        const speedScale = useJoy ? Math.min(1, len) : 1;
        let step = PlayerStats.I.get('moveSpeed') * dt * speedScale;
        // 冰原：地面打滑减速
        if (ThemeRuntime.currentTheme?.id === 'ice') {
            step *= 0.72;
            if (!this._iceTipShown) {
                this._iceTipShown = true;
                eventBus.emit('show-tip', { text: '🧊 冰面湿滑，移动变慢' });
            }
        } else {
            this._iceTipShown = false;
        }
        // 沼泽泥地 / 云海气流（ThemeAmbient）
        const terrainMul = ThemeAmbient.moveMulAt(WorldBridge.x, WorldBridge.y);
        if (terrainMul !== 1) step *= terrainMul;
        // #125 瓦片地牢：水洼慢 / 冰面快
        const tileMul = WorldBridge.terrainSpeedMul(WorldBridge.x, WorldBridge.y);
        if (tileMul !== 1) {
            step *= tileMul;
            if (!this._tileTipShown) {
                this._tileTipShown = true;
                eventBus.emit('show-tip', { text: tileMul < 1 ? '💧 水洼里脚步变沉' : '🧊 冰面滑行，移动更快' });
            }
        }
        if (ThemeAmbient.justEnteredMud(WorldBridge.x, WorldBridge.y)) {
            eventBus.emit('show-tip', { text: '🫧 泥水洼，脚步变沉' });
        }
        if (ThemeAmbient.justEnteredRuins(WorldBridge.x, WorldBridge.y)) {
            eventBus.emit('show-tip', { text: '🏛️ 圣坛之力，脚步轻快' });
        }
        if (ThemeAmbient.justEnteredIcePatch(WorldBridge.x, WorldBridge.y)) {
            eventBus.emit('show-tip', { text: '❄ 冰晶面更滑！' });
        }
        if (ThemeAmbient.justEnteredCaveRubble(WorldBridge.x, WorldBridge.y)) {
            eventBus.emit('show-tip', { text: '🪨 碎石带，小心落脚' });
        }
        if (ThemeAmbient.consumeSkyTip()) {
            eventBus.emit('show-tip', { text: '☁️ 云海气流，移动略快' });
        }
        if (ThemeAmbient.consumeCaveTip()) {
            eventBus.emit('show-tip', { text: '🪨 洞穴碎屑纷落' });
        }
        if (ThemeAmbient.consumeVolcanoTip()) {
            eventBus.emit('show-tip', { text: '🌋 熔岩火口，热浪扑面' });
        }
        if (ThemeAmbient.justEnteredLava(WorldBridge.x, WorldBridge.y)) {
            eventBus.emit('show-tip', { text: '🔥 熔浆带，脚步灼烫变慢' });
        }
        if (ThemeAmbient.consumeAbyssTip()) {
            eventBus.emit('show-tip', { text: '🕳️ 虚空裂隙，引力低语' });
        }
        if (ThemeAmbient.justEnteredRift(WorldBridge.x, WorldBridge.y)) {
            eventBus.emit('show-tip', { text: '💜 裂隙环拉扯，移动变沉' });
        }
        if (ThemeAmbient.consumeNecropolisTip()) {
            eventBus.emit('show-tip', { text: '🪦 亡灵墓园，青磷弥漫' });
        }
        if (ThemeAmbient.justEnteredGraveFog(WorldBridge.x, WorldBridge.y)) {
            eventBus.emit('show-tip', { text: '💚 磷雾缠足，略微减速' });
        }
        WorldBridge.tryMove(
            WorldBridge.x + (dx / len) * step,
            WorldBridge.y + (dy / len) * step,
        );
        WorldBridge.syncPlayerNode(this.node);
        if (this._breath) {
            this._breath.moving = true;
            this._breath.moveDirX = dx / len;
            this._breath.moveDirY = dy / len;
        }
        if (dx !== 0) {
            this._facing = dx < 0 ? -1 : 1;
            CombatFace.face(this.node, dx);
        }
    }

    setJoystickDir(x: number, y: number) { this._joyDir.set(x, y, 0); }

    /** 当前移动输入方向（摇杆优先，键盘兜底；未归一） */
    get moveDir(): { x: number; y: number } {
        if (this._joyDir.x * this._joyDir.x + this._joyDir.y * this._joyDir.y > 0.01) {
            return { x: this._joyDir.x, y: this._joyDir.y };
        }
        return {
            x: (this._keys.right ? 1 : 0) - (this._keys.left ? 1 : 0),
            y: (this._keys.up ? 1 : 0) - (this._keys.down ? 1 : 0),
        };
    }

    get facing(): number { return this._facing; }

    /** 攻击/瞄准时翻身：元气骑士式「朝哪打就朝哪看」 */
    faceToward(dx: number) {
        if (Math.abs(dx) < 0.4) return;
        this._facing = dx < 0 ? -1 : 1;
        CombatFace.face(this.node, dx);
    }

    /** 技能/道具给予无敌帧（取更长者） */
    grantInvuln(sec: number) {
        if (sec <= this._invincibleTimer) return;
        this._invincibleTimer = sec;
        this._breath?.setInvuln(sec);
    }

    /** #166 回大厅清无敌闪烁 */
    clearInvuln() {
        this._invincibleTimer = 0;
        this._breath?.setInvuln(0);
    }

    setTransitioning(v: boolean) {
        this._transitioning = v;
        if (v) {
            this._joyDir.set(0, 0, 0);
            this.scheduleOnce(() => {
                if (this._transitioning) this._transitioning = false;
            }, 3);
        }
    }

    reviveForNewFloor() {
        this._isDead = false;
        this.enabled = true;
        this._armorTipShown = false;
        PlayerStats.I.refillArmor();
        this._breath?.resume();
        this.node.setScale(this._facing, 1, 1);
        WorldBridge.reset(0, 0);
        WorldBridge.syncPlayerNode(this.node);
    }

    takeDamage(amount: number, opts?: { hazard?: boolean }) {
        if (!GameFlow.isPlaying) return;
        if (this._isDead) return;
        // #152 无敌帧里被蹭到也算「挨打」——打断护甲回复，避免打斗中甲条还在涨
        PlayerStats.I.markHit();
        if (this._invincibleTimer > 0) return;
        // #154 机关/陷阱：大部分穿防，不会被铁皮药剂压成「每次 -1 护甲」
        const dmgRaw = PlayerStats.I.calcIncoming(amount, opts?.hazard ? 0.72 : 0);
        const hadShield = PlayerStats.I.shield > 0;
        // #139 吸收链：护盾 → 护甲 → 生命
        const hit = PlayerStats.I.absorbHit(dmgRaw);
        const dmg = hit.toHp;
        PlayerStats.I.hp = Math.max(0, Math.round(PlayerStats.I.hp - dmg));
        this._invincibleTimer = 0.55;
        this._emitHp();
        if (hadShield) {
            const parent = WorldBridge.worldLayer;
            if (parent?.isValid) {
                CombatVfx.ringPulse(parent, WorldBridge.x, WorldBridge.y,
                    new Color(120, 200, 255, 220), 22, 0.26);
            }
            if (PlayerStats.I.shield <= 0) eventBus.emit('show-tip', { text: '🛡 护盾破裂' });
        } else if (hit.armorUsed > 0) {
            const parent = WorldBridge.worldLayer;
            if (parent?.isValid) {
                CombatVfx.ringPulse(parent, WorldBridge.x, WorldBridge.y,
                    new Color(210, 220, 235, 200), 18, 0.2);
            }
            if (hit.armorBroke && !this._armorTipShown) {
                this._armorTipShown = true;
                eventBus.emit('show-tip', { text: '⛨ 护甲碎裂 · 脱战约 5 秒才慢慢回复，清空厅室立刻回满' });
            }
        }
        // tip 通道留给状态变化；挨打靠闪白/后仰/飘字，不刷数字
        if (this._breath) {
            this._breath.hitFlinch();
            this._breath.setInvuln(0.55);
        }
        CombatVfx.hitFlash(this.node.getChildByName('Body'));
        CombatVfx.shakeWorld(12);
        Haptic.light();
        try {
            const cid = GameManager.instance?.selectedCharacterId
                ?? GameManager.instance?.save?.selectedCharacter
                ?? 'knight';
            AudioManager.playHurt(cid);
        } catch { /* ignore */ }
        if (PlayerStats.I.hp <= 0) this._die();
    }

    private _onLootHeart(d: { amount: number }) {
        this.heal(d.amount ?? 15);
        eventBus.emit('show-tip', { text: '❤ 回血' });
    }

    heal(amount: number) {
        const max = Math.round(PlayerStats.I.get('maxHp'));
        PlayerStats.I.hp = Math.min(max, Math.round(PlayerStats.I.hp + Math.max(0, amount)));
        this._emitHp();
    }

    addMaxHp(amount: number) {
        PlayerStats.I.addBonus({ maxHp: amount });
        this._emitHp();
    }

    get currentHp() { return PlayerStats.I.hp; }
    get maxHp() { return PlayerStats.I.get('maxHp'); }
    get isDead() { return this._isDead; }

    private _die() {
        if (this._isDead) return;
        this._isDead = true;
        this.enabled = false;
        this._breath?.pause();
        Haptic.heavy();
        tween(this.node)
            .to(0.15, { scale: new Vec3(this._facing * 1.4, 1.4, 1) })
            .to(0.40, { scale: new Vec3(0, 0, 1) })
            .start();

        const gm = GameManager.instance;
        const floor = gm?.runState.floor ?? 1;
        const score = gm?.runState.score ?? 0;
        const kills = gm?.runState.killCount ?? 0;
        if (gm) gm.notifyPlayerDied(floor, score, kills);
        else eventBus.emit(GameEvents.PLAYER_DIED, { floor, score, kills, time: 0 });
    }

    private _body(): Node {
        let body = this.node.getChildByName('Body');
        if (!body) {
            body = new Node('Body');
            body.setParent(this.node);
            body.setPosition(0, 0, 0);
            body.addComponent(UITransform).setContentSize(56, 72);
            this._breath = body.addComponent(IdleBreath);
            this._breath.kind = 'hero';
            this._hand = body.addComponent(WeaponHand);
        } else {
            if (!this._breath) {
                this._breath = body.getComponent(IdleBreath) ?? body.addComponent(IdleBreath);
                this._breath.kind = 'hero';
            }
            if (!this._hand) {
                this._hand = body.getComponent(WeaponHand) ?? body.addComponent(WeaponHand);
            }
        }
        return body;
    }

    private _drawBody() {
        const body = this._body();
        let g = body.getComponent(Graphics);
        if (!g) g = body.addComponent(Graphics);
        // 根节点若还挂着旧剪影，清掉以免叠两层
        const rootG = this.getComponent(Graphics);
        if (rootG) rootG.clear();
        const ch = getCharacter(GameManager.instance?.selectedCharacterId ?? '') ?? defaultCharacter();
        const skinId = ch.skinId || ch.id;
        g.clear();
        // #126 四肢小人：Body/Rig 下按关节分部件，剪影函数只留给缩略图
        CharacterRig.mount(body, skinId);
        if (this._breath) this._breath.skinId = skinId;
    }

    private _applyLobbyLook(animate = false) {
        const ch = getCharacter(GameManager.instance?.selectedCharacterId ?? '') ?? defaultCharacter();
        const wid = GameManager.instance?.selectedWeaponId
            ?? (isWeaponType(ch.exclusiveWeaponId) ? ch.exclusiveWeaponId : 'sword');
        const w = isWeaponType(wid) ? getWeapon(wid) : getWeapon('sword');
        this._weaponEmoji = w.emoji;
        this._drawBody();
        this._setBodyRestScale(PlayerController.LOBBY_BODY_SCALE);
        this._breath?.resume();
        this._paintWeaponIcon(w.id);
        if (animate && this._breath) {
            this._breath.strike(this._facing, 0);
        }
    }

    private _setBodyRestScale(s: number) {
        this._body();
        this._breath?.setRestScale(s);
        this._hand?.setCarryScale(GameFlow.isLobby ? 1.35 : 1);
    }

    private _paintWeaponIcon(weaponId?: string) {
        const body = this._body();
        // 旧版挂在 Player 根上的图标迁到 Body，随步伐/出击一起动
        const orphan = this.node.getChildByName('WeaponIcon');
        if (orphan && orphan.parent === this.node) orphan.destroy();

        let iconNode = body.getChildByName('WeaponIcon');
        if (!iconNode) {
            iconNode = new Node('WeaponIcon');
            iconNode.setParent(body);
            iconNode.addComponent(UITransform).setContentSize(36, 36);
        }
        for (const c of [...iconNode.children]) {
            if (c.isValid) c.destroy();
        }
        let lbl = iconNode.getComponent(Label);
        if (lbl) lbl.string = '';
        const id = weaponId
            ?? GameManager.instance?.selectedWeaponId
            ?? 'sword';
        try {
            const g = iconNode.getComponent(Graphics) ?? iconNode.addComponent(Graphics);
            g.clear();
            if (isWeaponType(id)) {
                drawWeaponGlyph(g, id, GameFlow.isLobby ? 32 : 26);
            } else {
                if (!lbl) lbl = iconNode.addComponent(Label);
                lbl.string = this._weaponEmoji;
                lbl.fontSize = 18;
            }
        } catch {
            if (!lbl) lbl = iconNode.addComponent(Label);
            lbl.string = this._weaponEmoji;
            lbl.fontSize = 18;
        }
        this._weaponIconLabel = iconNode.getComponent(Label);
        this._hand = body.getComponent(WeaponHand) ?? body.addComponent(WeaponHand);
        this._hand.bind(iconNode);
        this._hand.setWeapon(isWeaponType(id) ? id : 'sword');
        this._hand.setCarryScale(GameFlow.isLobby ? 1.35 : 1);
    }

    private _emitHp() {
        eventBus.emit(GameEvents.PLAYER_HP_CHANGED, {
            current: PlayerStats.I.hp,
            max: PlayerStats.I.get('maxHp'),
            shield: PlayerStats.I.shield,
        });
    }

    private _onWeaponChanged(data: { emoji?: string; id?: string }) {
        if (!GameFlow.isPlaying) {
            if (data?.emoji) this._weaponEmoji = data.emoji;
            this._applyLobbyLook(true);
            return;
        }
        if (data?.emoji) this._weaponEmoji = data.emoji;
        const id = data?.id
            ?? this.getComponent(WeaponController)?.currentWeapon?.id;
        this._paintWeaponIcon(id);
        this._breath?.strike(this._facing, 0);
    }

    private _onCharacterChanged() {
        if (GameFlow.isPlaying) this._drawBody();
        else this._applyLobbyLook(true);
    }

    private _onFlowState(d: { state: string }) {
        if (d.state === 'playing') {
            Tween.stopAllByTarget(this.node);
            this._setBodyRestScale(1);
            // 跟 WeaponController 当前武，勿回退到存档 selectedWeapon
            const wid = this.getComponent(WeaponController)?.currentWeapon?.id;
            this._paintWeaponIcon(wid);
            return;
        }
        if (d.state !== 'lobby') return;
        // 死亡会把缩放收到 0 并关掉组件；回大厅必须停掉这段动画再站回中央
        Tween.stopAllByTarget(this.node);
        this._isDead = false;
        this._transitioning = false;
        this.enabled = true;
        this._facing = 1;
        this.node.setScale(1, 1, 1);
        this._breath?.resume();
        WorldBridge.reset(0, 0);
        WorldBridge.syncPlayerNode(this.node);
        this._applyLobbyLook();
    }

    private _onKeyDown(e: EventKeyboard) {
        if (e.keyCode === KeyCode.KEY_W || e.keyCode === KeyCode.ARROW_UP) this._keys.up = true;
        if (e.keyCode === KeyCode.KEY_S || e.keyCode === KeyCode.ARROW_DOWN) this._keys.down = true;
        if (e.keyCode === KeyCode.KEY_A || e.keyCode === KeyCode.ARROW_LEFT) this._keys.left = true;
        if (e.keyCode === KeyCode.KEY_D || e.keyCode === KeyCode.ARROW_RIGHT) this._keys.right = true;
    }

    private _onKeyUp(e: EventKeyboard) {
        if (e.keyCode === KeyCode.KEY_W || e.keyCode === KeyCode.ARROW_UP) this._keys.up = false;
        if (e.keyCode === KeyCode.KEY_S || e.keyCode === KeyCode.ARROW_DOWN) this._keys.down = false;
        if (e.keyCode === KeyCode.KEY_A || e.keyCode === KeyCode.ARROW_LEFT) this._keys.left = false;
        if (e.keyCode === KeyCode.KEY_D || e.keyCode === KeyCode.ARROW_RIGHT) this._keys.right = false;
    }
}
