import { _decorator, Component, Node, find } from 'cc';
import { WeaponController, WeaponType } from './WeaponController';
import { WeaponPickup } from './WeaponPickup';

const { ccclass, property } = _decorator;

/**
 * WeaponSpawner —— 在地图上生成可拾取的武器
 * 挂到 Canvas 下的 WeaponLayer 节点
 */
@ccclass('WeaponSpawner')
export class WeaponSpawner extends Component {

    @property(Node)
    playerNode: Node = null!;

    @property(Node)
    weaponControllerNode: Node = null!;  // 挂有 WeaponController 的节点（Player）

    /** 要生成的武器和位置 [x, y, weaponId] */
    private readonly DROPS: [number, number, WeaponType][] = [
        [ -180,  200, 'bow'    ],
        [  200, -180, 'wand'   ],
        [ -100, -280, 'dagger' ],
    ];

    onLoad() {
        if (!this.playerNode) {
            this.playerNode = find('Game/Canvas/Player') as Node
                           ?? find('Canvas/Player') as Node;
        }
        if (!this.weaponControllerNode) {
            this.weaponControllerNode = this.playerNode;
        }

        const ctrl = this.weaponControllerNode?.getComponent(WeaponController);
        if (!ctrl) {
            console.warn('[WeaponSpawner] 找不到 WeaponController，请挂到 Player 上');
            return;
        }

        this.DROPS.forEach(([x, y, id]) => {
            const n = new Node(`Pickup_${id}`);
            n.setParent(this.node);
            n.setPosition(x, y, 0);
            n.addComponent(WeaponPickup).init(id, this.playerNode, ctrl);
        });

        console.log(`[WeaponSpawner] 生成了 ${this.DROPS.length} 个武器拾取物`);
    }
}
