/**
 * RNG determinista (mulberry32). Mismo estado → misma secuencia en cualquier
 * motor de JS, porque solo usa operaciones enteras de 32 bits.
 */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** Estado interno (para guardar/restaurar). */
  get state(): number {
    return this.s;
  }

  set state(v: number) {
    this.s = v >>> 0;
  }

  /** Entero sin signo de 32 bits. */
  nextU32(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** [0, 1) */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  /** Real en [a, b) */
  range(a: number, b: number): number {
    return a + this.next() * (b - a);
  }

  /** Entero en [a, b] */
  int(a: number, b: number): number {
    return a + Math.floor(this.next() * (b - a + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Baraja en el sitio (Fisher-Yates). */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** RNG hijo independiente (p. ej. para la IA), derivado de este. */
  fork(salt: number): Rng {
    return new Rng((this.nextU32() ^ Math.imul(salt | 0, 0x9e3779b1)) >>> 0);
  }
}

/** Semilla aleatoria para empezar una partida (fuera de la simulación). */
export function randomSeed(): number {
  // eslint-disable-next-line no-restricted-properties -- la semilla se elige fuera de la partida
  return (Math.random() * 4294967296) >>> 0;
}
