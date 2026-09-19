import { _decorator, Component, Node, Vec3, find } from 'cc';

const { ccclass, property } = _decorator;

/**
 * WorldScroller —— UI 模式下实现"相机跟随"
 *
 * 原理：玩家永远在屏幕中央，WorldLayer 反向移动形成跟随效果。
 *
 * 挂到 WorldLayer 节点上。
 * WorldLayer 下放：Floor、Room、EnemyLayer、DamageNumbers
 * Canvas  下放：Player、HUD、JoystickBg/Ctrl（固定不动）
 */
@ccclass('WorldScroller')
export class WorldScroller extends Component {

    @property(Node)
    playerNode: Node = null!;

    @property({ min: 1, max: 30 })
    smoothSpeed: number = 10;

    // 世界边界（地图半尺寸，防止看到黑边）
    @property mapHalfW: number = 360;
    @property mapHalfH: number = 550;

    // 屏幕半尺寸（设计分辨率 750×1334）
    private readonly SCREEN_HW = 375;
    private readonly SCREEN_HH = 667;

    private _dest = new Vec3();

    onLoad() {
        if (!this.playerNode) {
            this.playerNode = find('Game/Canvas/Player') as Node
                           ?? find('Canvas/Player') as Node;
        }
    }

    update(dt: number) {
        if (!this.playerNode) return;

        const px = this.playerNode.position.x;
        const py = this.playerNode.position.y;

        // WorldLayer 要偏移到让玩家看起来在屏幕中央
        // clamp：不让地图滚出边界
        const tx = -Math.max(-this.mapHalfW + this.SCREEN_HW,
                    Math.min( this.mapHalfW - this.SCREEN_HW, px));
        const ty = -Math.max(-this.mapHalfH + this.SCREEN_HH,
                    Math.min( this.mapHalfH - this.SCREEN_HH, py));

        // 平滑插值
        const cur = this.node.position;
        const f   = Math.min(1, this.smoothSpeed * dt);
        this._dest.set(
            cur.x + (tx - cur.x) * f,
            cur.y + (ty - cur.y) * f,
            0,
        );
        this.node.setPosition(this._dest);
    }
}
