/**
 * npm run audio -- --src <carpeta con los paquetes descomprimidos>
 *
 * Convierte los sonidos elegidos de los paquetes CC0 (Kenney y Juhani Junkala, ver
 * CREDITS.md) en lo que usa el juego: client/public/audio/<nombre>[_n].ogg y .mp3 +
 * manifest.json. Los archivos se buscan por nombre en cualquier subcarpeta de --src, así
 * que da igual cómo estén descomprimidos.
 *
 * Efectos: mono, sin silencio al principio y con el pico normalizado (más `gain` dB).
 * Música: estéreo, sin recortar (para que el bucle siga cuadrando).
 * Requiere ffmpeg en el PATH.
 *
 * Para cambiar un sonido: edita SFX o MUSIC y vuelve a ejecutar el script.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'client/public/audio');

/** Variante = un archivo, o varios que se mezclan en uno (capas). */
type Variant = string | string[];
interface SfxDef {
  variants: Variant[];
  /** Ajuste de volumen respecto al pico normalizado (dB). */
  gain?: number;
}

// prettier-ignore
const SFX: Record<string, SfxDef> = {
  click:     { variants: ['click_001.ogg'], gain: -8 },
  select:    { variants: ['select_001.ogg', 'select_002.ogg'], gain: -6 },
  noElixir:  { variants: ['error_004.ogg'], gain: -6 },
  emote:     { variants: ['pluck_002.ogg'], gain: -5 },
  countdown: { variants: ['tick_004.ogg'], gain: -4 },
  fight:     { variants: ['jingles_HIT01.ogg'], gain: -4 },
  deploy:    { variants: ['impactSoft_heavy_000.ogg', 'impactSoft_heavy_001.ogg', 'impactSoft_heavy_002.ogg'], gain: -3 },
  hit:       { variants: ['impactPunch_medium_000.ogg', 'impactPunch_medium_001.ogg', 'impactPunch_medium_002.ogg'], gain: -9 },
  shoot:     { variants: ['drawKnife1.ogg', 'drawKnife2.ogg', 'drawKnife3.ogg'], gain: -12 },
  boom:      { variants: ['explosionCrunch_000.ogg', 'explosionCrunch_001.ogg', 'explosionCrunch_002.ogg'], gain: -3 },
  tower:     { variants: ['lowFrequency_explosion_000.ogg'], gain: -1 },
  faint:     { variants: ['minimize_005.ogg'], gain: -8 },
  coin:      { variants: ['handleCoins2.ogg', 'chip-lay-1.ogg', 'chip-lay-2.ogg', 'chip-lay-3.ogg'], gain: -6 },
  wobble:    { variants: ['impactPlate_light_000.ogg', 'impactPlate_light_001.ogg'], gain: -4 },
  open:      { variants: [['metalLatch.ogg', 'maximize_006.ogg']], gain: -3 },
  cardFly:   { variants: ['card-slide-1.ogg', 'card-slide-2.ogg', 'card-slide-3.ogg'], gain: -6 },
  card:      { variants: ['card-place-1.ogg', 'card-place-2.ogg', 'card-place-4.ogg'], gain: -4 },
  rare:      { variants: ['jingles_NES14.ogg'], gain: -5 },
  epic:      { variants: ['jingles_NES08.ogg'], gain: -4 },
  legendary: { variants: ['jingles_STEEL02.ogg'], gain: -2 },
  upgrade:   { variants: ['jingles_PIZZI02.ogg'], gain: -4 },
  win:       { variants: ['jingles_NES12.ogg'], gain: -3 },
  lose:      { variants: ['jingles_NES11.ogg'], gain: -4 },
  crown:     { variants: ['jingles_NES09.ogg'], gain: -4 },
};

