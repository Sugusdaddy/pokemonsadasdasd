import { ARENA } from '../config';

/**
 * El tablero es simétrico respecto al río. Cada jugador lo ve con su lado abajo:
 * el equipo de arriba (red) ve la Y reflejada. La función es su propia inversa.
 */
export const mirrorY = (y: number): number => 2 * ARENA.riverY - y;
export const mirrorPoint = (x: number, y: number): [number, number] => [x, mirrorY(y)];
