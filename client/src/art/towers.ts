import type Phaser from 'phaser';
import { COLORS } from '@arena/shared';
import { INK, Pix, shade } from './pixel';

// ─────────────────────────────────────────────────────────────
//  TORRES en pixel art (rejilla a la mitad; textura a 2x).
//  Tamaños fijos para que el guardián siga de pie arriba: rey 56×52 (112×104),
//  princesa 42×42 (84×84) y escombros 44×36 (88×72). Cada torre tiene versión
//  dañada (por debajo de media vida) para los dos equipos.
// ─────────────────────────────────────────────────────────────

const STONE = { base: 0xa9abba, light: 0xd2d4e0, dark: 0x7d7f92, mortar: 0x5b5d70, deep: 0x3d3f52 };
const GOLD = { base: 0xffc93c, light: 0xfff1b8, dark: 0xd9921a };
const WOOD = { base: 0x8a5a2b, light: 0xb07a3e, dark: 0x5a3818 };
const HOLE = 0x241f33;

export interface TeamCols {
  base: number;
  light: number;
  dark: number;
}
export const teamCols = (c: number): TeamCols => ({ base: c, light: shade(c, 0.4), dark: shade(c, -0.4) });

/** Muro de ladrillos con luz arriba a la izquierda y sombra a la derecha. */
function bricks(p: Pix, x: number, y: number, w: number, h: number, s = STONE): void {
  p.rect(x, y, w, h, s.base);
  for (let row = 0; row * 3 < h; row++) {
    const ry = y + row * 3;
    if (row > 0) p.hline(x, ry, w, s.mortar); // junta horizontal
    const off = row % 2 ? 3 : 0;
    const jh = Math.min(2, y + h - ry - 1); // la última fila puede ser más baja: no salirse del muro
    for (let bx = x + off; bx < x + w; bx += 6) {
      if (jh <= 0) break;
      if (bx > x) p.vline(bx, ry + 1, jh, s.mortar); // junta vertical
      if (bx + 1 < x + w) p.set(bx + 1, ry + 1, s.light); // brillo del ladrillo
    }
  }
  p.speckle(x, y, w, h, s.dark, 0.06);
  // volumen: borde izquierdo claro, derecho oscuro
  p.recolor(x, y, 2, h, s.base, s.light);
  p.recolor(x + w - 3, y, 3, h, s.base, s.dark);
  p.recolor(x + w - 3, y, 3, h, s.light, s.base);
}

/** Almenas: bloques de `mw` separados por huecos de `gap`. */
function merlons(p: Pix, x: number, y: number, w: number, h: number, mw = 5, gap = 3, s = STONE): void {
  for (let mx = x; mx < x + w; mx += mw + gap) {
    const ww = Math.min(mw, x + w - mx);
    p.rect(mx, y, ww, h, s.base);
    p.hline(mx, y, ww, s.light);
    p.vline(mx + ww - 1, y + 1, h - 1, s.dark);
  }
}

/** Puerta en arco de madera con herrajes. */
function door(p: Pix, cx: number, top: number, bottom: number, half: number): void {
  for (let y = top; y <= bottom; y++) {
    const t = y - top;
    const hw = t < half ? Math.round(Math.sqrt(half * half - (half - t) * (half - t))) : half;
    p.hline(cx - hw, y, hw * 2, WOOD.base);
  }
  for (let x = cx - half + 2; x < cx + half; x += 3) p.vline(x, top + 2, bottom - top - 1, WOOD.dark);
  p.hline(cx - half, top + Math.round((bottom - top) * 0.45), half * 2, INK);
  p.hline(cx - half, bottom - 2, half * 2, INK);
  p.set(cx + half - 3, top + Math.round((bottom - top) * 0.65), GOLD.base);
}

