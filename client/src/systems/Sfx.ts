// ─────────────────────────────────────────────────────────────
//  SONIDO Y MÚSICA
//  - Efectos y música CC0 (Kenney y Juhani Junkala, ver CREDITS.md) en public/audio,
//    generados con `npm run audio`. Se usan si cargan; si no, el sintetizador de abajo.
//  - Mezclador: volumen general, de música y de efectos (Perfil). La música baja sola
//    mientras suena una fanfarria (revelar cartas, ganar, coronas…).
// ─────────────────────────────────────────────────────────────

/** Volúmenes del mezclador (0 a 1). */
export interface Volumes {
  master: number;
  music: number;
  sfx: number;
}
export const DEFAULT_VOLUMES: Volumes = { master: 0.9, music: 0.6, sfx: 1 };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxGain: GainNode | null = null;
let musicGain: GainNode | null = null;
/** Baja la música por debajo de las fanfarrias (ducking). */
let duckGain: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
const vol: Volumes = { ...DEFAULT_VOLUMES };
const last: Record<string, number> = {};

type AudioCtor = typeof AudioContext;

/** Curva de volumen: el oído no es lineal; así la mitad de la barra suena a "la mitad". */
const curve = (v: number) => Math.pow(Math.max(0, Math.min(1, v)), 1.7);

