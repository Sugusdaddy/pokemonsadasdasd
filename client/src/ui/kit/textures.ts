import Phaser from 'phaser';
import { BUTTONS, C, PANELS, type ButtonVariant, type PanelVariant } from './theme';

// Texturas de la UI dibujadas con canvas 2D (degradados, brillos, sombras) y usadas
// como nine-slice: se estiran a cualquier tamaño sin deformar las esquinas.

type Ctx = CanvasRenderingContext2D;
const hex = (c: number, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function canvasTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: Ctx) => void): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  draw(tex.getContext());
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
}

/** Medidas de las texturas y de sus cortes nine-slice. */
export const BTN = { w: 160, h: 112, r: 20, lip: 9, slice: { l: 28, r: 28, t: 30, b: 38 } };
export const PNL = { w: 160, h: 160, shadow: 8, slice: (r: number) => ({ l: r + 8, r: r + 8, t: r + 8, b: r + 16 }) };

export type ButtonState = 'normal' | 'hover' | 'pressed' | 'disabled';
export const btnKey = (v: ButtonVariant, s: ButtonState) => `ui_btn_${v}_${s}`;
export const pnlKey = (v: PanelVariant) => `ui_pnl_${v}`;

function lighten(c: number, f: number): number {
  const ch = (s: number) => Math.min(255, Math.round(((c >> s) & 255) + (255 - ((c >> s) & 255)) * f));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
function darken(c: number, f: number): number {
  const ch = (s: number) => Math.round(((c >> s) & 255) * (1 - f));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
function gray(c: number): number {
  const l = Math.round(0.3 * ((c >> 16) & 255) + 0.59 * ((c >> 8) & 255) + 0.11 * (c & 255));
  const m = Math.round(l * 0.75 + 30);
  return (m << 16) | (m << 8) | m;
}

function drawButton(ctx: Ctx, v: ButtonVariant, state: ButtonState): void {
  const { w, h, r, lip } = BTN;
  let top: number = BUTTONS[v].top,
    bottom: number = BUTTONS[v].bottom,
    rim: number = BUTTONS[v].rim;
  if (state === 'hover') {
    top = lighten(top, 0.18);
    bottom = lighten(bottom, 0.12);
  }
  if (state === 'disabled') {
    top = gray(top);
    bottom = gray(bottom);
    rim = gray(rim);
  }
  const press = state === 'pressed' ? lip - 3 : 0;
  // sombra suave
  ctx.fillStyle = hex(C.ink, 0.35);
  roundRect(ctx, 3, 8, w - 6, h - 8, r + 2);
  ctx.fill();
  // contorno y "labio" inferior (da volumen)
  ctx.fillStyle = hex(C.ink);
  roundRect(ctx, 2, 2 + press, w - 4, h - 6 - press, r + 2);
  ctx.fill();
  ctx.fillStyle = hex(darken(bottom, 0.35));
  roundRect(ctx, 5, 5 + press, w - 10, h - 12 - press, r);
  ctx.fill();
  // cara del botón con degradado
  const faceH = h - 12 - lip;
  const g = ctx.createLinearGradient(0, 5 + press, 0, 5 + press + faceH);
  g.addColorStop(0, hex(top));
  g.addColorStop(1, hex(bottom));
  ctx.fillStyle = g;
  roundRect(ctx, 5, 5 + press, w - 10, faceH, r);
  ctx.fill();
  // brillo superior
  const gl = ctx.createLinearGradient(0, 8 + press, 0, 8 + press + faceH * 0.5);
  gl.addColorStop(0, 'rgba(255,255,255,0.45)');
  gl.addColorStop(1, 'rgba(255,255,255,0.05)');
  ctx.fillStyle = gl;
  roundRect(ctx, 10, 9 + press, w - 20, faceH * 0.46, r - 6);
  ctx.fill();
  // filo de luz
  ctx.strokeStyle = hex(rim, 0.7);
  ctx.lineWidth = 2;
  roundRect(ctx, 6.5, 6.5 + press, w - 13, faceH - 3, r - 1);
  ctx.stroke();
}

function drawPanel(ctx: Ctx, v: PanelVariant): void {
  const { w, h, shadow } = PNL;
  const p = PANELS[v];
  const r = p.radius;
  ctx.fillStyle = hex(C.ink, 0.4);
  roundRect(ctx, 2, shadow, w - 4, h - shadow, r + 2);
  ctx.fill();
  ctx.fillStyle = hex(p.border);
  roundRect(ctx, 1, 1, w - 2, h - shadow - 1, r + 3);
  ctx.fill();
  const g = ctx.createLinearGradient(0, 4, 0, h - shadow - 4);
  g.addColorStop(0, hex(p.top));
  g.addColorStop(1, hex(p.bottom));
  ctx.fillStyle = g;
  roundRect(ctx, 4, 4, w - 8, h - shadow - 8, r);
  ctx.fill();
  if (v !== 'inset') {
    const gl = ctx.createLinearGradient(0, 6, 0, 46);
    gl.addColorStop(0, 'rgba(255,255,255,0.14)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl;
    roundRect(ctx, 8, 7, w - 16, 40, r - 4);
    ctx.fill();
  } else {
    // sombra interior
    const gi = ctx.createLinearGradient(0, 4, 0, 24);
    gi.addColorStop(0, 'rgba(0,0,0,0.35)');
    gi.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gi;
    roundRect(ctx, 4, 4, w - 8, 30, r);
    ctx.fill();
  }
  ctx.strokeStyle = hex(p.rim, v === 'inset' ? 0.5 : 0.55);
  ctx.lineWidth = 2;
  roundRect(ctx, 5.5, 5.5, w - 11, h - shadow - 11, r - 1);
  ctx.stroke();
}

/** Brillo radial (para fondos, luces de rareza y destellos). */
function drawGlow(ctx: Ctx, size: number): void {
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

/** Crea todas las texturas de la UI (una vez, en el arranque). */
export function createKitTextures(scene: Phaser.Scene): void {
  for (const v of Object.keys(BUTTONS) as ButtonVariant[]) {
    for (const s of ['normal', 'hover', 'pressed', 'disabled'] as ButtonState[]) {
      canvasTexture(scene, btnKey(v, s), BTN.w, BTN.h, (ctx) => drawButton(ctx, v, s));
    }
  }
  for (const v of Object.keys(PANELS) as PanelVariant[]) {
    canvasTexture(scene, pnlKey(v), PNL.w, PNL.h, (ctx) => drawPanel(ctx, v));
  }
  canvasTexture(scene, 'ui_glow', 256, 256, (ctx) => drawGlow(ctx, 256));
  // fondo del menú: degradado vertical (se estira a la pantalla)
  canvasTexture(scene, 'ui_bg', 4, 512, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, hex(C.bg2));
    g.addColorStop(0.55, hex(C.bg1));
    g.addColorStop(1, hex(C.bg0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 512);
  });
  // patrón diagonal sutil
  canvasTexture(scene, 'ui_stripes', 64, 64, (ctx) => {
    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth = 14;
    for (let i = -64; i < 128; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 64);
      ctx.lineTo(i + 64, 0);
      ctx.stroke();
    }
  });
  // relleno de barras (blanco con volumen; se tiñe del color que toque)
  canvasTexture(scene, 'ui_pill', 64, 32, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.5, 'rgba(235,235,235,1)');
    g.addColorStop(1, 'rgba(190,190,190,1)');
    ctx.fillStyle = g;
    roundRect(ctx, 0, 0, 64, 32, 14);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    roundRect(ctx, 5, 3, 54, 9, 5);
    ctx.fill();
  });
  // gota de elixir
  canvasTexture(scene, 'ui_drop', 64, 80, (ctx) => {
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(32, 4);
      ctx.bezierCurveTo(44, 24, 58, 38, 58, 52);
      ctx.arc(32, 52, 26, 0, Math.PI, false);
      ctx.bezierCurveTo(6, 38, 20, 24, 32, 4);
      ctx.closePath();
    };
    ctx.lineWidth = 6;
    ctx.strokeStyle = hex(C.ink);
    path();
    ctx.stroke();
    const g = ctx.createLinearGradient(0, 4, 0, 78);
    g.addColorStop(0, '#ff9cf6');
    g.addColorStop(0.5, hex(C.elixir));
    g.addColorStop(1, '#7a1a9e');
    ctx.fillStyle = g;
    path();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(22, 48, 6, 11, -0.4, 0, Math.PI * 2);
    ctx.fill();
  });
  // rayos de luz (pantalla de victoria, aperturas)
  canvasTexture(scene, 'ui_rays', 512, 512, (ctx) => {
    ctx.translate(256, 256);
    for (let i = 0; i < 16; i++) {
      ctx.rotate((Math.PI * 2) / 16);
      const g = ctx.createLinearGradient(0, 0, 0, -256);
      g.addColorStop(0, 'rgba(255,255,255,0.5)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-26, -256);
      ctx.lineTo(26, -256);
      ctx.closePath();
      ctx.fill();
    }
  });
  // viñeta para oscurecer bordes
  canvasTexture(scene, 'ui_vignette', 256, 256, (ctx) => {
    const g = ctx.createRadialGradient(128, 128, 60, 128, 128, 180);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  });
}
