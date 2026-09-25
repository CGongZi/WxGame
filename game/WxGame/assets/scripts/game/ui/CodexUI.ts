import { Node, Label, Color, UITransform, Graphics, Layers, find } from 'cc';
import { GameManager } from '../../core/GameManager';
import { ThemeRuntime, type ObstacleStyle } from '../dungeon/MapThemes';
import { DungeonLayout, TILE } from '../dungeon/DungeonLayout';
import { MAP_COLS, MAP_ROWS } from '../dungeon/MapConstants';
import { getWeapon } from '../weapon/WeaponController';
import { resolveMode, modeLabel, weaponTraitTags } from '../weapon/WeaponModes';
import { rarityLabel, rarityColor } from '../weapon/WeaponRarity';
import { ConfigStore } from '../../core/ConfigStore';
import { eventBus } from '../../core/EventBus';
import {
    mountOverlay, paintWarmPanel, UiTone, fitPanelSize, mountScrollArea,
    softClose, overlayChromeY, OverlaySafe,
} from './UiChrome';
import { mountThumbArt, type ThumbArtKind } from './UiPixelThumb';

const GALLERY_W = 390;
const DETAIL_W = 250;
const CELL = 68;
const CELL_GAP = 8;
const COLS = 4;
const PAD_TOP = 10;
const PAD_BOT = 12;

type CodexTab = 'weapons' | 'items' | 'maps' | 'enemies';

interface EnemyCodexDef {
    id: string;
    displayName: string;
    emoji: string;
    biome: string;
    behavior: string;
}

const ENEMY_CODEX: readonly EnemyCodexDef[] = [
    {
        id: 'slime',
        displayName: '史莱姆',
        emoji: '🟢',
        biome: '各主题常见',
        behavior: '近战追击，血厚迟缓',
    },
    {
        id: 'fast',
        displayName: '疾行者',
        emoji: '💨',
        biome: '沼泽偏多',
        behavior: '高速贴脸，血薄难缠',
    },
    {
        id: 'tank',
        displayName: '重装怪',
        emoji: '🛡️',
        biome: '洞穴偏多',
        behavior: '高血近战，攻距更远',
    },
    {
        id: 'archer',
        displayName: '弓箭手',
        emoji: '🏹',
        biome: '遗迹偏多',
        behavior: '保持距离射击',
    },
    {
        id: 'wisp',
        displayName: '幽魂',
        emoji: '👻',
        biome: '沼泽 / 洞穴飘荡',
        behavior: '飞掠贴脸，周期性落地可打',
    },
    {
        id: 'bat',
        displayName: '蝙蝠',
        emoji: '🦇',
        biome: '云海最多，洞穴偶见',
        behavior: '高速翼扑，落地窗口短',
    },
    {
        id: 'beetle',
        displayName: '甲虫',
        emoji: '🪲',
        biome: '洞穴 / 沼泽贴地',
        behavior: '中距蓄力后直线冲锋（有红线预警），撞墙会自晕——侧身躲开再打',
    },
    {
        id: 'toad',
        displayName: '毒蛙',
        emoji: '🐸',
        biome: '沼泽最多',
        behavior: '蹲身后扑向你起跳时的位置，落地一圈震伤——起跳后走开即可',
    },
    {
        id: 'crystal',
        displayName: '晶爬',
        emoji: '💎',
        biome: '冰原贴地',
        behavior: '棱角缓慢推移，壳硬带震击',
    },
    {
        id: 'golem',
        displayName: '石偶',
        emoji: '🗿',
        biome: '遗迹镇守',
        behavior: '沉重抬踏近战，血厚攻慢',
    },
    {
        id: 'moth',
        displayName: '飞蛾',
        emoji: '🦋',
        biome: '沼泽 / 云海',
        behavior: '宽翅慢飘，周期性落地可打',
    },
    {
        id: 'raven',
        displayName: '渡鸦',
        emoji: '🐦‍⬛',
        biome: '冰原 / 遗迹 / 虚空',
        behavior: '中速盘旋俯冲，落地窗口可打',
    },
    {
        id: 'mosquito',
        displayName: '蚊蚋',
        emoji: '🦟',
        biome: '沼泽 / 火山偶见',
        behavior: '高频扑咬，落地窗口极短',
    },
    {
        id: 'specter',
        displayName: '幽灵',
        emoji: '👻',
        biome: '亡灵墓园',
        behavior: '半透明盘旋，周期性落地可打',
    },
    {
        id: 'bone',
        displayName: '骨卫',
        emoji: '💀',
        biome: '亡灵墓园',
        behavior: '贴地追击，沉重抬踏近战',
    },
    {
        id: 'mage',
        displayName: '暗法师',
        emoji: '🔮',
        biome: '遗迹偏多',
        behavior: '远程慢速法球',
    },
    {
        id: 'dragon',
        displayName: '火龙',
        emoji: '🐉',
        biome: '洞穴 / 遗迹 / 云海（深层）',
        behavior: '盘旋喷火球，落地可打，火球留焰',
    },
    {
        id: 'spider',
        displayName: '蛛魔',
        emoji: '🕷️',
        biome: '洞穴 / 遗迹 / 墓园',
        behavior: '八腿贴地疾爬，近战撕咬',
    },
    {
        id: 'snake',
        displayName: '毒蛇',
        emoji: '🐍',
        biome: '沼泽最多，洞穴偶见',
        behavior: '蜿蜒高速贴脸，毒牙近战',
    },
    {
        id: 'imp',
        displayName: '小恶魔',
        emoji: '😈',
        biome: '火山 / 虚空（中深层）',
        behavior: '矮小跳扑近战，持三叉戟',
    },
    {
        id: 'shroom',
        displayName: '菇怪',
        emoji: '🍄',
        biome: '沼泽 / 洞穴 / 墓园',
        behavior: '粗柄慢挪，血厚近战',
    },
    {
        id: 'jelly',
        displayName: '水母',
        emoji: '🪼',
        biome: '冰原 / 云海 / 虚空',
        behavior: '触手飘飞，周期性落地可打',
    },
    {
        id: 'cog',
        displayName: '齿轮怪',
        emoji: '⚙️',
        biome: '齿轮秘库专属',
        behavior: '咬合齿轮滚压近战，壳硬难缠',
    },
    {
        id: 'spark',
        displayName: '电火花',
        emoji: '⚡',
        biome: '齿轮秘库专属',
        behavior: '高速飘飞贴脸，落地窗口短',
    },
    {
        id: 'puppet',
        displayName: '提线木偶',
        emoji: '🪆',
        biome: '齿轮秘库专属',
        behavior: '关节木偶近战扑击',
    },
    {
        id: 'drone',
        displayName: '浮空机甲',
        emoji: '🛸',
        biome: '齿轮秘库专属',
        behavior: '悬停保持距离射击',
    },
    {
        id: 'wolf',
        displayName: '灰狼',
        emoji: '🐺',
        biome: '洞穴 / 遗迹',
        behavior: '低伏高速贴脸撕咬',
    },
    {
        id: 'crab',
        displayName: '巨蟹',
        emoji: '🦀',
        biome: '沼泽 / 冰原',
        behavior: '横壳双螯，血厚近战',
    },
    {
        id: 'boss',
        displayName: '地牢首领',
        emoji: '👑',
        biome: '每层末房 / 终局',
        behavior: '多阶段强敌，主题色调',
    },
];