function ac(): AudioContext | null {
  if (!ctx) {
    const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
    const AC = w.AudioContext || w.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
    sfxGain = ctx.createGain();
    sfxGain.connect(master);
    duckGain = ctx.createGain();
    duckGain.connect(master);
    musicGain = ctx.createGain();
    musicGain.connect(duckGain);
    applyVolumes();
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function applyVolumes(): void {
  if (!ctx || !master || !sfxGain || !musicGain) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(curve(vol.master) * 0.9, t, 0.03);
  sfxGain.gain.setTargetAtTime(curve(vol.sfx), t, 0.03);
  musicGain.gain.setTargetAtTime(curve(vol.music) * 0.7, t, 0.03);
}

// ───────────────────────── Sintetizador (respaldo) ─────────────────────────

/** El sintetizador sonaba con el volumen general a la mitad: se mantiene ese nivel. */
let synthOut: GainNode | null = null;
let synthMusic: GainNode | null = null;
function synthNodes(): { sfx: GainNode; music: GainNode } | null {
  const c = ac();
  if (!c || !sfxGain || !musicGain) return null;
  if (!synthOut) {
    synthOut = c.createGain();
    synthOut.gain.value = 0.5;
    synthOut.connect(sfxGain);
    synthMusic = c.createGain();
    synthMusic.gain.value = 0.25;
    synthMusic.connect(musicGain);
  }
  return { sfx: synthOut, music: synthMusic! };
}

interface ToneOpts {
  f?: number;
  f2?: number | null;
  type?: OscillatorType;
  dur?: number;
  vol?: number;
  delay?: number;
  out?: AudioNode | null;
}

function tone({ f = 440, f2 = null, type = 'square', dur = 0.12, vol = 0.25, delay = 0, out = null }: ToneOpts): void {
  const c = ac();
  const n = synthNodes();
  if (!c || !n) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out || n.sfx);
  o.start(t);
  o.stop(t + dur + 0.02);
}

interface NoiseOpts {
  dur?: number;
  vol?: number;
  filter?: number;
  delay?: number;
  sweep?: number | null;
}

function noise({ dur = 0.15, vol = 0.3, filter = 1200, delay = 0, sweep = null }: NoiseOpts): void {
  const c = ac();
  const n = synthNodes();
  if (!c || !n || !noiseBuf) return;
  const t = c.currentTime + delay;
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  const fl = c.createBiquadFilter();
  fl.type = 'lowpass';
  fl.frequency.setValueAtTime(filter, t);
  if (sweep) fl.frequency.exponentialRampToValueAtTime(sweep, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl).connect(g).connect(n.sfx);
  s.start(t);
  s.stop(t + dur + 0.02);
}

const throttle = (name: string, ms: number): boolean => {
  const n = performance.now();
  if (last[name] && n - last[name] < ms) return true;
  last[name] = n;
  return false;
};

// prettier-ignore
const SOUNDS = {
  click: () => tone({ f: 660, f2: 880, type: 'square', dur: 0.06, vol: 0.12 }),
  select: () => tone({ f: 520, f2: 760, type: 'triangle', dur: 0.08, vol: 0.18 }),
  deploy: () => { noise({ dur: 0.18, vol: 0.25, filter: 900, sweep: 200 }); tone({ f: 180, f2: 90, type: 'sine', dur: 0.18, vol: 0.3 }); },
  hit: () => noise({ dur: 0.07, vol: 0.18, filter: 2500, sweep: 600 }),
  shoot: () => tone({ f: 900, f2: 300, type: 'sawtooth', dur: 0.09, vol: 0.06 }),
  boom: () => { noise({ dur: 0.45, vol: 0.45, filter: 1500, sweep: 80 }); tone({ f: 110, f2: 40, type: 'sine', dur: 0.4, vol: 0.4 }); },
  tower: () => { noise({ dur: 0.8, vol: 0.5, filter: 1200, sweep: 60 }); tone({ f: 90, f2: 30, type: 'sawtooth', dur: 0.7, vol: 0.25 }); },
  faint: () => tone({ f: 500, f2: 120, type: 'triangle', dur: 0.25, vol: 0.12 }),
  noElixir: () => { tone({ f: 220, type: 'square', dur: 0.08, vol: 0.12 }); tone({ f: 180, type: 'square', dur: 0.1, vol: 0.12, delay: 0.09 }); },
  coin: () => { tone({ f: 988, type: 'square', dur: 0.06, vol: 0.12 }); tone({ f: 1319, type: 'square', dur: 0.14, vol: 0.12, delay: 0.06 }); },
  wobble: () => tone({ f: 300, f2: 220, type: 'triangle', dur: 0.12, vol: 0.25 }),
  open: () => { noise({ dur: 0.5, vol: 0.35, filter: 6000, sweep: 400 }); [523, 659, 784, 1047].forEach((f, i) => tone({ f, type: 'square', dur: 0.12, vol: 0.12, delay: i * 0.06 })); },
  cardFly: () => noise({ dur: 0.18, vol: 0.12, filter: 5000, sweep: 1500 }),
  card: () => tone({ f: 700, f2: 1100, type: 'triangle', dur: 0.12, vol: 0.18 }),
  rare: () => [784, 988, 1175].forEach((f, i) => tone({ f, type: 'square', dur: 0.12, vol: 0.12, delay: i * 0.07 })),
  epic: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ f, type: 'square', dur: 0.14, vol: 0.12, delay: i * 0.07 })),
  legendary: () => { [392, 523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone({ f, type: 'square', dur: 0.2, vol: 0.13, delay: i * 0.08 })); noise({ dur: 1.2, vol: 0.15, filter: 8000, sweep: 1000 }); },
  upgrade: () => [523, 659, 784, 1047].forEach((f, i) => tone({ f, type: 'triangle', dur: 0.18, vol: 0.2, delay: i * 0.08 })),
  win: () => [523, 523, 523, 659, 784, 1047].forEach((f, i) => tone({ f, type: 'square', dur: i === 5 ? 0.5 : 0.14, vol: 0.14, delay: i * 0.14 })),
  lose: () => [392, 370, 349, 262].forEach((f, i) => tone({ f, type: 'triangle', dur: i === 3 ? 0.6 : 0.25, vol: 0.18, delay: i * 0.25 })),
  countdown: () => tone({ f: 880, type: 'square', dur: 0.1, vol: 0.12 }),
  fight: () => { tone({ f: 1047, type: 'square', dur: 0.3, vol: 0.14 }); noise({ dur: 0.3, vol: 0.2, filter: 4000, sweep: 500 }); },
  emote: () => tone({ f: 620, f2: 940, type: 'sine', dur: 0.15, vol: 0.2 }),
  crown: () => [659, 880, 1175].forEach((f, i) => tone({ f, type: 'square', dur: 0.16, vol: 0.14, delay: i * 0.1 })),
};

export type SoundName = keyof typeof SOUNDS;

// ───────────────────────── Archivos de audio ─────────────────────────

const BASE = `${import.meta.env.BASE_URL ?? '/'}audio/`;
/** Variantes decodificadas de cada efecto. */
const samples = new Map<string, AudioBuffer[]>();
const lastVariant: Record<string, number> = {};
let musicNames = new Set<string>();
let loading: Promise<void> | null = null;

/** ¿Este navegador decodifica Ogg Vorbis? (si no, MP3). */
const canOgg = (): boolean => {
  try {
    return document.createElement('audio').canPlayType('audio/ogg; codecs="vorbis"') !== '';
  } catch {
    return false;
  }
};

async function decode(c: AudioContext, url: string): Promise<AudioBuffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(String(r.status));
  const data = await r.arrayBuffer();
  return new Promise((ok, ko) => c.decodeAudioData(data, ok, ko));
}

