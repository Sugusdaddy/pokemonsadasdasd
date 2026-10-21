import type Phaser from 'phaser';
import type { ArenaTheme } from '@arena/shared';
import { INK, Pix, shade } from './pixel';

// ─────────────────────────────────────────────────────────────
//  PUENTES, DECORADOS Y DETALLES DEL SUELO en pixel art.
//  Decorados: 3 variantes por arena, rejilla 32×36 (textura 64×72, base en y≈32).
//  Puentes: rejilla 46×34 (92×68) centrados en el río.
//  Detalles del suelo: rejilla 8×8 (16×16), sin contorno para que no distraigan.
// ─────────────────────────────────────────────────────────────

type Deco = ArenaTheme['deco'];
export type BridgeKind = 'wood' | 'stone' | 'basalt';

export const BRIDGE_OF: Record<Deco, BridgeKind> = {
  tree: 'wood',
  rock: 'stone',
  grave: 'stone',
  ice: 'wood',
  lava: 'basalt',
  pillar: 'stone',
};

const G = { dark: 0x1f5a1c, mid: 0x2f8a2a, light: 0x58b84a, pale: 0x9be07a };
const BARK = { base: 0x6e4c1e, dark: 0x4a3010, light: 0x8f6a34 };
const ROCK = { base: 0x8f91a0, light: 0xc6c8d4, dark: 0x5b5d70 };
const SNOW = { base: 0xf2f8ff, shade: 0xc4dcef };
const LAVA = { hot: 0xffd36a, mid: 0xff8a2a, dark: 0xc23b14 };
const GOLD = { base: 0xffc93c, light: 0xfff1b8, dark: 0xd9921a };

// ───────────────────────── Puentes ─────────────────────────

function bridge(kind: BridgeKind): Pix {
  const p = new Pix(46, 34, 11);
  const x0 = 1,
    w = 44,
    y0 = 1,
    h = 32;
  if (kind === 'wood') {
    // tablones horizontales (se cruza de arriba abajo)
    for (let y = y0; y < y0 + h; y += 4) {
      const c = (y / 4) % 2 ? 0x9b6a3a : 0xa8743f;
      p.rect(x0 + 3, y, w - 6, 3, c);
      p.hline(x0 + 3, y, w - 6, shade(c, 0.2));
      p.hline(x0 + 3, y + 3, w - 6, 0x4a3010);
      p.set(x0 + 5, y + 1, 0x3a2410).set(x0 + w - 6, y + 1, 0x3a2410); // clavos
    }
    p.speckle(x0 + 3, y0, w - 6, h, 0x7a5028, 0.08);
    // barandillas con postes
    for (const rx of [x0, x0 + w - 3]) {
      p.rect(rx, y0, 3, h, BARK.base);
      p.vline(rx, y0, h, BARK.light);
      for (let y = y0; y < y0 + h; y += 8) {
        p.rect(rx, y, 3, 3, BARK.dark);
        p.set(rx + 1, y, BARK.light);
      }
    }
  } else {
    const deck =
      kind === 'stone'
        ? { base: 0xa9abba, light: 0xd2d4e0, dark: 0x6f7184 }
        : { base: 0x3a3442, light: 0x5a5266, dark: 0x221d2a };
    // adoquines
    p.rect(x0 + 3, y0, w - 6, h, deck.dark);
    for (let y = y0; y < y0 + h; y += 4)
      for (let x = x0 + 3 + ((y / 4) % 2 ? 0 : 3); x < x0 + w - 3; x += 6) {
        p.rect(x, y, 5, 3, deck.base);
        p.set(x, y, deck.light);
      }
    if (kind === 'basalt') {
      // grietas con lava
      for (let i = 0; i < 4; i++) {
        let cx = x0 + 6 + p.rng.int(0, w - 12),
          cy = y0 + p.rng.int(0, h - 8);
        for (let k = 0; k < 7; k++) {
          p.set(cx, cy, k % 3 === 0 ? LAVA.hot : LAVA.mid);
          cy += 1;
          cx += p.rng.int(-1, 1);
        }
      }
    }
    for (const rx of [x0, x0 + w - 3]) {
      p.rect(rx, y0, 3, h, deck.base);
      p.vline(rx + (rx === x0 ? 0 : 2), y0, h, rx === x0 ? deck.light : deck.dark);
      for (let y = y0 + 2; y < y0 + h; y += 6) p.hline(rx, y, 3, deck.dark);
    }
  }
  return p.outline();
}

// ───────────────────────── Decorados ─────────────────────────

function trunk(p: Pix, x: number, y: number, w: number, h: number): void {
  p.rect(x, y, w, h, BARK.base);
  p.vline(x, y, h, BARK.light);
  p.vline(x + w - 1, y, h, BARK.dark);
}