function terrainDesc(style: ObstacleStyle): string {
    switch (style) {
        case 'rock': return '岩石散落，昏暗石地';
        case 'pillar': return '石柱林立，冷灰遗迹地砖';
        case 'root': return '树根缠绕，毒雾湿地';
        case 'crystal': return '晶石突兀，寒光地面';
        case 'cloud': return '云团浮岛，高空风带';
        case 'gear': return '黄铜齿轮咬合，铆钉机油地面';
        default: return '未知地形';
    }
}

/**
 * CodexUI —— 局外图鉴（武器 | 地图 | 怪兽）
 * 布局对齐 TalentTree / SoulShop / SettingsPanel：全屏 BlockInput + 返回
 */
export class CodexUI {
    private static _open = false;
    private static _root: Node | null = null;
    private static _tab: CodexTab = 'weapons';
    private static _pickWeapon = '';
    private static _pickItem = '';
    private static _pickMap = '';
    private static _pickEnemy = '';
    /** 当前弹窗内宫格视口高（由 show 按 OverlaySafe 算） */
    private static _galleryH = 180;

    static reset() {
        CodexUI._open = false;
        CodexUI._tab = 'weapons';
        CodexUI._pickWeapon = '';
        CodexUI._pickItem = '';
        CodexUI._pickMap = '';
        CodexUI._pickEnemy = '';
        const orphan = CodexUI._root?.isValid
            ? CodexUI._root
            : find('Canvas/CodexUI');
        if (orphan?.isValid) orphan.destroy();
        CodexUI._root = null;
    }

