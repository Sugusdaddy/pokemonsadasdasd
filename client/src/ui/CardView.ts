import Phaser from 'phaser';
import type { Card, Rarity } from '@arena/shared';
import { animInfo, hasTypeIcon, palette, portraitSprite } from '../systems/Assets';
import { cardName, t } from '../i18n';
import * as kit from './kit';

export interface CardViewOpts {
  level?: number | null;
  progress?: { have: number; need: number } | null;
  locked?: boolean;
  isNew?: boolean;
  compact?: boolean;
}

/** Contenedor de una carta dibujada. */
export interface CardView extends Phaser.GameObjects.Container {
  portrait: Phaser.GameObjects.Sprite;
  dim: Phaser.GameObjects.Graphics;
  cardW: number;
  cardH: number;
}

// ───────────────────────── Texturas del marco (se crean una vez) ─────────────────────────

/** Degradado del marco por rareza (de arriba abajo). */
const FRAME: Record<Rarity | 'locked', string[]> = {
  common: ['#f4f7fc', '#c3cbdb', '#8a94ab'],
  rare: ['#ffe08a', '#ffad33', '#d8701a'],
  epic: ['#f0c2ff', '#b763ff', '#6a23c4'],
  legendary: ['#ff9ee6', '#ffe27a', '#6ff0e2', '#5aa8ff'],
  locked: ['#5a6090', '#3e4370', '#2a2e52'],
};
/** Color "plano" de cada rareza (brillos, textos). */
export const RARITY_COLOR: Record<Rarity, number> = {
  common: 0xc3cbdb,
  rare: 0xffad33,
  epic: 0xb763ff,
  legendary: 0x6ff0e2,
};
export const RARITY_CSS: Record<Rarity, string> = {
  common: '#dfe6f5',
  rare: '#ffc46b',
  epic: '#d9a3ff',
  legendary: '#8ff7ec',
};

const FW = 120,
  FH = 150,
  FR = 16;

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Remache metálico (cartas comunes). */
function rivet(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, base: string, light: string): void {
  ctx.fillStyle = '#0b0d1f';
  ctx.beginPath();
  ctx.arc(x, y, r + 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.4, 0, Math.PI * 2);
  ctx.fill();
}

/** Gema en rombo con engaste dorado (épicas y legendarias). */
function gem(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string, light: string): void {
  const diamond = (rad: number) => {
    ctx.beginPath();
    ctx.moveTo(x, y - rad);
    ctx.lineTo(x + rad, y);
    ctx.lineTo(x, y + rad);
    ctx.lineTo(x - rad, y);
    ctx.closePath();
    ctx.fill();
  };
  ctx.fillStyle = '#0b0d1f';
  diamond(r + 3.5);
  ctx.fillStyle = '#ffc93c';
  diamond(r + 2);
  ctx.fillStyle = col;
  diamond(r);
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x - r * 0.55, y - r * 0.1);
  ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fill();
}

/** Escuadra dorada en una esquina (raras). sx, sy: hacia dónde abre (±1). */
function bracket(ctx: CanvasRenderingContext2D, x: number, y: number, sx: number, sy: number): void {
  for (const [col, wdt] of [
    ['#0b0d1f', 6],
    ['#ffd75a', 3],
  ] as const) {
    ctx.strokeStyle = col;
    ctx.lineWidth = wdt;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y + sy * 13);
    ctx.lineTo(x, y);
    ctx.lineTo(x + sx * 13, y);
    ctx.stroke();
  }
}

