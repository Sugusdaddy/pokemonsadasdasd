// ─────────────────────────────────────────────────────────────
//  BALANCE EDITABLE: cambios de estadísticas de las cartas guardados en la base de datos.
//  Los hace un admin desde el juego y cada guardado es una versión nueva. Cada partida lleva
//  en MatchSetup.balance los cambios con los que se jugó, así que la simulación (cliente y
//  servidor) y las repeticiones usan siempre esos números, aunque luego cambien.
//  Se puede tocar vida, daño, velocidad de ataque y coste. Lo de cardDefs.ts es la base.
// ─────────────────────────────────────────────────────────────
import { getCard, isCardKey, type Card } from '../data/cards';

export type BalanceStat = 'hp' | 'dmg' | 'hitSpeed' | 'cost';
export const BALANCE_STATS: readonly BalanceStat[] = ['hp', 'dmg', 'hitSpeed', 'cost'];
export type CardOverride = Partial<Record<BalanceStat, number>>;

export interface Balance {
  /** Versión (0 = sin cambios, las cartas de cardDefs.ts). */
  v: number;
  /** Cambios por carta (valores al nivel inicial de su rareza). */
  o: Record<string, CardOverride>;
}

export const NO_BALANCE: Balance = { v: 0, o: {} };

/** Límites: entre la cuarta parte y el cuádruple del valor base (coste de 1 a 10). */
export function statRange(card: Card, stat: BalanceStat): [number, number] {
  if (stat === 'cost') return [1, 10];
  if (stat === 'hitSpeed') return [0.3, 5];
  const base = card[stat];
  return [Math.max(1, Math.round(base / 4)), Math.round(base * 4)];
}

/** ¿Tiene sentido esa estadística en esa carta? (los hechizos no tienen vida ni velocidad de ataque) */
export const statApplies = (card: Card, stat: BalanceStat): boolean =>
  card.type !== 'spell' || stat === 'dmg' || stat === 'cost';

/** La carta base con sus cambios de balance (sin subir de nivel). */
export function withOverride(card: Card, o: CardOverride | undefined): Card {
  if (!o) return card;
  const out = { ...card };
  for (const s of BALANCE_STATS) if (o[s] !== undefined) out[s] = o[s]!;
  return out;
}

/**
 * Comprueba los cambios que manda un admin. Devuelve los limpios (sin los que son iguales
 * a la base) o un código de error.
 */
export function cleanOverrides(raw: unknown): Record<string, CardOverride> | string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'err.balance.shape';
  const out: Record<string, CardOverride> = {};
  for (const [key, ov] of Object.entries(raw as Record<string, unknown>)) {
    if (!isCardKey(key)) return 'err.balance.card';
    if (!ov || typeof ov !== 'object') return 'err.balance.shape';
    const card = getCard(key);
    const clean: CardOverride = {};
    for (const [stat, value] of Object.entries(ov as Record<string, unknown>)) {
      if (!BALANCE_STATS.includes(stat as BalanceStat)) return 'err.balance.stat';
      const s = stat as BalanceStat;
      if (!statApplies(card, s)) return 'err.balance.stat';
      if (typeof value !== 'number' || !Number.isFinite(value)) return 'err.balance.value';
      const v = s === 'hitSpeed' ? Math.round(value * 100) / 100 : Math.round(value);
      const [lo, hi] = statRange(card, s);
      if (v < lo || v > hi) return 'err.balance.range';
      if (v !== card[s]) clean[s] = v;
    }
    if (Object.keys(clean).length) out[key] = clean;
  }
  return out;
}

// ───────────────────────── Lo que se ve en los menús ─────────────────────────

let live: Balance = NO_BALANCE;
const liveCache = new Map<string, Card>();

/** El balance en vigor (el cliente lo pide al servidor al arrancar). */
export function setLiveBalance(b: Balance): void {
  live = b;
  liveCache.clear();
}

export const liveBalance = (): Balance => live;

/** Carta con el balance en vigor (para enseñarla en menús; en batalla manda el de la partida). */
export function liveCard(key: string): Card {
  let c = liveCache.get(key);
  if (!c) {
    c = withOverride(getCard(key), live.o[key]);
    liveCache.set(key, c);
  }
  return c;
}