    static get isOpen() { return CodexUI._open; }

    static show(canvas: Node) {
        const existing = canvas.getChildByName('CodexUI');
        if (existing) {
            if (CodexUI._open) return;
            existing.destroy();
        }
        CodexUI._open = true;
        CodexUI._tab = 'weapons';

        const root = mountOverlay('CodexUI', canvas, 10004);
        CodexUI._root = root;

        const fit = fitPanelSize(OverlaySafe.maxW, OverlaySafe.maxH);
        const { titleY, backY } = overlayChromeY(fit.h);
        const panel = new Node('Panel');
        panel.layer = Layers.Enum.UI_2D;
        panel.setParent(root);
        panel.setPosition(0, 0, 0);
        panel.addComponent(UITransform).setContentSize(fit.w, fit.h);
        const pg = panel.addComponent(Graphics);
        paintWarmPanel(pg, fit.w, fit.h, 14, 'amber');

        CodexUI._lbl(panel, '图鉴', 0, titleY, 22, UiTone.title, 320);

        const tipBar = new Node('TipBar');
        tipBar.layer = Layers.Enum.UI_2D;
        tipBar.setParent(panel);
        tipBar.setPosition(0, titleY - 28, 0);
        tipBar.addComponent(UITransform).setContentSize(640, 26);
        const tipBg = tipBar.addComponent(Graphics);
        tipBg.fillColor = new Color(18, 14, 12, 160);
        tipBg.roundRect(-320, -13, 640, 26, 6); tipBg.fill();
        const tipLbl = CodexUI._lbl(
            tipBar, '首次遭遇自动解锁 · 未知显示？？', 0, 0, 11, UiTone.muted, 620,
        );

        // 页签固定在列表上方；列表顶边不得顶穿页签
        const tabY = titleY - 60;
        const tabHost = new Node('TabHost');
        tabHost.layer = Layers.Enum.UI_2D;
        tabHost.setParent(panel);
        tabHost.setPosition(0, tabY, 0);
        tabHost.addComponent(UITransform).setContentSize(640, 34);

        // 宫格区：页签底 → 返回钮顶，严格落在面板内
        const galleryTop = tabY - 24;
        const galleryBot = backY + 36;
        const galleryH = Math.max(150, Math.min(200, galleryTop - galleryBot));
        const galleryY = (galleryTop + galleryBot) / 2;
        CodexUI._galleryH = galleryH;

        const listHost = new Node('ListHost');
        listHost.layer = Layers.Enum.UI_2D;
        listHost.setParent(panel);
        listHost.setPosition(0, galleryY, 0);
        listHost.addComponent(UITransform).setContentSize(680, galleryH);

        const setTip = (text: string) => {
            const tip = tipLbl.getComponent(Label)!;
            tip.string = text;
        };

        const refresh = () => {
            CodexUI._buildTabs(tabHost, () => refresh());
            CodexUI._clearChildren(listHost);
            const list = new Node('List');
            list.layer = Layers.Enum.UI_2D;
            list.setParent(listHost);
            list.setPosition(0, 0, 0);

            const gm = GameManager.instance;
            if (CodexUI._tab === 'weapons') {
                CodexUI._fillWeapons(list, gm);
                setTip('点宫格查看武器 · 列表可上下滑动');
            } else if (CodexUI._tab === 'items') {
                CodexUI._fillItems(list);
                setTip('点宫格查看道具 · 列表可上下滑动');
            } else if (CodexUI._tab === 'maps') {
                CodexUI._fillMaps(list, gm);
                setTip('左边选地图，右边看地形 · 可滑动');
            } else {
                CodexUI._fillEnemies(list, gm);
                setTip('点宫格查看怪兽 · 列表可上下滑动');
            }
            // 页签始终压在列表之上，避免滚出内容盖住菜单
            tabHost.setSiblingIndex(panel.children.length - 1);
            tipBar.setSiblingIndex(panel.children.length - 1);
        };

        refresh();

        const back = CodexUI._btn(
            panel, '返回主界面', 0, backY, 170, 38, UiTone.btn,
        );
        const close = () => {
            if (!CodexUI._open) return;
            CodexUI._open = false;
            CodexUI._root = null;
            eventBus.emit('lobby-input-lock', { ms: 500 });
            softClose(root);
        };
        // 只绑 TOUCH_END：桌面预览 TOUCH+MOUSE 会双触发
        back.on(Node.EventType.TOUCH_END, (ev) => { ev.propagationStopped = true; close(); });

        tipBar.setSiblingIndex(panel.children.length - 1);
    }

