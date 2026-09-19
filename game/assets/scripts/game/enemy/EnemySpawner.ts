import { _decorator, Component, Node, Graphics, UITransform,
         Color, find } from 'cc';
import { SlimeEnemy } from './SlimeEnemy';

const { ccclass, property } = _decorator;

/**
 * EnemySpawner
 * 挂到 Canvas 下的 EnemyLayer 节点
 * 用 Graphics 画出有颜色的史莱姆方块（不需要图片）
 */
@ccclass('EnemySpawner')
export class EnemySpawner extends Component {

    @property({ min: 1, step: 1 })
    slimeCount: number = 5;

    @property({ min: 20 })
    slimeSize: number = 64;

    @property(Node)
    playerNode: Node = null!;

    /** [x, y, hp, speed, colorR, colorG]  — 横屏坐标，X范围±480，Y范围±220 */
    private readonly SPAWNS: [number, number, number, number, number, number][] = [
        [ 300,   80,  30,  70, 60, 200],
        [-280,  100,  25,  85, 30, 220],
        [ 150, -160,  40,  60, 80, 180],
        [-400,  -80,  35,  75, 50, 210],
        [ 420, -140,  50,  65, 40, 190],
        [-180,  180,  30,  80, 70, 200],
        [ 350,  190,  45,  70, 55, 215],
    ];

    onLoad() {
        // 强制父节点居中
        this.node.setPosition(0, 0, 0);
        console.log('[EnemyLayer] worldPos =', this.node.worldPosition);

        if (!this.playerNode) {
            this.playerNode = find('Game/Canvas/Player') as Node;
            if (!this.playerNode) {
                // 再往上一层找
                this.playerNode = find('Canvas/Player') as Node;
            }
        }
        console.log('[Spawner] playerNode:', this.playerNode?.name ?? 'NOT FOUND');
        this._spawnAll();
    }

    private _spawnAll() {
        const count = Math.min(this.slimeCount, this.SPAWNS.length);
        for (let i = 0; i < count; i++) {
            const [x, y, hp, spd, cr, cg] = this.SPAWNS[i];
            this._createSlime(x, y, hp, spd, new Color(cr, cg, 60, 255), i);
        }
        console.log(`[Spawner] 生成了 ${count} 只史莱姆`);
    }

    private _createSlime(
        x: number, y: number,
        hp: number, speed: number,
        color: Color, idx: number
    ) {
        const node = new Node(`Slime_${idx}`);
        node.setParent(this.node);
        node.setPosition(x, y, 0);

        // ── UITransform（尺寸）─────────────────────────────
        const ui = node.addComponent(UITransform);
        ui.setContentSize(this.slimeSize, this.slimeSize);

        // ── Graphics 画实心圆角方块（不需要图片资源）────────
        const g = node.addComponent(Graphics);
        const s = this.slimeSize;
        const h = s / 2;
        const r = 8; // 圆角

        // 身体
        g.fillColor = color;
        g.roundRect(-h, -h, s, s, r);
        g.fill();

        // 高光（顶部亮条）
        g.fillColor = new Color(255, 255, 255, 60);
        g.roundRect(-h + 4, h - 10, s - 8, 6, 3);
        g.fill();

        // 眼睛（两个白点）
        g.fillColor = new Color(255, 255, 255, 220);
        g.circle(-h / 2 + 4, 6, 6);
        g.fill();
        g.circle( h / 2 - 4, 6, 6);
        g.fill();

        // 瞳孔（黑点）
        g.fillColor = new Color(20, 20, 20, 255);
        g.circle(-h / 2 + 5, 5, 3);
        g.fill();
        g.circle( h / 2 - 3, 5, 3);
        g.fill();

        // ── SlimeEnemy 逻辑组件 ───────────────────────────
        const slime       = node.addComponent(SlimeEnemy);
        slime.hp          = hp;
        slime.speed       = speed;
        slime.damage      = 8;
        slime.attackRange = 55;
        slime.detectionRange = 500;
        slime.playerNode  = this.playerNode;

        return node;
    }
}