function pine(p: Pix, snowy: boolean): void {
  trunk(p, 15, 27, 3, 6);
  const tiers: Array<[number, number, number]> = [
    [3, 13, 8],
    [9, 21, 11],
    [15, 29, 13],
  ];
  for (const [top, bottom, half] of tiers) {
    p.poly(
      [
        [16, top],
        [16 - half, bottom],
        [16 + half, bottom],
      ],
      G.dark,
    );
    p.poly(
      [
        [16, top + 1],
        [16 - half + 2, bottom - 1],
        [16, bottom - 1],
      ],
      G.mid,
    );
    if (snowy) {
      p.poly(
        [
          [16, top],
          [16 - Math.round(half * 0.55), top + Math.round((bottom - top) * 0.5)],
          [16 + Math.round(half * 0.55), top + Math.round((bottom - top) * 0.5)],
        ],
        SNOW.base,
      );
      p.hline(16 - half + 1, bottom - 1, half * 2 - 1, SNOW.shade);
    } else p.set(14, top + 3, G.light).set(12, top + 6, G.light);
  }
}

const DECOS: Record<Deco, Array<(p: Pix) => void>> = {
  tree: [
    // roble con manzanas
    (p) => {
      trunk(p, 14, 21, 4, 12);
      p.ellipse(16, 13, 13, 11, G.dark);
      p.ellipse(14, 11, 10, 8, G.mid);
      p.ellipse(11, 8, 4, 3, G.light);
      p.speckle(4, 3, 26, 20, G.dark, 0.08);
      p.set(20, 14, 0xe0454f).set(9, 15, 0xe0454f).set(17, 7, 0xe0454f);
    },
    (p) => pine(p, false),
    // arbusto con flores
    (p) => {
      p.ellipse(16, 25, 13, 8, G.dark);
      p.ellipse(15, 23, 10, 6, G.mid);
      p.ellipse(12, 21, 4, 2, G.light);
      for (const [x, y, c] of [
        [9, 24, 0xff8ad8],
        [15, 20, 0xffe066],
        [21, 23, 0xff8ad8],
        [19, 27, 0xffffff],
        [11, 28, 0xffe066],
      ])
        p.set(x, y, c).set(x + 1, y, shade(c, -0.2));
    },
  ],
  rock: [
    // roca grande
    (p) => {
      p.poly(
        [
          [4, 32],
          [6, 20],
          [12, 13],
          [21, 12],
          [28, 19],
          [29, 32],
        ],
        ROCK.dark,
      );
      p.poly(
        [
          [6, 30],
          [8, 20],
          [13, 15],
          [20, 14],
          [24, 20],
          [20, 30],
        ],
        ROCK.base,
      );
      p.line(10, 18, 14, 15, ROCK.light).line(14, 15, 19, 15, ROCK.light);
      p.speckle(5, 13, 24, 19, ROCK.dark, 0.08);
    },
    // cristales de piedra lunar
    (p) => {
      p.ellipse(16, 30, 12, 4, ROCK.dark);
      p.ellipse(15, 29, 9, 3, ROCK.base);
      const cr = [0xe6b3ff, 0xc77dff, 0xfff0ff];
      for (const [x, top, w] of [
        [11, 12, 4],
        [16, 6, 5],
        [22, 15, 4],
      ]) {
        p.poly(
          [
            [x, top],
            [x - w, 29],
            [x + w, 29],
          ],
          cr[1],
        );
        p.poly(
          [
            [x, top + 1],
            [x - w + 1, 28],
            [x, 28],
          ],
          cr[0],
        );
        p.vline(x - 1, top + 4, 6, cr[2]);
      }
    },
    // montón de piedras
    (p) => {
      for (const [cx, cy, rx, ry] of [
        [10, 28, 6, 4],
        [21, 28, 7, 5],
        [15, 22, 6, 4],
      ]) {
        p.ellipse(cx, cy, rx, ry, ROCK.dark);
        p.ellipse(cx - 1, cy - 1, rx - 2, ry - 1, ROCK.base);
        p.set(cx - 2, cy - 2, ROCK.light);
      }
    },
  ],
  grave: [
    // lápida
    (p) => {
      const s = { base: 0x9a93b8, light: 0xc8c2e0, dark: 0x5c5480 };
      p.rect(9, 14, 14, 18, s.base);
      p.ellipse(16, 14, 7, 6, s.base);
      p.vline(9, 12, 20, s.light);
      p.vline(22, 12, 20, s.dark);
      p.rect(15, 15, 2, 9, s.dark);
      p.rect(12, 18, 8, 2, s.dark);
      p.ellipse(16, 32, 11, 2, 0x4d6b3a);
      p.speckle(9, 8, 14, 24, s.dark, 0.08);
    },
    // cruz de piedra
    (p) => {
      const s = { base: 0x8a84a8, light: 0xbab4d8, dark: 0x4f4870 };
      p.rect(14, 6, 5, 26, s.base);
      p.rect(8, 11, 17, 5, s.base);
      p.vline(14, 6, 26, s.light);
      p.hline(8, 11, 17, s.light);
      p.vline(18, 6, 26, s.dark);
      p.ellipse(16, 32, 9, 2, 0x4d6b3a);
    },
    // árbol muerto
    (p) => {
      const b = 0x3d3448,
        l = 0x5c5070;
      p.rect(14, 16, 4, 17, b);
      p.vline(14, 16, 17, l);
      p.line(15, 18, 7, 8, b).line(16, 18, 8, 8, b);
      p.line(17, 15, 25, 6, b).line(16, 15, 24, 6, b);
      p.line(10, 12, 6, 11, b);
      p.line(22, 9, 27, 10, b);
      p.line(16, 16, 16, 3, b);
      p.set(24, 5, 0x8ff7ec).set(7, 7, 0xb59cff); // brillos de alma
    },
  ],
  ice: [
    // cristal de hielo
    (p) => {
      p.poly(
        [
          [7, 32],
          [11, 12],
          [17, 2],
          [22, 14],
          [26, 32],
        ],
        0x2f8aa8,
      );
      p.poly(
        [
          [9, 31],
          [12, 13],
          [17, 4],
          [17, 31],
        ],
        0x8fe0f5,
      );
      p.vline(13, 12, 14, 0xffffff);
      p.line(18, 8, 22, 18, 0x5ab8d6);
    },
    (p) => pine(p, true),
    // muñeco de nieve
    (p) => {
      p.circle(16, 25, 7, SNOW.base);
      p.circle(16, 14, 5, SNOW.base);
      p.dither(17, 20, 6, 11, SNOW.shade);
      p.set(14, 13, INK).set(18, 13, INK);
      p.hline(16, 15, 3, 0xff8a2a);
      p.set(16, 22, INK).set(16, 25, INK).set(16, 28, INK);
      p.line(10, 21, 5, 17, BARK.dark).line(22, 21, 27, 17, BARK.dark);
      p.rect(12, 8, 9, 2, 0xe0454f); // gorro
      p.rect(13, 5, 7, 3, 0xe0454f);
    },
  ],
  lava: [
    // chimenea volcánica
    (p) => {
      p.poly(
        [
          [3, 32],
          [11, 13],
          [21, 13],
          [29, 32],
        ],
        0x2a1610,
      );
      p.poly(
        [
          [6, 31],
          [12, 15],
          [16, 15],
          [13, 31],
        ],
        0x4a2a1c,
      );
      p.ellipse(16, 13, 6, 2, LAVA.mid);
      p.hline(13, 13, 6, LAVA.hot);
      p.line(19, 14, 21, 22, LAVA.mid).line(12, 14, 11, 19, LAVA.dark);
      p.set(15, 9, LAVA.hot).set(18, 6, LAVA.mid).set(14, 4, LAVA.dark);
    },
    // obsidiana
    (p) => {
      for (const [x, top, w, c] of [
        [10, 10, 4, 0x2b1d3a],
        [18, 5, 5, 0x1d1428],
        [24, 16, 3, 0x2b1d3a],
      ] as const) {
        p.poly(
          [
            [x, top],
            [x - w, 32],
            [x + w, 32],
          ],
          c,
        );
        p.line(x, top + 2, x - 1, top + 9, 0x7a5aa8);
      }
      p.set(17, 22, LAVA.mid).set(11, 27, LAVA.mid);
    },
    // árbol calcinado
    (p) => {
      const b = 0x1f1714,
        l = 0x3a2a24;
      p.rect(14, 14, 4, 19, b);
      p.vline(14, 14, 19, l);
      p.line(15, 17, 8, 9, b).line(17, 14, 24, 7, b).line(16, 14, 16, 4, b);
      for (const [x, y] of [
        [15, 20],
        [16, 26],
        [9, 10],
        [23, 8],
      ])
        p.set(x, y, LAVA.mid);
    },
  ],
  pillar: [
    // columna
    (p) => {
      p.rect(8, 29, 17, 4, 0x1b2a6b);
      p.rect(10, 9, 13, 20, 0xe8e2ff);
      p.vline(13, 9, 20, 0xb8b2e0).vline(17, 9, 20, 0xb8b2e0).vline(21, 9, 20, 0xb8b2e0);
      p.vline(10, 9, 20, 0xffffff);
      p.rect(7, 5, 19, 4, GOLD.base);
      p.hline(7, 5, 19, GOLD.light);
      p.hline(8, 29, 17, GOLD.base);
    },
    // columna rota
    (p) => {
      p.rect(8, 29, 17, 4, 0x1b2a6b);
      p.rect(10, 17, 13, 12, 0xe8e2ff);
      // borde roto irregular
      [0, 2, 1, 4, 3, 1, 5, 6, 3, 2, 4, 1, 2].forEach((d, i) => {
        for (let y = 17; y < 17 + d; y++) p.clear(10 + i, y);
      });
      p.vline(13, 19, 10, 0xb8b2e0).vline(17, 18, 11, 0xb8b2e0);
      p.hline(8, 29, 17, GOLD.base);
      p.rect(24, 28, 7, 4, 0xe8e2ff); // trozo caído
      p.hline(24, 28, 7, 0xffffff);
    },
    // brasero
    (p) => {
      p.rect(15, 18, 3, 13, GOLD.dark);
      p.rect(11, 30, 11, 2, GOLD.dark);
      p.poly(
        [
          [8, 14],
          [24, 14],
          [21, 19],
          [11, 19],
        ],
        GOLD.base,
      );
      p.hline(8, 14, 17, GOLD.light);
      p.poly(
        [
          [16, 2],
          [10, 13],
          [22, 13],
        ],
        LAVA.mid,
      );
      p.poly(
        [
          [16, 6],
          [13, 13],
          [19, 13],
        ],
        LAVA.hot,
      );
    },
  ],
};