    /** 立即摘除子节点再 destroy，避免同帧叠两份 List/Tabs */
    private static _clearChildren(host: Node) {
        const kids = host.children.slice();
        for (const c of kids) {
            if (!c?.isValid) continue;
            c.removeFromParent();
            c.destroy();
        }
    }

    private static _buildTabs(host: Node, onSwitch: () => void) {
        CodexUI._clearChildren(host);
        const tabs = new Node('Tabs');
        tabs.layer = Layers.Enum.UI_2D;
        tabs.setParent(host);
        tabs.setPosition(0, 0, 0);

        const defs: Array<{ id: CodexTab; label: string }> = [
            { id: 'weapons', label: '武器' },
            { id: 'items', label: '道具' },
            { id: 'maps', label: '地图' },
            { id: 'enemies', label: '怪兽' },
        ];
        const w = 140;
        const gap = 18;
        const total = defs.length * w + (defs.length - 1) * gap;
        const startX = -total / 2 + w / 2;

        defs.forEach((d, i) => {
            const active = CodexUI._tab === d.id;
            const color = active
                ? new Color(78, 62, 140, 255)
                : new Color(40, 34, 48, 255);
            const btn = CodexUI._btn(tabs, d.label, startX + i * (w + gap), 0, w, 34, color);
            btn.on(Node.EventType.TOUCH_END, (ev) => {
                ev.propagationStopped = true;
                if (CodexUI._tab === d.id) return;
                CodexUI._tab = d.id;
                onSwitch();
            });
        });
    }

    private static _fillWeapons(list: Node, gm: GameManager | null) {
        const weapons = ConfigStore.weaponList();
        if (!weapons.some(w => w.id === CodexUI._pickWeapon)) CodexUI._pickWeapon = weapons[0]?.id ?? '';
        const cells = weapons.map(w => ({
            id: w.id,
            emoji: gm?.hasCodexWeapon(w.id) ? w.emoji : '?',
            name: gm?.hasCodexWeapon(w.id) ? w.name : '？？',
            unlocked: gm?.hasCodexWeapon(w.id) ?? false,
            art: 'weapon' as ThumbArtKind,
        }));
        CodexUI._gallery(list, cells, () => CodexUI._pickWeapon, (id) => {
            CodexUI._pickWeapon = id;
        }, (detail) => {
            const def = getWeapon(CodexUI._pickWeapon);
            const open = gm?.hasCodexWeapon(def.id) ?? false;
            const tier = rarityLabel(def.rarity);
            const tierCol = rarityColor(def.rarity);
            const starterHint = (def.dropWeight ?? 1) <= 0 ? ' · 角色开局武' : ' · 局内掉落';
            const mode = resolveMode(def);
            const body = open
                ? `[${tier}]${starterHint}\n${def.type === 'melee' ? '近战' : '远程'}·${modeLabel(mode.fireMode)}  伤${def.damage}  CD${def.cooldown}s  距${def.range}\n特效 ${weaponTraitTags(def)}\n${def.description}`
                : '？？';
            CodexUI._detailCard(detail, '', '', body, open ? -2 : 4);
            mountThumbArt(detail, 'weapon', def.id, 52, open);
            const art = detail.getChildByName('ThumbArt');
            if (art) art.setPosition(0, 72, 0);
            if (open) {
                const badge = new Node('Rarity');
                badge.setParent(detail);
                badge.setPosition(0, 42, 0);
                badge.addComponent(UITransform).setContentSize(80, 22);
                const bg = badge.addComponent(Graphics);
                bg.fillColor = new Color(tierCol.r, tierCol.g, tierCol.b, 60);
                bg.roundRect(-36, -10, 72, 20, 6); bg.fill();
                bg.strokeColor = tierCol;
                bg.lineWidth = 1.5;
                bg.roundRect(-36, -10, 72, 20, 6); bg.stroke();
                CodexUI._lbl(badge, `${tier}阶`, 0, 0, 12, tierCol, 80);
                CodexUI._lbl(detail, def.name, 0, 22, 15, new Color(235, 225, 245, 255), DETAIL_W - 28);
            } else {
                CodexUI._lbl(detail, '？？？', 0, 42, 15, new Color(235, 225, 245, 255), DETAIL_W - 28);
            }
        });
    }

