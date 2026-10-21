import Phaser from 'phaser';
import { BALLS, PACK, TOWER_GUARDIANS, type AnimName, type BallConfig } from '@arena/shared';

// Los sprites vienen de los atlas que genera `npm run assets` en public/gen/.
export const GEN = 'gen/';

// Orden de filas de cada spritesheet (README del pack)
export const DIRS = ['Down', 'DownRight', 'Right', 'UpRight', 'Up', 'UpLeft', 'Left', 'DownLeft'];
export const ANIMS: AnimName[] = ['Walk', 'Attack', 'Idle', 'Shoot', 'Charge', 'Hurt', 'Faint'];
const LOOPING = new Set<AnimName>(['Walk', 'Idle']);

interface AnimMeta {
  fw: number;
  fh: number;
  n: number;
  ticks: number[];
  ax: number;
  ay: number;
  dur: number;
}
export interface Manifest {
  generatedAt: string;
  spriteSource: string;
  source: string;
  atlases: Record<string, number>;
  impactFrames: number;
  moves: Record<string, string>;
  anims: Record<string, Partial<Record<AnimName, AnimMeta>>>;
}

let MANIFEST: Manifest | null = null;
export const setManifest = (m: Manifest): void => {
  MANIFEST = m;
};
export const manifest = (): Manifest => {
  if (!MANIFEST) throw new Error('Manifest de assets sin cargar');
  return MANIFEST;
};

export const pkAtlas = (id: number): string => `pk_${id}`;
export const animKey = (id: number, anim: AnimName, dir: number): string => `pk_${id}_${anim}_${dir}`;
/** Animación Idle mirando abajo del atlas de retratos (menú, cartas). */
export const portraitAnim = (id: number): string => `pt_${id}`;

/** Info de una animación con el mismo formato que animations_metadata.json. */
export function animInfo(id: number, anim: AnimName) {
  const a = manifest().anims[String(id)]?.[anim] ?? manifest().anims[String(id)]?.Idle;
  if (!a) throw new Error(`Sin animación ${anim} para el Pokémon ${id}: ejecuta "npm run assets"`);
  return {
    frame_width: a.fw,
    frame_height: a.fh,
    frame_count: a.n,
    total_duration_sec: a.dur,
    ground_anchor: { x: a.ax, y: a.ay },
  };
}

export function dirFromVector(dx: number, dy: number): number {
  if (dx === 0 && dy === 0) return 0;
  const angle = Math.atan2(dy, dx);
  return ((Math.round((Math.PI / 2 - angle) / (Math.PI / 4)) % 8) + 8) % 8;
}

export function palette(name: string): number[] {
  return (PACK.typePalettes[name] || PACK.typePalettes.normal).map((h) => parseInt(h.slice(1), 16));
}

export function guardianIds(): number[] {
  const ids = new Set<number>();
  for (const team of Object.values(TOWER_GUARDIANS)) for (const g of Object.values(team)) ids.add(g.pokemon);
  return [...ids];
}

/** Textura y frame del proyectil de un ataque (o el impacto genérico si no tiene sprite). */
export function moveFrame(move: string): [string, string] {
  const f = MANIFEST?.moves[move];
  return f ? ['fx', f] : ['fx', 'impact_0'];
}

export const typeIconFrame = (type: string): [string, string] => ['fx', `type_${type}`];

export function hasTypeIcon(scene: Phaser.Scene, type: string): boolean {
  return scene.textures.exists('fx') && scene.textures.get('fx').has(`type_${type}`);
}

// ───────────────────────── Carga ─────────────────────────

export function queueManifest(scene: Phaser.Scene): void {
  scene.load.json('manifest', `${GEN}manifest.json`);
}

/** Menú: atlas de retratos (Idle mirando abajo) y de efectos. */
export function queuePortraits(scene: Phaser.Scene): void {
  if (!scene.textures.exists('portraits')) scene.load.multiatlas('portraits', `${GEN}portraits.json`, GEN);
  if (!scene.textures.exists('fx')) scene.load.multiatlas('fx', `${GEN}fx.json`, GEN);
}

/** Batalla: el atlas completo de cada Pokémon que aparece. */
export function queueBattle(scene: Phaser.Scene, ids: number[]): void {
  for (const id of ids) {
    if (!scene.textures.exists(pkAtlas(id))) scene.load.multiatlas(pkAtlas(id), `${GEN}pk/${id}.json`, `${GEN}pk/`);
  }
}

