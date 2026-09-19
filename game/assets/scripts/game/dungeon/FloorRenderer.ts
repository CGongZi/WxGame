import { _decorator, Component, Graphics, Color, UITransform, Camera, Widget } from 'cc';

const { ccclass, property } = _decorator;

/**
 * FloorRenderer —— 纯代码画出像素风地板
 * 挂到 Canvas 下的 Floor 节点，不需要任何图片资源
 * 确保 Floor 节点在 Hierarchy 里排在 Player/Slime **前面**（z-order 最低）
 */
@ccclass('FloorRenderer')
export class FloorRenderer extends Component {

    @property({ min: 4  }) tileSize:  number = 48;
    @property({ min: 2  }) cols:      number = 26;  // 横屏：1334/48 ≈ 26
    @property({ min: 2  }) rows:      number = 14;  // 横屏：750/48  ≈ 14

    // 像素地牢配色
    private readonly C_DARK   = new Color( 38,  28,  52, 255);
    private readonly C_LIGHT  = new Color( 52,  40,  68, 255);
    private readonly C_EDGE   = new Color( 25,  18,  36, 255);
    private readonly C_SHINE  = new Color(255, 255, 255,  12);

    onLoad() {
        // 强制居中：不管 scene 文件里设了什么位置
        this.node.setPosition(0, 0, 0);

        // ★ 调试：打印关键节点的实际坐标数值
        const canvasNode = this.node.parent;
        if (canvasNode) {
            // 禁用 Widget
            const widget = canvasNode.getComponent(Widget);
            if (widget) { widget.enabled = false; }

            // 读 Canvas UITransform 实际尺寸
            const cvUI = canvasNode.getComponent(UITransform);
            const cvW  = cvUI ? cvUI.width  : -1;
            const cvH  = cvUI ? cvUI.height : -1;

            // Canvas 世界坐标
            const cvWP = canvasNode.worldPosition;

            // Camera
            const camNode = canvasNode.getChildByName('Camera');
            const cam = camNode?.getComponent(Camera);
            const camOH = cam ? cam.orthoHeight : -1;
            const camWP = camNode?.worldPosition;

            // Floor 自身世界坐标
            const flWP = this.node.worldPosition;

            console.log(
                '[DEBUG] Canvas worldPos=(' + cvWP.x.toFixed(0) + ',' + cvWP.y.toFixed(0) + ')' +
                ' size=' + cvW.toFixed(0) + 'x' + cvH.toFixed(0)
            );
            console.log(
                '[DEBUG] Camera worldPos=(' + (camWP?.x.toFixed(0) ?? '?') + ',' + (camWP?.y.toFixed(0) ?? '?') + ')' +
                ' orthoHeight=' + camOH.toFixed(0)
            );
            console.log(
                '[DEBUG] Floor  worldPos=(' + flWP.x.toFixed(0) + ',' + flWP.y.toFixed(0) + ')'
            );
        }

        const ui = this.getComponent(UITransform) ?? this.addComponent(UITransform);
        const W  = this.cols * this.tileSize;
        const H  = this.rows * this.tileSize;
        ui.setContentSize(W, H);

        const g = this.getComponent(Graphics) ?? this.addComponent(Graphics);
        this._draw(g, W, H);
    }

    private _draw(g: Graphics, W: number, H: number) {
        const ox = -W / 2;
        const oy = -H / 2;
        const ts = this.tileSize;

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const x = ox + c * ts;
                const y = oy + r * ts;

                // 边框（深色）
                g.fillColor = this.C_EDGE;
                g.rect(x, y, ts, ts);
                g.fill();

                // 内部砖块（交替深浅）
                g.fillColor = (r + c) % 2 === 0 ? this.C_DARK : this.C_LIGHT;
                g.rect(x + 1, y + 1, ts - 2, ts - 2);
                g.fill();

                // 顶部高光（模拟像素 3D 感）
                g.fillColor = this.C_SHINE;
                g.rect(x + 1, y + ts - 4, ts - 2, 3);
                g.fill();
            }
        }
    }
}
