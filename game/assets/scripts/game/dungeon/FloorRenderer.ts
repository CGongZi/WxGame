import { _decorator, Component, Graphics, Color, UITransform, Widget } from 'cc';

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
        // Widget：让节点自动居中对齐 Canvas
        const widget = this.getComponent(Widget) ?? this.addComponent(Widget);
        widget.isAlignHorizontalCenter = true;
        widget.isAlignVerticalCenter   = true;
        widget.horizontalCenter        = 0;
        widget.verticalCenter          = 0;
        widget.alignMode               = Widget.AlignMode.ON_WINDOW_RESIZE;

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
