/**
 * npm run assets [-- --fan-only] [-- --root <carpeta>] [-- --force]
 *
 * Lee el pack de sprites (por defecto ART.root de shared/src/config.ts) y genera:
 *   shared/src/data/pack.json      datos de juego (tipos, stats, duraciones…), sin arte. Va en git.
 *   client/public/gen/manifest.json lista de atlas + info de animaciones (anclas, frames, tiempos).
 *   client/public/gen/portraits.*  atlas con el Idle mirando abajo de todos los Pokémon (menú y cartas).
 *   client/public/gen/pk/<id>.*    atlas con todas las animaciones de cada Pokémon (batalla).
 *   client/public/gen/fx.*         proyectiles de ataques, impacto e iconos de tipo.
 *
 * Con spriteSource 'fan-only' los sprites oficiales (Chunsoft) y mixtos se sustituyen por una
 * criatura genérica dibujada aquí, con los mismos tamaños y anclas, así que el juego no cambia.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import crypto from 'node:crypto';
import { MaxRectsPacker } from 'maxrects-packer';
import { ART, ARENAS, TOWER_GUARDIANS, type SpriteSource } from '../shared/src/config';
import { DEFS, DEFAULT_MOVE } from '../shared/src/data/cardDefs';
import type { AnimName, Pack, PackPokemon, SpriteOrigin } from '../shared/src/data/pack';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argVal = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const SOURCE_DIR = path.resolve(ROOT, argVal('--root') ?? ART.root);
const SPRITE_SOURCE: SpriteSource = args.includes('--fan-only') ? 'fan-only' : ART.spriteSource;
const OUT_GEN = path.join(ROOT, 'client/public/gen');
const OUT_PACK = path.join(ROOT, 'shared/src/data/pack.json');
const ANIMS: AnimName[] = ['Walk', 'Attack', 'Idle', 'Shoot', 'Charge', 'Hurt', 'Faint'];
const TYPES = [
  'normal',
  'fire',
  'water',
  'grass',
  'electric',
  'psychic',
  'ice',
  'fighting',
  'poison',
  'ground',
  'flying',
  'bug',
  'rock',
  'ghost',
  'dragon',
  'dark',
  'steel',
  'fairy',
];

// ───────────────────────── Metadatos del pack ─────────────────────────

interface MetaAnim {
  frame_width: number;
  frame_height: number;
  frame_count: number;
  frame_durations_ticks?: number[];
  total_duration_sec: number;
  ground_anchor: { x: number; y: number };
  files: { normal: string; shiny?: string };
}
interface MetaPokemon {
  id: number;
  name: string;
  types?: string[];
  stats?: PackPokemon['stats'];
  shadow_size?: number;
  hovers?: boolean;
  animations: Partial<Record<AnimName, MetaAnim>>;
}
interface MetaAttack {
  name: string;
  type: string;
  kind: string;
  base_stats?: Record<string, number>;
  vfx?: { palette?: string; sprite_file?: string };
}
interface Meta {
  project_info: { title: string; version: string };
  system_specification: { cast_animation_rules: { mapping: Record<string, AnimName> } };
  type_palettes: Record<string, string[]>;
  vfx_shapes: Record<string, { frame_width: number; frame_height: number; frames: string[] }>;
  attacks: Record<string, MetaAttack>;
  pokemon: Record<string, MetaPokemon>;
}

function loadMeta(): Meta {
  const file = path.join(SOURCE_DIR, 'animations_metadata.json');
  if (!fs.existsSync(file)) {
    console.error(
      `\n✖ No encuentro ${path.relative(ROOT, file)}.\n  Copia tu carpeta SpritesPokemon dentro de assets/ (mira el README).\n`,
    );
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Meta;
}

/** Origen de cada sprite según la tabla "Todo el pack" de CREDITS.md. */
function loadOrigins(): Record<number, SpriteOrigin> {
  const out: Record<number, SpriteOrigin> = {};
  const isDefaultPack = path.basename(SOURCE_DIR.replace(/[\\/]+$/, '')) === 'SpritesPokemon';
  if (!isDefaultPack) return out; // arte propio: todo es 'custom'
  const credits = fs.readFileSync(path.join(ROOT, 'CREDITS.md'), 'utf8');
  const section = credits.slice(credits.indexOf('### Todo el pack'));
  for (const line of section.split('\n')) {
    const m = /^\|\s*(\d{4})\s*\|[^|]*\|\s*([^|]+?)\s*\|/.exec(line);
    if (!m) continue;
    const o = m[2].toLowerCase();
    out[Number(m[1])] = o.startsWith('oficial')
      ? 'official'
      : o.startsWith('mixto')
        ? 'mixed'
        : o.startsWith('fan')
          ? 'fan'
          : 'official';
  }
  return out;
}

