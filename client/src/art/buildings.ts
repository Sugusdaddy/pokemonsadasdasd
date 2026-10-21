import type Phaser from 'phaser';
import { COLORS } from '@arena/shared';
import { Pix, shade } from './pixel';

// ─────────────────────────────────────────────────────────────
//  PEANA DE LOS EDIFICIOS: losa de piedra redonda con el borde del color del equipo.
//  Va debajo del Pokémon que hace de edificio para que se distinga de una tropa.
// ─────────────────────────────────────────────────────────────

const STONE = 0xa9abba;

function base(team: number): Pix {
  const w = 44,
    h = 22;
  const p = new Pix(w, h, 11);
  const cx = (w - 1) / 2,
    cy = (h - 1) / 2;
  // losa: elipse con cara superior clara y canto oscuro
  p.ellipse(cx, cy + 2, w / 2 - 1, h / 2 - 2, shade(STONE, -0.45));
  p.ellipse(cx, cy, w / 2 - 1, h / 2 - 3, STONE);
  p.ellipse(cx - 3, cy - 2, w / 2 - 8, h / 2 - 6, shade(STONE, 0.25));
  // juntas entre losas
  for (const x of [cx - 10, cx, cx + 10]) p.vline(Math.round(x), Math.round(cy - 3), 6, shade(STONE, -0.25));
  p.hline(Math.round(cx - 15), Math.round(cy), 30, shade(STONE, -0.2));
  p.speckle(4, 3, w - 8, h - 8, shade(STONE, -0.12), 0.08);
  // borde del equipo
  for (let x = 0; x < w; x++)
    for (let y = 0; y < h; y++) {
      const d = ((x - cx) / (w / 2 - 1)) ** 2 + ((y - cy - 1) / (h / 2 - 2)) ** 2;
      if (d > 0.78 && d <= 1 && p.get(x, y) !== -1) p.set(x, y, y > cy ? shade(team, -0.3) : team);
    }
  return p.outline();
}

export function createBuildingArt(scene: Phaser.Scene): void {
  base(COLORS.player).toTexture(scene, 'bld_base_player');
  base(COLORS.enemy).toTexture(scene, 'bld_base_enemy');
}