const frameMs = (ticks: number) => (ticks * 1000) / 60;

/** Los sprites del pack son pixel art: se escalan sin suavizar (el resto de la UI sí se suaviza). */
function pixelArt(scene: Phaser.Scene, key: string): void {
  if (scene.textures.exists(key)) scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
}

export function createPortraitAnims(scene: Phaser.Scene, ids: number[]): void {
  pixelArt(scene, 'portraits');
  pixelArt(scene, 'fx');
  for (const id of ids) {
    const key = portraitAnim(id);
    const a = manifest().anims[String(id)]?.Idle;
    if (!a || scene.anims.exists(key)) continue;
    const frames = a.ticks.map((t, i) => ({ key: 'portraits', frame: `${id}_${i}`, duration: frameMs(t) }));
    scene.anims.create({ key, frames, repeat: -1 });
  }
  if (!scene.anims.exists('fx_impact') && scene.textures.exists('fx')) {
    const frames = Array.from({ length: manifest().impactFrames }, (_, i) => ({ key: 'fx', frame: `impact_${i}` }));
    scene.anims.create({ key: 'fx_impact', frames, frameRate: 14, repeat: 0 });
  }
}

/** Una animación por Pokémon × animación × dirección con la duración real de cada frame. */
export function createAnims(scene: Phaser.Scene, ids: number[]): void {
  for (const id of ids) {
    pixelArt(scene, pkAtlas(id));
    const info = manifest().anims[String(id)];
    if (!info || !scene.textures.exists(pkAtlas(id))) continue;
    for (const anim of ANIMS) {
      const a = info[anim];
      if (!a) continue;
      for (let d = 0; d < 8; d++) {
        const key = animKey(id, anim, d);
        if (scene.anims.exists(key)) continue;
        const frames = a.ticks.map((t, i) => ({ key: pkAtlas(id), frame: `${anim}_${d}_${i}`, duration: frameMs(t) }));
        scene.anims.create({ key, frames, repeat: LOOPING.has(anim) ? -1 : 0 });
      }
    }
  }
}

/** Sprite del retrato animado de un Pokémon, anclado por los pies. */
export function portraitSprite(scene: Phaser.Scene, x: number, y: number, id: number): Phaser.GameObjects.Sprite {
  const a = animInfo(id, 'Idle');
  const sp = scene.add.sprite(x, y, 'portraits', `${id}_0`);
  sp.setOrigin(a.ground_anchor.x / a.frame_width, a.ground_anchor.y / a.frame_height);
  if (scene.anims.exists(portraitAnim(id))) sp.play(portraitAnim(id));
  return sp;
}

// ───────────────────────── Texturas dibujadas por código ─────────────────────────

const gfx = (scene: Phaser.Scene) => scene.make.graphics({ x: 0, y: 0 }, false);
type G = Phaser.GameObjects.Graphics;
type Pt = { x: number; y: number };