// ───────────────────────── PNG ─────────────────────────

const pngCache = new Map<string, PNG>();
function readPng(rel: string): PNG {
  let p = pngCache.get(rel);
  if (!p) {
    p = PNG.sync.read(fs.readFileSync(path.join(SOURCE_DIR, rel)));
    pngCache.set(rel, p);
  }
  return p;
}

function crop(src: PNG, x: number, y: number, w: number, h: number): PNG {
  const out = new PNG({ width: w, height: h });
  PNG.bitblt(src, out, x, y, w, h, 0, 0);
  return out;
}

const readFilePng = (abs: string): PNG => PNG.sync.read(fs.readFileSync(abs));

const hex = (s: string): [number, number, number] => [
  parseInt(s.slice(1, 3), 16),
  parseInt(s.slice(3, 5), 16),
  parseInt(s.slice(5, 7), 16),
];

/**
 * Criatura genérica para el modo fan-only: un "blob" del color de su tipo que
 * respira, camina, se agacha al atacar y se aplana al debilitarse.
 */
function placeholderFrame(a: MetaAnim, anim: AnimName, dir: number, i: number, pal: string[]): PNG {
  const w = a.frame_width,
    h = a.frame_height;
  const png = new PNG({ width: w, height: h });
  const n = a.frame_count;
  const t = n > 1 ? i / (n - 1) : 0;
  const ax = a.ground_anchor.x,
    ay = a.ground_anchor.y;
  let rx = Math.min(12, w * 0.3),
    ry = rx * 0.85;
  let lift = 0;
  if (anim === 'Walk') lift = Math.abs(Math.sin(t * Math.PI * 2)) * 2;
  if (anim === 'Idle') ry *= 1 + 0.06 * Math.sin(t * Math.PI * 2);
  if (anim === 'Attack' || anim === 'Shoot') {
    rx *= 1 + 0.15 * Math.sin(t * Math.PI);
    ry *= 1 - 0.1 * Math.sin(t * Math.PI);
  }
  if (anim === 'Charge') {
    rx *= 1 + 0.08 * Math.sin(t * Math.PI * 4);
  }
  if (anim === 'Hurt') {
    rx *= 0.9;
  }
  if (anim === 'Faint') {
    ry *= 1 - 0.6 * t;
    rx *= 1 + 0.3 * t;
  }
  const cx = ax,
    cy = ay - ry - lift;
  // dirección (fila 0 = abajo, en sentido horario)
  const ang = Math.PI / 2 - (dir * Math.PI) / 4;
  const ex = Math.cos(ang);
  const [outline, , body, light] = [hex(pal[0]), hex(pal[1]), hex(pal[2]), hex(pal[3])];
  const put = (x: number, y: number, c: [number, number, number], alpha = 255) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const k = (y * w + x) * 4;
    png.data[k] = c[0];
    png.data[k + 1] = c[1];
    png.data[k + 2] = c[2];
    png.data[k + 3] = alpha;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x + 0.5 - cx) / rx,
        dy = (y + 0.5 - cy) / ry;
      const d = dx * dx + dy * dy;
      if (d <= 1) put(x, y, d > 0.78 ? outline : dx < -0.2 && dy < -0.3 ? light : body);
    }
  }
  // ojos (no se ven mirando hacia arriba)
  if (anim !== 'Faint' && !(dir >= 3 && dir <= 5)) {
    const fx = Math.round(cx + ex * rx * 0.35),
      fy = Math.round(cy - ry * 0.15);
    for (const s of [-1, 1]) {
      const px = fx + s * Math.max(2, Math.round(rx * 0.3));
      for (let yy = 0; yy < 3; yy++) put(px, fy + yy, outline);
      put(px + 1, fy, [255, 255, 255]);
    }
  }
  return png;
}

// ───────────────────────── Atlas ─────────────────────────

interface Img {
  path: string;
  png: PNG;
}

const ATLAS_SIZE = 2048;
const PADDING = 2;