/** Estandarte colgante con punta de flecha. */
function banner(p: Pix, x: number, y: number, w: number, h: number, t: TeamCols, torn = false): void {
  const hh = torn ? Math.round(h * 0.55) : h;
  p.rect(x, y, w, hh, t.base);
  p.vline(x, y, hh, t.light);
  p.vline(x + w - 1, y, hh, t.dark);
  if (!torn) {
    for (let i = 0; i < Math.ceil(w / 2); i++) {
      p.set(x + i, y + h + i, t.base);
      p.set(x + w - 1 - i, y + h + i, t.dark);
    }
  } else {
    for (let i = 0; i < w; i += 2) p.set(x + i, y + hh, t.dark); // borde roto
  }
  p.set(x + Math.floor(w / 2), y + 2, GOLD.base);
  p.set(x + Math.floor(w / 2), y + 3, GOLD.dark);
}

/** Corona dorada (emblema del rey). */
function crown(p: Pix, cx: number, y: number): void {
  p.rect(cx - 5, y + 3, 11, 4, GOLD.base);
  for (const dx of [-5, 0, 5]) p.vline(cx + dx, y, 3, GOLD.base);
  p.set(cx - 5, y - 1, GOLD.light)
    .set(cx, y - 1, GOLD.light)
    .set(cx + 5, y - 1, GOLD.light);
  p.hline(cx - 5, y + 6, 11, GOLD.dark);
  p.set(cx - 2, y + 4, 0xe0454f)
    .set(cx + 2, y + 4, 0x3aa0ff)
    .set(cx, y + 4, 0x44d17a);
}

/** Tejado cónico de torreón, del color del equipo. */
function roof(p: Pix, cx: number, top: number, bottom: number, half: number, t: TeamCols): void {
  for (let y = top; y <= bottom; y++) {
    const hw = Math.round(((y - top) / (bottom - top)) * half);
    p.hline(cx - hw, y, hw, t.light);
    p.hline(cx, y, hw + 1, t.dark);
  }
  p.hline(cx - half, bottom, half * 2 + 1, t.base);
  p.vline(cx, top - 3, 3, GOLD.base);
  p.set(cx, top - 4, GOLD.light);
}

/** Daños: grietas, ladrillos que faltan y quemaduras. */
function damage(p: Pix, x: number, y: number, w: number, h: number, cracks: number): void {
  for (let i = 0; i < cracks; i++) {
    let cx = x + p.rng.int(2, w - 3),
      cy = y + p.rng.int(0, Math.floor(h / 2));
    const len = p.rng.int(5, 10);
    for (let k = 0; k < len; k++) {
      p.set(cx, cy, STONE.deep);
      cy += 1;
      cx += p.rng.int(-1, 1);
    }
  }
  for (let i = 0; i < cracks; i++) p.rect(x + p.rng.int(2, w - 5), y + p.rng.int(2, h - 5), 2, 2, HOLE);
  p.speckle(x, y + Math.floor(h * 0.5), w, Math.ceil(h * 0.5), 0x4a4458, 0.07);
}

export function kingTower(t: TeamCols, damaged: boolean): Pix {
  const p = new Pix(56, 52, damaged ? 77 : 7);
  // cimientos
  bricks(p, 1, 40, 54, 4, { ...STONE, base: STONE.dark, light: STONE.base, dark: STONE.mortar });
  // muro central con almenas
  bricks(p, 10, 13, 36, 28);
  merlons(p, 11, 8, 34, 5);
  p.hline(10, 13, 36, STONE.deep);
  // torreones laterales con tejado
  for (const tx of [1, 43]) {
    bricks(p, tx, 12, 12, 29);
    roof(p, tx + 6, 3, 12, 7, t);
    p.rect(tx + 4, 20, 4, 6, HOLE); // ventana
    p.hline(tx + 4, 19, 4, STONE.light);
    p.set(tx + 5, 21, t.light);
  }
  // franja del equipo, corona y puerta
  p.rect(10, 14, 36, 3, t.base);
  p.hline(10, 14, 36, t.light);
  p.hline(10, 16, 36, t.dark);
  crown(p, 28, 19);
  door(p, 28, 29, 40, 5);
  if (damaged) {
    damage(p, 10, 17, 36, 22, 4);
    damage(p, 1, 14, 12, 26, 1);
    damage(p, 43, 14, 12, 26, 1);
    // almenas rotas
    p.rect(19, 8, 5, 5, -1);
    p.rect(35, 8, 3, 3, -1);
    p.rect(44, 10, 4, 3, -1);
  }
  return p.outline();
}

