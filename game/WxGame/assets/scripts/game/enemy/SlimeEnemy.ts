import { _decorator, Component, Node, Vec2, Sprite, Graphics, Color, find } from 'cc';
import { GameConfig } from '../../core/GameConfig';
import { GameManager } from '../../core/GameManager';
import { eventBus, GameEvents } from '../../core/EventBus';
import { EnemyRegistry } from './EnemyRegistry';

const { ccclass, property } = _decorator;

type SlimeState = 'idle' | 'chase' | 'attack' | 'stunned' | 'dead';

@ccclass('SlimeEnemy')
export class SlimeEnemy extends Component {

    @property(Node)
    playerNode: Node = null!;

    @property({ min: 10 }) hp:              number = 30;
    @property({ min: 1  }) damage:          number = 8;
    @property({ min: 10 }) speed:           number = 70;
    @property({ min: 10 }) detectionRange:  number = 400;
    @property({ min: 10 }) attackRange:     number = 50;
    @property({ min: 0.1}) attackCooldown:  number = 1.2;

    private _state: SlimeState = 'idle';
    private _currentHp = 0;
    private _maxHp = 0;
    private _attackTimer = 0;
    private _stunTimer = 0;
    private _sprite: Sprite | null = null;
    private _graphics: Graphics | null = null;

    private readonly C_NORMAL = new Color( 60, 200,  80, 255);
    private readonly C_HIT    = new Color(255,  80,  80, 255);
    private readonly C_DEAD   = new Color( 80,  80,  80, 120);

    onLoad() {
        this._currentHp = this.hp;
        this._maxHp     = this.hp;
        this._sprite   = this.getComponent(Sprite);
        this._graphics = this.getComponent(Graphics);
        if (this._sprite) this._sprite.color = this.C_NORMAL;

        // 自动查找玩家
        if (!this.playerNode) {
            this.playerNode = find('Game/Canvas/Player') as Node;
        }

        // 注册到全局表
        EnemyRegistry.register(this);
        console.log(`[Slime] 已注册，共 ${EnemyRegistry.count} 只`);
    }

    onDestroy() {
        EnemyRegistry.unregister(this);
    }

    update(dt: number) {
        if (this._state === 'dead') return;

        if (this._state === 'stunned') {
            this._stunTimer -= dt;
            if (this._stunTimer <= 0) this._state = 'chase';
            return;
        }

        if (this._attackTimer > 0) this._attackTimer -= dt;

        const dist = this._distToPlayer();

        switch (this._state) {
            case 'idle':
                if (dist < this.detectionRange) this._state = 'chase';
                break;
            case 'chase':
                if (dist < this.attackRange) this._state = 'attack';
                else this._moveToward(dt);
                break;
            case 'attack':
                if (dist > this.attackRange * 1.5) this._state = 'chase';
                else if (this._attackTimer <= 0)   this._doAttack();
                break;
        }
    }

    /** 受到伤害 */
    takeDamage(amount: number) {
        if (this._state === 'dead') return;

        // 暴击
        let dmg = amount;
        if (Math.random() < GameConfig.CRIT_CHANCE) {
            dmg = Math.round(dmg * GameConfig.CRIT_MULTIPLIER);
        }
        this._currentHp -= dmg;

        // 飘字
        eventBus.emit(GameEvents.DAMAGE_DEALT, {
            amount: dmg,
            position: this.node.position.clone(),
        });

        // 受击闪红：Sprite 或 Graphics 都支持
        if (this._sprite) {
            this._sprite.color = this.C_HIT;
            this.scheduleOnce(() => {
                if (this._sprite && this._state !== 'dead')
                    this._sprite.color = this.C_NORMAL;
            }, 0.12);
        } else if (this._graphics) {
            // Graphics 节点：整体透明度闪烁表示受击
            this.node.setScale(1.15, 1.15, 1);
            this.scheduleOnce(() => { this.node.setScale(1, 1, 1); }, 0.12);
        }

        this._state = 'stunned';
        this._stunTimer = 0.25;

        if (this._currentHp <= 0) this._die();
    }

    get isDead() { return this._state === 'dead'; }

    // ── 私有 ──

    private _moveToward(dt: number) {
        if (!this.playerNode) return;
        const mx = this.node.position.x, my = this.node.position.y;
        const px = this.playerNode.position.x, py = this.playerNode.position.y;
        const dx = px - mx, dy = py - my;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1) return;
        this.node.setPosition(mx + (dx / len) * this.speed * dt,
                              my + (dy / len) * this.speed * dt, 0);
        // 翻转朝向
        const s = this.node.scale;
        this.node.setScale(dx < 0 ? -Math.abs(s.x) : Math.abs(s.x), s.y, s.z);
    }

    private _doAttack() {
        this._attackTimer = this.attackCooldown;
        if (this._distToPlayer() < this.attackRange) {
            const pc = this.playerNode?.getComponent('PlayerController') as any;
            pc?.takeDamage(this.damage);
            console.log(`[Slime] 攻击玩家 -${this.damage} HP`);
        }
    }

    private _die() {
        this._state = 'dead';
        if (this._sprite)   this._sprite.color = this.C_DEAD;
        if (this._graphics) this.node.setScale(0.5, 0.5, 1);  // 死亡缩小
        // GameManager.onEnemyKilled 内部已经会 emit ENEMY_KILLED，不要重复 emit
        try { GameManager.instance.onEnemyKilled('slime-green'); } catch {
            // 编辑器没有 GameManager 时直接 emit
            eventBus.emit(GameEvents.ENEMY_KILLED, { enemyId: 'slime-green' });
        }
        try { GameManager.instance.addCoins(Math.ceil(Math.random() * 3)); } catch {}
        this.scheduleOnce(() => this.node.destroy(), 0.5);
    }

    private _distToPlayer(): number {
        if (!this.playerNode) return Infinity;
        const dx = this.playerNode.position.x - this.node.position.x;
        const dy = this.playerNode.position.y - this.node.position.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
}