    private static _fillItems(list: Node) {
        const items = ConfigStore.items();
        if (!items.some(it => it.id === CodexUI._pickItem)) CodexUI._pickItem = items[0]?.id ?? '';
        const cells = items.map(it => ({
            id: it.id, emoji: it.emoji, name: it.name, unlocked: true, art: 'item' as ThumbArtKind,
        }));
        CodexUI._gallery(list, cells, () => CodexUI._pickItem, (id) => {
            CodexUI._pickItem = id;
        }, (detail) => {
            const it = items.find(row => row.id === CodexUI._pickItem);
            if (!it) return;
            const kind = it.kind === 'heal' ? '回复' : it.kind === 'throw' ? '投掷' : '增益';
            CodexUI._detailCard(detail, '', it.name, `${kind}  数值 ${it.amount}\n${it.desc}`);
            mountThumbArt(detail, 'item', it.id, 48, true);
            const art = detail.getChildByName('ThumbArt');
            if (art) art.setPosition(0, 72, 0);
        });
    }

    private static _fillMaps(list: Node, gm: GameManager | null) {
        const themes = ThemeRuntime.allThemes();
        if (!themes.some(t => t.id === CodexUI._pickMap)) CodexUI._pickMap = themes[0]?.id ?? '';
        const cells = themes.map(t => {
            const open = gm?.hasCodexTheme(t.id) ?? false;
            return { id: t.id, emoji: open ? t.emoji : '?', name: open ? t.name : '？？', unlocked: open, art: 'none' as ThumbArtKind };
        });
        CodexUI._gallery(list, cells, () => CodexUI._pickMap, (id) => {
            CodexUI._pickMap = id;
        }, (detail) => {
            const theme = themes.find(t => t.id === CodexUI._pickMap);
            if (!theme) return;
            const open = gm?.hasCodexTheme(theme.id) ?? false;
            CodexUI._paintMap(detail, theme, open);
            CodexUI._detailCard(
                detail, '', '',
                open
                    ? `${theme.blurb || terrainDesc(theme.obstacleStyle)}\n出现层 ${theme.floorMin}–${theme.floorMax}`
                    : '？？',
                -36,
            );
            CodexUI._lbl(
                detail, open ? theme.name : '？？？', 0, CodexUI._galleryH / 2 - 18, 16,
                new Color(235, 225, 245, 255), DETAIL_W - 28,
            );
        });
    }

    private static _fillEnemies(list: Node, gm: GameManager | null) {
        if (!ENEMY_CODEX.some(e => e.id === CodexUI._pickEnemy)) CodexUI._pickEnemy = ENEMY_CODEX[0]?.id ?? '';
        const cells = ENEMY_CODEX.map(e => {
            const open = gm?.hasCodexEnemy(e.id) ?? false;
            return {
                id: e.id,
                emoji: open ? e.emoji : '?',
                name: open ? e.displayName : '？？',
                unlocked: open,
                art: 'enemy' as ThumbArtKind,
            };
        });
        CodexUI._gallery(list, cells, () => CodexUI._pickEnemy, (id) => {
            CodexUI._pickEnemy = id;
        }, (detail) => {
            const e = ENEMY_CODEX.find(row => row.id === CodexUI._pickEnemy);
            if (!e) return;
            const open = gm?.hasCodexEnemy(e.id) ?? false;
            CodexUI._detailCard(detail, '', open ? e.displayName : '？？？', open
                ? CodexUI._enemyStatBlock(e)
                : '？？', open ? 18 : 4);
            mountThumbArt(detail, 'enemy', e.id, 56, open);
            const art = detail.getChildByName('ThumbArt');
            if (art) art.setPosition(0, 72, 0);
        });
    }

