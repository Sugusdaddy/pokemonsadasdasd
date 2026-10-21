import type Phaser from 'phaser';
import { COLORS } from '@arena/shared';
import { L } from '../layout';
import { t } from '../i18n';
import * as kit from './kit';

// Ayudantes de UI de toda la vida, ahora dibujados con el sistema de diseño (ui/kit).
// Las pantallas siguen llamando a txt/button/panel igual; para piezas nuevas, usa kit directamente.

type Scene = Phaser.Scene;
type Txt = Phaser.GameObjects.Text;

export interface TxtOpts extends Phaser.Types.GameObjects.Text.TextStyle {
  originX?: number;
  originY?: number;
}

/** Texto de títulos y etiquetas (fuente de display con contorno y sombra). */
export function txt(
  scene: Scene,
  x: number,
  y: number,
  str: string,
  size = 24,
  color = '#ffffff',
  opts: TxtOpts = {},
): Txt {
  const noStroke = opts.strokeThickness === 0;
  const o = kit.text(scene, x, y, str, 'label', color, { size, dropShadow: !noStroke, ...opts });
  if (noStroke) o.setStroke('#000000', 0);
  return o;
}

/** Texto de cuerpo (frases largas, descripciones): fuente legible sin contorno. */
export function body(
  scene: Scene,
  x: number,
  y: number,
  str: string,
  size = 20,
  color = '#dfe4ff',
  opts: TxtOpts = {},
): Txt {
  return kit.text(scene, x, y, str, 'body', color, { size, ...opts });
}

/**
 * Posición vertical de pantallas centradas (Boot, Online, apertura de Pokéball) diseñadas
 * para el lienzo de móvil (1280 de alto): en PC se comprime al alto de 1080.
 */
export const sy = (y: number): number => (L.pc ? Math.round((y * L.h) / 1280) : y);

export const shade = (c: number, f: number): number => {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * f));
  const b = Math.min(255, Math.round((c & 255) * f));
  return (r << 16) | (g << 8) | b;
};

export type Button = kit.Button;

/** Color de botón antiguo → variante del sistema de diseño. */
function buttonVariant(color: number): kit.ButtonVariant {
  if (color === COLORS.green) return 'success';
  if (color === COLORS.red) return 'danger';
  if (color === COLORS.blue) return 'info';
  if (color === COLORS.orange || color === 0xf2b01b || color === COLORS.gold) return 'primary';
  return 'neutral';
}

/** Botón con volumen, brillo y estados (hover, pulsado, deshabilitado). */
export function button(
  scene: Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  color: number,
  onClick: () => void,
  size = 34,
  opts: { icon?: string; hotkey?: string } = {},
): Button {
  return kit.button(scene, x, y, w, h, label, buttonVariant(color), onClick, { size, ...opts });
}

/** Color de panel antiguo → variante del sistema de diseño. */
function panelVariant(color: number): kit.PanelVariant {
  const r = (color >> 16) & 255,
    g = (color >> 8) & 255,
    b = color & 255;
  if (color === COLORS.panelDark || color === 0x23284d) return 'dark';
  if (g > r * 1.3 && g > b) return 'green';
  if (r > g * 1.6 && r > b * 1.4) return 'red';
  if (r > b && g > b) return 'gold';
  if (b > 0x80 && b > r * 1.6) return 'light';
  return 'card';
}

/** Panel con borde, degradado, brillo y sombra (nine-slice). x, y = esquina superior izquierda. */
export function panel(scene: Scene, x: number, y: number, w: number, h: number, color = COLORS.panel, _radius = 18) {
  return kit.panel(scene, x, y, w, h, panelVariant(color));
}

function crownPts(x: number, y: number, s: number) {
  return [
    { x: x - s, y: y + s * 0.6 },
    { x: x - s, y: y - s * 0.5 },
    { x: x - s * 0.5, y },
    { x, y: y - s * 0.8 },
    { x: x + s * 0.5, y },
    { x: x + s, y: y - s * 0.5 },
    { x: x + s, y: y + s * 0.6 },
  ];
}

export function drawCrown(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, color: number): void {
  g.fillStyle(kit.C.ink, 0.45);
  g.fillPoints(crownPts(x, y + Math.max(3, s * 0.18), s + 2), true);
  g.fillStyle(kit.C.ink);
  g.fillPoints(crownPts(x, y + 1, s + 3), true);
  g.fillStyle(color);
  g.fillPoints(crownPts(x, y, s), true);
  // brillo
  g.fillStyle(0xffffff, 0.3);
  g.fillTriangle(x - s * 0.85, y + s * 0.1, x - s * 0.85, y - s * 0.35, x - s * 0.35, y + s * 0.1);
}

export function fmtTime(sec: number): string {
  sec = Math.ceil(sec);
  if (sec <= 0) return t('time.ready');
  const h = Math.floor(sec / 3600),
    m = Math.floor((sec % 3600) / 60),
    s = sec % 60;
  if (h) return t('time.hm', { h, m });
  if (m) return t('time.ms', { m, s: String(s).padStart(2, '0') });
  return t('time.s', { s });
}

export const fmtNum = (n: number): string =>
  n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : String(Math.floor(n));

export const cssColor = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/** Hexágono de nivel (estilo escudo). */
export function levelBadge(
  scene: Scene,
  x: number,
  y: number,
  level: number,
  size = 26,
): [Phaser.GameObjects.Graphics, Txt] {
  const g = scene.add.graphics();
  const pts = (r: number) =>
    Array.from({ length: 6 }, (_, i) => ({
      x: x + Math.cos(Math.PI / 6 + (i * Math.PI) / 3) * r,
      y: y + Math.sin(Math.PI / 6 + (i * Math.PI) / 3) * r,
    }));
  g.fillStyle(kit.C.ink, 0.4).fillPoints(
    pts(size + 4).map((p) => ({ x: p.x, y: p.y + 4 })),
    true,
  );
  g.fillStyle(kit.C.ink).fillPoints(pts(size + 4), true);
  g.fillStyle(0x2a6fe0).fillPoints(pts(size), true);
  g.fillStyle(0x6fc0ff).fillPoints(
    pts(size * 0.82).map((p) => ({ x: p.x, y: p.y - size * 0.08 })),
    true,
  );
  g.fillStyle(0xffffff, 0.22).fillPoints(
    pts(size * 0.6).map((p) => ({ x: p.x, y: p.y - size * 0.18 })),
    true,
  );
  const tt = txt(scene, x, y, String(level), size * 0.95);
  return [g, tt];
}
