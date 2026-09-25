import { _decorator, Component, Node, Graphics, Color, UITransform } from 'cc';
import { MAP_HALF_H, MAP_HALF_W } from '../dungeon/MapConstants';

const { ccclass } = _decorator;

type Particle = {
    node: Node;
    g: Graphics;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    baseR: number;
    kind: 'bubble' | 'dust' | 'mote' | 'spark' | 'ember' | 'fluff';
    ox: number;
    oy: number;
};

type Hotspot = { x: number; y: number; r: number };

/**
 * ThemeAmbient —— 挂在 WorldLayer 的主题循环氛围
 * 不改 Player / Camera / ViewZoom；换主题时整体销毁重建。
 */
@ccclass('ThemeAmbient')
export class ThemeAmbient extends Component {

    static I: ThemeAmbient | null = null;

    private _themeId = '';
    private _parts: Particle[] = [];
    private _hotspots: Hotspot[] = [];
    private _spawnCd = 0;
    private _tipShown = false;
    private _skyTipShown = false;
    private _ruinsTipShown = false;
    private _iceTipShown = false;
    private _caveTipShown = false;
    private _caveHotTipShown = false;
    private _volcanoTipShown = false;
    private _volcanoHotTipShown = false;
    private _abyssTipShown = false;
    private _abyssHotTipShown = false;
    private _necropolisTipShown = false;
    private _necropolisHotTipShown = false;

    static attach(worldLayer: Node, themeId: string): ThemeAmbient | null {
        if (!worldLayer?.isValid) return null;
        ThemeAmbient.clear(worldLayer);
        const n = new Node('ThemeAmbient');
        n.setParent(worldLayer);
        n.setPosition(0, 0, 0);
        const amb = n.addComponent(ThemeAmbient);
        amb._boot(themeId);
        return amb;
    }

    static clear(worldLayer: Node | null | undefined) {
        if (!worldLayer?.isValid) return;
        const old = worldLayer.getChildByName('ThemeAmbient');
        if (old?.isValid) {
            old.removeFromParent();
            old.destroy();
        }
        if (ThemeAmbient.I && (!ThemeAmbient.I.node?.isValid || ThemeAmbient.I.node.parent !== worldLayer)) {
            ThemeAmbient.I = null;
        }
    }

    /** 踩在主题热点上时的移速倍率（1 = 无影响） */
    static moveMulAt(wx: number, wy: number): number {
        const amb = ThemeAmbient.I;
        if (!amb) return 1;
        let mul = 1;
        // 云海：全局略加速；上升气流柱再加速
        if (amb._themeId === 'sky') {
            mul *= 1.08;
            for (const h of amb._hotspots) {
                const dx = wx - h.x;
                const dy = wy - h.y;
                if (dx * dx + dy * dy <= h.r * h.r) {
                    mul *= 1.14;
                    break;
                }
            }
        }
        // 冰原：除全局减速外，冰晶热点更滑
        if (amb._themeId === 'ice') {
            for (const h of amb._hotspots) {
                const dx = wx - h.x;
                const dy = wy - h.y;
                if (dx * dx + dy * dy <= h.r * h.r) {
                    mul *= 0.82;
                    break;
                }
            }
        }
        // 洞穴：碎石带略减速（谨慎探路）
        if (amb._themeId === 'cave') {
            for (const h of amb._hotspots) {
                const dx = wx - h.x;
                const dy = wy - h.y;
                if (dx * dx + dy * dy <= h.r * h.r) {
                    mul *= 0.88;
                    break;
                }
            }
        }
        // 沼泽泥地热点
        if (amb._themeId === 'swamp') {
            for (const h of amb._hotspots) {
                const dx = wx - h.x;
                const dy = wy - h.y;
                if (dx * dx + dy * dy <= h.r * h.r) {
                    mul *= 0.78;
                    break;
                }
            }
        }
        // 遗迹圣坛：踩上去略加速
        if (amb._themeId === 'ruins') {
            for (const h of amb._hotspots) {
                const dx = wx - h.x;
                const dy = wy - h.y;
                if (dx * dx + dy * dy <= h.r * h.r) {
                    mul *= 1.12;
                    break;
                }
            }
        }
        // 熔岩火口：熔浆洼减速
        if (amb._themeId === 'volcano') {
            for (const h of amb._hotspots) {
                const dx = wx - h.x;
                const dy = wy - h.y;
                if (dx * dx + dy * dy <= h.r * h.r) {
                    mul *= 0.76;
                    break;
                }
            }
        }
        // 虚空裂隙：引力环缓步
        if (amb._themeId === 'abyss') {
            for (const h of amb._hotspots) {
                const dx = wx - h.x;
                const dy = wy - h.y;
                if (dx * dx + dy * dy <= h.r * h.r) {
                    mul *= 0.8;
                    break;
                }
            }
        }
        // 亡灵墓园：青磷雾略减速
        if (amb._themeId === 'necropolis') {
            for (const h of amb._hotspots) {
                const dx = wx - h.x;
                const dy = wy - h.y;
                if (dx * dx + dy * dy <= h.r * h.r) {
                    mul *= 0.84;
                    break;
                }
            }
        }
        return mul;
    }