    /** 国王保卫战式：生命 / 攻击 / 移速 / 攻距 + 栖息与行为 */
    private static _enemyStatBlock(e: EnemyCodexDef): string {
        if (e.id === 'boss') {
            const d = ConfigStore.dungeon();
            return [
                `❤ 生命  ${d.bossHpBase}（+${d.bossHpPerFloor}/层）`,
                `⚔ 攻击  ${d.bossDamageBase}（+${d.bossDamagePerFloor}/层）`,
                `👟 移速  ${d.bossSpeedBase}（+${d.bossSpeedPerFloor}/层）`,
                `📐 攻距  ${d.bossAttackRange}`,
                `——`,
                e.biome,
                e.behavior,
            ].join('\n');
        }
        const row = ConfigStore.enemy(e.id);
        if (!row) return `${e.biome}\n${e.behavior}`;
        const spd = row.speed <= 50 ? '慢' : row.speed <= 85 ? '中' : '快';
        const role = row.behaviorId === 'kite' || row.behaviorId === 'cast' ? '远程'
            : row.behaviorId === 'fly' || row.behaviorId === 'dragon' ? '飞行'
            : '近战';
        // 与 DungeonManager.buildEnemyConfig 同一公式：hp × scale，dmg × (1 + (scale−1)×0.55)，
        // scale = 1 + roomIndex × roomScaleStep（第 1 层首房 = 基础值）。这里标出每房成长，避免"图鉴与实战不一致"
        const step = ConfigStore.dungeon().roomScaleStep ?? 0;
        const hpPct = Math.round(step * 100);
        const dmgPct = Math.round(step * 55 * 100) / 100;
        const growth = step > 0 ? `每过一房 生命 +${hpPct}% · 攻击 +${dmgPct}%` : '';
        return [
            `❤ 生命  ${row.hp}`,
            `⚔ 攻击  ${row.damage}`,
            `👟 移速  ${row.speed} · ${spd}`,
            `📐 攻距  ${row.attackRange} · ${role}`,
            `——`,
            `第 1 层基础值${growth ? '；' + growth : ''}`,
            e.biome,
            e.behavior,
        ].join('\n');
    }

    private static _gallery(
        host: Node,
        cells: Array<{ id: string; emoji: string; name: string; unlocked: boolean; art?: ThumbArtKind }>,
        getSelected: () => string,
        onPick: (id: string) => void,
        drawDetail: (detail: Node) => void,
    ) {
        const galleryH = CodexUI._galleryH;
        const detailW = DETAIL_W;
        const detailX = 200;
        const gridX = -155;

        const paintDetailShell = (g: Graphics) => {
            g.clear();
            g.fillColor = new Color(32, 28, 40, 255);
            g.roundRect(-detailW / 2, -galleryH / 2, detailW, galleryH, 10); g.fill();
            g.strokeColor = new Color(120, 110, 150, 120);
            g.lineWidth = 1.2;
            g.roundRect(-detailW / 2, -galleryH / 2, detailW, galleryH, 10); g.stroke();
        };

        // 右：详情固定，先建好供点选刷新
        const detail = new Node('Detail');
        detail.layer = Layers.Enum.UI_2D;
        detail.setParent(host);
        detail.setPosition(detailX, 0, 0);
        detail.addComponent(UITransform).setContentSize(detailW, galleryH);
        paintDetailShell(detail.addComponent(Graphics));

        // 左：固定视口滚动（不因点选整表重建）
        const gridHost = new Node('GridHost');
        gridHost.layer = Layers.Enum.UI_2D;
        gridHost.setParent(host);
        gridHost.setPosition(gridX, 0, 0);
        const { scroll, content, contentUI } = mountScrollArea(gridHost, {
            w: GALLERY_W, h: galleryH, vertical: true,
        });

        const rows = Math.max(1, Math.ceil(cells.length / COLS));
        const contentH = Math.max(
            galleryH,
            PAD_TOP + PAD_BOT + rows * CELL + Math.max(0, rows - 1) * CELL_GAP,
        );
        contentUI.setContentSize(GALLERY_W, contentH);
        content.setPosition(0, galleryH / 2, 0);

        const span = COLS * CELL + (COLS - 1) * CELL_GAP;
        const paintCell = (n: Node, c: typeof cells[0], on: boolean) => {
            const g = n.getComponent(Graphics)!;
            g.clear();
            g.fillColor = c.unlocked ? new Color(44, 38, 56, 255) : new Color(28, 26, 32, 255);
            g.roundRect(-CELL / 2, -CELL / 2, CELL, CELL, 8); g.fill();
            g.lineWidth = on ? 1.8 : 1.1;
            g.strokeColor = on
                ? new Color(200, 170, 110, 220)
                : new Color(100, 90, 120, 120);
            g.roundRect(-CELL / 2, -CELL / 2, CELL, CELL, 8); g.stroke();
        };

        cells.forEach((c, i) => {
            const col = i % COLS;
            const row = Math.floor(i / COLS);
            const x = -span / 2 + CELL / 2 + col * (CELL + CELL_GAP);
            const y = -PAD_TOP - CELL / 2 - row * (CELL + CELL_GAP);
            const n = new Node(c.id);
            n.layer = Layers.Enum.UI_2D;
            n.setParent(content);
            n.setPosition(x, y, 0);
            n.addComponent(UITransform).setContentSize(CELL, CELL);
            n.addComponent(Graphics);
            paintCell(n, c, c.id === getSelected());
            // #178 真实像素缩略；地图仍用 emoji（详情有真地牢预览）
            const artKind = (c as { art?: ThumbArtKind }).art ?? 'none';
            const usedArt = artKind !== 'none' && mountThumbArt(n, artKind, c.id, 36, c.unlocked);
            if (!usedArt) {
                CodexUI._lbl(n, c.emoji, 0, 8, 22, new Color(255, 255, 255, c.unlocked ? 255 : 90), CELL - 8);
            }
            CodexUI._lbl(n, c.name, 0, -22, 11, new Color(200, 195, 210, c.unlocked ? 255 : 110), CELL - 8);
            n.on(Node.EventType.TOUCH_END, (ev) => {
                ev.propagationStopped = true;
                if (getSelected() === c.id) return;
                onPick(c.id);
                // 只改描边 + 详情，不拆 ScrollView（滚动才丝滑）
                for (const kid of content.children) {
                    const cell = cells.find(x => x.id === kid.name);
                    if (!cell) continue;
                    paintCell(kid, cell, kid.name === c.id);
                }
                CodexUI._clearChildren(detail);
                paintDetailShell(detail.getComponent(Graphics)!);
                drawDetail(detail);
            });
        });

        scroll.stopAutoScroll();
        scroll.scrollToTop(0);

        // 不在宫格上叠「滑动」字——易错位盖住格子；能否滚动由 tip 文案提示
        drawDetail(detail);
    }