/** Música (bucles de Chiptune Adventures, de Juhani Junkala). */
const MUSIC: Record<string, string> = {
  lobby: 'Juhani Junkala [Chiptune Adventures] 4. Stage Select.ogg',
  battle: 'Juhani Junkala [Chiptune Adventures] 1. Stage 1.ogg',
  overtime: 'Juhani Junkala [Chiptune Adventures] 3. Boss Fight.ogg',
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Índice nombre de archivo → ruta, de todo lo que hay en --src. */
function index(dir: string, out = new Map<string, string>()): Map<string, string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) index(p, out);
    else if (!out.has(e.name)) out.set(e.name, p);
  }
  return out;
}

function ffmpeg(args: string[]): string {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg falló:\n${r.stderr.slice(-800)}`);
  return r.stderr;
}

/** Pico (dB) de un archivo. */
function peak(file: string): number {
  const log = ffmpeg(['-i', file, '-af', 'volumedetect', '-f', 'null', '-']);
  const m = /max_volume: (-?[\d.]+) dB/.exec(log);
  return m ? Number(m[1]) : 0;
}

function main(): void {
  const src = arg('src');
  if (!src || !fs.existsSync(src)) {
    console.error('Uso: npm run audio -- --src <carpeta con los paquetes descomprimidos>');
    process.exit(1);
  }
  const files = index(path.resolve(src));
  const find = (name: string): string => {
    const p = files.get(name);
    if (!p) throw new Error(`No encuentro ${name} en ${src}`);
    return p;
  };
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const manifest: { sfx: Record<string, number>; music: string[] } = { sfx: {}, music: [] };
  const tmp = path.join(OUT, '_tmp.wav');

  for (const [name, def] of Object.entries(SFX)) {
    def.variants.forEach((v, i) => {
      const layers = (Array.isArray(v) ? v : [v]).map(find);
      // 1) capas mezcladas, mono, sin silencio al principio
      const inputs = layers.flatMap((l) => ['-i', l]);
      const trim = 'silenceremove=start_periods=1:start_threshold=-55dB';
      // con varias capas hace falta un filtro complejo (varias entradas)
      const filter =
        layers.length > 1 ? ['-filter_complex', `amix=inputs=${layers.length}:normalize=0,${trim}`] : ['-af', trim];
      ffmpeg([...inputs, ...filter, '-ac', '1', '-ar', '44100', tmp]);
      // 2) pico a -1 dB más el ajuste del sonido
      const vol = (-1 - peak(tmp) + (def.gain ?? 0)).toFixed(1);
      const base = path.join(OUT, `${name}_${i}`);
      ffmpeg(['-i', tmp, '-af', `volume=${vol}dB`, '-c:a', 'libvorbis', '-q:a', '4', `${base}.ogg`]);
      ffmpeg(['-i', tmp, '-af', `volume=${vol}dB`, '-c:a', 'libmp3lame', '-q:a', '5', `${base}.mp3`]);
    });
    manifest.sfx[name] = def.variants.length;
    console.log(`  ${name} (${def.variants.length})`);
  }

  for (const [name, file] of Object.entries(MUSIC)) {
    const p = find(file);
    const vol = (-1.5 - peak(p)).toFixed(1);
    const base = path.join(OUT, `music_${name}`);
    ffmpeg(['-i', p, '-af', `volume=${vol}dB`, '-c:a', 'libvorbis', '-q:a', '3', `${base}.ogg`]);
    ffmpeg(['-i', p, '-af', `volume=${vol}dB`, '-c:a', 'libmp3lame', '-b:a', '112k', `${base}.mp3`]);
    manifest.music.push(name);
    console.log(`  música: ${name}`);
  }
  fs.rmSync(tmp, { force: true });
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const bytes = fs.readdirSync(OUT).reduce((t, f) => t + fs.statSync(path.join(OUT, f)).size, 0);
  console.log(
    `Listo: ${fs.readdirSync(OUT).length} archivos, ${(bytes / 1024 / 1024).toFixed(2)} MB en client/public/audio`,
  );
}

main();