    /** 主题首次进入提示（冰在 PlayerController；沼在 mud；云在此） */
    static consumeSkyTip(): boolean {
        const amb = ThemeAmbient.I;
        if (!amb || amb._themeId !== 'sky' || amb._skyTipShown) return false;
        amb._skyTipShown = true;
        return true;
    }

    static consumeCaveTip(): boolean {
        const amb = ThemeAmbient.I;
        if (!amb || amb._themeId !== 'cave' || amb._caveTipShown) return false;
        amb._caveTipShown = true;
        return true;
    }

    static justEnteredIcePatch(wx: number, wy: number): boolean {
        const amb = ThemeAmbient.I;
        if (!amb || amb._themeId !== 'ice' || amb._iceTipShown) return false;
        for (const h of amb._hotspots) {
            const dx = wx - h.x;
            const dy = wy - h.y;
            if (dx * dx + dy * dy <= h.r * h.r) {
                amb._iceTipShown = true;
                return true;
            }
        }
        return false;
    }

    static justEnteredCaveRubble(wx: number, wy: number): boolean {
        const amb = ThemeAmbient.I;
        if (!amb || amb._themeId !== 'cave' || amb._caveHotTipShown) return false;
        for (const h of amb._hotspots) {
            const dx = wx - h.x;
            const dy = wy - h.y;
            if (dx * dx + dy * dy <= h.r * h.r) {
                amb._caveHotTipShown = true;
                return true;
            }
        }
        return false;
    }

    static justEnteredMud(wx: number, wy: number): boolean {
        const amb = ThemeAmbient.I;
        if (!amb || amb._themeId !== 'swamp' || amb._tipShown) return false;
        for (const h of amb._hotspots) {
            const dx = wx - h.x;
            const dy = wy - h.y;
            if (dx * dx + dy * dy <= h.r * h.r) {
                amb._tipShown = true;
                return true;
            }
        }
        return false;
    }

    static justEnteredRuins(wx: number, wy: number): boolean {
        const amb = ThemeAmbient.I;
        if (!amb || amb._themeId !== 'ruins' || amb._ruinsTipShown) return false;
        for (const h of amb._hotspots) {
            const dx = wx - h.x;
            const dy = wy - h.y;
            if (dx * dx + dy * dy <= h.r * h.r) {
                amb._ruinsTipShown = true;
                return true;
            }
        }
        return false;
    }

    static consumeVolcanoTip(): boolean {
        const amb = ThemeAmbient.I;
        if (!amb || amb._themeId !== 'volcano' || amb._volcanoTipShown) return false;
        amb._volcanoTipShown = true;
        return true;
    }

    static justEnteredLava(wx: number, wy: number): boolean {
        const amb = ThemeAmbient.I;
        if (!amb || amb._themeId !== 'volcano' || amb._volcanoHotTipShown) return false;
        for (const h of amb._hotspots) {
            const dx = wx - h.x;
            const dy = wy - h.y;
            if (dx * dx + dy * dy <= h.r * h.r) {
                amb._volcanoHotTipShown = true;
                return true;
            }
        }
        return false;
    }

    static consumeAbyssTip(): boolean {
        const amb = ThemeAmbient.I;
        if (!amb || amb._themeId !== 'abyss' || amb._abyssTipShown) return false;
        amb._abyssTipShown = true;
        return true;
    }

    static justEnteredRift(wx: number, wy: number): boolean {
        const amb = ThemeAmbient.I;
        if (!amb || amb._themeId !== 'abyss' || amb._abyssHotTipShown) return false;
        for (const h of amb._hotspots) {
            const dx = wx - h.x;
            const dy = wy - h.y;
            if (dx * dx + dy * dy <= h.r * h.r) {
                amb._abyssHotTipShown = true;
                return true;
            }
        }
        return false;
    }

