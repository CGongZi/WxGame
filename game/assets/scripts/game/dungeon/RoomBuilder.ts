import { _decorator, Component, Node, Graphics, UITransform, Color, Widget } from 'cc';

const { ccclass, property } = _decorator;

/**
 * RoomBuilder
 * 画一个带厚墙的地牢房间
 * 挂到 Canvas 下的 Room 节点（放在 Floor 上面、Player 下面）
 */
@ccclass('RoomBuilder')
export class RoomBuilder extends Component {

    @property({ tooltip: '房间内部宽度（像素）' })
    roomW: number = 1150;   // 横屏 1334 - 墙×2

    @property({ tooltip: '房间内部高度（像素）' })
    roomH: number = 600;    // 横屏 750 - 墙×2 - HUD

    @property({ tooltip: '墙厚（像素）' })
    wallThickness: number = 48;

    onLoad() {
        // Widget：自动居中对齐 Canvas
        const widget = this.getComponent(Widget) ?? this.addComponent(Widget);
        widget.isAlignHorizontalCenter = true;
        widget.isAlignVerticalCenter   = true;
        widget.horizontalCenter        = 0;
        widget.verticalCenter          = 0;
        widget.alignMode               = Widget.AlignMode.ON_WINDOW_RESIZE;

        this._build();
    }

    private _build() {
        const ui = this.getComponent(UITransform) ?? this.addComponent(UITransform);
        const TW  = this.roomW + this.wallThickness * 2;
        const TH  = this.roomH + this.wallThickness * 2;
        ui.setContentSize(TW, TH);

        const g = this.getComponent(Graphics) ?? this.addComponent(Graphics);

        const hw = TW / 2, hh = TH / 2;
        const wt = this.wallThickness;

        // ── 只画四面墙，内部留空让 Floor 节点透出来 ─────────
        // 左墙
        this._drawWallSection(g, -hw,      -hh,      wt,           TH);
        // 右墙
        this._drawWallSection(g,  hw - wt, -hh,      wt,           TH);
        // 下墙（不含角落）
        this._drawWallSection(g, -hw + wt, -hh,      this.roomW,   wt);
        // 上墙（不含角落）
        this._drawWallSection(g, -hw + wt,  hh - wt, this.roomW,   wt);

        // ── 四个角落（最暗）──────────────────────────────
        const corners = [
            [-hw, -hh], [hw - wt, -hh],
            [-hw,  hh - wt], [hw - wt, hh - wt],
        ];
        g.fillColor = new Color(12, 8, 20, 255);
        corners.forEach(([cx, cy]) => {
            g.rect(cx, cy, wt, wt);
            g.fill();
        });

        // ── 门洞（上下各一个）────────────────────────────
        const doorW = 80;
        // 下门
        g.fillColor = new Color(10, 6, 18, 255);
        g.rect(-doorW / 2, -hh, doorW, wt);
        g.fill();
        // 上门
        g.rect(-doorW / 2, hh - wt, doorW, wt);
        g.fill();
    }

    /** 画一段带砖块纹理的墙 */
    private _drawWallSection(g: Graphics, x: number, y: number, w: number, h: number) {
        // 底色（深紫黑）
        g.fillColor = new Color(22, 14, 35, 255);
        g.rect(x, y, w, h);
        g.fill();

        // 砖块纹理
        const brickH = 24, brickW = 48;
        const rows = Math.ceil(h / brickH);
        const cols = Math.ceil(w / brickW) + 1;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const offset = (r % 2 === 0) ? 0 : brickW / 2;
                const bx = x + c * brickW - offset;
                const by = y + r * brickH;
                const bw = Math.min(brickW - 2, x + w - bx - 1);
                const bh = Math.min(brickH - 2, y + h - by - 1);
                if (bw <= 0 || bh <= 0) continue;

                // 砖面（略亮）
                g.fillColor = new Color(48, 32, 68, 255);
                g.rect(bx + 1, by + 1, bw, bh);
                g.fill();

                // 顶部高光
                g.fillColor = new Color(70, 50, 95, 200);
                g.rect(bx + 1, by + bh - 3, bw, 2);
                g.fill();
            }
        }

        // 门洞（上下墙各挖一个门）
        if (Math.abs(h - this.wallThickness) < 2) {  // 是横墙
            g.fillColor = new Color(8, 5, 16, 255);
            g.rect(-this.doorWidth / 2, y, this.doorWidth, h);
            g.fill();
        }
    }
}
