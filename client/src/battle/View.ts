import { mirrorY } from '@arena/shared';

/**
 * Cómo se ve el tablero: cada jugador ve su lado abajo. Para el equipo de arriba
 * (red) se refleja la Y. La simulación siempre trabaja en coordenadas del mundo.
 */
export class View {
  constructor(readonly flip: boolean) {}

  /** Y del mundo → Y de pantalla (y al revés: es su propia inversa). */
  y(wy: number): number {
    return this.flip ? mirrorY(wy) : wy;
  }

  /** Componente Y de un vector (dirección) del mundo → pantalla. */
  dy(v: number): number {
    return this.flip ? -v : v;
  }
}
