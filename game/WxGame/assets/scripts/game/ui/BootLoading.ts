import { Node, Label, Color, UITransform, Graphics, Layers, BlockInputEvents, tween } from 'cc';
import { ConfigRemote } from '../../core/ConfigRemote';
import { ConfigStore } from '../../core/ConfigStore';
import { GameManager } from '../../core/GameManager';
import { ThemeRuntime } from '../dungeon/MapThemes';

/**
 * BootLoading —— 冷启动短加载（J1）
 * 读档 + 内置配置包就绪后再进大厅。配置校验失败可重试。
 * 远程包可选（PACK_URL + LOCK_REMOTE）；失败 / unchanged 不阻断进大厅。
 */
export class BootLoading {
    private static _done = false;
    private static _running = false;
    private static _waiters: Array<() => void> = [];

    static get isDone() { return BootLoading._done; }

    /** 加载结束后回调；已完成则立刻调用 */
    static whenReady(canvas: Node, onReady: () => void) {
        if (BootLoading._done) {
            onReady();
            return;
        }
        BootLoading._waiters.push(onReady);
        if (BootLoading._running) return;
        BootLoading._running = true;
        BootLoading._play(canvas);
    }

    private static _finish() {
        BootLoading._done = true;
        BootLoading._running = false;
        const list = BootLoading._waiters.splice(0);
        for (const fn of list) {
            try { fn(); } catch (e) { console.error('[BootLoading] waiter', e); }
        }
    }

    private static _play(canvas: Node) {
        const old = canvas.getChildByName('BootLoading');
        if (old?.isValid) old.destroy();

        const root = new Node('BootLoading');
        root.layer = Layers.Enum.UI_2D;
        root.setParent(canvas);
        root.setPosition(0, 0, 0);
        root.setSiblingIndex(canvas.children.length - 1);
        root.addComponent(UITransform).setContentSize(1334, 750);
        root.addComponent(BlockInputEvents);

        const bg = root.addComponent(Graphics);
        bg.fillColor = new Color(8, 6, 16, 255);
        bg.rect(-667, -375, 1334, 750);
        bg.fill();

        const title = BootLoading._lbl(root, '像素地牢', 0, 40, 36, new Color(255, 228, 140, 255));
        const tip = BootLoading._lbl(root, '正在准备…', 0, -20, 18, new Color(180, 190, 210, 255));

        const bar = new Node('Bar');
        bar.layer = Layers.Enum.UI_2D;
        bar.setParent(root);
        bar.setPosition(0, -70, 0);
        bar.addComponent(UITransform).setContentSize(420, 16);
        const barG = bar.addComponent(Graphics);
        const drawBar = (ratio: number) => {
            barG.clear();
            barG.fillColor = new Color(30, 24, 48, 255);
            barG.roundRect(-210, -8, 420, 16, 6);
            barG.fill();
            const w = Math.max(8, 412 * Math.max(0, Math.min(1, ratio)));
            barG.fillColor = new Color(90, 160, 255, 255);
            barG.roundRect(-206, -6, w, 12, 5);
            barG.fill();
        };
        drawBar(0.05);

        const steps: Array<{ text: string; run: () => void | Promise<void> }> = [
            { text: '读取存档', run: () => { void GameManager.instance?.save; } },
            { text: '载入配置包', run: () => { ConfigStore.loadBuiltin(); } },
            {
                text: ConfigRemote.enabled ? '检查远程配置' : (ConfigRemote.LOCK_REMOTE ? '配置已锁定内置包' : '跳过远程配置'),
                run: async () => {
                    const r = await ConfigRemote.tryFetchAndApply();
                    if (r === 'applied') {
                        tip.string = `远程配置 v${ConfigStore.version}`;
                    } else if (r === 'unchanged') {
                        tip.string = `配置已是最新 v${ConfigStore.version}`;
                    } else if (r === 'failed') {
                        tip.string = '远程配置不可用，已用内置包';
                    }
                },
            },
            { text: '载入地图主题', run: () => {
                if (ThemeRuntime.allThemes().length < 1) throw new Error('主题表为空');
            } },
            { text: '进入大厅', run: () => { /* 回调里再弹 Lobby */ } },
        ];

        let i = 0;
        const fail = (msg: string) => {
            tip.string = `${msg}  ·  点击重试`;
            const btn = new Node('Retry');
            btn.layer = Layers.Enum.UI_2D;
            btn.setParent(root);
            btn.setPosition(0, -130, 0);
            btn.addComponent(UITransform).setContentSize(200, 48);
            const g = btn.addComponent(Graphics);
            g.fillColor = new Color(50, 110, 200, 255);
            g.roundRect(-100, -24, 200, 48, 10);
            g.fill();
            BootLoading._lbl(btn, '重试', 0, 0, 22, new Color(255, 255, 255, 255));
            btn.on(Node.EventType.TOUCH_END, () => {
                if (root.isValid) root.destroy();
                BootLoading._running = true;
                BootLoading._play(canvas);
            });
        };

        const next = () => {
            if (!root.isValid) return;
            if (i >= steps.length) {
                drawBar(1);
                tween(root)
                    .delay(0.12)
                    .call(() => {
                        if (root.isValid) root.destroy();
                        BootLoading._finish();
                    })
                    .start();
                return;
            }
            const step = steps[i];
            tip.string = step.text;
            drawBar((i + 1) / steps.length);
            void Promise.resolve()
                .then(() => step.run())
                .then(() => {
                    if (!root.isValid) return;
                    i++;
                    setTimeout(next, 160);
                })
                .catch((e) => {
                    console.error('[BootLoading]', e);
                    fail('初始化失败');
                });
        };
        setTimeout(next, 80);
        void title;
    }

    private static _lbl(p: Node, t: string, x: number, y: number, s: number, c: Color): Label {
        const n = new Node('L');
        n.layer = Layers.Enum.UI_2D;
        n.setParent(p);
        n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(480, s + 10);
        const l = n.addComponent(Label);
        l.string = t;
        l.fontSize = s;
        l.color = c;
        l.horizontalAlign = 1;
        return l;
    }
}
