import { _decorator, Vec2, PhysicsSystem2D, CircleCollider2D, geometry, math } from 'cc';
import { WeaponBase } from './WeaponBase';
import { EnemyBase } from '../enemy/EnemyBase';
import { GameConfig } from '../../core/GameConfig';

const { ccclass } = _decorator;

/**
 * 近战武器 — 剑
 * 攻击时在玩家前方一定范围内检测敌人
 */
@ccclass('SwordWeapon')
export class SwordWeapon extends WeaponBase {

    attack(direction: Vec2) {
        if (!this.canAttack || !this._data || !this._ownerNode) return;

        this.startCooldown();

        // 在攻击范围内检测敌人（圆形区域）
        const playerPos = this._ownerNode.position;
        // 攻击中心点 = 玩家位置 + 方向 * 半径
        const attackCenter = new math.Vec2(
            playerPos.x + direction.x * this._data.range * 0.5,
            playerPos.y + direction.y * this._data.range * 0.5,
        );

        // 使用物理系统进行圆形范围查询
        const results = PhysicsSystem2D.instance.testAABB(
            new geometry.AABB(
                attackCenter.x - this._data.range,
                attackCenter.y - this._data.range,
                0,
                this._data.range * 2,
                this._data.range * 2,
                0,
            ),
        );

        // 对范围内的敌人造成伤害
        for (const collider of results) {
            const enemy = collider.node.getComponent(EnemyBase);
            if (enemy) {
                const knockback = new Vec2(
                    collider.node.position.x - playerPos.x,
                    collider.node.position.y - playerPos.y,
                ).normalize();
                enemy.takeDamage(this._data.damage, knockback);
            }
        }

        // 播放挥砍动画/特效
        this._playSlashEffect(attackCenter, direction);
    }

    private _playSlashEffect(_pos: math.Vec2, _dir: Vec2) {
        // TODO: 实例化挥砍特效 Prefab
    }
}
