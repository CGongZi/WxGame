import { _decorator, Component, Node, Graphics, UITransform,
         Color, Label, tween, Vec3, find } from 'cc';
import { WeaponController, WeaponType, WeaponDef, getWeapon } from './WeaponController';
import { WorldBridge } from '../dungeon/WorldBridge';
import { drawWeaponGlyph } from '../fx/WeaponArt';
import { CombatVfx } from '../fx/CombatVfx';
import { eventBus } from '../../core/EventBus';
import { LootMagnet } from '../item/LootMagnet';
import { rarityColor, rarityLabel, normalizeRarity } from './WeaponRarity';
import { WeaponReplaceUI } from '../ui/WeaponReplaceUI';

const { ccclass } = _decorator;

@ccclass('WeaponPickup')
export class WeaponPickup extends Component {

    private _weaponId: WeaponType = 'bow';
    private _scaled: WeaponDef | null = null;
    private _weaponCtrl: WeaponController = null!;
    private _pickupRadius = 62;
    private _magnet = 300;
    private _floatTimer   = 0;
    private _baseX = 0;
    private _baseY = 0;
    private _picked       = false;
    /** 正在弹替换 UI：不磁吸、不重复触发 */
    private _choosing     = false;
    /** #155 换层刚刷出：宽限内不磁吸/不自动装备 */
    private _readyAt = 0;

    init(id: WeaponType, _playerNode: Node, weaponCtrl: WeaponController, scaled?: WeaponDef) {
        this._weaponId   = id;
        this._weaponCtrl = weaponCtrl;
        this._scaled = scaled ?? null;
        this._baseX = this.node.position.x;
        this._baseY = this.node.position.y;
        this._readyAt = Date.now() / 1000 + 1.35;
        this._draw(id);
        this._floatAnim();
    }

    update(dt: number) {
        if (this._picked || this._choosing) return;
        this._floatTimer += dt;

        const dx = WorldBridge.x - this.node.position.x;
        const dy = WorldBridge.y - this.node.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (Date.now() / 1000 < this._readyAt) {
            const y = this._baseY + Math.sin(this._floatTimer * 2.5) * 8;
            this.node.setPosition(this._baseX, y, 0);
            return;
        }
        const magnet = LootMagnet.range(this._magnet);

        if (dist < magnet && dist > 1) {
            const t = LootMagnet.active ? 1 : 1 - dist / magnet;
            const sp = (280 + t * 440) * dt;
            this.node.setPosition(
                this.node.position.x + (dx / dist) * sp,
                this.node.position.y + (dy / dist) * sp,
                0,
            );
            this._baseX = this.node.position.x;
            this._baseY = this.node.position.y;
            const s = 1 + t * 0.12;
            this.node.setScale(s, s, 1);
        } else {
            const y = this._baseY + Math.sin(this._floatTimer * 2.5) * 8;
            this.node.setPosition(this._baseX, y, 0);
        }

        if (dist < this._pickupRadius) this._pickup();
    }

    private _pickup() {
        if (this._picked || this._choosing) return;
        if (WeaponReplaceUI.isOpen) return;
        const def = this._scaled ?? getWeapon(this._weaponId);
        const ok = this._weaponCtrl?.equipWeapon(this._weaponId, this._scaled ?? undefined);
        if (ok === false) {
            // #161 已满两把：弹选择，地面武先藏着
            this._choosing = true;
            this.node.active = false;
            const canvas = find('Canvas');
            if (!canvas) {
                this._choosing = false;
                this.node.active = true;
                return;
            }
            const incoming: WeaponDef = {
                ...def,
                bulletColor: def.bulletColor ? def.bulletColor.clone() : undefined,
            };
            WeaponReplaceUI.show({
                canvas,
                incoming,
                slots: this._weaponCtrl.slotWeapons(),
                onReplace: (oldId) => {
                    this._weaponCtrl.replaceOwned(oldId, incoming);
                    this._finishPickupFx(incoming);
                },
                onCancel: () => {
                    this._choosing = false;
                    if (this.node.isValid) {
                        this.node.active = true;
                        // 弹开一点，避免立刻再触发
                        const a = Math.random() * Math.PI * 2;
                        this._baseX = WorldBridge.x + Math.cos(a) * 90;
                        this._baseY = WorldBridge.y + Math.sin(a) * 90;
                        this.node.setPosition(this._baseX, this._baseY, 0);
                    }
                    eventBus.emit('show-tip', { text: '取消拾取' });
                },
            });
            return;
        }

        this._finishPickupFx(def);
    }

    private _finishPickupFx(def: WeaponDef) {
        this._picked = true;
        this._choosing = false;
        const tier = rarityLabel(def.rarity);
        eventBus.emit('show-tip', { text: `${def.emoji} [${tier}] ${def.name}` });

        if (!this.node.active) this.node.active = true;
        const parent = this.node.parent;
        if (parent?.isValid) {
            const col = rarityColor(def.rarity);
            CombatVfx.burst(parent, this.node.position.x, this.node.position.y, col, 8);
            CombatVfx.ringPulse(parent, this.node.position.x, this.node.position.y,
                col, 20, 0.25);
        }

        tween(this.node)
            .to(0.12, {
                position: new Vec3(WorldBridge.x, WorldBridge.y, 0),
                scale: new Vec3(1.7, 1.7, 1),
            }, { easing: 'quartOut' })
            .to(0.12, { scale: new Vec3(0, 0, 1) })
            .call(() => this.node.destroy())
            .start();
    }

    private _draw(id: WeaponType) {
        const def = this._scaled ?? getWeapon(id);
        const col = rarityColor(def.rarity);
        this.node.addComponent(UITransform).setContentSize(56, 64);
        const g = this.node.addComponent(Graphics);
        g.fillColor = new Color(col.r, col.g, col.b, 55);
        g.circle(0, 2, 28); g.fill();
        g.strokeColor = new Color(col.r, col.g, col.b, 220);
        g.lineWidth = normalizeRarity(def.rarity) === 'red' || normalizeRarity(def.rarity) === 'gold' ? 3 : 2;
        g.circle(0, 2, 28); g.stroke();
        drawWeaponGlyph(g, id, 40);
        g.fillColor = new Color(40, 28, 18, 230);
        g.roundRect(-22, -26, 44, 14, 4); g.fill();
        g.fillColor = new Color(col.r, col.g, col.b, 255);
        g.roundRect(-22, -16, 44, 8, 3); g.fill();

        const nameNode = new Node('Name');
        nameNode.setParent(this.node);
        nameNode.setPosition(0, -38, 0);
        nameNode.addComponent(UITransform).setContentSize(110, 18);
        const nameLbl = nameNode.addComponent(Label);
        nameLbl.string = `${def.name}·${rarityLabel(def.rarity)}`;
        nameLbl.fontSize = 12;
        nameLbl.color = col;
    }

    private _floatAnim() {
        this.node.setScale(0, 0, 1);
        tween(this.node)
            .to(0.3, { scale: new Vec3(1.2, 1.2, 1) }, { easing: 'backOut' })
            .to(0.1, { scale: new Vec3(1.0, 1.0, 1) })
            .start();
    }
}
