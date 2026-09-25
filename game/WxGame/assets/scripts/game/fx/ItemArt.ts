import { Color, Graphics } from 'cc';
import type { ConfigItem } from '../../core/ConfigSchema';

/** 局内道具精致图标（程序画，替代纯 emoji 卡片） */
export function drawItemGlyph(g: Graphics, it: ConfigItem, size = 36) {
    const s = size / 36;
    g.fillColor = new Color(24, 18, 40, 230);
    g.roundRect(-18 * s, -16 * s, 36 * s, 34 * s, 8 * s); g.fill();
    g.strokeColor = accentFor(it);
    g.lineWidth = 2;
    g.roundRect(-18 * s, -16 * s, 36 * s, 34 * s, 8 * s); g.stroke();
    g.fillColor = new Color(255, 230, 160, 28);
    g.roundRect(-14 * s, 6 * s, 28 * s, 8 * s, 4 * s); g.fill();

    if (it.kind === 'heal') drawPotion(g, s, new Color(80, 220, 120));
    else if (it.id === 'bomb') drawBomb(g, s, new Color(40, 40, 45));
    else if (it.id === 'frost_bomb') drawBomb(g, s, new Color(120, 190, 240));
    else if (it.id === 'compass') drawCompass(g, s);
    else if (it.id === 'amulet') drawAmulet(g, s);
    else if (it.id === 'potion_shield') drawShield(g, s);
    else if (it.id === 'scroll_magnet') drawMagnet(g, s);
    else if (it.id === 'coin_pouch') drawPouch(g, s);
    else if (it.id === 'elixir_life') drawPotion(g, s, new Color(255, 200, 90));
    else if (it.id === 'potion_rage') drawPotion(g, s, new Color(255, 110, 90));
    else if (it.kind === 'buff') drawScroll(g, s, it.id === 'scroll_crit' ? new Color(230, 90, 90) : new Color(140, 90, 200));
    else drawPotion(g, s, new Color(200, 120, 255));
}

function accentFor(it: ConfigItem): Color {
    if (it.kind === 'heal') return new Color(120, 220, 150, 180);
    if (it.id === 'bomb') return new Color(255, 140, 80, 180);
    if (it.id === 'frost_bomb') return new Color(140, 210, 255, 190);
    if (it.id === 'potion_shield') return new Color(120, 200, 255, 190);
    if (it.id === 'coin_pouch' || it.id === 'elixir_life') return new Color(255, 210, 110, 190);
    if (it.kind === 'throw') return new Color(255, 180, 100, 180);
    if (it.rarity === 'epic') return new Color(220, 140, 255, 200);
    return new Color(180, 160, 255, 160);
}

function drawShield(g: Graphics, s: number) {
    g.fillColor = new Color(90, 160, 230, 255);
    g.moveTo(0, 12 * s); g.lineTo(11 * s, 6 * s); g.lineTo(9 * s, -6 * s);
    g.lineTo(0, -13 * s); g.lineTo(-9 * s, -6 * s); g.lineTo(-11 * s, 6 * s); g.close(); g.fill();
    g.fillColor = new Color(200, 230, 255, 220);
    g.moveTo(0, 8 * s); g.lineTo(6 * s, 4 * s); g.lineTo(5 * s, -4 * s);
    g.lineTo(0, -8 * s); g.lineTo(-5 * s, -4 * s); g.lineTo(-6 * s, 4 * s); g.close(); g.fill();
}

function drawMagnet(g: Graphics, s: number) {
    g.strokeColor = new Color(220, 70, 70, 255);
    g.lineWidth = 5 * s;
    g.arc(0, -2 * s, 9 * s, Math.PI, 0, false); g.stroke();
    g.fillColor = new Color(220, 70, 70, 255);
    g.rect(-11.5 * s, -8 * s, 5 * s, 8 * s); g.fill();
    g.rect(6.5 * s, -8 * s, 5 * s, 8 * s); g.fill();
    g.fillColor = new Color(220, 220, 230, 255);
    g.rect(-11.5 * s, -12 * s, 5 * s, 4 * s); g.fill();
    g.rect(6.5 * s, -12 * s, 5 * s, 4 * s); g.fill();
}

function drawPouch(g: Graphics, s: number) {
    g.fillColor = new Color(150, 100, 50, 255);
    g.ellipse(0, -3 * s, 11 * s, 10 * s); g.fill();
    g.fillColor = new Color(110, 70, 35, 255);
    g.roundRect(-6 * s, 6 * s, 12 * s, 5 * s, 2 * s); g.fill();
    g.fillColor = new Color(255, 215, 80, 255);
    g.circle(-3 * s, -3 * s, 3 * s); g.fill();
    g.circle(3 * s, -1 * s, 3 * s); g.fill();
}

function drawPotion(g: Graphics, s: number, col: Color) {
    g.fillColor = new Color(200, 210, 220, 255);
    g.roundRect(-4 * s, 6 * s, 8 * s, 6 * s, 2 * s); g.fill();
    g.fillColor = new Color(col.r, col.g, col.b, 220);
    g.ellipse(0, -2 * s, 10 * s, 12 * s); g.fill();
    g.fillColor = new Color(255, 255, 255, 160);
    g.circle(-3 * s, 2 * s, 2.5 * s); g.fill();
}

function drawBomb(g: Graphics, s: number, body: Color) {
    g.fillColor = new Color(body.r, body.g, body.b, 255);
    g.circle(0, -2 * s, 11 * s); g.fill();
    g.fillColor = new Color(Math.min(255, body.r + 40), Math.min(255, body.g + 40), Math.min(255, body.b + 45), 255);
    g.circle(-3 * s, 2 * s, 3 * s); g.fill();
    g.strokeColor = new Color(200, 160, 80, 255);
    g.lineWidth = 2;
    g.moveTo(0, 8 * s); g.lineTo(4 * s, 14 * s); g.stroke();
    g.fillColor = new Color(255, 120, 40, 255);
    g.circle(5 * s, 15 * s, 2.5 * s); g.fill();
}

function drawCompass(g: Graphics, s: number) {
    g.fillColor = new Color(220, 190, 120, 255);
    g.circle(0, 0, 11 * s); g.fill();
    g.fillColor = new Color(30, 40, 60, 255);
    g.circle(0, 0, 8 * s); g.fill();
    g.fillColor = new Color(255, 80, 80, 255);
    g.moveTo(0, 6 * s); g.lineTo(3 * s, 0); g.lineTo(0, -2 * s); g.lineTo(-3 * s, 0); g.close(); g.fill();
}

function drawAmulet(g: Graphics, s: number) {
    g.strokeColor = new Color(180, 160, 100, 255);
    g.lineWidth = 2;
    g.moveTo(0, 12 * s); g.lineTo(0, 4 * s); g.stroke();
    g.fillColor = new Color(160, 120, 80, 255);
    g.circle(0, 0, 8 * s); g.fill();
    g.fillColor = new Color(100, 180, 220, 255);
    g.circle(0, 0, 4 * s); g.fill();
}

function drawScroll(g: Graphics, s: number, ink: Color) {
    g.fillColor = new Color(230, 210, 160, 255);
    g.roundRect(-10 * s, -10 * s, 20 * s, 22 * s, 3 * s); g.fill();
    g.fillColor = new Color(ink.r, ink.g, ink.b, 255);
    g.rect(-6 * s, 2 * s, 12 * s, 2 * s); g.fill();
    g.rect(-6 * s, -2 * s, 10 * s, 2 * s); g.fill();
    g.rect(-6 * s, -6 * s, 8 * s, 2 * s); g.fill();
}
