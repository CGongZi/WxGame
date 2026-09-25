import {
    Node, Label, Color, UITransform, Graphics, BlockInputEvents, Layers, tween, Vec3, Mask, ScrollView,
    EventTouch,
} from 'cc';
import { AudioManager } from '../../core/AudioManager';

/**
 * 大厅 Overlay 共用扁平皮肤：单填色 + 细描边，无立体金边/高光。
 * 不改业务逻辑，只统一「简约大气、点起来舒服」。
 *
 * 安全框：大厅 ViewZoom.LOBBY_ORTHO=235 → 可视约 ±418×±235。
 * 弹窗宽高请用 OverlaySafe / fitPanelSize，避免超出游戏框。
 */
export const OverlaySafe = {
    /** 弹窗最大宽（LOBBY_ORTHO=235 → 半宽≈418，两侧各留边） */
    maxW: 720,
    /** 弹窗最大高（半高 235，上下各留边，返回钮不裁切） */
    maxH: 400,
} as const;

export function fitPanelSize(w: number, h: number): { w: number; h: number } {
    return {
        w: Math.min(Math.max(280, w), OverlaySafe.maxW),
        h: Math.min(Math.max(220, h), OverlaySafe.maxH),
    };
}

/**
 * 面板内标题 / 返回 Y（相对面板中心）。
 * 按 fit 后高度算，避免仍用 430 时代坐标把返回钮裁出 OverlaySafe。
 */
export function overlayChromeY(panelH: number): { titleY: number; backY: number } {
    const hh = Math.max(220, panelH) * 0.5;
    return {
        /** 顶边留空（含标题字高），避免贴死面板上沿 */
        titleY: hh - 40,
        /** 按钮高≤46 时底边仍在 −hh+6 内 */
        backY: -(hh - 28),
    };
}

export const UiTone = {
    dim: new Color(6, 5, 8, 218),
    panel: new Color(28, 22, 18, 250),
    panelDeep: new Color(22, 17, 14, 255),
    inset: new Color(36, 28, 22, 255),
    stroke: new Color(160, 130, 95, 160),
    strokeSoft: new Color(110, 90, 70, 100),
    shine: new Color(255, 220, 150, 0), // 保留字段，扁平风不再画高光
    title: new Color(240, 225, 200, 255),
    body: new Color(210, 195, 175, 255),
    muted: new Color(150, 138, 122, 255),
    accent: new Color(220, 180, 110, 255),
    row: new Color(40, 32, 26, 255),
    rowAlt: new Color(46, 36, 28, 255),
    rowSel: new Color(62, 48, 34, 255),
    rowStroke: new Color(140, 115, 85, 140),
    btn: new Color(58, 46, 34, 255),
    btnHover: new Color(72, 58, 42, 255),
    btnGood: new Color(42, 88, 58, 255),
    btnDanger: new Color(100, 48, 42, 255),
    btnGhost: new Color(42, 36, 30, 255),
    ok: new Color(140, 230, 160, 255),
    warn: new Color(255, 170, 120, 255),
};

export type UiAccent = 'amber' | 'sky' | 'violet';

const ACCENT: Record<UiAccent, { stroke: Color; title: Color }> = {
    amber: { stroke: UiTone.stroke, title: UiTone.title },
    sky: {
        stroke: new Color(120, 160, 200, 160),
        title: new Color(200, 220, 240, 255),
    },
    violet: {
        stroke: new Color(150, 130, 190, 160),
        title: new Color(220, 205, 240, 255),
    },
};

/** 全屏遮罩根：BlockInput + 暗底（按安全框铺开，不靠设计稿 1334 边缘） */
export function mountOverlay(name: string, canvas: Node, sibling = 10002): Node {
    const root = new Node(name);
    root.layer = Layers.Enum.UI_2D;
    root.setParent(canvas);
    root.setPosition(0, 0, 0);
    root.setSiblingIndex(sibling);
    // 略大于可视区即可挡住点击；过大无意义且易误导布局
    const dw = 980;
    const dh = 560;
    root.addComponent(UITransform).setContentSize(dw, dh);
    root.addComponent(BlockInputEvents);
    const bg = root.addComponent(Graphics);
    bg.fillColor = UiTone.dim;
    bg.rect(-dw / 2, -dh / 2, dw, dh);
    bg.fill();
    bg.fillColor = new Color(0, 0, 0, 40);
    bg.rect(-dw / 2, dh / 2 - 70, dw, 70); bg.fill();
    bg.rect(-dw / 2, -dh / 2, dw, 70); bg.fill();
    return root;
}

/** 扁平面板：单填色 + 一条细描边（无阴影/内凹/高光） */
export function paintWarmPanel(
    g: Graphics,
    w: number,
    h: number,
    radius = 14,
    accent: UiAccent = 'amber',
) {
    const hw = w / 2;
    const hh = h / 2;
    const stroke = ACCENT[accent].stroke;

    g.clear();
    g.fillColor = UiTone.panel;
    g.roundRect(-hw, -hh, w, h, radius); g.fill();
    g.strokeColor = stroke;
    g.lineWidth = 1.4;
    g.roundRect(-hw, -hh, w, h, radius); g.stroke();
}

