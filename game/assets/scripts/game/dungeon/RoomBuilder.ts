import { _decorator, Component, Graphics, UITransform, Color } from 'cc';
import { RoomController } from './RoomController';

const { ccclass, property } = _decorator;

/**
 * RoomBuilder —— 画带厚墙的地牢房间 + 可开关的门
 */
@ccclass('RoomBuilder')
export class RoomBuilder extends Component {

    @property({ tooltip: '房间内部宽度（像素）' })
    roomW: number = 1150;

    @property({ tooltip: '房间内部高度（像素）' })
    roomH: number = 600;

    @property({ tooltip: '墙厚（像素）' })
    wallThickness: number = 48;

    @property({ tooltip: '门洞宽度' })
    doorWidth: number = 80;

    private _doorsOpen = false;
    private _g: Graphics | null = null;

    onLoad() {
        this.node.setPosition(0, 0, 0);

        // 自动挂 RoomController，免手动加组件
        if (!this.getComponent(RoomController)) {
            this.addComponent(RoomController);
        }

        this._rebuild();
    }

    /** 开/关门：重绘门洞区域 */
    setDoorsOpen(open: boolean) {
        this._doorsOpen = open;
        this._rebuild();
    }

    get doorsOpen() { return this._doorsOpen; }

    private _rebuild() {
        const ui = this.getComponent(UITransform) ?? this.addComponent(UITransform);
        const TW  = this.roomW + this.wallThickness * 2;
        const TH  = this.roomH + this.wallThickness * 2;
        ui.setContentSize(TW, TH);

        this._g = this.getComponent(Graphics) ?? this.addComponent(Graphics);
        this._g.clear();

        const hw = TW / 2, hh = TH / 2;
        const wt = this.wallThickness;
        const g  = this._g;

        // 四面墙（横墙中间预留门洞，不在这里画满）
        this._drawWallSection(g, -hw,      -hh,      wt,           TH);           // 左
        this._drawWallSection(g,  hw - wt, -hh,      wt,           TH);           // 右
        this._drawWallWithDoorGap(g, -hw + wt, -hh,      this.roomW, wt, false);  // 下
        this._drawWallWithDoorGap(g, -hw + wt,  hh - wt, this.roomW, wt, true);   // 上

        // 四角
        g.fillColor = new Color(12, 8, 20, 255);
        [[-hw, -hh], [hw - wt, -hh], [-hw, hh - wt], [hw - wt, hh - wt]]
            .forEach(([cx, cy]) => { g.rect(cx as number, cy as number, wt, wt); g.fill(); });

        // 门状态
        this._drawDoors(g, hw, hh, wt);
    }

    /** 横墙：左右两段，中间留门洞 */
    private _drawWallWithDoorGap(
        g: Graphics, x: number, y: number, w: number, h: number, _isTop: boolean
    ) {
        const dw = this.doorWidth;
        const leftW  = (w - dw) / 2;
        const rightX = x + leftW + dw;
        this._drawWallSection(g, x, y, leftW, h);
        this._drawWallSection(g, rightX, y, leftW, h);
    }

    private _drawDoors(g: Graphics, hw: number, hh: number, wt: number) {
        const dw = this.doorWidth;
        const positions: Array<{ x: number; y: number }> = [
            { x: -dw / 2, y: -hh },      // 南门
            { x: -dw / 2, y:  hh - wt }, // 北门
        ];

        for (const p of positions) {
            if (this._doorsOpen) {
                // 开着的门：深色门洞 + 金色描边
                g.fillColor = new Color(8, 5, 16, 255);
                g.rect(p.x, p.y, dw, wt);
                g.fill();

                g.strokeColor = new Color(255, 200, 60, 220);
                g.lineWidth = 3;
                g.rect(p.x + 2, p.y + 2, dw - 4, wt - 4);
                g.stroke();

                // 两侧门柱高光
                g.fillColor = new Color(255, 210, 80, 180);
                g.rect(p.x, p.y, 4, wt);
                g.fill();
                g.rect(p.x + dw - 4, p.y, 4, wt);
                g.fill();
            } else {
                // 封死的门：铁栅栏
                g.fillColor = new Color(28, 18, 40, 255);
                g.rect(p.x, p.y, dw, wt);
                g.fill();

                // 横栏
                g.fillColor = new Color(90, 70, 110, 255);
                for (let i = 0; i < 3; i++) {
                    const by = p.y + 8 + i * 14;
                    g.rect(p.x + 4, by, dw - 8, 4);
                    g.fill();
                }
                // 竖栏
                g.fillColor = new Color(70, 55, 90, 255);
                for (let i = 0; i < 4; i++) {
                    const bx = p.x + 12 + i * 16;
                    g.rect(bx, p.y + 4, 4, wt - 8);
                    g.fill();
                }

                // 锁标记
                g.fillColor = new Color(200, 160, 40, 255);
                g.circle(0, p.y + wt / 2, 6);
                g.fill();
            }
        }
    }

    private _drawWallSection(g: Graphics, x: number, y: number, w: number, h: number) {
        if (w <= 0 || h <= 0) return;

        g.fillColor = new Color(22, 14, 35, 255);
        g.rect(x, y, w, h);
        g.fill();

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

                g.fillColor = new Color(48, 32, 68, 255);
                g.rect(bx + 1, by + 1, bw, bh);
                g.fill();

                g.fillColor = new Color(70, 50, 95, 200);
                g.rect(bx + 1, by + bh - 3, bw, 2);
                g.fill();
            }
        }
    }
}
