import { GameConfig } from './GameConfig';
import { eventBus, GameEvents } from './EventBus';

/** 角色战斗属性（局内实时） */
export interface StatBlock {
    maxHp: number;
    atk: number;
    def: number;
    moveSpeed: number;
    critChance: number;
    critMultiplier: number;
}

/**
 * PlayerStats —— 属性唯一来源
 * 武器伤害 / 移速 / 受击减伤 / 暴击 都读这里
 */
export class PlayerStats {
    private static _inst: PlayerStats | null = null;

    static get I(): PlayerStats {
        if (!PlayerStats._inst) PlayerStats._inst = new PlayerStats();
        return PlayerStats._inst;
    }

    /** 基础属性（角色模板） */
    base: StatBlock = {
        maxHp: GameConfig.PLAYER_BASE_HP,
        atk: GameConfig.PLAYER_BASE_DAMAGE,
        def: 0,
        moveSpeed: GameConfig.PLAYER_BASE_SPEED,
        critChance: GameConfig.CRIT_CHANCE,
        critMultiplier: GameConfig.CRIT_MULTIPLIER,
    };

    /** 局内加成（商店/掉落/Buff） */
    bonus: Partial<StatBlock> = {};

    /** 天赋加成（开局从存档灌入） */
    talent: Partial<StatBlock> = {};

    /** 当前生命（运行时） */
    hp: number = GameConfig.PLAYER_BASE_HP;

    /** 护盾值：先于生命吸收伤害（护盾药水 / 技能），不自动回复 */
    shield = 0;

    /**
     * #139/#152 护甲（元气骑士式）：护盾之后、生命之前吸收伤害。
     * 必须「一段时间未受到攻击」才开始回；恢复中一旦再挨打（含无敌帧里被蹭到）立刻中断。
     * 清厅 / 过层仍可瞬间回满。
     */
    armor = 0;
    /** 脱战多久才开始回护甲（秒） */
    static readonly ARMOR_DELAY = 5.5;
    /** 开始回复后，每秒回复上限的比例（约 10 秒回满） */
    static readonly ARMOR_REGEN_PER_SEC = 0.10;
    private _sinceHit = 99;

    /** 护甲上限：别堆太高（#159 配合软减伤，否则甲条仍像无限） */
    armorMax(): number {
        return Math.round(12 + this.get('def') * 1.5 + this.get('maxHp') * 0.05);
    }

    /** 任意「被打到」都打断护甲回复（含无敌帧期间的蹭碰，避免站桩打斗还在回甲） */
    markHit() {
        this._sinceHit = 0;
    }

    /** 每帧：脱战计时 + 护甲回复（不 emit，HUD 每帧对比拉取） */
    tickArmor(dt: number) {
        this._sinceHit += dt;
        const max = this.armorMax();
        if (this._sinceHit < PlayerStats.ARMOR_DELAY || this.armor >= max) return;
        // 护甲可带小数做平滑条；生命永远整数，吸收时会 round
        this.armor = Math.min(max, this.armor + max * PlayerStats.ARMOR_REGEN_PER_SEC * dt);
    }

    /** 清厅 / 新层：护甲立刻回满 */
    refillArmor() {
        this.armor = this.armorMax();
        this._emit();
    }

    /** 护甲是否正在回复中（HUD 呼吸提示用） */
    get armorRegening(): boolean {
        return this._sinceHit >= PlayerStats.ARMOR_DELAY && this.armor < this.armorMax() - 0.5;
    }

    resetForNewRun() {
        this.bonus = {};
        this.shield = 0;
        this.hp = Math.round(this.get('maxHp'));
        this.armor = this.armorMax();
        this._sinceHit = 99;
        this._emit();
    }

    addShield(amount: number, cap = 80) {
        this.shield = Math.min(cap, Math.round(this.shield + Math.max(0, amount)));
        this._emit();
    }

    /** 护盾吸收：返回剩余需扣生命的伤害 */
    absorbWithShield(dmg: number): number {
        const hit = Math.max(0, Math.round(dmg));
        if (this.shield <= 0) return hit;
        const used = Math.min(this.shield, hit);
        this.shield = Math.max(0, Math.round(this.shield - used));
        return Math.max(0, hit - used);
    }

