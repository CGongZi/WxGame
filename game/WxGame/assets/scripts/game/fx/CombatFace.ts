import { Component, Node } from 'cc';

/**
 * CombatFace —— 根节点左右朝向（#148）
 *
 * 约定：美术默认朝右（scale.x > 0）；dx < 0 时翻成负 scale.x。
 * 只动根节点 X 符号，不改 Y/Z，不碰 Body 上的 IdleBreath / EnemyMotion 挤压。
 * 受击弹一下也必须经 pulse()，禁止裸写 setScale(1.15,1.15,1) —— 会把朝向抹成朝右。
 */
export class CombatFace {
    /** 按水平位移/瞄准方向翻转；|dx| 太小不动，避免原地抖动 */
    static face(node: Node | null | undefined, dx: number) {
        if (!node?.isValid) return;
        if (Math.abs(dx) < 0.4) return;
        const s = node.scale;
        const ax = Math.abs(s.x) || 1;
        const want = dx < 0 ? -ax : ax;
        if (s.x === want) return;
        node.setScale(want, s.y, s.z);
    }

    /** 受击弹一下，保留朝向；结束后回到 |scale|=1（怪/玩家根节点常态） */
    static pulse(host: Component, node: Node | null | undefined, mul = 1.15, sec = 0.12) {
        if (!host?.isValid || !node?.isValid) return;
        const sign = node.scale.x < 0 ? -1 : 1;
        node.setScale(sign * mul, mul, 1);
        host.scheduleOnce(() => {
            if (!node.isValid) return;
            const s = node.scale.x < 0 ? -1 : 1;
            node.setScale(s, 1, 1);
        }, sec);
    }

    /** 当前朝向符号：-1 左 / +1 右 */
    static sign(node: Node | null | undefined): number {
        if (!node?.isValid) return 1;
        return node.scale.x < 0 ? -1 : 1;
    }
}