/** Sonidos con variación de tono (golpes, pasos, monedas…) para que no suenen siempre igual. */
const PITCHED = new Set(['hit', 'shoot', 'deploy', 'coin', 'boom', 'cardFly', 'card', 'wobble']);
/** Fanfarrias: bajan la música mientras suenan. */
const FANFARES = new Set(['rare', 'epic', 'legendary', 'upgrade', 'win', 'lose', 'crown', 'fight']);
/** Límite de repetición (ms) para sonidos muy frecuentes en batalla. */
const THROTTLE: Record<string, number> = { hit: 45, shoot: 60, coin: 40, cardFly: 60 };

function playSample(name: string, list: AudioBuffer[]): void {
  const c = ac();
  if (!c || !sfxGain) return;
  // otra variante distinta de la última, si hay
  let i = Math.floor(Math.random() * list.length);
  if (list.length > 1 && i === lastVariant[name]) i = (i + 1) % list.length;
  lastVariant[name] = i;
  const src = c.createBufferSource();
  src.buffer = list[i];
  if (PITCHED.has(name)) src.playbackRate.value = 0.94 + Math.random() * 0.12;
  src.connect(sfxGain);
  src.start();
  if (FANFARES.has(name)) Music.duckFor(list[i].duration);
}

export const Sfx = {
  /** Aplica los ajustes guardados (volúmenes; los de versiones antiguas eran sí/no). */
  configure(settings: { vol?: Partial<Volumes>; sfx?: boolean; music?: boolean }): void {
    Object.assign(vol, DEFAULT_VOLUMES, settings.vol ?? {});
    if (!settings.vol) {
      if (settings.sfx === false) vol.sfx = 0;
      if (settings.music === false) vol.music = 0;
    }
    applyVolumes();
    Music.volumeChanged();
  },
  setVolumes(v: Volumes): void {
    Object.assign(vol, v);
    applyVolumes();
    Music.volumeChanged();
  },
  get volumes(): Volumes {
    return { ...vol };
  },
  /** Carga los efectos (en segundo plano; mientras tanto suena el sintetizador). */
  load(): Promise<void> {
    loading ??= (async () => {
      const c = ac();
      if (!c) return;
      const ext = canOgg() ? 'ogg' : 'mp3';
      let manifest: { sfx: Record<string, number>; music: string[] };
      try {
        manifest = await (await fetch(`${BASE}manifest.json`)).json();
      } catch {
        return; // sin archivos: todo con el sintetizador
      }
      musicNames = new Set(manifest.music);
      // si ya sonaba la música sintetizada, se cambia por la de verdad
      if (Music.timer && Music.song) {
        const s = Music.song;
        Music.fadeOut(100);
        Music.song = null;
        Music.play(s);
      }
      await Promise.all(
        Object.entries(manifest.sfx).map(async ([name, n]) => {
          const list: AudioBuffer[] = [];
          for (let i = 0; i < n; i++) {
            try {
              list.push(await decode(c, `${BASE}${name}_${i}.${ext}`));
            } catch {
              // si el ogg falla en este navegador, el mp3
              try {
                if (ext === 'ogg') list.push(await decode(c, `${BASE}${name}_${i}.mp3`));
              } catch {
                /* se queda el sintetizador */
              }
            }
          }
          if (list.length) samples.set(name, list);
        }),
      );
    })();
    return loading;
  },
  play(name: SoundName | string): void {
    if (vol.sfx <= 0 || vol.master <= 0) return;
    const th = THROTTLE[name];
    if (th && throttle(name, th)) return;
    try {
      const list = samples.get(name);
      if (list?.length) playSample(name, list);
      else SOUNDS[name as SoundName]?.();
    } catch {
      /* audio no disponible */
    }
  },
  /** Estado del audio (para depurar desde la consola: __game y Sfx.debug()). */
  debug(): Record<string, unknown> {
    return {
      ctx: ctx?.state ?? 'none',
      sounds: samples.size,
      variants: [...samples.values()].reduce((t, l) => t + l.length, 0),
      music: Music.song,
      playing: Music.current
        ? { time: Number(Music.current.el.currentTime.toFixed(2)), paused: Music.current.el.paused }
        : null,
      synthMusic: !!Music.timer,
      volumes: { ...vol },
    };
  },
  /** Tras el primer toque: el navegador ya deja sonar (y arranca la música pendiente). */
  unlock(): void {
    try {
      ac();
      Music.resume();
    } catch {
      /* nada */
    }
  },
};

// ───────────────────────── Música ─────────────────────────