    static consumeNecropolisTip(): boolean {
        const amb = ThemeAmbient.I;
        if (!amb || amb._themeId !== 'necropolis' || amb._necropolisTipShown) return false;
        amb._necropolisTipShown = true;
        return true;
    }

    static justEnteredGraveFog(wx: number, wy: number): boolean {
        const amb = ThemeAmbient.I;
        if (!amb || amb._themeId !== 'necropolis' || amb._necropolisHotTipShown) return false;
        for (const h of amb._hotspots) {
            const dx = wx - h.x;
            const dy = wy - h.y;
            if (dx * dx + dy * dy <= h.r * h.r) {
                amb._necropolisHotTipShown = true;
                return true;
            }
        }
        return false;
    }

    onLoad() {
        ThemeAmbient.I = this;
    }

    onDestroy() {
        if (ThemeAmbient.I === this) ThemeAmbient.I = null;
        this._parts.length = 0;
        this._hotspots.length = 0;
    }

    private _boot(themeId: string) {
        this._themeId = themeId;
        this._parts = [];
        this._hotspots = [];
        this._tipShown = false;
        this._skyTipShown = false;
        this._ruinsTipShown = false;
        this._caveTipShown = false;
        this._iceTipShown = false;
        this._caveHotTipShown = false;
        this._volcanoTipShown = false;
        this._volcanoHotTipShown = false;
        this._abyssTipShown = false;
        this._abyssHotTipShown = false;
        this._necropolisTipShown = false;
        this._necropolisHotTipShown = false;
        this._spawnCd = 0;

        if (themeId === 'swamp') {
            for (let i = 0; i < 12; i++) {
                const x = this._rng(-MAP_HALF_W + 140, MAP_HALF_W - 140);
                const y = this._rng(-MAP_HALF_H + 140, MAP_HALF_H - 140);
                if (Math.hypot(x, y) < 220) continue;
                const r = 32 + Math.random() * 40;
                this._hotspots.push({ x, y, r });
                const ring = new Node(`PuddleRing_${i}`);
                ring.setParent(this.node);
                ring.setPosition(x, y, 0);
                ring.addComponent(UITransform).setContentSize(r * 2, r * 2);
                const g = ring.addComponent(Graphics);
                g.fillColor = new Color(18, 70, 48, 70);
                g.circle(0, 0, r); g.fill();
                g.strokeColor = new Color(40, 120, 70, 100);
                g.lineWidth = 2;
                g.circle(0, 0, r * 0.85); g.stroke();
            }
        }

        if (themeId === 'ruins') {
            for (let i = 0; i < 8; i++) {
                const x = this._rng(-MAP_HALF_W + 160, MAP_HALF_W - 160);
                const y = this._rng(-MAP_HALF_H + 160, MAP_HALF_H - 160);
                if (Math.hypot(x, y) < 240) continue;
                const r = 40 + Math.random() * 28;
                this._hotspots.push({ x, y, r });
                const ring = new Node(`Shrine_${i}`);
                ring.setParent(this.node);
                ring.setPosition(x, y, 0);
                ring.addComponent(UITransform).setContentSize(r * 2.2, r * 2.2);
                const g = ring.addComponent(Graphics);
                g.fillColor = new Color(80, 60, 140, 45);
                g.circle(0, 0, r); g.fill();
                g.strokeColor = new Color(180, 160, 255, 110);
                g.lineWidth = 2;
                g.circle(0, 0, r * 0.75); g.stroke();
                g.fillColor = new Color(220, 200, 255, 90);
                g.circle(0, 0, 6); g.fill();
            }
        }

        if (themeId === 'ice') {
            for (let i = 0; i < 10; i++) {
                const x = this._rng(-MAP_HALF_W + 150, MAP_HALF_W - 150);
                const y = this._rng(-MAP_HALF_H + 150, MAP_HALF_H - 150);
                if (Math.hypot(x, y) < 230) continue;
                const r = 36 + Math.random() * 34;
                this._hotspots.push({ x, y, r });
                const patch = new Node(`IcePatch_${i}`);
                patch.setParent(this.node);
                patch.setPosition(x, y, 0);
                patch.addComponent(UITransform).setContentSize(r * 2, r * 2);
                const g = patch.addComponent(Graphics);
                g.fillColor = new Color(180, 230, 255, 55);
                g.ellipse(0, 0, r, r * 0.7); g.fill();
                g.strokeColor = new Color(220, 245, 255, 140);
                g.lineWidth = 2;
                g.ellipse(0, 0, r * 0.85, r * 0.55); g.stroke();
                g.fillColor = new Color(255, 255, 255, 70);
                g.circle(-r * 0.2, r * 0.1, 4); g.fill();
            }
        }

        if (themeId === 'cave') {
            for (let i = 0; i < 9; i++) {
                const x = this._rng(-MAP_HALF_W + 150, MAP_HALF_W - 150);
                const y = this._rng(-MAP_HALF_H + 150, MAP_HALF_H - 150);
                if (Math.hypot(x, y) < 220) continue;
                const r = 30 + Math.random() * 28;
                this._hotspots.push({ x, y, r });
                const rubble = new Node(`Rubble_${i}`);
                rubble.setParent(this.node);
                rubble.setPosition(x, y, 0);
                rubble.addComponent(UITransform).setContentSize(r * 2, r * 2);
                const g = rubble.addComponent(Graphics);
                g.fillColor = new Color(50, 40, 32, 80);
                g.circle(0, 0, r); g.fill();
                g.fillColor = new Color(90, 70, 50, 140);
                g.circle(-6, 2, 7); g.fill();
                g.circle(8, -3, 5); g.fill();
                g.circle(0, -6, 4); g.fill();
            }
        }

        if (themeId === 'sky') {
            // 上升气流柱：踩上去额外加速（叠在全局 1.08 上）
            for (let i = 0; i < 6; i++) {
                const x = this._rng(-MAP_HALF_W + 180, MAP_HALF_W - 180);
                const y = this._rng(-MAP_HALF_H + 180, MAP_HALF_H - 180);
                if (Math.hypot(x, y) < 260) continue;
                const r = 44 + Math.random() * 24;
                this._hotspots.push({ x, y, r });
                const col = new Node(`Updraft_${i}`);
                col.setParent(this.node);
                col.setPosition(x, y, 0);
                col.addComponent(UITransform).setContentSize(r * 2, r * 2.4);
                const g = col.addComponent(Graphics);
                g.fillColor = new Color(200, 230, 255, 35);
                g.ellipse(0, 0, r, r * 1.2); g.fill();
                g.strokeColor = new Color(255, 255, 255, 90);
                g.lineWidth = 1.5;
                g.ellipse(0, 8, r * 0.55, r * 0.75); g.stroke();
            }
        }

        if (themeId === 'volcano') {
            for (let i = 0; i < 10; i++) {
                const x = this._rng(-MAP_HALF_W + 150, MAP_HALF_W - 150);
                const y = this._rng(-MAP_HALF_H + 150, MAP_HALF_H - 150);
                if (Math.hypot(x, y) < 240) continue;
                const r = 34 + Math.random() * 36;
                this._hotspots.push({ x, y, r });
                const lava = new Node(`Lava_${i}`);
                lava.setParent(this.node);
                lava.setPosition(x, y, 0);
                lava.addComponent(UITransform).setContentSize(r * 2.2, r * 2);
                const g = lava.addComponent(Graphics);
                g.fillColor = new Color(180, 40, 20, 70);
                g.ellipse(0, 0, r, r * 0.75); g.fill();
                g.fillColor = new Color(255, 120, 40, 90);
                g.ellipse(0, 0, r * 0.55, r * 0.4); g.fill();
                g.strokeColor = new Color(255, 180, 60, 120);
                g.lineWidth = 2;
                g.ellipse(0, 0, r * 0.9, r * 0.65); g.stroke();
            }
        }

        if (themeId === 'abyss') {
            for (let i = 0; i < 8; i++) {
                const x = this._rng(-MAP_HALF_W + 170, MAP_HALF_W - 170);
                const y = this._rng(-MAP_HALF_H + 170, MAP_HALF_H - 170);
                if (Math.hypot(x, y) < 250) continue;
                const r = 42 + Math.random() * 30;
                this._hotspots.push({ x, y, r });
                const rift = new Node(`Rift_${i}`);
                rift.setParent(this.node);
                rift.setPosition(x, y, 0);
                rift.addComponent(UITransform).setContentSize(r * 2.4, r * 2.4);
                const g = rift.addComponent(Graphics);
                g.fillColor = new Color(20, 8, 40, 90);
                g.circle(0, 0, r); g.fill();
                g.strokeColor = new Color(160, 100, 255, 130);
                g.lineWidth = 2;
                g.circle(0, 0, r * 0.8); g.stroke();
                g.strokeColor = new Color(200, 160, 255, 80);
                g.lineWidth = 1.5;
                g.circle(0, 0, r * 0.5); g.stroke();
                g.fillColor = new Color(120, 80, 200, 100);
                g.circle(0, 0, 5); g.fill();
            }
        }

        if (themeId === 'necropolis') {
            for (let i = 0; i < 9; i++) {
                const x = this._rng(-MAP_HALF_W + 160, MAP_HALF_W - 160);
                const y = this._rng(-MAP_HALF_H + 160, MAP_HALF_H - 160);
                if (Math.hypot(x, y) < 230) continue;
                const r = 36 + Math.random() * 28;
                this._hotspots.push({ x, y, r });
                const fog = new Node(`GraveFog_${i}`);
                fog.setParent(this.node);
                fog.setPosition(x, y, 0);
                fog.addComponent(UITransform).setContentSize(r * 2.2, r * 2);
                const g = fog.addComponent(Graphics);
                g.fillColor = new Color(140, 180, 120, 55);
                g.ellipse(0, 0, r, r * 0.7); g.fill();
                g.strokeColor = new Color(180, 220, 160, 90);
                g.lineWidth = 1.5;
                g.ellipse(0, 0, r * 0.85, r * 0.55); g.stroke();
            }
        }
    }

