import { _decorator, Component, Node, Vec2, input, Input,
         EventKeyboard, KeyCode, EventMouse, find, Sprite, Color, tween, Vec3 } from 'cc';
import { GameConfig } from '../../core/GameConfig';
import { SlimeEnemy } from '../enemy/SlimeEnemy';

const { ccclass, property } = _decorator;

/**
 * 玩家攻击控制器
 * - 空格键 / 鼠标左键：近战攻击
 * - 攻击范围内最近的敌人受到伤害
 */
@ccclass('AttackController')
export class AttackController extends Component {

    @property({ min: 10 })
    attackRange: number = 90;           // 攻击范围（像素）

    @property({ min: 1 })
    attackDamage: number = GameConfig.PLAYER_BASE_DAMAGE;

    @property({ min: 0.1 })
    attackCooldown: number = 0.5;       // 攻击 CD（秒）

    @property(Node)
    attackEffect: Node = null!;         // 攻击特效节点（可留空）

    private _cooldownTimer: number = 0;
    private _isAttacking: boolean = false;

    onEnable() {
        input.on(Input.EventType.KEY_DOWN,    this._onKeyDown,    this);
        input.on(Input.EventType.MOUSE_DOWN,  this._onMouseDown,  this);
    }

    onDisable() {
        input.off(Input.EventType.KEY_DOWN,   this._onKeyDown,    this);
        input.off(Input.EventType.MOUSE_DOWN, this._onMouseDown,  this);
    }

    update(dt: number) {
        if (this._cooldownTimer > 0) this._cooldownTimer -= dt;
    }

    // ── 输入 ──

    private _onKeyDown(e: EventKeyboard) {
        if (e.keyCode === KeyCode.SPACE) this._doAttack();
    }

    private _onMouseDown(e: EventMouse) {
        // 左键攻击
        if (e.getButton() === EventMouse.BUTTON_LEFT) this._doAttack();
    }

    // ── 攻击逻辑 ──

    private _doAttack() {
        if (this._cooldownTimer > 0 || this._isAttacking) return;

        this._cooldownTimer = this.attackCooldown;
        this._isAttacking = true;

        // 在范围内找所有敌人
        const enemies = this._findEnemiesInRange();

        if (enemies.length > 0) {
            // 打最近的一个
            enemies[0].takeDamage(this.attackDamage);
            console.log(`[Attack] 命中 ${enemies[0].node.name}，伤害 ${this.attackDamage}`);
        }

        // 播放攻击特效
        this._playSlashEffect();

        this.scheduleOnce(() => { this._isAttacking = false; }, 0.15);
    }

    private _findEnemiesInRange(): SlimeEnemy[] {
        const myPos = this.node.position;
        const result: { enemy: SlimeEnemy; dist: number }[] = [];

        // 查找场景中所有 SlimeEnemy 组件
        const scene = this.node.scene;
        const canvas = scene?.getChildByName('Game')?.getChildByName('Canvas');
        if (!canvas) return [];

        canvas.children.forEach(child => {
            const enemy = child.getComponent(SlimeEnemy);
            if (enemy && !enemy.isDead) {
                const dx = child.position.x - myPos.x;
                const dy = child.position.y - myPos.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist <= this.attackRange) {
                    result.push({ enemy, dist });
                }
            }
        });

        // 按距离排序，最近的优先
        result.sort((a, b) => a.dist - b.dist);
        return result.map(r => r.enemy);
    }

    private _playSlashEffect() {
        // 简单：让玩家节点短暂缩放表示攻击感
        tween(this.node)
            .to(0.05, { scale: new Vec3(1.3, 1.3, 1) })
            .to(0.1,  { scale: new Vec3(1.0, 1.0, 1) })
            .start();
    }
}
