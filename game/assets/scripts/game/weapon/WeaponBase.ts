import { _decorator, Component, Vec2, Node } from 'cc';
import { WeaponData } from '../../core/types';

const { ccclass } = _decorator;

/**
 * 武器基类
 * 所有武器类型继承这里，挂载在 PlayerController.weaponHolder 节点上
 */
@ccclass('WeaponBase')
export abstract class WeaponBase extends Component {

    protected _data: WeaponData | null = null;
    protected _cooldownTimer: number = 0;
    protected _ownerNode: Node | null = null;

    /** 初始化武器数据 */
    init(data: WeaponData, owner: Node) {
        this._data = data;
        this._ownerNode = owner;
        this.onInit();
    }

    /** 子类重写：执行一次攻击 */
    abstract attack(direction: Vec2): void;

    /** 子类可重写：初始化逻辑 */
    protected onInit() {}

    update(dt: number) {
        if (this._cooldownTimer > 0) {
            this._cooldownTimer -= dt;
        }
    }

    /** 是否可以攻击（CD 冷却完毕） */
    get canAttack(): boolean {
        return this._cooldownTimer <= 0;
    }

    get weaponData(): WeaponData | null { return this._data; }

    protected startCooldown() {
        if (this._data) {
            this._cooldownTimer = this._data.attackSpeed;
        }
    }
}