    update(dt: number) {
        if (!this.node?.isValid) return;
        this._spawnCd -= dt;
        if (this._spawnCd <= 0) {
            this._spawnBatch();
            this._spawnCd = this._spawnInterval();
        }
        this._tickParts(dt);
    }

    private _spawnInterval(): number {
        switch (this._themeId) {
            case 'swamp': return 0.22;
            case 'volcano': return 0.28;
            case 'cave':  return 0.35;
            case 'ruins': return 0.4;
            case 'abyss': return 0.32;
            case 'necropolis': return 0.34;
            case 'ice':   return 0.45;
            case 'sky':   return 0.5;
            default:      return 0.5;
        }
    }

    private _spawnBatch() {
        const n = (this._themeId === 'swamp' || this._themeId === 'volcano') ? 2 : 1;
        for (let i = 0; i < n; i++) this._spawnOne();
        // 上限，避免堆积
        while (this._parts.length > 48) {
            const p = this._parts.shift();
            if (p?.node?.isValid) p.node.destroy();
        }
    }

    private _spawnBubble() {
        if (this._hotspots.length < 1) return;
        const h = this._hotspots[Math.floor(Math.random() * this._hotspots.length)];
        const ox = h.x + (Math.random() - 0.5) * h.r * 0.7;
        const oy = h.y + (Math.random() - 0.5) * h.r * 0.5;
        const r = 2.5 + Math.random() * 4;
        this._addPart(ox, oy, 0, 28 + Math.random() * 36, 1.1 + Math.random() * 0.7, r, 'bubble',
            new Color(160, 230, 190, 200));
    }