/** Música chiptune sintetizada (respaldo si no hay archivos). */
interface Song {
  bpm: number;
  bass: number[];
  lead: number[];
}
const SONGS: Record<string, Song> = {
  lobby: {
    bpm: 112,
    bass: [48, 48, 55, 55, 53, 53, 50, 55],
    lead: [72, 76, 79, 76, 77, 74, 71, 74, 72, 76, 79, 84, 83, 79, 74, 0],
  },
  battle: {
    bpm: 140,
    bass: [45, 45, 52, 45, 41, 41, 48, 43],
    lead: [69, 72, 76, 72, 74, 71, 67, 71, 69, 72, 76, 81, 79, 76, 74, 71],
  },
};
SONGS.overtime = { ...SONGS.battle, bpm: 160 };
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface Track {
  el: HTMLAudioElement;
  gain: GainNode;
}
const tracks = new Map<string, Track>();

function track(name: string): Track | null {
  const c = ac();
  if (!c || !musicGain || !musicNames.has(name)) return null;
  let tr = tracks.get(name);
  if (!tr) {
    const el = new Audio(`${BASE}music_${name}.${canOgg() ? 'ogg' : 'mp3'}`);
    el.loop = true;
    el.preload = 'auto';
    const gain = c.createGain();
    gain.gain.value = 0;
    c.createMediaElementSource(el).connect(gain).connect(musicGain);
    tr = { el, gain };
    tracks.set(name, tr);
  }
  return tr;
}

export const Music = {
  timer: null as ReturnType<typeof setInterval> | null,
  /** Canción que debería sonar (aunque esté en silencio por el volumen). */
  song: null as string | null,
  current: null as Track | null,
  duckUntil: 0,

  play(name: string): void {
    if (this.song === name && (this.current || this.timer)) return;
    this.song = name;
    if (vol.music <= 0 || vol.master <= 0) return;
    this.fadeOut();
    const c = ac();
    const tr = track(name);
    if (c && tr) {
      this.current = tr;
      tr.el.currentTime = 0;
      tr.gain.gain.cancelScheduledValues(c.currentTime);
      tr.gain.gain.setValueAtTime(0, c.currentTime);
      tr.gain.gain.linearRampToValueAtTime(1, c.currentTime + 0.6);
      // sin un toque previo el navegador no deja empezar: se reintenta en unlock()
      void tr.el.play().catch(() => {});
      return;
    }
    this.synth(name);
  },

  /** Apaga lo que suena con un fundido corto. */
  fadeOut(ms = 400): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const c = ctx;
    const tr = this.current;
    this.current = null;
    if (c && tr) {
      tr.gain.gain.cancelScheduledValues(c.currentTime);
      tr.gain.gain.setValueAtTime(tr.gain.gain.value, c.currentTime);
      tr.gain.gain.linearRampToValueAtTime(0, c.currentTime + ms / 1000);
      setTimeout(() => this.current !== tr && tr.el.pause(), ms + 50);
    }
  },

  stop(): void {
    this.song = null;
    this.fadeOut();
  },

  /** Reintenta lo que el navegador no dejó sonar antes del primer toque. */
  resume(): void {
    if (this.current?.el.paused) void this.current.el.play().catch(() => {});
  },

  /** Volumen de música cambiado: si se quitó, para; si se puso, vuelve la canción. */
  volumeChanged(): void {
    const on = vol.music > 0 && vol.master > 0;
    if (!on && (this.current || this.timer)) this.fadeOut(200);
    else if (on && this.song && !this.current && !this.timer) {
      const s = this.song;
      this.song = null;
      this.play(s);
    }
  },

  /** Baja la música un rato (fanfarrias, secuencia legendaria). */
  duckFor(seconds: number, level = 0.3): void {
    const c = ctx;
    if (!c || !duckGain) return;
    const until = c.currentTime + seconds + 0.25;
    this.duckUntil = Math.max(this.duckUntil, until);
    duckGain.gain.cancelScheduledValues(c.currentTime);
    duckGain.gain.setTargetAtTime(level, c.currentTime, 0.05);
    duckGain.gain.setTargetAtTime(1, this.duckUntil, 0.35);
  },

  /** Respaldo: bucle sintetizado de 4 compases. */
  synth(name: string): void {
    const c = ac();
    const n = synthNodes();
    const s = SONGS[name];
    if (!c || !n || !s) return;
    const step = 60 / s.bpm / 2;
    let i = 0;
    let next = c.currentTime + 0.1;
    this.timer = setInterval(() => {
      while (next < c.currentTime + 0.3) {
        const delay = next - c.currentTime;
        const lead = s.lead[i % s.lead.length];
        if (lead) tone({ f: mtof(lead), type: 'square', dur: step * 0.9, vol: 0.12, delay, out: n.music });
        if (i % 2 === 0)
          tone({
            f: mtof(s.bass[(i / 2) % s.bass.length]),
            type: 'triangle',
            dur: step * 1.8,
            vol: 0.3,
            delay,
            out: n.music,
          });
        next += step;
        i++;
      }
    }, 100);
  },
};
