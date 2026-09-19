import { _decorator, Component, Vec3, input, Input,
         EventKeyboard, KeyCode, EventMouse, Sprite, Color, tween } from 'cc';
import { GameConfig } from '../../core/GameConfig';
import { EnemyRegistry } from '../enemy/EnemyRegistry';

const { ccclass, property } = _decorator;

@ccclass('AttackController')
export class AttackController extends Component {

    @property({ min: 10 })  attackRange:    number = 120;
    @property({ min: 1  })  attackDamage:   number = GameConfig.PLAYER_BASE_DAMAGE;
    @property({ min: 0.1 }) attackCooldown: number = 0.5;

    private _cdTimer   = 0;
    private _sprite: Sprite | null = null;

    // 攻击时玩家变白色闪一下
    private readonly C_NORMAL = new Color(0,   255, 136, 255);  // 00FF88
    private readonly C_ATTACK = new Color(255, 255, 255, 255);  // 白

    onLoad() {
        this._sprite = this.getComponent(Sprite);
    }

    onEnable() {
        input.on(Input.EventType.KEY_DOWN,   this._onKey,   this);
        input.on(Input.EventType.MOUSE_DOWN, this._onMouse, this);
    }

    onDisable() {
        input.off(Input.EventType.KEY_DOWN,   this._onKey,   this);
        input.off(Input.EventType.MOUSE_DOWN, this._onMouse, this);
    }

    update(dt: number) {
        if (this._cdTimer > 0) this._cdTimer -= dt;
    }

    private _onKey(e: EventKeyboard) {
        if (e.keyCode === KeyCode.SPACE || e.keyCode === KeyCode.KEY_J) {
            this._doAttack();
        }
    }

    private _onMouse(e: EventMouse) {
        // 左键
        if (e.getButton() === 0) this._doAttack();
    }

    private _doAttack() {
        if (this._cdTimer > 0) return;
        this._cdTimer = this.attackCooldown;

        const pos = this.node.position;
        const enemies = EnemyRegistry.getInRange(pos.x, pos.y, this.attackRange);

        console.log(`[Attack] 范围内敌人: ${enemies.length}，攻击力: ${this.attackDamage}`);

        if (enemies.length > 0) {
            enemies[0].takeDamage(this.attackDamage);
        }

        // 攻击视觉反馈：玩家闪白
        if (this._sprite) {
            this._sprite.color = this.C_ATTACK;
            this.scheduleOnce(() => {
                if (this._sprite) this._sprite.color = this.C_NORMAL;
            }, 0.1);
        }

        // 缩放弹跳感
        tween(this.node)
            .to(0.06, { scale: new Vec3(1.25, 1.25, 1) })
            .to(0.12, { scale: new Vec3(1.0,  1.0,  1) })
            .start();
    }
}