/** Rectángulo con píxeles visibles (recorte del espacio transparente). */
function trimBox(p: PNG) {
  let x0 = p.width,
    y0 = p.height,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      if (p.data[(y * p.width + x) * 4 + 3] === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return { x: 0, y: 0, w: 1, h: 1 };
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * Empaqueta con recorte y frames idénticos deduplicados. Escribe <out>.json en
 * formato multiatlas de Phaser 3 y <out>-N.png. Devuelve el nº de páginas.
 */
function writeAtlas(images: Img[], outBase: string): number {
  type Unique = {
    w: number;
    h: number;
    png: PNG;
    box: ReturnType<typeof trimBox>;
    bin?: number;
    x?: number;
    y?: number;
  };
  const uniques = new Map<string, Unique>();
  const frames: Array<{ name: string; key: string; box: ReturnType<typeof trimBox>; sw: number; sh: number }> = [];
  for (const img of images) {
    const box = trimBox(img.png);
    const tight = crop(img.png, box.x, box.y, box.w, box.h);
    const key = crypto.createHash('sha1').update(`${box.w}x${box.h}`).update(tight.data).digest('hex');
    if (!uniques.has(key)) uniques.set(key, { w: box.w, h: box.h, png: tight, box });
    frames.push({ name: img.path, key, box, sw: img.png.width, sh: img.png.height });
  }
  const packer = new MaxRectsPacker(ATLAS_SIZE, ATLAS_SIZE, PADDING, {
    smart: true,
    pot: false,
    square: false,
    allowRotation: false,
  });
  packer.addArray(
    [...uniques.entries()].map(([key, u]) => ({ width: u.w, height: u.h, x: 0, y: 0, data: key })) as never,
  );
  const name = path.basename(outBase);
  const dir = path.dirname(outBase);
  fs.mkdirSync(dir, { recursive: true });
  const textures = packer.bins.map((bin, bi) => {
    const page = new PNG({ width: bin.width, height: bin.height });
    for (const r of bin.rects) {
      const u = uniques.get(r.data as string)!;
      PNG.bitblt(u.png, page, 0, 0, u.w, u.h, r.x, r.y);
      u.bin = bi;
      u.x = r.x;
      u.y = r.y;
    }
    const image = `${name}-${bi}.png`;
    fs.writeFileSync(path.join(dir, image), PNG.sync.write(page));
    return { image, format: 'RGBA8888', size: { w: bin.width, h: bin.height }, scale: 1, frames: [] as unknown[] };
  });
  for (const f of frames) {
    const u = uniques.get(f.key)!;
    textures[u.bin!].frames.push({
      filename: f.name,
      rotated: false,
      trimmed: f.box.w !== f.sw || f.box.h !== f.sh,
      sourceSize: { w: f.sw, h: f.sh },
      spriteSourceSize: { x: f.box.x, y: f.box.y, w: f.box.w, h: f.box.h },
      frame: { x: u.x, y: u.y, w: u.w, h: u.h },
    });
  }
  fs.writeFileSync(`${outBase}.json`, JSON.stringify({ textures }));
  return textures.length;
}

// ───────────────────────── Principal ─────────────────────────

async function main() {
  const t0 = Date.now();
  const meta = loadMeta();
  const origins = loadOrigins();
  const isDefaultPack = Object.keys(origins).length > 0;

  // Pokémon que usa el juego: cartas, guardianes de las torres y "estrellas" de las arenas.
  const ids = new Set<number>();
  for (const d of Object.values(DEFS)) ids.add(d.pokemon);
  for (const team of Object.values(TOWER_GUARDIANS)) for (const g of Object.values(team)) ids.add(g.pokemon);
  for (const a of ARENAS) ids.add(a.star);
  const moves = new Set<string>();
  for (const team of Object.values(TOWER_GUARDIANS)) for (const g of Object.values(team)) moves.add(g.move);
  for (const d of Object.values(DEFS)) {
    const pk = meta.pokemon[String(d.pokemon)];
    if (!pk) throw new Error(`El Pokémon ${d.pokemon} no está en animations_metadata.json`);
    moves.add(d.move || DEFAULT_MOVE[(pk.types || ['normal'])[0]] || 'tackle');
  }

  // 1) pack.json
  const pack: Pack = {
    source: {
      title: meta.project_info.title,
      version: meta.project_info.version,
      spriteSource: SPRITE_SOURCE,
      generatedFrom: path.relative(ROOT, SOURCE_DIR).replace(/\\/g, '/'),
    },
    castAnim: meta.system_specification.cast_animation_rules.mapping,
    typePalettes: meta.type_palettes,
    pokemon: {},
    attacks: {},
  };
  for (const [id, a] of Object.entries(meta.attacks)) {
    pack.attacks[id] = {
      name: a.name,
      type: a.type,
      kind: a.kind,
      base_stats: a.base_stats || {},
      palette: a.vfx?.palette || a.type,
    };
  }
  const placeholder = (id: number) => SPRITE_SOURCE === 'fan-only' && isDefaultPack && origins[id] !== 'fan';
  for (const id of [...ids].sort((a, b) => a - b)) {
    const pk = meta.pokemon[String(id)];
    if (!pk) throw new Error(`El Pokémon ${id} no está en animations_metadata.json`);
    const animDur: Partial<Record<AnimName, number>> = {};
    for (const an of ANIMS) if (pk.animations[an]) animDur[an] = pk.animations[an]!.total_duration_sec;
    pack.pokemon[String(id)] = {
      id,
      name: pk.name,
      types: pk.types || ['normal'],
      stats: {
        bst: pk.stats?.bst,
        atk: pk.stats?.atk,
        spd: pk.stats?.spd,
        rarity: pk.stats?.rarity,
        legendary: pk.stats?.legendary,
      },
      shadow_size: pk.shadow_size ?? 1,
      hovers: !!pk.hovers,
      idleH: pk.animations.Idle?.frame_height ?? 40,
      animDur,
      origin: isDefaultPack ? (origins[id] ?? 'official') : 'custom',
      placeholder: placeholder(id),
    };
  }
  fs.writeFileSync(OUT_PACK, JSON.stringify(pack, null, 1) + '\n');

  // 2) Atlas
  fs.rmSync(OUT_GEN, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT_GEN, 'pk'), { recursive: true });
  const anims: Record<
    string,
    Record<string, { fw: number; fh: number; n: number; ticks: number[]; ax: number; ay: number; dur: number }>
  > = {};
  const portraits: Img[] = [];
  const atlases: Record<string, number> = {};

  for (const id of ids) {
    const pk = meta.pokemon[String(id)];
    const pal = meta.type_palettes[(pk.types || ['normal'])[0]] || meta.type_palettes.normal;
    const fake = placeholder(id);
    const imgs: Img[] = [];
    anims[id] = {};
    for (const an of ANIMS) {
      const a = pk.animations[an];
      if (!a) continue;
      const n = a.frame_count;
      anims[id][an] = {
        fw: a.frame_width,
        fh: a.frame_height,
        n,
        ticks: Array.from({ length: n }, (_, i) => a.frame_durations_ticks?.[i] ?? 4),
        ax: a.ground_anchor.x,
        ay: a.ground_anchor.y,
        dur: a.total_duration_sec,
      };
      const sheet = fake ? null : readPng(a.files.normal);
      for (let d = 0; d < 8; d++) {
        for (let i = 0; i < n; i++) {
          const buf = fake
            ? placeholderFrame(a, an, d, i, pal)
            : crop(sheet!, i * a.frame_width, d * a.frame_height, a.frame_width, a.frame_height);
          imgs.push({ path: `${an}_${d}_${i}`, png: buf });
          if (an === 'Idle' && d === 0) portraits.push({ path: `${id}_${i}`, png: buf });
        }
      }
    }
    atlases[`pk_${id}`] = writeAtlas(imgs, path.join(OUT_GEN, 'pk', String(id)));
    pngCache.clear();
    process.stdout.write('.');
  }
  atlases.portraits = writeAtlas(portraits, path.join(OUT_GEN, 'portraits'));

  // fx: proyectiles, impacto e iconos de tipo
  const fx: Img[] = [];
  const moveFrames: Record<string, string> = {};
  for (const m of moves) {
    const file = meta.attacks[m]?.vfx?.sprite_file;
    if (!file || !fs.existsSync(path.join(SOURCE_DIR, file))) continue;
    fx.push({ path: `mv_${m}`, png: readFilePng(path.join(SOURCE_DIR, file)) });
    moveFrames[m] = `mv_${m}`;
  }
  const impact = meta.vfx_shapes.impact;
  impact.frames.forEach((f, i) => fx.push({ path: `impact_${i}`, png: readFilePng(path.join(SOURCE_DIR, f)) }));
  for (const t of TYPES) {
    const f = path.join(SOURCE_DIR, `attacks/types/type_${t}.png`);
    if (fs.existsSync(f)) fx.push({ path: `type_${t}`, png: readFilePng(f) });
  }
  atlases.fx = writeAtlas(fx, path.join(OUT_GEN, 'fx'));

  const manifest = {
    generatedAt: new Date().toISOString(),
    spriteSource: SPRITE_SOURCE,
    source: pack.source.generatedFrom,
    atlases,
    impactFrames: impact.frames.length,
    moves: moveFrames,
    anims,
  };
  fs.writeFileSync(path.join(OUT_GEN, 'manifest.json'), JSON.stringify(manifest));

  const fakes = Object.values(pack.pokemon).filter((p) => p.placeholder).length;
  console.log(
    `\n✔ ${ids.size} Pokémon, ${moves.size} ataques (${SPRITE_SOURCE}${fakes ? `, ${fakes} sustituidos por la criatura genérica` : ''}) en ${((Date.now() - t0) / 1000).toFixed(1)} s`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
