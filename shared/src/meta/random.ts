/**
 * Fuente de aleatoriedad para la meta (Pokéballs, tienda, rivales).
 * Fuera de la simulación se puede usar Math.random; en el servidor (Fase 2)
 * se podrá inyectar un RNG auditable.
 */
export type RandFn = () => number;

export const defaultRand: RandFn = () => Math.random();

export const randInt = (rand: RandFn, a: number, b: number): number => a + Math.floor(rand() * (b - a + 1));

export const pick = <T>(rand: RandFn, arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];

export function shuffle<T>(rand: RandFn, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