    private _spawnOne() {
        switch (this._themeId) {
            case 'swamp': this._spawnBubble(); break;
            case 'cave':  this._spawnDust(); break;
            case 'ruins':
                // 圣坛上冒光点；否则普通浮尘
                if (this._hotspots.length > 0 && Math.random() < 0.65) {
                    const h = this._hotspots[Math.floor(Math.random() * this._hotspots.length)];
                    this._addPart(
                        h.x + (Math.random() - 0.5) * h.r * 0.5,
                        h.y + (Math.random() - 0.5) * h.r * 0.3,
                        (Math.random() - 0.5) * 6, 22 + Math.random() * 20,
                        1.6 + Math.random(), 2 + Math.random() * 2, 'mote',
                        new Color(210, 190, 255, 220),
                    );
                } else {
                    this._spawnMote(new Color(200, 190, 255, 200));
                }
                break;
            case 'ice':   this._spawnSpark(); break;
            case 'sky':   this._spawnFluff(); break;
            case 'volcano': this._spawnEmber(); break;
            case 'abyss':
                if (this._hotspots.length > 0 && Math.random() < 0.7) {
                    const h = this._hotspots[Math.floor(Math.random() * this._hotspots.length)];
                    this._addPart(
                        h.x + (Math.random() - 0.5) * h.r * 0.45,
                        h.y - 8,
                        (Math.random() - 0.5) * 8, 30 + Math.random() * 28,
                        1.4 + Math.random(), 2 + Math.random() * 2.5, 'mote',
                        new Color(180, 120, 255, 230),
                    );
                } else {
                    this._spawnMote(new Color(140, 100, 220, 200));
                }
                break;
            case 'necropolis':
                if (this._hotspots.length > 0 && Math.random() < 0.7) {
                    const h = this._hotspots[Math.floor(Math.random() * this._hotspots.length)];
                    this._addPart(
                        h.x + (Math.random() - 0.5) * h.r * 0.5,
                        h.y + (Math.random() - 0.5) * h.r * 0.3,
                        (Math.random() - 0.5) * 5, 18 + Math.random() * 22,
                        1.5 + Math.random(), 2 + Math.random() * 2, 'mote',
                        new Color(170, 220, 150, 210),
                    );
                } else {
                    this._spawnMote(new Color(150, 180, 140, 180));
                }
                break;
            default:      this._spawnDust(); break;
        }
    }