// ───────────────────────── Detalles del suelo ─────────────────────────

/** Guijarro pequeño: bloque 3×2 con brillo y sombra. */
function pebble(p: Pix, c: number): void {
  p.rect(3, 4, 3, 2, c);
  p.set(3, 4, shade(c, 0.35));
  p.hline(4, 6, 2, shade(c, -0.35));
}

const DETAILS: Record<Deco, Array<(p: Pix) => void>> = {
  tree: [
    (p) => p.line(2, 7, 1, 3, G.dark).line(4, 7, 4, 2, G.mid).line(6, 7, 7, 4, G.dark),
    (p) => p.set(3, 3, 0xffe066).set(2, 4, 0xffffff).set(4, 4, 0xffffff).set(3, 5, 0xffffff).set(3, 4, 0xffe066),
    (p) => pebble(p, 0x8a7a64),
  ],
  rock: [
    (p) => pebble(p, ROCK.dark),
    (p) => p.line(1, 2, 3, 4, 0x5b4d40).line(3, 4, 6, 5, 0x5b4d40),
    (p) => p.set(2, 5, 0xe6b3ff).set(5, 4, 0xc77dff),
  ],
  grave: [
    (p) => p.vline(3, 4, 3, 0xd8d0f0).ellipse(3, 3, 2, 1, 0xb05cff).set(2, 2, 0xe6b3ff),
    (p) => p.line(1, 3, 6, 5, 0x4a4060),
    (p) => pebble(p, 0x6b6488),
  ],
  ice: [
    (p) => p.ellipse(4, 4, 3, 2, SNOW.base).dither(1, 3, 6, 3, SNOW.shade),
    (p) =>
      p.poly(
        [
          [4, 1],
          [2, 6],
          [6, 6],
        ],
        0x8fe0f5,
      ),
    (p) => p.set(3, 3, 0xffffff).set(5, 5, 0xffffff),
  ],
  lava: [
    (p) => p.line(0, 3, 3, 4, LAVA.dark).line(3, 4, 7, 3, LAVA.mid).set(3, 4, LAVA.hot),
    (p) => pebble(p, 0x3a2a24),
    (p) => p.set(2, 4, LAVA.mid).set(5, 2, LAVA.hot),
  ],
  pillar: [
    (p) =>
      p
        .poly(
          [
            [4, 1],
            [1, 4],
            [4, 7],
            [7, 4],
          ],
          0x8fb0f0,
        )
        .set(4, 4, GOLD.base),
    (p) => pebble(p, 0x4a64b0),
    (p) => p.hline(1, 4, 6, 0x8fb0f0),
  ],
};

export const DECO_VARIANTS = 3;
export const DETAIL_VARIANTS = 3;

/** Crea puentes, decorados (deco_<tipo>_<n>) y detalles del suelo (detail_<tipo>_<n>). */
export function createSceneryArt(scene: Phaser.Scene): void {
  for (const kind of ['wood', 'stone', 'basalt'] as const) bridge(kind).toTexture(scene, `bridge_${kind}`);
  for (const [deco, list] of Object.entries(DECOS) as Array<[Deco, Array<(p: Pix) => void>]>) {
    list.forEach((draw, i) => {
      const p = new Pix(32, 36, 100 + i);
      draw(p);
      p.outline().toTexture(scene, `deco_${deco}_${i}`);
    });
    DETAILS[deco].forEach((draw, i) => {
      const p = new Pix(8, 8, 200 + i);
      draw(p);
      p.toTexture(scene, `detail_${deco}_${i}`);
    });
  }
}
