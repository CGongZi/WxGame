import { _decorator, Component, Graphics, UITransform, Color } from 'cc';

const { ccclass } = _decorator;

/** 墙上火把：纯视觉闪烁光晕 */
@ccclass('Torch')
export class Torch extends Component {
    private _g: Graphics | null = null;
    private _t = Math.random() * 10;
    private _acc = 0;

    init() {
        this.node.addComponent(UITransform).setContentSize(60, 60);
        this._g = this.node.addComponent(Graphics);
        this._paint();
    }

    update(dt: number) {
        this._t += dt;
        this._acc += dt;
        if (this._acc < 0.08) return;
        this._acc = 0;
        this._paint();
    }

    private _paint() {
        const g = this._g;
        if (!g) return;
        g.clear();
        const f = 0.8 + Math.sin(this._t * 9) * 0.12 + Math.sin(this._t * 23) * 0.08;
        g.fillColor = new Color(255, 150, 60, Math.floor(28 * f));
        g.circle(0, -6, 30 * f); g.fill();
        g.fillColor = new Color(70, 50, 30, 255);
        g.rect(-2, -22, 4, 16); g.fill();
        g.fillColor = new Color(255, 120, 40, 255);
        g.ellipse(0, -2, 6 * f, 9 * f); g.fill();
        g.fillColor = new Color(255, 220, 120, 255);
        g.ellipse(0, -4, 3 * f, 5 * f); g.fill();
    }
}
