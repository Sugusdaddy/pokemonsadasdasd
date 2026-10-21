import { FONT, COLORS } from '../config.js';
import { Sfx } from '../systems/Sfx.js';

export function txt(scene, x, y, str, size = 24, color = '#ffffff', opts = {}) {
  const { originX, originY, ...style } = opts;
  const t = scene.add.text(x, y, str, {
    fontFamily: FONT,
    fontSize: `${size}px`,
    color,
    stroke: '#14122b',
    strokeThickness: Math.max(2, Math.round(size / 6)),
    align: 'center',
    ...style,
  });
  t.setOrigin(originX ?? 0.5, originY ?? 0.5);
  return t;
}

const shade = (c, f) => {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * f));
  const b = Math.min(255, Math.round((c & 255) * f));
  return (r << 16) | (g << 8) | b;
};

/** Botón "gordito" con sombra, brillo, sonido y animación de pulsado. */
export function button(scene, x, y, w, h, label, color, onClick, size = 34, opts = {}) {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  const draw = (pressed) => {
    g.clear();
    const oy = pressed ? 4 : 0;
    g.fillStyle(COLORS.panelDark).fillRoundedRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 12, 18);
    g.fillStyle(shade(color, 0.6)).fillRoundedRect(-w / 2, -h / 2 + 6, w, h, 16);
    g.fillStyle(color).fillRoundedRect(-w / 2, -h / 2 + oy, w, h - 2, 16);
    g.fillStyle(0xffffff, 0.28).fillRoundedRect(-w / 2 + 6, -h / 2 + 4 + oy, w - 12, h * 0.36, 12);
  };
  draw(false);
  c.add(g);
  let ix = 0;
  if (opts.icon) {
    const ic = scene.add.image(-w / 2 + h * 0.55, 0, opts.icon).setDisplaySize(h * 0.6, h * 0.6);
    c.add(ic);
    ix = h * 0.25;
  }
  const t = txt(scene, ix, 0, label, size);
  c.add(t);
  c.label = t;
  c.setSize(w, h).setInteractive({ useHandCursor: true });
  c.on('pointerdown', () => { draw(true); t.y = 4; });
  c.on('pointerout', () => { draw(false); t.y = 0; });
  c.on('pointerup', () => {
    draw(false); t.y = 0;
    if (c.disabled) { Sfx.play('noElixir'); return; }
    Sfx.play('click');
    onClick();
  });
  c.setDisabled = (v) => { c.disabled = v; c.setAlpha(v ? 0.55 : 1); return c; };
  return c;
}

export function panel(scene, x, y, w, h, color = COLORS.panel, radius = 18) {
  const g = scene.add.graphics();
  g.fillStyle(COLORS.panelDark).fillRoundedRect(x - 3, y - 3, w + 6, h + 9, radius + 2);
  g.fillStyle(color).fillRoundedRect(x, y, w, h, radius);
  g.fillStyle(0xffffff, 0.08).fillRoundedRect(x + 4, y + 4, w - 8, Math.min(30, h * 0.3), radius - 4);
  return g;
}

export function drawCrown(g, x, y, s, color) {
  g.fillStyle(COLORS.panelDark);
  g.fillPoints(crownPts(x, y + 2, s + 2), true);
  g.fillStyle(color);
  g.fillPoints(crownPts(x, y, s), true);
}

function crownPts(x, y, s) {
  return [
    { x: x - s, y: y + s * 0.6 }, { x: x - s, y: y - s * 0.5 }, { x: x - s * 0.5, y },
    { x, y: y - s * 0.8 }, { x: x + s * 0.5, y }, { x: x + s, y: y - s * 0.5 }, { x: x + s, y: y + s * 0.6 },
  ];
}

export function fmtTime(sec) {
  sec = Math.ceil(sec);
  if (sec <= 0) return '¡Lista!';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

export const fmtNum = (n) => (n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : String(Math.floor(n)));

/** Hexágono de nivel (estilo escudo). */
export function levelBadge(scene, x, y, level, size = 26) {
  const g = scene.add.graphics();
  const pts = (r) => Array.from({ length: 6 }, (_, i) => ({ x: x + Math.cos(Math.PI / 6 + (i * Math.PI) / 3) * r, y: y + Math.sin(Math.PI / 6 + (i * Math.PI) / 3) * r }));
  g.fillStyle(COLORS.panelDark).fillPoints(pts(size + 4), true);
  g.fillStyle(0x3a7cff).fillPoints(pts(size), true);
  g.fillStyle(0xffffff, 0.2).fillPoints(pts(size * 0.7).map((p) => ({ x: p.x, y: p.y - 3 })), true);
  const t = txt(scene, x, y, String(level), size * 0.95);
  return [g, t];
}