    private _spawnEmber() {
        if (this._hotspots.length > 0 && Math.random() < 0.75) {
            const h = this._hotspots[Math.floor(Math.random() * this._hotspots.length)];
            this._addPart(
                h.x + (Math.random() - 0.5) * h.r * 0.6,
                h.y + (Math.random() - 0.5) * h.r * 0.3,
                (Math.random() - 0.5) * 16, 40 + Math.random() * 50,
                0.9 + Math.random() * 0.7, 2 + Math.random() * 3, 'ember',
                new Color(255, 140 + Math.floor(Math.random() * 80), 40, 220),
            );
            return;
        }
        const ox = this._rng(-MAP_HALF_W + 80, MAP_HALF_W - 80);
        const oy = this._rng(-MAP_HALF_H + 80, MAP_HALF_H - 80);
        this._addPart(ox, oy, (Math.random() - 0.5) * 20, 35 + Math.random() * 40,
            1.0 + Math.random() * 0.6, 1.8 + Math.random() * 2, 'ember',
            new Color(255, 160, 50, 200));
    }

    private _spawnDust() {
        const ox = this._rng(-MAP_HALF_W + 60, MAP_HALF_W - 60);
        const oy = this._rng(-MAP_HALF_H + 60, MAP_HALF_H - 60);
        this._addPart(ox, oy + 40, (Math.random() - 0.5) * 12, -18 - Math.random() * 22,
            1.6 + Math.random(), 1.5 + Math.random() * 2, 'dust',
            new Color(160, 130, 100, 160));
    }

    private _spawnMote(color: Color) {
        const ox = this._rng(-MAP_HALF_W + 80, MAP_HALF_W - 80);
        const oy = this._rng(-MAP_HALF_H + 80, MAP_HALF_H - 80);
        this._addPart(ox, oy, (Math.random() - 0.5) * 8, 16 + Math.random() * 24,
            2 + Math.random(), 2 + Math.random() * 2, 'mote', color);
    }

    private _spawnSpark() {
        const ox = this._rng(-MAP_HALF_W + 80, MAP_HALF_W - 80);
        const oy = this._rng(-MAP_HALF_H + 80, MAP_HALF_H - 80);
        this._addPart(ox, oy, 0, 0, 0.7 + Math.random() * 0.5, 2 + Math.random() * 2.5, 'spark',
            new Color(210, 240, 255, 230));
    }

    private _spawnFluff() {
        const ox = this._rng(-MAP_HALF_W + 80, MAP_HALF_W - 80);
        const oy = this._rng(-MAP_HALF_H + 80, MAP_HALF_H - 80);
        this._addPart(ox, oy, 18 + Math.random() * 28, (Math.random() - 0.5) * 10,
            2.5 + Math.random(), 4 + Math.random() * 6, 'fluff',
            new Color(255, 255, 255, 90));
    }