/** 标题色（按强调色） */
export function titleColor(accent: UiAccent = 'amber'): Color {
    return ACCENT[accent].title;
}

export function makePanel(
    parent: Node,
    name: string,
    w: number,
    h: number,
    y = 0,
    accent: UiAccent = 'amber',
): Node {
    const fit = fitPanelSize(w, h);
    const panel = new Node(name);
    panel.layer = Layers.Enum.UI_2D;
    panel.setParent(parent);
    panel.setPosition(0, y, 0);
    panel.addComponent(UITransform).setContentSize(fit.w, fit.h);
    const g = panel.addComponent(Graphics);
    paintWarmPanel(g, fit.w, fit.h, 14, accent);
    // 入场轻弹
    panel.setScale(0.94, 0.94, 1);
    tween(panel).to(0.18, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
    return panel;
}

/**
 * ScrollView 视口 Mask：用 RECT 按 UITransform 裁切，避免 GRAPHICS_RECT 未画导致列表画出边框。
 */
export function applyScrollMask(view: Node): Mask {
    const ui = view.getComponent(UITransform) ?? view.addComponent(UITransform);
    const mask = view.getComponent(Mask) ?? view.addComponent(Mask);
    mask.type = Mask.Type.GRAPHICS_RECT;
    // 强制刷新一次尺寸，保证首帧即裁切
    const sz = ui.contentSize;
    ui.setContentSize(sz.width, sz.height);
    return mask;
}

export type ScrollAreaOpts = {
    w: number;
    h: number;
    /** 默认纵向 */
    horizontal?: boolean;
    vertical?: boolean;
    /** content 锚点：纵向列表常用 (0.5,1) */
    contentAnchor?: { x: number; y: number };
};

export type ScrollArea = {
    host: Node;
    scroll: ScrollView;
    view: Node;
    content: Node;
    contentUI: UITransform;
};

/**
 * 标准可滚动区：host → view(Mask) → content。
 * Cocos 3 的 ScrollView.view 只有 getter，不能赋值；须先建好名为 `view` 的子节点再挂 ScrollView，
 * 引擎会自动认 view，再设 content。
 */
export function mountScrollArea(host: Node, opts: ScrollAreaOpts): ScrollArea {
    const w = opts.w;
    const h = opts.h;
    const horizontal = !!opts.horizontal;
    const vertical = opts.vertical !== false && !horizontal
        ? true
        : !!opts.vertical;

    let ui = host.getComponent(UITransform);
    if (!ui) ui = host.addComponent(UITransform);
    ui.setContentSize(w, h);

    // 先搭 view/content，再挂 ScrollView（否则 onLoad 时找不到 view）
    let view = host.getChildByName('view');
    if (!view) {
        view = new Node('view');
        view.layer = Layers.Enum.UI_2D;
        view.setParent(host);
    }
    view.setPosition(0, 0, 0);
    const viewUI = view.getComponent(UITransform) ?? view.addComponent(UITransform);
    viewUI.setContentSize(w, h);
    applyScrollMask(view);

    let content = view.getChildByName('content');
    if (!content) {
        content = new Node('content');
        content.layer = Layers.Enum.UI_2D;
        content.setParent(view);
    }
    const contentUI = content.getComponent(UITransform) ?? content.addComponent(UITransform);
    const ax = opts.contentAnchor?.x ?? 0.5;
    const ay = opts.contentAnchor?.y ?? (vertical ? 1 : 0.5);
    contentUI.setAnchorPoint(ax, ay);
    contentUI.setContentSize(w, h);
    if (vertical && ay >= 0.99) content.setPosition(0, h / 2, 0);
    else content.setPosition(0, 0, 0);

    // 若已有 ScrollView，先去掉再挂，确保重新 _init 绑定 view
    const old = host.getComponent(ScrollView);
    if (old) old.destroy();
    const scroll = host.addComponent(ScrollView);
    scroll.horizontal = horizontal;
    scroll.vertical = vertical;
    scroll.inertia = true;
    scroll.brake = 0.42;
    scroll.elastic = true;
    scroll.bounceDuration = 0.18;
    scroll.cancelInnerEvents = true;
    scroll.content = content;

    return { host, scroll, view, content, contentUI };
}

export function makeLabel(
    parent: Node,
    text: string,
    x: number,
    y: number,
    size: number,
    color: Color,
    width = 560,
    align: 0 | 1 | 2 = 1,
): Node {
    const n = new Node('L');
    n.layer = Layers.Enum.UI_2D;
    n.setParent(parent);
    n.setPosition(x, y, 0);
    n.addComponent(UITransform).setContentSize(width, size + 14);
    const l = n.addComponent(Label);
    l.string = text;
    l.fontSize = size;
    l.color = color;
    l.horizontalAlign = align;
    l.overflow = Label.Overflow.CLAMP;
    return n;
}

/** 副标题细条（扁平，无描边框） */
export function makeSubtitleBar(
    parent: Node,
    text: string,
    y: number,
    width = 640,
): { bar: Node; label: Label } {
    const bar = new Node('SubBar');
    bar.layer = Layers.Enum.UI_2D;
    bar.setParent(parent);
    bar.setPosition(0, y, 0);
    bar.addComponent(UITransform).setContentSize(width, 28);
    const g = bar.addComponent(Graphics);
    g.fillColor = new Color(18, 14, 12, 160);
    g.roundRect(-width / 2, -14, width, 28, 6); g.fill();
    const ln = makeLabel(bar, text, 0, 0, 12, UiTone.muted, width - 24);
    return { bar, label: ln.getComponent(Label)! };
}

export function paintRowCard(
    g: Graphics,
    w: number,
    h: number,
    selected = false,
    alt = false,
) {
    g.clear();
    g.fillColor = selected ? UiTone.rowSel : (alt ? UiTone.rowAlt : UiTone.row);
    g.roundRect(-w / 2, -h / 2, w, h, 10); g.fill();
    g.strokeColor = selected
        ? new Color(200, 165, 100, 180)
        : UiTone.rowStroke;
    g.lineWidth = selected ? 1.6 : 1.1;
    g.roundRect(-w / 2, -h / 2, w, h, 10); g.stroke();
}

export interface UiBtnOpts {
    w?: number;
    h?: number;
    color?: Color;
    fontSize?: number;
    ghost?: boolean;
}

export function makeButton(
    parent: Node,
    text: string,
    x: number,
    y: number,
    onTap: () => void,
    opts: UiBtnOpts = {},
): Node {
    const w = opts.w ?? 160;
    const h = opts.h ?? 44;
    const color = opts.color ?? UiTone.btn;
    const n = new Node('Btn');
    n.layer = Layers.Enum.UI_2D;
    n.setParent(parent);
    n.setPosition(x, y, 0);
    n.addComponent(UITransform).setContentSize(w, h);
    const g = n.addComponent(Graphics);
    paintButtonFace(g, w, h, color, !!opts.ghost);
    makeLabel(n, text, 0, 0, opts.fontSize ?? 16, new Color(255, 248, 230, 255), w - 12);
    bindPress(n, () => {
        AudioManager.playUi();
        onTap();
    });
    return n;
}

function paintButtonFace(g: Graphics, w: number, h: number, color: Color, ghost: boolean) {
    g.clear();
    const hw = w / 2;
    const hh = h / 2;
    if (ghost) {
        g.fillColor = UiTone.btnGhost;
        g.roundRect(-hw, -hh, w, h, 8); g.fill();
        g.strokeColor = UiTone.strokeSoft;
        g.lineWidth = 1.2;
        g.roundRect(-hw, -hh, w, h, 8); g.stroke();
        return;
    }
    g.fillColor = color;
    g.roundRect(-hw, -hh, w, h, 8); g.fill();
    g.strokeColor = new Color(170, 140, 100, 100);
    g.lineWidth = 1.2;
    g.roundRect(-hw, -hh, w, h, 8); g.stroke();
}

/** 按压缩放 + 仅 TOUCH_END（防桌面双击）；截断冒泡，避免点穿到下层大厅钮 */
export function bindPress(node: Node, onTap: () => void) {
    const base = new Vec3(1, 1, 1);
    node.on(Node.EventType.TOUCH_START, (ev: EventTouch) => {
        ev.propagationStopped = true;
        tween(node).stop();
        tween(node).to(0.06, { scale: new Vec3(0.95, 0.95, 1) }).start();
    });
    const restore = () => {
        tween(node).stop();
        tween(node).to(0.1, { scale: base }, { easing: 'quadOut' }).start();
    };
    node.on(Node.EventType.TOUCH_CANCEL, restore);
    node.on(Node.EventType.TOUCH_END, (ev: EventTouch) => {
        ev.propagationStopped = true;
        restore();
        onTap();
    });
}

/** 宫格/芯片底板（扁平） */
export function paintChip(
    g: Graphics,
    w: number,
    h: number,
    selected: boolean,
    locked = false,
) {
    g.clear();
    if (locked) {
        g.fillColor = new Color(30, 26, 24, 255);
        g.roundRect(-w / 2, -h / 2, w, h, 10); g.fill();
        g.strokeColor = new Color(70, 62, 55, 120);
        g.lineWidth = 1.1;
        g.roundRect(-w / 2, -h / 2, w, h, 10); g.stroke();
        return;
    }
    g.fillColor = selected ? UiTone.rowSel : new Color(44, 36, 28, 255);
    g.roundRect(-w / 2, -h / 2, w, h, 10); g.fill();
    g.strokeColor = selected
        ? new Color(200, 165, 100, 200)
        : new Color(120, 100, 75, 120);
    g.lineWidth = selected ? 1.6 : 1.1;
    g.roundRect(-w / 2, -h / 2, w, h, 10); g.stroke();
}

/** 关闭用：先藏再拆，防点穿 */
export function softClose(root: Node | null, done?: () => void) {
    if (!root?.isValid) {
        done?.();
        return;
    }
    root.active = false;
    const n = root;
    setTimeout(() => {
        if (n.isValid) n.destroy();
        done?.();
    }, 40);
}