/** Pokéballs: textura completa + mitad superior e inferior (para la animación de apertura). */
export function createBallTextures(scene: Phaser.Scene): void {
  const S = 128,
    C = 64,
    R = 58;
  const drawHalf = (g: G, cfg: BallConfig, type: string, part: 'full' | 'top' | 'bot') => {
    const [top, bottom] = cfg.colors;
    if (part !== 'bot') {
      g.fillStyle(0x14122b)
        .slice(C, C, R + 4, Math.PI, 0, false)
        .fillPath();
      g.fillStyle(top).slice(C, C, R, Math.PI, 0, false).fillPath();
      g.fillStyle(0xffffff, 0.3).fillEllipse(C - 22, C - 34, 26, 14);
      if (type === 'super') {
        g.fillStyle(cfg.stripe!);
        g.fillPoints(
          [
            { x: 18, y: 50 },
            { x: 30, y: 26 },
            { x: 46, y: 22 },
            { x: 34, y: 50 },
          ],
          true,
        );
        g.fillPoints(
          [
            { x: 110, y: 50 },
            { x: 98, y: 26 },
            { x: 82, y: 22 },
            { x: 94, y: 50 },
          ],
          true,
        );
      } else if (type === 'ultra') {
        g.fillStyle(cfg.stripe!);
        g.fillRect(26, 18, 14, 40).fillRect(88, 18, 14, 40).fillRect(26, 30, 76, 10);
      } else if (type === 'master') {
        g.fillStyle(cfg.stripe!).fillCircle(32, 36, 11).fillCircle(96, 36, 11);
        g.fillStyle(0xffffff);
        g.fillPoints(
          [
            { x: 46, y: 50 },
            { x: 50, y: 18 },
            { x: 64, y: 34 },
            { x: 78, y: 18 },
            { x: 82, y: 50 },
            { x: 74, y: 50 },
            { x: 72, y: 34 },
            { x: 64, y: 44 },
            { x: 56, y: 34 },
            { x: 54, y: 50 },
          ],
          true,
        );
      } else if (type === 'crown') {
        g.fillStyle(cfg.stripe!);
        g.fillPoints(
          [
            { x: 40, y: 50 },
            { x: 40, y: 24 },
            { x: 52, y: 36 },
            { x: 64, y: 18 },
            { x: 76, y: 36 },
            { x: 88, y: 24 },
            { x: 88, y: 50 },
          ],
          true,
        );
      } else if (type === 'free') {
        g.fillStyle(0xffffff, 0.85).fillRect(58, 16, 12, 34).fillRect(47, 27, 34, 12);
      }
      g.fillStyle(0x14122b).fillRect(C - R - 4, C - 7, (R + 4) * 2, 7);
    }
    if (part !== 'top') {
      g.fillStyle(0x14122b)
        .slice(C, C, R + 4, 0, Math.PI, false)
        .fillPath();
      g.fillStyle(bottom).slice(C, C, R, 0, Math.PI, false).fillPath();
      g.fillStyle(0x000000, 0.12)
        .slice(C, C, R, 0.2, Math.PI - 0.2, false)
        .fillPath();
      g.fillStyle(bottom).fillEllipse(C, C + 4, R * 2 - 6, 30);
      g.fillStyle(0x14122b).fillRect(C - R - 4, C, (R + 4) * 2, 7);
    }
    // botón
    if (part === 'top') {
      g.fillStyle(0x14122b).slice(C, C, 20, Math.PI, 0, false).fillPath();
      g.fillStyle(0xffffff).slice(C, C, 13, Math.PI, 0, false).fillPath();
    } else if (part === 'bot') {
      g.fillStyle(0x14122b).slice(C, C, 20, 0, Math.PI, false).fillPath();
      g.fillStyle(0xffffff).slice(C, C, 13, 0, Math.PI, false).fillPath();
    } else {
      g.fillStyle(0x14122b).fillCircle(C, C, 20);
      g.fillStyle(0xffffff).fillCircle(C, C, 13);
      g.fillStyle(0xdddde8).fillCircle(C, C, 8);
    }
  };
  for (const [type, cfg] of Object.entries(BALLS)) {
    for (const part of ['full', 'top', 'bot'] as const) {
      const key = part === 'full' ? `ball_${type}` : `ball_${type}_${part}`;
      if (scene.textures.exists(key)) continue;
      const g = gfx(scene);
      drawHalf(g, cfg, type, part);
      g.generateTexture(key, S, S);
      g.destroy();
    }
  }
}

