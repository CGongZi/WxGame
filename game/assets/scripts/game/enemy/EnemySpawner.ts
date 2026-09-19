import { _decorator, Component, Node, Sprite, SpriteFrame, UITransform,
         Color, find, resources } from 'cc';
import { SlimeEnemy } from './SlimeEnemy';

const { ccclass, property } = _decorator;

/**
 * EnemySpawner
 * 挂到 Canvas 下任意节点（推荐新建 EnemyLayer 节点）
 * 自动生成多只史莱姆，无需手动在编辑器里创建敌人节点
 */
@ccclass('EnemySpawner')
export class EnemySpawner extends Component {

    @property({ min: 1, step: 1, tooltip: '生成史莱姆数量' })
    slimeCount: number = 5;

    @property({ min: 20 })
    slimeSize: number = 64;   // 像素，64x64 足够清晰

    @property(Node)
    playerNode: Node = null!;

    /** 生成配置：[x, y, hp, speed] */
    private readonly SPAWN_POINTS: [number, number, number, number][] = [
        [ 220,   0,  30,  70],
        [-220,  80,  25,  85],
        [ 100, 250,  40,  60],
        [-150,-200,  35,  75],
        [ 300,-120,  50,  65],
        [-280, 200,  30,  80],
        [ 180, 320,  45,  70],
    ];

    onLoad() {
        // 自动找玩家
        if (!this.playerNode) {
            this.playerNode = find('Game/Canvas/Player') as Node;
        }
        this._spawnAll();
    }

    private _spawnAll() {
        const count = Math.min(this.slimeCount, this.SPAWN_POINTS.length);
        for (let i = 0; i < count; i++) {
            const [x, y, hp, spd] = this.SPAWN_POINTS[i];
            this._createSlime(x, y, hp, spd, i);
        }
        console.log(`[Spawner] 生成了 ${count} 只史莱姆`);
    }

    private _createSlime(x: number, y: number, hp: number, speed: number, idx: number) {
        const node = new Node(`Slime_${idx}`);
        node.setParent(this.node);
        node.setPosition(x, y, 0);

        // ── UITransform（尺寸）────────────────────────
        const ui = node.addComponent(UITransform);
        ui.setContentSize(this.slimeSize, this.slimeSize);

        // ── Sprite（颜色方块，不需要图片）──────────────
        const sp = node.addComponent(Sprite);
        // 用引擎内置的白色 1x1 SpriteFrame，然后着色
        // 不同 idx 用不同深浅绿色，视觉上可区分
        const g = 160 + idx * 12;
        sp.color = new Color(40, g > 255 ? 255 : g, 60, 255);

        // ── SlimeEnemy 组件 ───────────────────────────
        const slime = node.addComponent(SlimeEnemy);
        slime.hp           = hp;
        slime.speed        = speed;
        slime.damage       = 8;
        slime.attackRange  = 55;
        slime.detectionRange = 500;
        slime.playerNode   = this.playerNode;

        return node;
    }
}
