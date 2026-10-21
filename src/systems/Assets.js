import { ASSETS_ROOT, TOWER_GUARDIANS, COLORS, BALLS } from '../config.js';

// Orden de filas de cada spritesheet (README del pack)
export const DIRS = ['Down', 'DownRight', 'Right', 'UpRight', 'Up', 'UpLeft', 'Left', 'DownLeft'];
export const ANIMS = ['Walk', 'Attack', 'Idle', 'Shoot', 'Charge', 'Hurt', 'Faint'];
const LOOPING = new Set(['Walk', 'Idle']);
const TYPES = ['normal', 'fire', 'water', 'grass', 'electric', 'psychic', 'ice', 'fighting', 'poison',
  'ground', 'flying', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'];

let META = null;
export const setMeta = (m) => { META = m; };
export const meta = () => META;

export const texKey = (id, anim) => `pk_${id}_${anim}`;
export const animKey = (id, anim, dir) => `pk_${id}_${anim}_${dir}`;
export const moveKey = (move) => `mv_${move}`;

export function dirFromVector(dx, dy) {
  if (dx === 0 && dy === 0) return 0;
  const angle = Math.atan2(dy, dx);
  return ((Math.round((Math.PI / 2 - angle) / (Math.PI / 4)) % 8) + 8) % 8;
}

export function animInfo(id, anim) {
  return META.pokemon[String(id)].animations[anim];
}

export function palette(name) {
  return (META.type_palettes[name] || META.type_palettes.normal).map((h) => parseInt(h.slice(1), 16));
}

export function guardianNeeds() {
  const ids = new Set(), moves = new Set();
  for (const team of Object.values(TOWER_GUARDIANS)) {
    for (const g of Object.values(team)) { ids.add(g.pokemon); moves.add(g.move); }
  }
  return { ids: [...ids], moves: [...moves] };
}

function queueSheet(scene, id, anim, variant) {
  const pk = META.pokemon[String(id)];
  const a = pk?.animations?.[anim];
  if (!a || scene.textures.exists(texKey(id, anim))) return;
  scene.load.spritesheet(texKey(id, anim), ASSETS_ROOT + (a.files[variant] || a.files.normal), {
    frameWidth: a.frame_width, frameHeight: a.frame_height,
  });
}

/** Menú: solo la animación Idle de cada Pokémon (retratos de cartas). */
export function queuePortraits(scene, ids) {
  for (const id of ids) queueSheet(scene, id, 'Idle', 'normal');
  for (const t of TYPES) {
    if (!scene.textures.exists(`type_${t}`)) scene.load.image(`type_${t}`, `${ASSETS_ROOT}attacks/types/type_${t}.png`);
  }
}

/** Batalla: todas las animaciones de los Pokémon de ambos mazos + ataques. */
export function queueBattle(scene, ids, moves) {
  for (const id of ids) for (const anim of ANIMS) queueSheet(scene, id, anim, 'normal');
  for (const m of moves) {
    const mv = META.attacks[m];
    if (mv?.vfx?.sprite_file && !scene.textures.exists(moveKey(m))) scene.load.image(moveKey(m), ASSETS_ROOT + mv.vfx.sprite_file);
  }
  if (!scene.textures.exists('fx_impact')) {
    const impact = META.vfx_shapes.impact;
    scene.load.spritesheet('fx_impact', ASSETS_ROOT + impact.strip, { frameWidth: impact.frame_width, frameHeight: impact.frame_height });
  }
}

/** Crea una animación por Pokémon × animación × dirección con la duración real de cada frame. */
export function createAnims(scene, ids) {
  for (const id of ids) {
    const pk = META.pokemon[String(id)];
    if (!pk) continue;
    for (const anim of ANIMS) {
      const a = pk.animations[anim];
      if (!a || !scene.textures.exists(texKey(id, anim))) continue;
      const n = a.frame_count;
      for (let d = 0; d < 8; d++) {
        const key = animKey(id, anim, d);
        if (scene.anims.exists(key)) continue;
        const frames = [];
        for (let i = 0; i < n; i++) {
          frames.push({ key: texKey(id, anim), frame: d * n + i, duration: ((a.frame_durations_ticks?.[i] ?? 4) * 1000) / 60 });
        }
        scene.anims.create({ key, frames, repeat: LOOPING.has(anim) ? -1 : 0 });
      }
    }
  }
  if (scene.textures.exists('fx_impact') && !scene.anims.exists('fx_impact')) {
    scene.anims.create({ key: 'fx_impact', frames: scene.anims.generateFrameNumbers('fx_impact'), frameRate: 14, repeat: 0 });
  }
}

// ───────────────────────── Texturas dibujadas por código ─────────────────────────

const gfx = (scene) => scene.make.graphics({ x: 0, y: 0, add: false });

export function createTowerTextures(scene) {
  if (scene.textures.exists('tower_rubble')) return;
  const make = (key, w, h, team, king) => {
    const g = gfx(scene);
    const col = COLORS[team];
    const stone = 0xa3a5b4, dark = 0x4b4d5e, light = 0xc9cbd8;
    const bodyTop = king ? 22 : 18;
    g.fillStyle(0x000000, 0.25).fillEllipse(w / 2, h - 10, w * 0.95, 18);
    g.fillStyle(dark).fillRoundedRect(4, bodyTop, w - 8, h - bodyTop - 8, 10);
    g.fillStyle(stone).fillRoundedRect(8, bodyTop + 2, w - 16, h - bodyTop - 16, 8);
    g.lineStyle(2, dark, 0.45);
    for (let y = bodyTop + 16; y < h - 16; y += 14) {
      g.lineBetween(10, y, w - 10, y);
      const off = ((y / 14) | 0) % 2 ? 0 : 12;
      for (let x = 14 + off; x < w - 12; x += 24) g.lineBetween(x, y, x, y + 14);
    }
    g.fillStyle(dark);
    const n = king ? 5 : 4;
    const cw = (w - 16) / (n * 2 - 1);
    for (let i = 0; i < n; i++) g.fillRect(8 + i * 2 * cw, bodyTop - 12, cw, 14);
    g.fillStyle(light);
    for (let i = 0; i < n; i++) g.fillRect(10 + i * 2 * cw, bodyTop - 10, cw - 4, 10);
    g.fillStyle(col).fillRect(8, bodyTop + 4, w - 16, 10);
    g.fillStyle(0xffffff, 0.35).fillRect(8, bodyTop + 4, w - 16, 3);
    if (king) {
      g.fillStyle(0xffc21a);
      g.fillPoints([{ x: w / 2 - 14, y: h - 52 }, { x: w / 2 - 14, y: h - 64 }, { x: w / 2 - 7, y: h - 57 },
        { x: w / 2, y: h - 68 }, { x: w / 2 + 7, y: h - 57 }, { x: w / 2 + 14, y: h - 64 }, { x: w / 2 + 14, y: h - 52 }], true);
    }
    g.fillStyle(0x2a2233).fillRoundedRect(w / 2 - 10, h - 40, 20, 24, { tl: 10, tr: 10, bl: 0, br: 0 });
    g.generateTexture(key, w, h);
    g.destroy();
  };
  for (const team of ['player', 'enemy']) {
    make(`tower_king_${team}`, 112, 104, team, true);
    make(`tower_princess_${team}`, 84, 84, team, false);
  }
  const g = gfx(scene);
  g.fillStyle(0x000000, 0.25).fillEllipse(44, 60, 84, 18);
  for (const [x, y, r] of [[20, 50, 14], [42, 46, 18], [64, 52, 13], [32, 58, 11], [56, 60, 12]]) {
    g.fillStyle(0x4b4d5e).fillCircle(x, y, r);
    g.fillStyle(0x8f91a0).fillCircle(x - 2, y - 3, r - 4);
  }
  g.generateTexture('tower_rubble', 88, 72);
  g.destroy();
}

/** Pokéballs: textura completa + mitad superior e inferior (para la animación de apertura). */
export function createBallTextures(scene) {
  const S = 128, C = 64, R = 58;
  const drawHalf = (g, cfg, type, part) => {
    const [top, bottom] = cfg.colors;
    if (part !== 'bot') {
      g.fillStyle(0x14122b).slice(C, C, R + 4, Math.PI, 0, false).fillPath();
      g.fillStyle(top).slice(C, C, R, Math.PI, 0, false).fillPath();
      g.fillStyle(0xffffff, 0.3).fillEllipse(C - 22, C - 34, 26, 14);
      if (type === 'super') {
        g.fillStyle(cfg.stripe);
        g.fillPoints([{ x: 18, y: 50 }, { x: 30, y: 26 }, { x: 46, y: 22 }, { x: 34, y: 50 }], true);
        g.fillPoints([{ x: 110, y: 50 }, { x: 98, y: 26 }, { x: 82, y: 22 }, { x: 94, y: 50 }], true);
      } else if (type === 'ultra') {
        g.fillStyle(cfg.stripe);
        g.fillRect(26, 18, 14, 40).fillRect(88, 18, 14, 40).fillRect(26, 30, 76, 10);
      } else if (type === 'master') {
        g.fillStyle(cfg.stripe).fillCircle(32, 36, 11).fillCircle(96, 36, 11);
        g.fillStyle(0xffffff);
        g.fillPoints([{ x: 46, y: 50 }, { x: 50, y: 18 }, { x: 64, y: 34 }, { x: 78, y: 18 }, { x: 82, y: 50 },
          { x: 74, y: 50 }, { x: 72, y: 34 }, { x: 64, y: 44 }, { x: 56, y: 34 }, { x: 54, y: 50 }], true);
      } else if (type === 'crown') {
        g.fillStyle(cfg.stripe);
        g.fillPoints([{ x: 40, y: 50 }, { x: 40, y: 24 }, { x: 52, y: 36 }, { x: 64, y: 18 }, { x: 76, y: 36 }, { x: 88, y: 24 }, { x: 88, y: 50 }], true);
      } else if (type === 'free') {
        g.fillStyle(0xffffff, 0.85).fillRect(58, 16, 12, 34).fillRect(47, 27, 34, 12);
      }
      g.fillStyle(0x14122b).fillRect(C - R - 4, C - 7, (R + 4) * 2, 7);
    }
    if (part !== 'top') {
      g.fillStyle(0x14122b).slice(C, C, R + 4, 0, Math.PI, false).fillPath();
      g.fillStyle(bottom).slice(C, C, R, 0, Math.PI, false).fillPath();
      g.fillStyle(0x000000, 0.12).slice(C, C, R, 0.2, Math.PI - 0.2, false).fillPath();
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
    for (const part of ['full', 'top', 'bot']) {
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
export function createIconTextures(scene) {
  if (scene.textures.exists('ic_gold')) return;
  const make = (key, draw, w = 64, h = 64) => { const g = gfx(scene); draw(g); g.generateTexture(key, w, h); g.destroy(); };
  const O = 0x14122b;
  make('ic_gold', (g) => {
    g.fillStyle(O).fillCircle(32, 34, 28);
    g.fillStyle(0xc98a00).fillCircle(32, 32, 26);
    g.fillStyle(0xffc21a).fillCircle(32, 30, 22);
    g.fillStyle(0xffe27a).fillCircle(26, 24, 7);
    g.fillStyle(0xc98a00).fillRect(28, 18, 8, 24);
  });
  make('ic_gem', (g) => {
    const p = (pts, c) => { g.fillStyle(c).fillPoints(pts.map(([x, y]) => ({ x, y })), true); };
    p([[12, 24], [22, 8], [42, 8], [52, 24], [32, 58]], O);
    p([[14, 23], [23, 10], [41, 10], [50, 23], [32, 54]], 0x1fa85a);
    p([[14, 23], [50, 23], [32, 54]], 0x3ee07a);
    p([[23, 10], [32, 23], [41, 10]], 0xa6ffd0);
  });
  make('ic_trophy', (g) => {
    g.fillStyle(O).fillRoundedRect(12, 6, 40, 34, 10).fillRect(26, 36, 12, 14).fillRoundedRect(16, 48, 32, 12, 4);
    g.fillStyle(0xffc21a).fillRoundedRect(15, 8, 34, 28, 8).fillRect(28, 34, 8, 14).fillRoundedRect(18, 50, 28, 8, 3);
    g.lineStyle(5, 0xffc21a).strokeCircle(12, 20, 8).strokeCircle(52, 20, 8);
    g.fillStyle(0xffe27a).fillRect(20, 12, 6, 16);
  });
  make('ic_crown', (g) => {
    const pts = (s, dy) => [[8, 50], [8, 18], [20, 32], [32, 10], [44, 32], [56, 18], [56, 50]].map(([x, y]) => ({ x, y: y + dy }));
    g.fillStyle(O).fillPoints(pts(1, 3), true);
    g.fillStyle(0xffc21a).fillPoints(pts(1, 0), true);
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
    const sword = (flip) => {
      const f = (x) => (flip ? 64 - x : x);
      g.fillStyle(O).fillPoints([{ x: f(8), y: 4 }, { x: f(18), y: 4 }, { x: f(50), y: 44 }, { x: f(44), y: 50 }], true);
      g.fillStyle(0xdfe6ff).fillPoints([{ x: f(10), y: 7 }, { x: f(17), y: 7 }, { x: f(47), y: 44 }, { x: f(44), y: 47 }], true);
      g.fillStyle(0xf2a12b).fillRect(flip ? 64 - 54 : 40, 44, 14, 6);
      g.fillStyle(0x8a5a2b).fillRect(flip ? 64 - 58 : 50, 50, 8, 10);
    };
    sword(false); sword(true);
  });
  make('ic_road', (g) => {
    g.fillStyle(O).fillRect(12, 6, 6, 54);
    g.fillStyle(O).fillPoints([{ x: 18, y: 6 }, { x: 56, y: 16 }, { x: 18, y: 32 }], true);
    g.fillStyle(0xe0454f).fillPoints([{ x: 18, y: 9 }, { x: 50, y: 17 }, { x: 18, y: 29 }], true);
    g.fillStyle(0xffc21a).fillRect(14, 8, 3, 50);
  });
  make('ic_profile', (g) => {
    g.fillStyle(O).fillCircle(32, 22, 15).fillRoundedRect(8, 36, 48, 26, 12);
    g.fillStyle(0x3fbf5a).fillCircle(32, 22, 12).fillRoundedRect(11, 39, 42, 20, 10);
  });
  make('ic_lock', (g) => {
    g.lineStyle(6, O).strokeCircle(32, 24, 12);
    g.fillStyle(O).fillRoundedRect(12, 26, 40, 32, 6);
    g.fillStyle(0x9aa0c8).fillRoundedRect(15, 29, 34, 26, 4);
    g.fillStyle(O).fillCircle(32, 40, 5);
  });
  make('ic_emote', (g) => {
    g.fillStyle(O).fillRoundedRect(4, 6, 56, 42, 14).fillPoints([{ x: 14, y: 44 }, { x: 10, y: 60 }, { x: 28, y: 46 }], true);
    g.fillStyle(0xffffff).fillRoundedRect(7, 9, 50, 36, 12);
    g.fillStyle(O).fillCircle(22, 24, 4).fillCircle(42, 24, 4);
    g.lineStyle(3, O).beginPath().arc(32, 28, 10, 0.3, Math.PI - 0.3).strokePath();
  });
  make('ic_flag', (g) => {
    g.fillStyle(0xffffff).fillRect(14, 8, 5, 50);
    g.fillStyle(0xffffff).fillPoints([{ x: 19, y: 8 }, { x: 52, y: 16 }, { x: 19, y: 30 }], true);
  });
  make('ic_sound', (g) => {
    g.fillStyle(0xffffff).fillRect(8, 24, 12, 16).fillPoints([{ x: 20, y: 24 }, { x: 34, y: 10 }, { x: 34, y: 54 }, { x: 20, y: 40 }], true);
    g.lineStyle(4, 0xffffff).beginPath().arc(34, 32, 12, -0.8, 0.8).strokePath();
    g.beginPath().arc(34, 32, 22, -0.8, 0.8).strokePath();
  });
  make('fx_spark', (g) => { g.fillStyle(0xffffff).fillCircle(8, 8, 8); }, 16, 16);
  make('fx_ray', (g) => {
    g.fillStyle(0xffffff, 0.9).fillPoints([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 22, y: 300 }, { x: 18, y: 300 }], true);
  }, 40, 300);
}

/** Decoraciones de arena dibujadas por código. */
export function createDecoTextures(scene) {
  if (scene.textures.exists('deco_tree')) return;
  const make = (key, draw, w = 64, h = 72) => { const g = gfx(scene); draw(g); g.generateTexture(key, w, h); g.destroy(); };
  const shadow = (g, w, h) => g.fillStyle(0x000000, 0.22).fillEllipse(w / 2, h - 8, w * 0.8, 14);
  make('deco_tree', (g) => {
    shadow(g, 64, 72);
    g.fillStyle(0x6e4c1e).fillRect(28, 44, 9, 22);
    g.fillStyle(0x1f5a1c).fillCircle(32, 30, 24);
    g.fillStyle(0x2f8a2a).fillCircle(28, 26, 19);
    g.fillStyle(0x58b84a).fillCircle(24, 20, 9);
  });
  make('deco_rock', (g) => {
    shadow(g, 64, 72);
    g.fillStyle(0x4b4d5e).fillEllipse(32, 48, 52, 34);
    g.fillStyle(0x8f91a0).fillEllipse(28, 44, 40, 24);
    g.fillStyle(0xc6c8d4).fillEllipse(22, 38, 14, 8);
  });
  make('deco_grave', (g) => {
    shadow(g, 64, 72);
    g.fillStyle(0x2a2440).fillRoundedRect(16, 18, 32, 46, { tl: 16, tr: 16, bl: 2, br: 2 });
    g.fillStyle(0x9a93b8).fillRoundedRect(19, 21, 26, 40, { tl: 13, tr: 13, bl: 2, br: 2 });
    g.fillStyle(0x5c5480).fillRect(30, 28, 4, 18).fillRect(24, 33, 16, 4);
  });
  make('deco_ice', (g) => {
    shadow(g, 64, 72);
    g.fillStyle(0x2f8aa8).fillPoints([{ x: 14, y: 64 }, { x: 22, y: 20 }, { x: 34, y: 6 }, { x: 44, y: 24 }, { x: 52, y: 64 }], true);
    g.fillStyle(0x8fe0f5).fillPoints([{ x: 18, y: 62 }, { x: 24, y: 22 }, { x: 34, y: 10 }, { x: 34, y: 62 }], true);
    g.fillStyle(0xffffff, 0.8).fillRect(27, 20, 3, 30);
  });
  make('deco_lava', (g) => {
    shadow(g, 64, 72);
    g.fillStyle(0x2a1610).fillPoints([{ x: 6, y: 66 }, { x: 22, y: 26 }, { x: 42, y: 26 }, { x: 58, y: 66 }], true);
    g.fillStyle(0x4a2a1c).fillPoints([{ x: 12, y: 64 }, { x: 24, y: 30 }, { x: 32, y: 30 }, { x: 28, y: 64 }], true);
    g.fillStyle(0xff6a1f).fillEllipse(32, 27, 22, 8);
    g.fillStyle(0xffd36a).fillCircle(30, 18, 4).fillCircle(37, 10, 3);
  });
  make('deco_pillar', (g) => {
    shadow(g, 64, 72);
    g.fillStyle(0x1b2a6b).fillRect(18, 10, 28, 56);
    g.fillStyle(0xe8e2ff).fillRect(21, 14, 22, 50);
    g.fillStyle(0xffc21a).fillRect(14, 6, 36, 8).fillRect(14, 60, 36, 6);
    g.fillStyle(0xb8b2e0).fillRect(26, 14, 3, 50).fillRect(35, 14, 3, 50);
  });
}