/** Iconos de la interfaz (oro, gemas, trofeo, pestañas…). */
export function createIconTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('ic_gold')) return;
  const make = (key: string, draw: (g: G) => void, w = 64, h = 64) => {
    const g = gfx(scene);
    draw(g);
    g.generateTexture(key, w, h);
    g.destroy();
  };
  const O = 0x14122b;
  make('ic_gold', (g) => {
    g.fillStyle(O).fillCircle(32, 34, 28);
    g.fillStyle(0xc98a00).fillCircle(32, 32, 26);
    g.fillStyle(0xffc21a).fillCircle(32, 30, 22);
    g.fillStyle(0xffe27a).fillCircle(26, 24, 7);
    g.fillStyle(0xc98a00).fillRect(28, 18, 8, 24);
  });
  make('ic_gem', (g) => {
    const p = (pts: number[][], c: number) => {
      g.fillStyle(c).fillPoints(
        pts.map(([x, y]) => ({ x, y })),
        true,
      );
    };
    p(
      [
        [12, 24],
        [22, 8],
        [42, 8],
        [52, 24],
        [32, 58],
      ],
      O,
    );
    p(
      [
        [14, 23],
        [23, 10],
        [41, 10],
        [50, 23],
        [32, 54],
      ],
      0x1fa85a,
    );
    p(
      [
        [14, 23],
        [50, 23],
        [32, 54],
      ],
      0x3ee07a,
    );
    p(
      [
        [23, 10],
        [32, 23],
        [41, 10],
      ],
      0xa6ffd0,
    );
  });
  make('ic_trophy', (g) => {
    g.fillStyle(O).fillRoundedRect(12, 6, 40, 34, 10).fillRect(26, 36, 12, 14).fillRoundedRect(16, 48, 32, 12, 4);
    g.fillStyle(0xffc21a).fillRoundedRect(15, 8, 34, 28, 8).fillRect(28, 34, 8, 14).fillRoundedRect(18, 50, 28, 8, 3);
    g.lineStyle(5, 0xffc21a).strokeCircle(12, 20, 8).strokeCircle(52, 20, 8);
    g.fillStyle(0xffe27a).fillRect(20, 12, 6, 16);
  });
  make('ic_crown', (g) => {
    const pts = (dy: number): Pt[] =>
      [
        [8, 50],
        [8, 18],
        [20, 32],
        [32, 10],
        [44, 32],
        [56, 18],
        [56, 50],
      ].map(([x, y]) => ({ x, y: y + dy }));
    g.fillStyle(O).fillPoints(pts(3), true);
    g.fillStyle(0xffc21a).fillPoints(pts(0), true);
  });
  make('ic_shop', (g) => {
    g.lineStyle(6, O).strokeCircle(32, 22, 12);
    g.fillStyle(O).fillRoundedRect(8, 22, 48, 38, 8);
    g.fillStyle(0xf2a12b).fillRoundedRect(11, 25, 42, 32, 6);
    g.fillStyle(0xffffff, 0.35).fillRect(14, 28, 36, 6);
  });
  make('ic_cards', (g) => {
    g.fillStyle(O).fillRoundedRect(6, 12, 32, 44, 6).fillRoundedRect(26, 6, 32, 44, 6);
    g.fillStyle(0x7d8bff).fillRoundedRect(9, 15, 26, 38, 4);
    g.fillStyle(0xb05cff).fillRoundedRect(29, 9, 26, 38, 4);
  });
  make('ic_battle', (g) => {
    const sword = (flip: boolean) => {
      const f = (x: number) => (flip ? 64 - x : x);
      g.fillStyle(O).fillPoints(
        [
          { x: f(8), y: 4 },
          { x: f(18), y: 4 },
          { x: f(50), y: 44 },
          { x: f(44), y: 50 },
        ],
        true,
      );
      g.fillStyle(0xdfe6ff).fillPoints(
        [
          { x: f(10), y: 7 },
          { x: f(17), y: 7 },
          { x: f(47), y: 44 },
          { x: f(44), y: 47 },
        ],
        true,
      );
      g.fillStyle(0xf2a12b).fillRect(flip ? 64 - 54 : 40, 44, 14, 6);
      g.fillStyle(0x8a5a2b).fillRect(flip ? 64 - 58 : 50, 50, 8, 10);
    };
    sword(false);
    sword(true);
  });
  make('ic_road', (g) => {
    g.fillStyle(O).fillRect(12, 6, 6, 54);
    g.fillStyle(O).fillPoints(
      [
        { x: 18, y: 6 },
        { x: 56, y: 16 },
        { x: 18, y: 32 },
      ],
      true,
    );
    g.fillStyle(0xe0454f).fillPoints(
      [
        { x: 18, y: 9 },
        { x: 50, y: 17 },
        { x: 18, y: 29 },
      ],
      true,
    );
    g.fillStyle(0xffc21a).fillRect(14, 8, 3, 50);
  });
  make('ic_profile', (g) => {
    g.fillStyle(O).fillCircle(32, 22, 15).fillRoundedRect(8, 36, 48, 26, 12);
    g.fillStyle(0x3fbf5a).fillCircle(32, 22, 12).fillRoundedRect(11, 39, 42, 20, 10);
  });
  make('ic_idea', (g) => {
    // bombilla
    g.fillStyle(O).fillCircle(32, 26, 21).fillRoundedRect(20, 38, 24, 22, 5);
    g.fillStyle(0xffd75a).fillCircle(32, 26, 18);
    g.fillStyle(0xfff3b8).fillCircle(26, 20, 7);
    g.fillStyle(0xb9c2e8).fillRoundedRect(23, 42, 18, 14, 3);
    g.fillStyle(O).fillRect(23, 47, 18, 2).fillRect(23, 52, 18, 2);
  });
  make('ic_admin', (g) => {
    // escudo con estrella
    const shield = (inset: number) => [
      { x: 8 + inset, y: 8 + inset },
      { x: 56 - inset, y: 8 + inset },
      { x: 56 - inset, y: 34 - inset * 0.3 },
      { x: 32, y: 60 - inset * 1.4 },
      { x: 8 + inset, y: 34 - inset * 0.3 },
    ];
    g.fillStyle(O).fillPoints(shield(0), true);
    g.fillStyle(0xe0454f).fillPoints(shield(3), true);
    g.fillStyle(0xffffff, 0.25).fillRect(12, 12, 40, 7);
    const star = [];
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? 6 : 13,
        a = -Math.PI / 2 + (k * Math.PI) / 5;
      star.push({ x: 32 + Math.cos(a) * r, y: 32 + Math.sin(a) * r });
    }
    g.fillStyle(0xffd75a).fillPoints(star, true);
  });
  make('ic_social', (g) => {
    // podio de tres escalones
    g.fillStyle(O)
      .fillRoundedRect(4, 30, 20, 30, 4)
      .fillRoundedRect(22, 16, 20, 44, 4)
      .fillRoundedRect(40, 38, 20, 22, 4);
    g.fillStyle(0xb9c2e8).fillRoundedRect(7, 33, 14, 24, 3);
    g.fillStyle(0xffc21a).fillRoundedRect(25, 19, 14, 38, 3);
    g.fillStyle(0xd9873a).fillRoundedRect(43, 41, 14, 16, 3);
    g.fillStyle(O).fillCircle(32, 8, 6);
    g.fillStyle(0xfff1b8).fillCircle(32, 8, 4);
  });
  make('ic_lock', (g) => {
    g.lineStyle(6, O).strokeCircle(32, 24, 12);
    g.fillStyle(O).fillRoundedRect(12, 26, 40, 32, 6);
    g.fillStyle(0x9aa0c8).fillRoundedRect(15, 29, 34, 26, 4);
    g.fillStyle(O).fillCircle(32, 40, 5);
  });
  make('ic_emote', (g) => {
    g.fillStyle(O)
      .fillRoundedRect(4, 6, 56, 42, 14)
      .fillPoints(
        [
          { x: 14, y: 44 },
          { x: 10, y: 60 },
          { x: 28, y: 46 },
        ],
        true,
      );
    g.fillStyle(0xffffff).fillRoundedRect(7, 9, 50, 36, 12);
    g.fillStyle(O).fillCircle(22, 24, 4).fillCircle(42, 24, 4);
    g.lineStyle(3, O)
      .beginPath()
      .arc(32, 28, 10, 0.3, Math.PI - 0.3)
      .strokePath();
  });
  make('ic_flag', (g) => {
    g.fillStyle(0xffffff).fillRect(14, 8, 5, 50);
    g.fillStyle(0xffffff).fillPoints(
      [
        { x: 19, y: 8 },
        { x: 52, y: 16 },
        { x: 19, y: 30 },
      ],
      true,
    );
  });
  make('ic_sound', (g) => {
    g.fillStyle(0xffffff)
      .fillRect(8, 24, 12, 16)
      .fillPoints(
        [
          { x: 20, y: 24 },
          { x: 34, y: 10 },
          { x: 34, y: 54 },
          { x: 20, y: 40 },
        ],
        true,
      );
    g.lineStyle(4, 0xffffff).beginPath().arc(34, 32, 12, -0.8, 0.8).strokePath();
    g.beginPath().arc(34, 32, 22, -0.8, 0.8).strokePath();
  });
  make(
    'fx_spark',
    (g) => {
      g.fillStyle(0xffffff).fillCircle(8, 8, 8);
    },
    16,
    16,
  );
  make(
    'fx_ray',
    (g) => {
      g.fillStyle(0xffffff, 0.9).fillPoints(
        [
          { x: 0, y: 0 },
          { x: 40, y: 0 },
          { x: 22, y: 300 },
          { x: 18, y: 300 },
        ],
        true,
      );
    },
    40,
    300,
  );
  make(
    'fx_px',
    (g) => {
      g.fillStyle(0xffffff).fillRect(0, 0, 8, 8);
    },
    8,
    8,
  );
}
