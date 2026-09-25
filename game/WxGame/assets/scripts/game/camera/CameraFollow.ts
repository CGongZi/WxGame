import { _decorator, Component, Node } from 'cc';

const { ccclass, property } = _decorator;

/**
 * CameraFollow —— 已弃用
 *
 * 旧方案：直接移动 Camera 跟随玩家（和 UI Canvas 坐标系冲突，
 * 会把画面拉到左下角，并与 WorldLayer 跟随互相覆盖）。
 *
 * 新方案（居中铁律）：
 *   Player 钉在 Canvas (0,0)；WorldLayer = (-WorldBridge.x, -WorldBridge.y)；
 *   Camera 固定在 Canvas (0,0)。禁止再启用本组件。
 *
 * 此组件保留仅防止场景反序列化报错；onLoad 立刻自我禁用。
 */
@ccclass('CameraFollow')
export class CameraFollow extends Component {

    @property(Node)
    target: Node = null!;

    @property({ min: 1, max: 30 })
    smoothSpeed: number = 8;

    @property mapHalfW: number = 400;
    @property mapHalfH: number = 680;

    onLoad() {
        this.enabled = false;
        console.log('[CameraFollow] 已弃用，自动禁用。跟随由 WorldLayer 负责。');
    }

    update(_dt: number) {
        // 空：不再移动 Camera
    }
}