    private _addPart(
        x: number, y: number, vx: number, vy: number,
        life: number, r: number, kind: Particle['kind'], color: Color,
    ) {
        const node = new Node('Amb');
        node.setParent(this.node);
        node.setPosition(x, y, 0);
        node.addComponent(UITransform).setContentSize(r * 4, r * 4);
        const g = node.addComponent(Graphics);
        g.fillColor = color;
        if (kind === 'fluff') {
            g.ellipse(0, 0, r * 1.6, r * 0.7); g.fill();
        } else if (kind === 'spark') {
            g.circle(0, 0, r); g.fill();
            g.strokeColor = new Color(255, 255, 255, 180);
            g.lineWidth = 1;
            g.moveTo(-r * 1.8, 0); g.lineTo(r * 1.8, 0); g.stroke();
            g.moveTo(0, -r * 1.8); g.lineTo(0, r * 1.8); g.stroke();
        } else if (kind === 'ember') {
            g.circle(0, 0, r); g.fill();
            g.fillColor = new Color(255, 220, 120, Math.min(200, color.a));
            g.circle(0, r * 0.2, Math.max(1, r * 0.45)); g.fill();
        } else if (kind === 'bubble') {
            g.circle(0, 0, r); g.fill();
            g.fillColor = new Color(255, 255, 255, 180);
            g.circle(-r * 0.35, r * 0.35, Math.max(1, r * 0.28)); g.fill();
        } else {
            g.circle(0, 0, r); g.fill();
        }
        this._parts.push({
            node, g, vx, vy, life, maxLife: life, baseR: r, kind, ox: x, oy: y,
        });
    }

    private _tickParts(dt: number) {
        for (let i = this._parts.length - 1; i >= 0; i--) {
            const p = this._parts[i];
            p.life -= dt;
            if (p.life <= 0 || !p.node?.isValid) {
                if (p.node?.isValid) p.node.destroy();
                this._parts.splice(i, 1);
                continue;
            }
            const t = 1 - p.life / p.maxLife;
            if (p.kind === 'spark') {
                // 冰晶：原地闪烁放大再消
                const s = 0.4 + Math.sin(t * Math.PI) * 1.2;
                p.node.setScale(s, s, 1);
            } else if (p.kind === 'ember') {
                // 熔岩火星：上漂 + 闪烁
                p.node.setPosition(
                    p.node.position.x + p.vx * dt,
                    p.node.position.y + p.vy * dt,
                    0,
                );
                const s = 0.5 + Math.sin(t * Math.PI) * 0.9;
                p.node.setScale(s, s, 1);
            } else if (p.kind === 'bubble') {
                p.node.setPosition(
                    p.node.position.x + Math.sin((p.maxLife - p.life) * 6) * 8 * dt,
                    p.node.position.y + p.vy * dt,
                    0,
                );
                p.node.setScale(1 - t * 0.3, 1 - t * 0.3, 1);
            } else {
                p.node.setPosition(
                    p.node.position.x + p.vx * dt,
                    p.node.position.y + p.vy * dt,
                    0,
                );
            }
            // 淡出：重绘透明度
            const a = Math.floor((1 - t) * (p.kind === 'fluff' ? 90 : 210));
            if (p.g) {
                p.g.clear();
                const col = p.kind === 'bubble' ? new Color(160, 230, 190, a)
                    : p.kind === 'dust' ? new Color(160, 130, 100, a)
                    : p.kind === 'mote' ? new Color(200, 190, 255, a)
                    : p.kind === 'spark' ? new Color(210, 240, 255, a)
                    : p.kind === 'ember' ? new Color(255, 150, 50, a)
                    : new Color(255, 255, 255, a);
                p.g.fillColor = col;
                const r = p.baseR;
                if (p.kind === 'fluff') {
                    p.g.ellipse(0, 0, r * 1.6, r * 0.7); p.g.fill();
                } else if (p.kind === 'spark' || p.kind === 'ember') {
                    p.g.circle(0, 0, r); p.g.fill();
                } else if (p.kind === 'bubble') {
                    p.g.circle(0, 0, r); p.g.fill();
                    p.g.fillColor = new Color(255, 255, 255, Math.min(180, a));
                    p.g.circle(-r * 0.35, r * 0.35, Math.max(1, r * 0.28)); p.g.fill();
                } else {
                    p.g.circle(0, 0, r); p.g.fill();
                }
            }
            // 离开地图则收
            const pos = p.node.position;
            if (Math.abs(pos.x) > MAP_HALF_W + 40 || Math.abs(pos.y) > MAP_HALF_H + 40) {
                p.life = 0;
            }
        }
    }

    private _rng(a: number, b: number) {
        return a + Math.random() * (b - a);
    }
}
