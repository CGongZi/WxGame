import { _decorator, Component, Graphics, Color, UITransform, Camera, Widget, Canvas, view } from 'cc';

const { ccclass, property } = _decorator;

/**
 * FloorRenderer —— 纯代码画出像素风地板
 * 同时负责把 Canvas/Camera 视口锁死，防止 AlignCanvasWithScreen 把画面打飞
 */
@ccclass('FloorRenderer')
export class FloorRenderer extends Component {

    @property({ min: 4  }) tileSize:  number = 48;
    @property({ min: 2  }) cols:      number = 26;
    @property({ min: 2  }) rows:      number = 14;

    private readonly C_DARK   = new Color( 38,  28,  52, 255);
    private readonly C_LIGHT  = new Color( 52,  40,  68, 255);
    private readonly C_EDGE   = new Color( 25,  18,  36, 255);
    private readonly C_SHINE  = new Color(255, 255, 255,  12);

    private _cam: Camera | null = null;
    private _canvas: Canvas | null = null;
    private _locked = false;

    onLoad() {
        this.node.setPosition(0, 0, 0);
        this._lockViewport('onLoad');

        // AlignCanvasWithScreen 会在首帧之后才改 Camera，延迟再锁一次
        this.scheduleOnce(() => this._lockViewport('delay0.05'), 0.05);
        this.scheduleOnce(() => this._lockViewport('delay0.2'), 0.2);
        this.scheduleOnce(() => this._lockViewport('delay0.5'), 0.5);

        const ui = this.getComponent(UITransform) ?? this.addComponent(UITransform);
        const W  = this.cols * this.tileSize;
        const H  = this.rows * this.tileSize;
        ui.setContentSize(W, H);

        const g = this.getComponent(Graphics) ?? this.addComponent(Graphics);
        this._draw(g, W, H);
    }

    /** 每帧末尾再锁一次，彻底压住引擎的自动对齐 */
    lateUpdate() {
        if (!this._locked) return;
        this._applyCameraLock();
    }

    private _lockViewport(tag: string) {
        const canvasNode = this.node.parent;
        if (!canvasNode) return;

        // 1) 关掉 Widget
        const widget = canvasNode.getComponent(Widget);
        if (widget) widget.enabled = false;

        // 2) 关掉 Align Canvas With Screen（这是“先居中再飞走”的元凶）
        this._canvas = canvasNode.getComponent(Canvas);
        if (this._canvas) {
            this._canvas.alignCanvasWithScreen = false;
        }

        // 3) 锁定 Camera
        const camNode = canvasNode.getChildByName('Camera');
        this._cam = camNode?.getComponent(Camera) ?? null;
        this._applyCameraLock();

        // 4) 确保 Floor 在 Canvas 本地原点
        this.node.setPosition(0, 0, 0);

        const cvWP = canvasNode.worldPosition;
        const camWP = camNode?.worldPosition;
        const oh = this._cam?.orthoHeight ?? -1;
        console.log(
            `[ViewportLock:${tag}] Canvas=(${cvWP.x.toFixed(0)},${cvWP.y.toFixed(0)})` +
            ` Cam=(${camWP?.x.toFixed(0)},${camWP?.y.toFixed(0)})` +
            ` orthoH=${oh.toFixed(1)}` +
            ` align=${this._canvas?.alignCanvasWithScreen}` +
            ` visible=${view.getVisibleSize().width.toFixed(0)}x${view.getVisibleSize().height.toFixed(0)}`
        );

        this._locked = true;
    }

    private _applyCameraLock() {
        if (!this._cam) return;

        // 设计分辨率高度一半；若预览窗口比例不同，按可见高度重新算，保证画面铺满
        const visH = view.getVisibleSize().height;
        const targetOH = Math.max(1, visH / 2);

        if (Math.abs(this._cam.orthoHeight - targetOH) > 0.5) {
            this._cam.orthoHeight = targetOH;
        }

        // Camera 必须跟 Canvas 中心对齐（Canvas 子节点本地 0,0）
        const camNode = this._cam.node;
        if (camNode.position.x !== 0 || camNode.position.y !== 0) {
            camNode.setPosition(0, 0, camNode.position.z);
        }

        if (this._canvas) {
            this._canvas.alignCanvasWithScreen = false;
        }
    }

    private _draw(g: Graphics, W: number, H: number) {
        const ox = -W / 2;
        const oy = -H / 2;
        const ts = this.tileSize;

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const x = ox + c * ts;
                const y = oy + r * ts;

                g.fillColor = this.C_EDGE;
                g.rect(x, y, ts, ts);
                g.fill();

                g.fillColor = (r + c) % 2 === 0 ? this.C_DARK : this.C_LIGHT;
                g.rect(x + 1, y + 1, ts - 2, ts - 2);
                g.fill();

                g.fillColor = this.C_SHINE;
                g.rect(x + 1, y + ts - 4, ts - 2, 3);
                g.fill();
            }
        }
    }
}
