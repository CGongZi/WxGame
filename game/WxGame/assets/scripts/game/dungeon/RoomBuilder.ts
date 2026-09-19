import { _decorator, Component, Node, Graphics, UITransform, Color } from 'cc';

const { ccclass, property } = _decorator;

/**
 * RoomBuilder
 * 画一个带厚墙的地牢房间
 * 挂到 Canvas 下的 Room 节点（放在 Floor 上面、Player 下面）
 */
@ccclass('RoomBuilder')
export class RoomBuilder extends Component {

    @property({ tooltip: '房间内部宽度（像素）' })
    roomW: number = 720;

    @property({ tooltip: '房间内部高度（像素）' })
    roomH: number = 1100;

    @property({ tooltip: '墙厚（像素）' })
    wallThickness: number = 48;

    onLoad() {
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

        // ── 外墙底色（更深的紫黑）────────────────────────
        g.fillColor = new Color(18, 12, 28, 255);
        g.rect(-hw, -hh, TW, TH);
        g.fill();

        // ── 内部地面（空洞，透出 FloorRenderer）──────────
        // 不画内部，让 Floor 层透出来即可

        // ── 砖墙纹理（分块）─────────────────────────────
        this._drawWallSection(g, -hw,       -hh,       wt,   TH);   // 左墙
        this._drawWallSection(g,  hw - wt,  -hh,       wt,   TH);   // 右墙
        this._drawWallSection(g, -hw + wt,  -hh,       this.roomW, wt);   // 下墙
        this._drawWallSection(g, -hw + wt,   hh - wt,  this.roomW, wt);   // 上墙

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
        const brickH = 24, brickW = 48;
        const rows = Math.ceil(h / brickH);
        const cols = Math.ceil(w / brickW);

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const offset = (r % 2 === 0) ? 0 : brickW / 2;
                const bx = x + c * brickW - offset;
                const by = y + r * brickH;
                const bw = Math.min(brickW - 2, x + w - bx - 1);
                const bh = Math.min(brickH - 2, y + h - by - 1);
                if (bw <= 0 || bh <= 0) continue;

                // 砖块深色
                g.fillColor = new Color(35, 24, 50, 255);
                g.rect(bx + 1, by + 1, bw, bh);
                g.fill();

                // 砖块顶部高光
                g.fillColor = new Color(55, 40, 75, 255);
                g.rect(bx + 1, by + bh - 3, bw, 2);
                g.fill();
            }
        }
    }
}