    /** 受击吸收链：护盾 → 护甲 → 返回应扣生命（整数）；并重置脱战计时 */
    absorbHit(dmg: number): { toHp: number; armorUsed: number; armorBroke: boolean } {
        this.markHit();
        let left = this.absorbWithShield(dmg);
        let armorUsed = 0;
        let armorBroke = false;
        if (left > 0 && this.armor > 0) {
            // 护甲可小数回复，但扣给生命的余量必须取整，否则 HUD 出现 65.21600000000001
            armorUsed = Math.min(this.armor, left);
            this.armor = Math.max(0, this.armor - armorUsed);
            left = Math.max(0, Math.round(left - armorUsed));
            if (this.armor <= 0.05) { this.armor = 0; armorBroke = true; }
        }
        return { toHp: left, armorUsed, armorBroke };
    }

    /** 读最终值：base + talent + bonus */
    get(key: keyof StatBlock): number {
        return (this.base[key] ?? 0)
            + (this.talent[key] ?? 0)
            + (this.bonus[key] ?? 0);
    }

    addBonus(partial: Partial<StatBlock>) {
        for (const k of Object.keys(partial) as (keyof StatBlock)[]) {
            const v = partial[k];
            if (v === undefined) continue;
            this.bonus[k] = (this.bonus[k] ?? 0) + v;
            if (k === 'maxHp') {
                this.hp = Math.min(Math.round(this.get('maxHp')), Math.round(this.hp + v));
            }
        }
        this._emit();
    }

    /** 短时 Buff：到期自动扣回（挂在任意 Component 的 schedule 上） */
    addTimedBonus(partial: Partial<StatBlock>, seconds: number, scheduler: { scheduleOnce: (cb: () => void, t: number) => void }) {
        this.addBonus(partial);
        const neg: Partial<StatBlock> = {};
        for (const k of Object.keys(partial) as (keyof StatBlock)[]) {
            const v = partial[k];
            if (v === undefined) continue;
            neg[k] = -v;
        }
        scheduler.scheduleOnce(() => this.addBonus(neg), Math.max(0.1, seconds));
    }

    setTalent(partial: Partial<StatBlock>) {
        const beforeMax = this.get('maxHp');
        this.talent = { ...partial };
        const afterMax = Math.round(this.get('maxHp'));
        const delta = afterMax - beforeMax;
        if (delta > 0) {
            this.hp = Math.min(afterMax, Math.round(this.hp + delta));
        } else {
            this.hp = Math.min(afterMax, Math.round(this.hp));
        }
        this._emit();
    }

    /** 最近一次出手是否暴击（飘字读取；同步命中链路内准确） */
    lastOutgoingCrit = false;

    /** 造成伤害：武器基础伤害 + atk，再掷暴击 */
    calcOutgoing(weaponDamage: number): { dmg: number; crit: boolean } {
        let dmg = weaponDamage + this.get('atk') * 0.35; // atk 部分转化，避免数值爆炸
        dmg = Math.round(dmg);
        const crit = Math.random() < this.get('critChance');
        if (crit) dmg = Math.round(dmg * this.get('critMultiplier'));
        this.lastOutgoingCrit = crit;
        return { dmg, crit };
    }

    /**
     * 受到伤害（#159）。
     * 旧公式 `raw - def` 高防时几乎全压成 1 → 护甲每次只掉 1，体感像铁皮。
     * 现用软减伤：dmg = raw × K/(K+def)，且至少 raw×45%（机关仍走 pierce 的 35% 底）。
     */
    calcIncoming(raw: number, pierceDef = 0): number {
        const hit = Math.max(0, raw);
        if (hit <= 0) return 0;
        const pierce = Math.max(0, Math.min(1, pierceDef));
        const def = Math.max(0, this.get('def') * (1 - pierce));
        const K = 18;
        const soft = Math.round(hit * (K / (K + def)));
        const floor = pierce > 0.01
            ? Math.max(1, Math.round(hit * 0.35))
            : Math.max(1, Math.round(hit * 0.45));
        return Math.max(floor, soft);
    }

    snapshot(): StatBlock & { hp: number } {
        return {
            maxHp: this.get('maxHp'),
            atk: this.get('atk'),
            def: this.get('def'),
            moveSpeed: this.get('moveSpeed'),
            critChance: this.get('critChance'),
            critMultiplier: this.get('critMultiplier'),
            hp: this.hp,
        };
    }

    private _emit() {
        // 生命面板只显示整数；顺手把已渗进的浮点尾巴夹掉
        this.hp = Math.max(0, Math.round(this.hp));
        eventBus.emit(GameEvents.PLAYER_HP_CHANGED, {
            current: this.hp,
            max: Math.round(this.get('maxHp')),
            shield: Math.round(this.shield),
            armor: this.armor,
            armorMax: this.armorMax(),
        });
        eventBus.emit('player-stats-changed', this.snapshot());
    }
}
