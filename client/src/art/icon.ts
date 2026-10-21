import { INK, Pix, shade } from './pixel';
import { kingTower, teamCols } from './towers';
import { COLORS } from '@arena/shared';

// ─────────────────────────────────────────────────────────────
//  ICONO DE LA APP (pantalla de inicio, PWA, pestaña del navegador): la torre del rey
//  azul sobre un fondo de rayos. Arte propio como el resto; lo genera `npm run icons`.
// ─────────────────────────────────────────────────────────────

const RAYS = [0x1d2357, 0x262e73];
const HALO = 0xffc93c;

/** Copia una rejilla sobre otra (lo transparente no pisa). */
function stamp(dst: Pix, src: Pix, ox: number, oy: number): void {
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      const c = src.get(x, y);
      if (c !== -1) dst.set(ox + x, oy + y, c);
    }
}

/**
 * Icono de `size` celdas de lado (96: la torre cabe en la zona segura de un icono "maskable";
 * 64: la torre ocupa casi todo, para el favicon, que se ve diminuto).
 * - `rounded`: cuadrado redondeado con borde (iconos normales).
 * - si no: fondo a sangre (Android recorta un círculo o la forma que quiera; iOS redondea él).
 */
export function appIcon(size: number, rounded: boolean): Pix {
  const p = new Pix(size, size, 3);
  const c = (size - 1) / 2;
  // rayos que salen del centro, más oscuros hacia fuera
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const a = Math.atan2(y - c, x - c) + Math.PI;
      const d = Math.min(1, Math.hypot(x - c, y - c) / (size * 0.62));
      p.set(x, y, shade(RAYS[Math.floor((a / (2 * Math.PI)) * 16) % 2], -0.45 * d));
    }
  // halo dorado detrás de la torre (anillos con trama para que se funda con el fondo)
  const r = size * 0.36;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c);
      if (d < r * 0.7) p.set(x, y, shade(HALO, -0.62));
      else if (d < r * 0.85 || (d < r && (x + y) % 2 === 0)) p.set(x, y, shade(HALO, -0.72));
    }

  const tower = kingTower(teamCols(COLORS.player), false);
  const ox = Math.round((size - tower.w) / 2);
  const big = size >= 96;
  const tall = 46; // la torre dibujada ocupa las 46 filas de arriba de su rejilla
  const oy = big ? Math.round((size - tall) / 2) : size - tall - 3;
  // sombra en el suelo
  p.ellipse(ox + tower.w / 2, oy + tall - 1, tower.w / 2 + 3, 2, shade(RAYS[0], -0.6));
  stamp(p, tower, ox, oy);
  // destellos (solo si hay sitio alrededor de la torre)
  if (big)
    for (const [sx, sy] of [
      [0.16, 0.2],
      [0.84, 0.26],
      [0.12, 0.62],
    ])
      sparkle(p, Math.round(sx * size), Math.round(sy * size));

  if (rounded) roundCorners(p, Math.round(size * 0.16));
  return p;
}

function sparkle(p: Pix, x: number, y: number): void {
  p.set(x, y, 0xffffff)
    .set(x - 1, y, HALO)
    .set(x + 1, y, HALO)
    .set(x, y - 1, HALO)
    .set(x, y + 1, HALO);
}

/** Recorta las esquinas en cuarto de círculo y pone el borde de tinta con un filo claro. */
function roundCorners(p: Pix, rad: number): void {
  const inside = (x: number, y: number) => {
    const cx = Math.min(Math.max(x, rad), p.w - 1 - rad),
      cy = Math.min(Math.max(y, rad), p.h - 1 - rad);
    return Math.hypot(x - cx, y - cy) <= rad + 0.3;
  };
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (!inside(x, y)) p.clear(x, y);
  // borde: tinta por fuera y una línea clara justo dentro (solo junto al borde, no junto al
  // contorno de la torre, que también es tinta)
  const out = (x: number, y: number) => p.get(x, y) === -1;
  const edge = new Set<number>();
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++)
      if (!out(x, y) && (out(x - 1, y) || out(x + 1, y) || out(x, y - 1) || out(x, y + 1))) edge.add(y * p.w + x);
  const isEdge = (x: number, y: number) => p.inside(x, y) && edge.has(y * p.w + x);
  const rim: Array<[number, number]> = [];
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++)
      if (!out(x, y) && !isEdge(x, y) && (isEdge(x - 1, y) || isEdge(x + 1, y) || isEdge(x, y - 1) || isEdge(x, y + 1)))
        rim.push([x, y]);
  for (const i of edge) p.data[i] = INK;
  for (const [x, y] of rim) p.set(x, y, 0x4b56b8);
}