    /** 每个主题固定种子 → 图鉴里同一张预览图 */
    private static _seedOf(id: string): number {
        let h = 2166136261;
        for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
        return h >>> 0;
    }

    /** 地图页预览：按该主题真实生成一张瓦片地牢（厅室/走廊/水火坑/箱子）缩略 */
    private static _paintMap(
        parent: Node,
        theme: {
            id: string; obstacleStyle: string; floorMin: number;
            floorDark: Color; floorLight: Color; obstacleDark: Color; obstacleLight: Color;
        },
        open: boolean,
    ) {
        const PW = 192, PH = 96;
        const plate = new Node('MapPic');
        plate.layer = Layers.Enum.UI_2D;
        plate.setParent(parent);
        plate.setPosition(0, 26, 0);
        plate.addComponent(UITransform).setContentSize(PW + 8, PH + 8);
        const g = plate.addComponent(Graphics);
        g.fillColor = open ? new Color(12, 10, 14, 255) : new Color(28, 26, 34, 255);
        g.roundRect(-PW / 2 - 4, -PH / 2 - 4, PW + 8, PH + 8, 6); g.fill();
        if (!open) return;

        let L: DungeonLayout | null = null;
        try {
            L = DungeonLayout.buildSeeded({
                themeId: theme.id, obstacleStyle: theme.obstacleStyle,
                roomIndex: 1, floor: Math.max(1, theme.floorMin), hasBoss: false, isFinal: false,
            }, CodexUI._seedOf(theme.id));
        } catch { L = null; }
        if (!L) return;

        const sx = PW / MAP_COLS, sy = PH / MAP_ROWS;
        const tint = L.hazardTint;
        const colWall = new Color(theme.obstacleDark.r, theme.obstacleDark.g, theme.obstacleDark.b, 255);
        const colFloor = new Color(theme.floorLight.r, theme.floorLight.g, theme.floorLight.b, 255);
        const colWater = tint === 'frost' ? new Color(160, 210, 240, 255) : new Color(70, 120, 200, 255);
        const colLava = tint === 'poison' ? new Color(90, 190, 80, 255) : new Color(220, 90, 40, 255);
        const colPit = new Color(14, 12, 20, 255);
        const colOf = (t: number): Color | null => {
            if (t === TILE.FLOOR) return colFloor;
            if (t === TILE.WATER) return colWater;
            if (t === TILE.LAVA) return colLava;
            if (t === TILE.PIT) return colPit;
            return null;
        };
        // 只画地板周围一圈墙，其它留深底色，轮廓更像地牢
        const x0 = -PW / 2, y0 = -PH / 2;
        const isFloorish = (c: number, r: number) =>
            c >= 0 && r >= 0 && c < MAP_COLS && r < MAP_ROWS && L!.tiles[r * MAP_COLS + c] !== TILE.WALL;
        g.fillColor = colWall;
        for (let r = 0; r < MAP_ROWS; r++) {
            for (let c = 0; c < MAP_COLS; c++) {
                if (L.tiles[r * MAP_COLS + c] !== TILE.WALL) continue;
                if (isFloorish(c - 1, r) || isFloorish(c + 1, r) || isFloorish(c, r - 1) || isFloorish(c, r + 1)
                    || isFloorish(c - 1, r - 1) || isFloorish(c + 1, r - 1) || isFloorish(c - 1, r + 1) || isFloorish(c + 1, r + 1)) {
                    g.rect(x0 + c * sx, y0 + r * sy, sx + 0.3, sy + 0.3);
                }
            }
        }
        g.fill();
        // 行内同色连段合并
        for (let r = 0; r < MAP_ROWS; r++) {
            let c = 0;
            while (c < MAP_COLS) {
                const col = colOf(L.tiles[r * MAP_COLS + c]);
                if (!col) { c++; continue; }
                let e = c + 1;
                while (e < MAP_COLS && colOf(L.tiles[r * MAP_COLS + e]) === col) e++;
                g.fillColor = col;
                g.rect(x0 + c * sx, y0 + r * sy, (e - c) * sx + 0.3, sy + 0.3);
                g.fill();
                c = e;
            }
        }
        // 箱子/装饰/机关点
        for (const f of L.features) {
            const px = x0 + (f.c + 0.5) * sx, py = y0 + (f.r + 0.5) * sy;
            if (f.kind === 'crate' || f.kind === 'prop') {
                g.fillColor = theme.obstacleLight;
                g.rect(px - sx * 0.4, py - sy * 0.4, sx * 0.8, sy * 0.8); g.fill();
            } else if (f.kind === 'spike' || f.kind === 'turret') {
                g.fillColor = new Color(230, 90, 80, 230);
                g.circle(px, py, 1); g.fill();
            } else if (f.kind === 'plate' || f.kind === 'trap_plate') {
                g.fillColor = new Color(255, 215, 90, 230);
                g.circle(px, py, 1.2); g.fill();
            } else if (f.kind === 'torch') {
                g.fillColor = new Color(255, 170, 60, 230);
                g.circle(px, py, 0.9); g.fill();
            }
        }
        // 起点
        g.fillColor = new Color(255, 235, 120, 255);
        g.circle(x0 + (MAP_COLS / 2) * sx, y0 + (MAP_ROWS / 2) * sy, 1.8); g.fill();
    }

