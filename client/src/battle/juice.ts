// ─────────────────────────────────────────────────────────────
//  "JUICE": reglas de la vibración de pantalla y del hit-stop.
//  Sin Phaser, para poder probarlas. Solo afectan a cómo se ve la partida:
//  la simulación avanza igual (el tiempo congelado se recupera al salir).
// ─────────────────────────────────────────────────────────────

export type ShakeLevel = 'off' | 'low' | 'normal';
export const SHAKE_LEVELS: ShakeLevel[] = ['off', 'low', 'normal'];

/** Cuánto se multiplica la vibración de pantalla según el ajuste del jugador. */
export const shakeFactor = (level: unknown): number => (level === 'off' ? 0 : level === 'low' ? 0.45 : 1);

/** Golpe fuerte: quita al menos un cuarto de la vida (y no es calderilla). */
export const heavyHit = (amount: number, maxHp: number): boolean => maxHp > 0 && amount >= Math.max(120, maxHp * 0.25);

/** Duración de cada pausa (ms). */
export const HIT_STOP = { heavy: 45, spell: 70, tower: 110 } as const;

/**
 * Hit-stop: congela la partida un instante en los golpes fuertes. Mientras dura, la
 * simulación no avanza; al acabar, avanza de golpe el tiempo que estuvo parada,
 * así que nunca se queda atrás (importa en las partidas online).
 */
export class HitStop {
  private until = 0;
  private last = -Infinity;
  private frozen = 0;

  constructor(
    /** Tiempo mínimo entre dos pausas, para que no tartamudee en peleas grandes. */
    readonly cooldownMs = 350,
    /** Pausa máxima seguida (aunque se encadenen golpes). */
    readonly maxMs = 140,
  ) {}

  /** Pide una pausa de `ms`. Devuelve true si se aplica (o alarga la que ya hay). */
  trigger(now: number, ms: number): boolean {
    if (ms <= 0) return false;
    if (now < this.until) {
      // ya está parada: un golpe más fuerte la alarga, sin pasar del máximo
      this.until = Math.min(this.last + this.maxMs, Math.max(this.until, now + ms));
      return true;
    }
    if (now - this.last < this.cooldownMs) return false;
    this.last = now;
    this.until = now + Math.min(ms, this.maxMs);
    return true;
  }

  active(now: number): boolean {
    return now < this.until;
  }

  /** Segundos de simulación que tocan este frame: 0 durante la pausa y, al acabar, lo acumulado. */
  step(now: number, dt: number): number {
    if (this.active(now)) {
      this.frozen += dt;
      return 0;
    }
    const out = dt + this.frozen;
    this.frozen = 0;
    return out;
  }
}
