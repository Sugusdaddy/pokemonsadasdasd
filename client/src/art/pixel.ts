import type Phaser from 'phaser';
import { Rng } from '@arena/shared';

// ─────────────────────────────────────────────────────────────
//  PIXEL ART PROPIO dibujado por código.
//  Se pinta en una rejilla pequeña (1 celda = 1 píxel del diseño) y se convierte en
//  textura a 2x con píxeles duros. Todo el arte de torres y decorados sale de aquí:
//  sin imágenes externas, sin licencias de terceros.
// ─────────────────────────────────────────────────────────────

/** Contorno de todo el pixel art (tinta azul muy oscura, igual que la UI). */
export const INK = 0x14122b;

/** Aclara (k > 0) u oscurece (k < 0) un color, k en [-1, 1]. */
export function shade(c: number, k: number): number {
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))));
  return (ch((c >> 16) & 255) << 16) | (ch((c >> 8) & 255) << 8) | ch(c & 255);
}

const isCanvas = (t: Phaser.Textures.Texture | null): t is Phaser.Textures.CanvasTexture => !!t && 'getContext' in t;

/** Rejilla de píxeles con utilidades de dibujo. -1 = transparente. */
export class Pix {
  readonly data: Int32Array;
  readonly rng: Rng;

  constructor(
    readonly w: number,
    readonly h: number,
    seed = 1,
  ) {
    this.data = new Int32Array(w * h).fill(-1);
    this.rng = new Rng(seed);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  get(x: number, y: number): number {
    return this.inside(x, y) ? this.data[y * this.w + x] : -1;
  }

  set(x: number, y: number, c: number): this {
    x = Math.round(x);
    y = Math.round(y);
    if (this.inside(x, y)) this.data[y * this.w + x] = c;
    return this;
  }

  /** Borra un píxel (transparente). */
  clear(x: number, y: number): this {
    return this.set(x, y, -1);
  }

  rect(x: number, y: number, w: number, h: number, c: number): this {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
    return this;
  }

  hline(x: number, y: number, w: number, c: number): this {
    return this.rect(x, y, w, 1, c);
  }

  vline(x: number, y: number, h: number, c: number): this {
    return this.rect(x, y, 1, h, c);
  }

  /** Línea de Bresenham. */
  line(x0: number, y0: number, x1: number, y1: number, c: number): this {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0),
      dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1,
      sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
    return this;
  }

  /** Elipse rellena (centro y radios). */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: number): this {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx,
          dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c);
      }
    return this;
  }

  circle(cx: number, cy: number, r: number, c: number): this {
    return this.ellipse(cx, cy, r, r, c);
  }

  /** Polígono relleno (puntos en orden). */
  poly(pts: Array<[number, number]>, c: number): this {
    const ys = pts.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i],
          [x1, y1] = pts[(i + 1) % pts.length];
        if (y0 === y1) continue;
        if ((y >= y0 && y < y1) || (y >= y1 && y < y0)) xs.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2)
        for (let x = Math.round(xs[i]); x <= Math.round(xs[i + 1]); x++) this.set(x, y, c);
    }
    return this;
  }

  /** Cambia un color por otro solo donde ya hay ese color (dentro de una zona). */
  recolor(x: number, y: number, w: number, h: number, from: number, to: number): this {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (this.get(i, j) === from) this.set(i, j, to);
    return this;
  }

  /** Salpica `c` sobre los píxeles ya pintados de una zona (textura, desgaste). */
  speckle(x: number, y: number, w: number, h: number, c: number, density: number): this {
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++) if (this.get(i, j) !== -1 && this.rng.chance(density)) this.set(i, j, c);
    return this;
  }

  /** Tramado en damero (degradados de pixel art). */
  dither(x: number, y: number, w: number, h: number, c: number): this {
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++) if ((i + j) % 2 === 0 && this.get(i, j) !== -1) this.set(i, j, c);
    return this;
  }

  /** Contorno de 1 píxel alrededor de todo lo pintado. */
  outline(c = INK): this {
    const add: number[] = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y) !== -1) continue;
        if (
          this.get(x - 1, y) !== -1 ||
          this.get(x + 1, y) !== -1 ||
          this.get(x, y - 1) !== -1 ||
          this.get(x, y + 1) !== -1
        )
          add.push(y * this.w + x);
      }
    for (const i of add) this.data[i] = c;
    return this;
  }

  /** Convierte la rejilla en una textura de Phaser a `scale` (2 = cada celda son 2×2 píxeles). */
  toTexture(scene: Phaser.Scene, key: string, scale = 2): void {
    const small = document.createElement('canvas');
    small.width = this.w;
    small.height = this.h;
    const sctx = small.getContext('2d')!;
    const img = sctx.createImageData(this.w, this.h);
    for (let i = 0; i < this.data.length; i++) {
      const c = this.data[i];
      if (c === -1) continue;
      img.data[i * 4] = (c >> 16) & 255;
      img.data[i * 4 + 1] = (c >> 8) & 255;
      img.data[i * 4 + 2] = c & 255;
      img.data[i * 4 + 3] = 255;
    }
    sctx.putImageData(img, 0, 0);
    // si ya existe (otra vez el mismo arte), se redibuja encima: hay imágenes que la están usando
    const W = this.w * scale,
      H = this.h * scale;
    const old = scene.textures.exists(key) ? scene.textures.get(key) : null;
    let tex: Phaser.Textures.CanvasTexture | null;
    if (isCanvas(old) && old.width === W && old.height === H) tex = old;
    else {
      if (old) scene.textures.remove(key);
      tex = scene.textures.createCanvas(key, W, H);
    }
    if (!tex) return;
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, this.w * scale, this.h * scale);
    tex.refresh();
    tex.setFilter(1 /* Phaser.Textures.FilterMode.NEAREST: píxeles duros */);
  }
}
