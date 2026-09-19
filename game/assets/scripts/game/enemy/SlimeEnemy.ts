import { _decorator, Component, Node, Vec2, Vec3, Sprite, Color,
         UITransform, find } from 'cc';
import { GameConfig } from '../../core/GameConfig';
import { GameManager } from '../../core/GameManager';
import { eventBus, GameEvents } from '../../core/EventBus';

const { ccclass, property } = _decorator;

type SlimeState = 'idle' | 'chase' | 'attack' | 'stunned' | 'dead';

/**
 * 史莱姆敌人
 * 感知玩家 → 追击 → 近战攻击
 */
@ccclass('SlimeEnemy')
export class SlimeEnemy extends Component {

    @property(Node)
    playerNode: Node = null!;   // 在 Inspector 里拖入 Player 节点

    @property({ min: 10 })
    hp: number = 30;

    @property({ min: 1 })
    damage: number = 8;

    @property({ min: 10 })
    speed: number = 60;

    @property({ min: 10 })
    detectionRange: number = 250;   // 感知范围（像素）

    @property({ min: 10 })
    attackRange: number = 45;       // 攻击范围

    @property({ min: 0.1 })
    attackCooldown: number = 1.2;   // 攻击 CD（秒）

    // ── 私有状态 ──
    private _state: SlimeState = 'idle';
    private _currentHp: number = 0;
    private _maxHp: number = 0;
    private _attackTimer: number = 0;
    private _stunTimer: number = 0;
    private _sprite: Sprite | null = null;

    // 史莱姆颜色主题
    private readonly COLOR_NORMAL = new Color(60, 200, 80, 255);   // 绿色
    private readonly COLOR_HIT    = new Color(255, 80, 80, 255);   // 受击红
    private readonly COLOR_DEAD   = new Color(80, 80, 80, 100);    // 死亡灰

    onLoad() {
        this._currentHp = this.hp;
        this._maxHp = this.hp;
        this._sprite = this.getComponent(Sprite);
        if (this._sprite) this._sprite.color = this.COLOR_NORMAL;
    }

    update(dt: number) {
        if (this._state === 'dead') return;

        // 眩晕计时
        if (this._state === 'stunned') {
            this._stunTimer -= dt;
            if (this._stunTimer <= 0) this._state = 'chase';
            return;
        }

        // 攻击 CD
        if (this._attackTimer > 0) this._attackTimer -= dt;

        // 自动寻找 Player（如未在 Inspector 赋值）
        if (!this.playerNode) {
            const found = find('Game/Canvas/Player');
            if (found) this.playerNode = found;
            else return;
        }

        const dist = this._distToPlayer();

        switch (this._state) {
            case 'idle':
                if (dist < this.detectionRange) {
                    this._state = 'chase';
                }
                break;

            case 'chase':
                if (dist < this.attackRange) {
                    this._state = 'attack';
                } else {
                    this._moveToward(dt);
                }
                break;

            case 'attack':
                if (dist > this.attackRange * 1.5) {
                    this._state = 'chase';
                } else if (this._attackTimer <= 0) {
                    this._doAttack();
                }
                break;
        }
    }

    /** 受到伤害（由 AttackController 调用） */
    takeDamage(amount: number) {
        if (this._state === 'dead') return;

        // 暴击判定
        let finalDmg = amount;
        if (Math.random() < GameConfig.CRIT_CHANCE) {
            finalDmg = Math.round(finalDmg * GameConfig.CRIT_MULTIPLIER);
        }

        this._currentHp -= finalDmg;

        // 伤害飘字事件
        eventBus.emit(GameEvents.DAMAGE_DEALT, {
            amount: finalDmg,
            position: this.node.position.clone(),
        });

        // 受击闪红
        this._flashRed();

        // 眩晕
        this._state = 'stunned';
        this._stunTimer = 0.25;

        if (this._currentHp <= 0) {
            this._die();
        }
    }

    get isDead() { return this._state === 'dead'; }
    get hpRatio() { return this._currentHp / this._maxHp; }

    // ── 私有 ──

    private _moveToward(dt: number) {
        const px = this.playerNode.position.x;
        const py = this.playerNode.position.y;
        const mx = this.node.position.x;
        const my = this.node.position.y;
        const dx = px - mx;
        const dy = py - my;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1) return;

        this.node.setPosition(
            mx + (dx / len) * this.speed * dt,
            my + (dy / len) * this.speed * dt,
            0,
        );

        // 朝向玩家翻转
        const scale = this.node.scale;
        if (dx < 0) this.node.setScale(-Math.abs(scale.x), scale.y, scale.z);
        else        this.node.setScale( Math.abs(scale.x), scale.y, scale.z);
    }

    private _doAttack() {
        this._attackTimer = this.attackCooldown;

        // 检查是否在攻击范围内（实时判断）
        if (this._distToPlayer() < this.attackRange) {
            const player = this.playerNode?.getComponent('PlayerController') as any;
            if (player) {
                player.takeDamage(this.damage);
                console.log(`[Slime] 攻击玩家 ${this.damage} 伤害`);
            }
        }
    }

    private _die() {
        this._state = 'dead';
        if (this._sprite) this._sprite.color = this.COLOR_DEAD;

        // 通知游戏管理器
        try { GameManager.instance.onEnemyKilled('slime-green'); } catch {}

        eventBus.emit(GameEvents.ENEMY_KILLED, {
            enemyId: 'slime-green',
            position: this.node.position.clone(),
        });

        // 掉落金币（临时：直接加金币）
        const coins = Math.floor(Math.random() * 3) + 1;
        try { GameManager.instance.addCoins(coins); } catch {}

        // 0.4 秒后销毁
        this.scheduleOnce(() => this.node.destroy(), 0.4);
    }

    private _flashRed() {
        if (!this._sprite) return;
        this._sprite.color = this.COLOR_HIT;
        this.scheduleOnce(() => {
            if (this._sprite && this._state !== 'dead') {
                this._sprite.color = this.COLOR_NORMAL;
            }
        }, 0.1);
    }

    private _distToPlayer(): number {
        if (!this.playerNode) return Infinity;
        const dx = this.playerNode.position.x - this.node.position.x;
        const dy = this.playerNode.position.y - this.node.position.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
}