    private static _detailCard(parent: Node, emoji: string, title: string, body: string, bodyY = 4) {
        if (emoji) CodexUI._lbl(parent, emoji, 0, 72, 26, new Color(255, 255, 255, 255), 60);
        if (title) CodexUI._lbl(parent, title, 0, 42, 15, new Color(235, 225, 245, 255), DETAIL_W - 28);
        const lines = body.split('\n');
        const lineH = lines.length > 5 ? 16 : 18;
        const startY = bodyY;
        lines.forEach((line, i) => {
            const isStat = line.startsWith('❤') || line.startsWith('⚔')
                || line.startsWith('👟') || line.startsWith('📐');
            const col = line === '——'
                ? new Color(100, 95, 110, 180)
                : isStat
                    ? new Color(230, 210, 160, 255)
                    : new Color(175, 180, 195, 255);
            CodexUI._lbl(parent, line, 0, startY - i * lineH, isStat ? 12 : 11, col, DETAIL_W - 24);
        });
    }

    private static _lbl(
        p: Node, t: string, x: number, y: number, s: number, c: Color, width = 360,
    ): Node {
        const n = new Node('L');
        n.layer = Layers.Enum.UI_2D;
        n.setParent(p); n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(width, s + 10);
        const l = n.addComponent(Label);
        l.string = t; l.fontSize = s; l.color = c; l.horizontalAlign = 1;
        l.overflow = Label.Overflow.CLAMP;
        return n;
    }

    private static _btn(
        p: Node, t: string, x: number, y: number, w: number, h: number, c: Color,
    ): Node {
        const n = new Node('B');
        n.layer = Layers.Enum.UI_2D;
        n.setParent(p); n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(w, h);
        const g = n.addComponent(Graphics);
        g.fillColor = c;
        g.roundRect(-w / 2, -h / 2, w, h, 8); g.fill();
        g.strokeColor = new Color(160, 140, 110, 90);
        g.lineWidth = 1.1;
        g.roundRect(-w / 2, -h / 2, w, h, 8); g.stroke();
        const lbl = CodexUI._lbl(n, t, 0, 0, 14, new Color(255, 248, 230, 255), w - 10);
        lbl.getComponent(UITransform)!.setContentSize(w - 10, h - 8);
        return n;
    }
}