/** Adornos de las esquinas según la rareza (quedan en las esquinas del nine-slice, sin deformarse). */
function ornaments(ctx: CanvasRenderingContext2D, key: string): void {
  const m = 10;
  const corners: Array<[number, number, number, number]> = [
    [m, m, 1, 1],
    [FW - m, m, -1, 1],
    [m, FH - m, 1, -1],
    [FW - m, FH - m, -1, -1],
  ];
  for (const [x, y, sx, sy] of corners) {
    if (key === 'common') rivet(ctx, x, y, 3.2, '#c3cbdb', '#ffffff');
    else if (key === 'rare') {
      bracket(ctx, x - sx * 3, y - sy * 3, sx, sy);
      rivet(ctx, x + sx, y + sy, 2.6, '#ffc93c', '#fff1b8');
    } else if (key === 'epic') gem(ctx, x, y, 4.5, '#b763ff', '#f0c2ff');
    else if (key === 'legendary') gem(ctx, x, y, 5, '#2fd6c4', '#d8fffa');
  }
}

/** Número de fotogramas del brillo que recorre las épicas y legendarias. */
const SHINE_FRAMES = 16;

/** Hoja de fotogramas: una franja de luz diagonal que cruza la carta (recortada a su forma). */
function shineTexture(scene: Phaser.Scene): void {
  const tex = scene.textures.createCanvas('card_shine', FW * SHINE_FRAMES, FH);
  if (!tex) return;
  const ctx = tex.getContext();
  for (let i = 0; i < SHINE_FRAMES; i++) {
    const ox = i * FW;
    ctx.save();
    rr(ctx, ox + 3, 3, FW - 6, FH - 6, FR);
    ctx.clip();
    const p = -0.5 + (i / (SHINE_FRAMES - 1)) * 2; // de fuera a fuera
    const cx = ox + p * FW;
    const g = ctx.createLinearGradient(cx - 34, 0, cx + 34, 40);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.75)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(ox, 0, FW, FH);
    ctx.restore();
    tex.add(i, 0, ox, 0, FW, FH);
  }
  tex.refresh();
  scene.anims.create({
    key: 'card_shine',
    frames: Array.from({ length: SHINE_FRAMES }, (_, i) => ({ key: 'card_shine', frame: i })),
    frameRate: 30,
    repeat: -1,
  });
}

/** Destello de 4 puntas (legendarias). */
function starTexture(scene: Phaser.Scene): void {
  const tex = scene.textures.createCanvas('card_star', 24, 24);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(12, 0);
  ctx.quadraticCurveTo(13.5, 10.5, 24, 12);
  ctx.quadraticCurveTo(13.5, 13.5, 12, 24);
  ctx.quadraticCurveTo(10.5, 13.5, 0, 12);
  ctx.quadraticCurveTo(10.5, 10.5, 12, 0);
  ctx.fill();
  tex.refresh();
}

function ensureTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('card_art')) return;
  shineTexture(scene);
  starTexture(scene);
  for (const [key, stops] of Object.entries(FRAME)) {
    const tex = scene.textures.createCanvas(`card_frame_${key}`, FW, FH);
    if (!tex) continue;
    const ctx = tex.getContext();
    ctx.fillStyle = '#0b0d1f';
    rr(ctx, 0, 0, FW, FH, FR + 2);
    ctx.fill();
    const g = ctx.createLinearGradient(0, 0, key === 'legendary' ? FW : 0, FH);
    stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
    ctx.fillStyle = g;
    rr(ctx, 3, 3, FW - 6, FH - 6, FR);
    ctx.fill();
    // brillo superior del metal
    const gl = ctx.createLinearGradient(0, 3, 0, 40);
    gl.addColorStop(0, 'rgba(255,255,255,0.55)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl;
    rr(ctx, 6, 5, FW - 12, 34, FR - 4);
    ctx.fill();
    // hueco interior (se tapa con el arte)
    ctx.fillStyle = 'rgba(11,13,31,0.85)';
    rr(ctx, 9, 9, FW - 18, FH - 18, FR - 6);
    ctx.fill();
    ornaments(ctx, key);
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }
  // fondo del arte (blanco con volumen; se tiñe del color del tipo)
  const art = scene.textures.createCanvas('card_art', 96, 120);
  if (art) {
    const ctx = art.getContext();
    const g = ctx.createLinearGradient(0, 0, 0, 120);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.6, '#d8d8d8');
    g.addColorStop(1, '#8c8c8c');
    ctx.fillStyle = g;
    rr(ctx, 0, 0, 96, 120, 10);
    ctx.fill();
    art.refresh();
    art.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }
}