function princessTower(t: TeamCols, damaged: boolean): Pix {
  const p = new Pix(42, 42, damaged ? 55 : 5);
  bricks(p, 3, 32, 36, 4, { ...STONE, base: STONE.dark, light: STONE.base, dark: STONE.mortar });
  bricks(p, 7, 11, 28, 22);
  merlons(p, 6, 5, 30, 6, 4, 3);
  p.hline(6, 11, 30, STONE.deep);
  // franja del equipo y estandartes
  p.rect(7, 12, 28, 2, t.base);
  p.hline(7, 12, 28, t.light);
  banner(p, 9, 14, 4, 8, t, damaged);
  banner(p, 29, 14, 4, 8, t);
  // aspilleras y puerta
  p.rect(20, 16, 2, 5, HOLE);
  p.set(20, 15, STONE.light).set(21, 15, STONE.light);
  door(p, 21, 25, 32, 4);
  if (damaged) {
    damage(p, 7, 14, 28, 18, 3);
    p.rect(13, 5, 4, 4, -1);
    p.rect(27, 5, 3, 3, -1);
  }
  return p.outline();
}

function rubble(): Pix {
  const p = new Pix(44, 36, 3);
  // montón de piedras
  p.ellipse(22, 27, 20, 6, STONE.dark);
  p.ellipse(21, 25, 16, 5, STONE.base);
  p.speckle(2, 20, 40, 14, STONE.mortar, 0.18);
  // resto de muro a la izquierda, con el borde roto
  bricks(p, 6, 13, 13, 14);
  for (let x = 6; x < 19; x++) {
    const cut = 13 + [0, 0, 1, 3, 2, 5, 7, 6, 8, 10, 9, 11, 12][x - 6];
    for (let y = 13; y < cut; y++) p.clear(x, y);
  }
  // bloques sueltos encima y alrededor
  for (const [x, y, w, h] of [
    [20, 18, 7, 5],
    [27, 21, 6, 4],
    [16, 23, 5, 3],
    [33, 25, 6, 4],
    [3, 26, 5, 3],
    [24, 26, 4, 3],
  ]) {
    p.rect(x, y, w, h, STONE.base);
    p.hline(x, y, w, STONE.light);
    p.vline(x + w - 1, y + 1, h - 1, STONE.dark);
    p.hline(x, y + h - 1, w - 1, STONE.mortar);
  }
  // una almena caída
  p.rect(30, 15, 5, 5, STONE.base);
  p.hline(30, 15, 5, STONE.light);
  p.vline(34, 16, 4, STONE.dark);
  p.speckle(4, 22, 38, 10, 0x4a4458, 0.08);
  return p.outline();
}

/** Crea todas las texturas de torres (las de antes se sustituyen). */
export function createTowerArt(scene: Phaser.Scene): void {
  for (const [side, col] of [
    ['player', COLORS.player],
    ['enemy', COLORS.enemy],
  ] as const) {
    const t = teamCols(col);
    kingTower(t, false).toTexture(scene, `tower_king_${side}`);
    kingTower(t, true).toTexture(scene, `tower_king_${side}_dmg`);
    princessTower(t, false).toTexture(scene, `tower_princess_${side}`);
    princessTower(t, true).toTexture(scene, `tower_princess_${side}_dmg`);
  }
  rubble().toTexture(scene, 'tower_rubble');
}
