import { _decorator, Component, Node, Camera, Vec3, game,
         director, view } from 'cc';

const { ccclass, property } = _decorator;

/**
 * CameraFollow
 * 挂到 Camera 节点上，平滑跟随玩家
 * 并在地图边界内限制相机位置（防止看到黑边）
 */
@ccclass('CameraFollow')
export class CameraFollow extends Component {

    @property(Node)
    target: Node = null!;       // 玩家节点

    @property({ min: 1, max: 30, tooltip: '跟随平滑度，越大越跟得紧' })
    smoothSpeed: number = 8;

    @property({ tooltip: '地图半宽（像素），0 = 不限制' })
    mapHalfW: number = 400;

    @property({ tooltip: '地图半高（像素），0 = 不限制' })
    mapHalfH: number = 680;

    private _offset = new Vec3(0, 0, 0);
    private _dest   = new Vec3();

    onLoad() {
        // 记录初始偏移（Camera 相对于 Canvas 原点的偏移）
        this._offset.set(this.node.position);
    }

    update(dt: number) {
        if (!this.target) return;

        const tp = this.target.worldPosition;

        // 目标位置
        this._dest.set(tp.x, tp.y, this.node.position.z);

        // 地图边界限制（让相机不超出地图）
        const w = view.getVisibleSize().width  / 2;
        const h = view.getVisibleSize().height / 2;
        if (this.mapHalfW > 0) {
            this._dest.x = Math.max(-this.mapHalfW + w, Math.min(this.mapHalfW - w, this._dest.x));
        }
        if (this.mapHalfH > 0) {
            this._dest.y = Math.max(-this.mapHalfH + h, Math.min(this.mapHalfH - h, this._dest.y));
        }

        // 平滑插值
        const cur = this.node.position;
        const lerpF = 1 - Math.pow(1 - Math.min(smoothSpeed2alpha(this.smoothSpeed), 0.99), dt * 60);
        this.node.setPosition(
            cur.x + (this._dest.x - cur.x) * lerpF,
            cur.y + (this._dest.y - cur.y) * lerpF,
            cur.z,
        );
    }
}

/** 把 smoothSpeed(1-30) 转成每帧 lerp 因子 */
function smoothSpeed2alpha(s: number) {
    return s / 30;
}