// ───────────────────────── Piezas ─────────────────────────

/** Gota de elixir con el coste. */
function elixirDrop(
  scene: Phaser.Scene,
  x: number,
  y: number,
  r: number,
  cost: number,
): Phaser.GameObjects.GameObject[] {
  const g = scene.add.graphics();
  const drop = (rad: number, dy: number, color: number, alpha = 1) => {
    g.fillStyle(color, alpha);
    g.fillCircle(x, y + dy, rad);
    g.fillTriangle(x - rad * 0.86, y + dy - rad * 0.5, x + rad * 0.86, y + dy - rad * 0.5, x, y + dy - rad * 1.75);
  };
  drop(r + 4, 3, kit.C.ink, 0.45);
  drop(r + 3, 0, kit.C.ink);
  drop(r, 0, 0xb52ad6);
  drop(r * 0.78, -r * 0.12, 0xe46cff);
  g.fillStyle(0xffffff, 0.55).fillCircle(x - r * 0.38, y - r * 0.42, r * 0.26);
  const n = kit.text(scene, x, y + 1, String(cost), 'number', '#ffffff', { size: Math.round(r * 1.25) });
  return [g, n];
}

/** Dibuja una carta. */
export function makeCardView(
  scene: Phaser.Scene,
  card: Card,
  x: number,
  y: number,
  w = 132,
  h = 158,
  opts: CardViewOpts = {},
): CardView {
  ensureTextures(scene);
  const c = scene.add.container(x, y) as CardView;
  const locked = !!opts.locked;
  const small = h < 110;
  const pal = palette(card.types[0]);
  const rarCol = RARITY_COLOR[card.rarity];

  // brillo de fondo para épicas y legendarias
  if (!locked && (card.rarity === 'epic' || card.rarity === 'legendary') && !small) {
    const glow = scene.add.image(0, 0, 'ui_glow').setTint(rarCol).setBlendMode(Phaser.BlendModes.ADD);
    glow.setDisplaySize(w * 1.7, h * 1.6).setAlpha(card.rarity === 'legendary' ? 0.55 : 0.4);
    c.add(glow);
    scene.tweens.add({
      targets: glow,
      alpha: glow.alpha * 0.45,
      yoyo: true,
      repeat: -1,
      duration: 1100,
      ease: 'Sine.easeInOut',
    });
  }

  // sombra
  const sh = scene.add.graphics();
  sh.fillStyle(kit.C.ink, 0.4).fillRoundedRect(-w / 2 + 2, -h / 2 + 6, w, h, Math.min(16, w * 0.12));
  c.add(sh);

  // marco de rareza (nine-slice)
  // en cartas pequeñas el marco se dibuja más grande y se reduce, para no deformar las esquinas
  const k = Math.min(1, w / 150);
  const corner = 22 * k;
  const frame = scene.add
    .nineslice(0, 0, `card_frame_${locked ? 'locked' : card.rarity}`, undefined, w / k, h / k, 22, 22, 22, 22)
    .setScale(k);
  c.add(frame);

  // arte: fondo del color del tipo + luz detrás del Pokémon
  const b = Math.max(6, Math.round(w * 0.085));
  const artH = h - 2 * b;
  const art = scene.add.nineslice(0, 0, 'card_art', undefined, (w - 2 * b) / k, artH / k, 12, 12, 12, 12).setScale(k);
  art.setTint(locked ? 0x2a2e52 : pal[2]);
  c.add(art);
  if (!locked) {
    const light = scene.add
      .image(0, -h * 0.08, 'ui_glow')
      .setTint(pal[4] ?? 0xffffff)
      .setAlpha(0.55);
    light.setDisplaySize(w * 0.95, w * 0.95).setBlendMode(Phaser.BlendModes.ADD);
    c.add(light);
  }

  const a = animInfo(card.pokemon, 'Idle');
  const scale = Math.min(h > 220 ? 4 : 2.5, Math.max(1, Math.floor(((h * 0.52) / (a.frame_height * 0.7)) * 2) / 2));
  const sp = portraitSprite(scene, 0, -h / 2 + h * 0.62, card.pokemon).setScale(scale);
  if (locked) {
    sp.stop();
    sp.setTintFill(0x0b0d1f).setAlpha(0.85);
  }
  c.add(sp);
  c.portrait = sp;

  // brillo que recorre las épicas y legendarias de vez en cuando (cada carta a su ritmo)
  if (!locked && (card.rarity === 'epic' || card.rarity === 'legendary')) {
    const legendary = card.rarity === 'legendary';
    const shine = scene.add
      .sprite(0, 0, 'card_shine', 0)
      .setDisplaySize(w, h)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(legendary ? 0xffffff : 0xf0d8ff)
      .setAlpha(legendary ? 0.8 : 0.6);
    shine.play({
      key: 'card_shine',
      delay: Math.random() * 2000,
      repeatDelay: (legendary ? 1600 : 2800) + Math.random() * 1200,
    });
    c.add(shine);
    if (legendary && !small) {
      // destellos que aparecen y se apagan en las esquinas
      for (const [sx, sy, d] of [
        [-0.36, -0.34, 0],
        [0.38, 0.12, 900],
      ]) {
        const star = scene.add
          .image(w * sx, h * sy, 'card_star')
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(0xd8fffa)
          .setScale(0);
        scene.tweens.add({
          targets: star,
          scale: Math.max(0.5, w / 160),
          angle: 90,
          yoyo: true,
          repeat: -1,
          duration: 420,
          delay: d + Math.random() * 600,
          repeatDelay: 1900,
          ease: 'Sine.easeInOut',
        });
        c.add(star);
      }
    }
  }

  // cinta del nombre
  const fs = Math.max(11, Math.round(h * 0.105));
  const ribbonH = Math.round(h * 0.22);
  if (!small) {
    const rib = scene.add.graphics();
    rib
      .fillStyle(kit.C.ink, 0.78)
      .fillRoundedRect(-w / 2 + b, h / 2 - b - ribbonH, w - 2 * b, ribbonH, { tl: 0, tr: 0, bl: 10, br: 10 });
    rib.fillStyle(rarCol, locked ? 0.15 : 0.55).fillRect(-w / 2 + b, h / 2 - b - ribbonH, w - 2 * b, 2);
    c.add(rib);
    const nameY = h / 2 - b - ribbonH / 2;
    const label = locked ? '???' : cardName(card);
    const nt = kit.text(scene, 0, nameY, label, 'label', card.type === 'spell' ? '#ffe38a' : '#ffffff', { size: fs });
    // nombres largos: se encogen para caber
    const maxW = w - 2 * b - 8;
    if (nt.width > maxW) nt.setScale(maxW / nt.width);
    c.add(nt);
  }

  // coste
  const r = Math.max(10, Math.round(h * 0.105));
  c.add(elixirDrop(scene, -w / 2 + r + 2, -h / 2 + r * 1.55, r, card.cost));

  // icono de tipo y cantidad
  if (!locked && !small && hasTypeIcon(scene, card.moveType)) {
    const ts = Math.max(1, Math.round(h / 80));
    const tb = scene.add.graphics();
    tb.fillStyle(kit.C.ink, 0.6).fillCircle(w / 2 - b - 9 * ts + 2, -h / 2 + b + 9 * ts + 1, 9 * ts + 2);
    c.add(tb);
    c.add(scene.add.image(w / 2 - b - 9 * ts + 2, -h / 2 + b + 9 * ts + 1, 'fx', `type_${card.moveType}`).setScale(ts));
  }
  if (card.count > 1 && !locked && !small) {
    c.add(
      kit.text(scene, w / 2 - b - 4, -h / 2 + h * 0.46, `x${card.count}`, 'label', '#ffffff', { size: fs, originX: 1 }),
    );
  }

  // nivel
  if (opts.level != null && !locked && !small) {
    const lv = opts.compact ? t('card.lvShort', { n: opts.level }) : t('card.level', { n: opts.level });
    const lt = kit.text(scene, 0, 0, lv, 'label', RARITY_CSS[card.rarity], { size: Math.round(fs * 0.85) });
    const pw = lt.width + 14,
      ph = Math.round(fs * 1.25);
    // esquina derecha, montada sobre el borde de la cinta: no tapa al Pokémon ni al tipo
    const py = h / 2 - b - ribbonH;
    const px = w / 2 - b - pw / 2 - 2;
    const pg = scene.add.graphics();
    pg.fillStyle(kit.C.ink, 0.92).fillRoundedRect(px - pw / 2, py - ph / 2, pw, ph, ph / 2);
    pg.lineStyle(1.5, RARITY_COLOR[card.rarity], 0.8).strokeRoundedRect(px - pw / 2, py - ph / 2, pw, ph, ph / 2);
    lt.setPosition(px, py);
    c.add([pg, lt]);
  }

  // progreso de cartas para subir de nivel
  if (opts.progress && !locked) {
    const { have, need } = opts.progress;
    const bh = Math.max(18, Math.round(h * 0.12)),
      by = h / 2 + 6;
    const ready = have >= need && need !== Infinity;
    const f = need === Infinity ? 1 : Math.min(1, have / need);
    const bar = kit.progressBar(
      scene,
      -w / 2,
      by,
      w,
      bh,
      ready ? kit.C.good : kit.C.info,
      f,
      need === Infinity ? t('card.max') : `${have}/${need}`,
    );
    c.add(bar.root);
    if (ready) {
      const arrow = scene.add.graphics();
      arrow.fillStyle(kit.C.ink).fillTriangle(w / 2 - 2, by - 2, w / 2 + 16, by - 2, w / 2 + 7, by - 16);
      arrow.fillStyle(kit.C.good).fillTriangle(w / 2 + 1, by - 4, w / 2 + 13, by - 4, w / 2 + 7, by - 13);
      c.add(arrow);
      scene.tweens.add({ targets: arrow, y: -6, yoyo: true, repeat: -1, duration: 420, ease: 'Sine.easeInOut' });
    }
  }

  if (opts.isNew) {
    const nt = kit.text(scene, 0, 0, t('card.new'), 'label', '#ffffff', { size: Math.max(14, Math.round(fs * 0.95)) });
    const nw = nt.width + 18;
    const ng = scene.add.graphics();
    ng.fillStyle(kit.C.ink).fillRoundedRect(-w / 2 - 8, -h / 2 - 14, nw + 4, 30, 10);
    ng.fillStyle(kit.C.bad).fillRoundedRect(-w / 2 - 6, -h / 2 - 12, nw, 26, 9);
    nt.setPosition(-w / 2 - 6 + nw / 2, -h / 2 + 1);
    c.add([ng, nt]);
    scene.tweens.add({ targets: [ng, nt], alpha: 0.6, yoyo: true, repeat: -1, duration: 500 });
  }

  const dim = scene.add.graphics();
  dim.fillStyle(kit.C.ink, 0.62).fillRoundedRect(-w / 2, -h / 2, w, h, corner);
  dim.setVisible(false);
  c.add(dim);
  c.dim = dim;
  c.cardW = w;
  c.cardH = h;
  return c;
}
