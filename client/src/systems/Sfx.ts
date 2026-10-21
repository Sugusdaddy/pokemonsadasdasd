// ─────────────────────────────────────────────────────────────
//  SONIDO sintetizado con Web Audio: no necesita archivos de audio.
//  Sustituye cualquier efecto por un .mp3/.ogg cuando tengas los tuyos.
// ─────────────────────────────────────────────────────────────

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicGain: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
const state = { sfx: true, music: true };
const last: Record<string, number> = {};

type AudioCtor = typeof AudioContext;

function ac(): AudioContext | null {
  if (!ctx) {
    const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
    const AC = w.AudioContext || w.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.16;
    musicGain.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
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
  if (!c || !master) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out || master);
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
  if (!c || !master || !noiseBuf) return;
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
  s.connect(fl).connect(g).connect(master);
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
  hit: () => { if (!throttle('hit', 45)) noise({ dur: 0.07, vol: 0.18, filter: 2500, sweep: 600 }); },
  shoot: () => { if (!throttle('shoot', 60)) tone({ f: 900, f2: 300, type: 'sawtooth', dur: 0.09, vol: 0.06 }); },
  boom: () => { noise({ dur: 0.45, vol: 0.45, filter: 1500, sweep: 80 }); tone({ f: 110, f2: 40, type: 'sine', dur: 0.4, vol: 0.4 }); },
  tower: () => { noise({ dur: 0.8, vol: 0.5, filter: 1200, sweep: 60 }); tone({ f: 90, f2: 30, type: 'sawtooth', dur: 0.7, vol: 0.25 }); },
  faint: () => tone({ f: 500, f2: 120, type: 'triangle', dur: 0.25, vol: 0.12 }),
  noElixir: () => { tone({ f: 220, type: 'square', dur: 0.08, vol: 0.12 }); tone({ f: 180, type: 'square', dur: 0.1, vol: 0.12, delay: 0.09 }); },
  coin: () => { tone({ f: 988, type: 'square', dur: 0.06, vol: 0.12 }); tone({ f: 1319, type: 'square', dur: 0.14, vol: 0.12, delay: 0.06 }); },
  wobble: () => tone({ f: 300, f2: 220, type: 'triangle', dur: 0.12, vol: 0.25 }),
  open: () => { noise({ dur: 0.5, vol: 0.35, filter: 6000, sweep: 400 }); [523, 659, 784, 1047].forEach((f, i) => tone({ f, type: 'square', dur: 0.12, vol: 0.12, delay: i * 0.06 })); },
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

export const Sfx = {
  configure(settings: { sfx: boolean; music: boolean }): void {
    state.sfx = settings.sfx;
    state.music = settings.music;
    if (!state.music) Music.stop();
  },
  play(name: SoundName | string): void {
    if (!state.sfx) return;
    try {
      SOUNDS[name as SoundName]?.();
    } catch {
      /* audio no disponible */
    }
  },
  unlock(): void {
    try {
      ac();
    } catch {
      /* nada */
    }
  },
};

// ───────── Música chiptune muy simple (bucle de 4 compases) ─────────
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
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export const Music = {
  timer: null as ReturnType<typeof setInterval> | null,
  song: null as string | null,
  play(name: string): void {
    if (!state.music || this.song === name) return;
    this.stop();
    const c = ac();
    const s = SONGS[name];
    if (!c || !s) return;
    this.song = name;
    const step = 60 / s.bpm / 2;
    let i = 0;
    let next = c.currentTime + 0.1;
    this.timer = setInterval(() => {
      while (next < c.currentTime + 0.3) {
        const delay = next - c.currentTime;
        const lead = s.lead[i % s.lead.length];
        if (lead) tone({ f: mtof(lead), type: 'square', dur: step * 0.9, vol: 0.12, delay, out: musicGain });
        if (i % 2 === 0)
          tone({
            f: mtof(s.bass[(i / 2) % s.bass.length]),
            type: 'triangle',
            dur: step * 1.8,
            vol: 0.3,
            delay,
            out: musicGain,
          });
        if (i % 4 === 2) noise({ dur: 0.05, vol: 0.04, filter: 7000, delay });
        next += step;
        i++;
      }
    }, 100);
  },
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.song = null;
  },
};
