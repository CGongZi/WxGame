import { _decorator, Component, Vec2, Vec3, RigidBody2D, Animation, Node } from 'cc';
import { EnemyData, EnemyState } from '../../core/types';
import { GameConfig } from '../../core/GameConfig';
import { GameManager } from '../../core/GameManager';
import { eventBus, GameEvents } from '../../core/EventBus';

const { ccclass, property } = _decorator;

/**
 * 怪物基类
 * 所有怪物类型继承这里
 */
@ccclass('EnemyBase')
export class EnemyBase extends Component {

    protected _data: EnemyData | null = null;
    protected _state: EnemyState = 'idle';
    protected _currentHp: number = 0;
    protected _rb: RigidBody2D | null = null;
    protected _anim: Animation | null = null;
    protected _playerNode: Node | null = null;
    protected _attackCooldown: number = 0;
    protected _stunTimer: number = 0;

    // ── 初始化 ──
    init(data: EnemyData, playerNode: Node) {
        this._data = data;
        this._currentHp = data.hp;
        this._playerNode = playerNode;
        this._rb = this.getComponent(RigidBody2D);
        this._anim = this.getComponentInChildren(Animation);
    }

    update(dt: number) {
        if (!this._data || this._state === 'dead') return;

        // 眩晕计时
        if (this._state === 'stunned') {
            this._stunTimer -= dt;
            if (this._stunTimer <= 0) {
                this._state = 'chase';
            }
            return;
        }

        // 攻击 CD 计时
        if (this._attackCooldown > 0) {
            this._attackCooldown -= dt;
        }

        this._updateAI(dt);
    }

    /** 子类重写：实现具体 AI 行为 */
    protected _updateAI(_dt: number) {
        if (!this._playerNode) return;

        const distToPlayer = this._distToPlayer();

        switch (this._state) {
            case 'idle':
                if (distToPlayer <= this._data!.detectionRange) {
                    this._state = 'chase';
                }
                break;

            case 'chase':
                if (distToPlayer <= this._data!.attackRange) {
                    this._state = 'attack';
                } else {
                    this._moveTowardPlayer();
                }
                break;

            case 'attack':
                if (distToPlayer > this._data!.attackRange * 1.5) {
                    this._state = 'chase';
                } else if (this._attackCooldown <= 0) {
                    this._doAttack();
                }
                break;
        }
    }

    /** 受到伤害 */
    takeDamage(amount: number, knockbackDir: Vec2 = Vec2.ZERO) {
        if (this._state === 'dead') return;

        // 应用暴击
        let finalDamage = amount;
        if (Math.random() < GameConfig.CRIT_CHANCE) {
            finalDamage *= GameConfig.CRIT_MULTIPLIER;
        }
        // 随机浮动
        const variance = 1 + (Math.random() * 2 - 1) * GameConfig.DAMAGE_VARIANCE;
        finalDamage = Math.round(finalDamage * variance);

        this._currentHp -= finalDamage;

        // 显示伤害数字
        eventBus.emit(GameEvents.DAMAGE_DEALT, {
            amount: finalDamage,
            position: this.node.position,
        });

        // 击退
        if (this._rb && !knockbackDir.equals(Vec2.ZERO)) {
            this._rb.applyLinearImpulseToCenter(
                new Vec2(knockbackDir.x * GameConfig.KNOCKBACK_FORCE, knockbackDir.y * GameConfig.KNOCKBACK_FORCE),
                true,
            );
        }

        // 进入眩晕状态
        this._state = 'stunned';
        this._stunTimer = 0.2;

        if (this._currentHp <= 0) {
            this._die();
        } else {
            eventBus.emit(GameEvents.ENEMY_DAMAGED, { node: this.node });
        }
    }

    // ── 受保护方法 ──

    protected _moveTowardPlayer() {
        if (!this._playerNode || !this._rb) return;
        const dir = new Vec2(
            this._playerNode.position.x - this.node.position.x,
            this._playerNode.position.y - this.node.position.y,
        ).normalize();
        this._rb.linearVelocity = new Vec2(dir.x * this._data!.speed, dir.y * this._data!.speed);
    }

    protected _doAttack() {
        // 子类重写
        this._attackCooldown = 1.0;
    }

    protected _die() {
        this._state = 'dead';
        if (this._rb) this._rb.linearVelocity = Vec2.ZERO;

        // 通知游戏管理器
        GameManager.instance.onEnemyKilled(this._data!.id);

        // 生成掉落
        this._spawnDrops();

        // 播放死亡动画后销毁
        this._playAnim('die');
        this.scheduleOnce(() => {
            this.node.destroy();
        }, 0.5);
    }

    protected _spawnDrops() {
        // DropSystem 会监听 ENEMY_KILLED 事件并处理掉落逻辑
    }

    protected _playAnim(name: string) {
        if (!this._anim) return;
        const state = this._anim.getState(name);
        if (state) this._anim.play(name);
    }

    protected _distToPlayer(): number {
        if (!this._playerNode) return Infinity;
        const dx = this._playerNode.position.x - this.node.position.x;
        const dy = this._playerNode.position.y - this.node.position.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
}
