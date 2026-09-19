import { _decorator, Component, Node, UITransform, Color, Sprite, SpriteFrame,
         Texture2D, PixelFormat, RenderTexture, gfx, Vec2, Vec3 } from 'cc';
const { ccclass, executeInEditMode } = _decorator;

/**
 * 摇杆自动创建工具
 * 挂载到任意节点上，在编辑器里点 Setup 按钮即可自动生成摇杆节点
 * 创建完成后可以删除这个组件
 */
@ccclass('JoystickSetup')
@executeInEditMode
export class JoystickSetup extends Component {

    /** 创建一个纯色圆形精灵节点 */
    private _createCircleNode(name: string, size: number, color: Color, parent: Node): Node {
        const node = new Node(name);
        node.setParent(parent);

        const tf = node.addComponent(UITransform);
        tf.setContentSize(size, size);

        const sp = node.addComponent(Sprite);
        sp.color = color;

        return node;
    }

    /** 在编辑器里调用这个方法来创建摇杆结构 */
    setupJoystick() {
        // 找到或创建 UILayer
        let uiLayer = this.node.scene.getChildByName('Game')
            ?.getChildByName('Canvas')
            ?.getChildByName('UILayer');

        if (!uiLayer) {
            const canvas = this.node.scene.getChildByName('Game')
                ?.getChildByName('Canvas');
            if (!canvas) {
                console.error('找不到 Canvas 节点！');
                return;
            }
            uiLayer = new Node('UILayer');
            uiLayer.setParent(canvas);
            const tf = uiLayer.addComponent(UITransform);
            tf.setContentSize(750, 1334);
        }

        // 创建 Joystick 根节点
        const joystick = new Node('Joystick');
        joystick.setParent(uiLayer);

        // 摇杆底盘（半透明灰色圆）
        const bg = this._createCircleNode('JoystickBg', 160,
            new Color(128, 128, 128, 80), joystick);
        bg.setPosition(-260, -500, 0); // 左下角

        // 摇杆拇指（白色小圆）
        const thumb = this._createCircleNode('JoystickThumb', 80,
            new Color(255, 255, 255, 180), bg);
        thumb.setPosition(0, 0, 0);

        console.log('✅ 摇杆节点创建完成！');
        console.log('请把 JoystickController 脚本挂到 Joystick 节点上');
    }
}
