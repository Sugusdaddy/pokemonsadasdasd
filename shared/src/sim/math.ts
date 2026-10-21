// Funciones matemáticas deterministas: solo + - * / y sqrt (que IEEE 754 garantiza
// idénticas en todos los motores). Nada de Math.hypot, sin, cos, atan2 ni pow
// dentro de la simulación.

export const dist = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = bx - ax,
    dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
};

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

/** Pasa segundos a ticks enteros (redondeando). */
export const ticks = (seconds: number, rate: number): number => Math.round(seconds * rate);

/**
 * Posiciones de una formación de N tropas en círculo (radio 1).
 * Precalculadas para no depender de sin/cos en tiempo de ejecución.
 */
// prettier-ignore
const FORMATIONS: Record<number, Array<[number, number]>> = {
  1: [[0, 0]],
  2: [[0, -1], [0, 1]],
  3: [[0, -1], [0.8660254037844387, 0.5], [-0.8660254037844385, 0.5]],
  4: [[0, -1], [1, 0], [0, 1], [-1, 0]],
  5: [[0, -1], [0.9510565162951535, -0.30901699437494745], [0.5877852522924732, 0.8090169943749475], [-0.587785252292473, 0.8090169943749475], [-0.9510565162951536, -0.30901699437494734]],
  6: [[0, -1], [0.8660254037844386, -0.5], [0.8660254037844387, 0.5], [0, 1], [-0.8660254037844385, 0.5], [-0.8660254037844386, -0.5]],
};

export function formation(count: number, r: number): Array<[number, number]> {
  if (count <= 1) return [[0, 0]];
  const base = FORMATIONS[count];
  if (!base) throw new Error(`Formación de ${count} tropas no soportada (máx. 6)`);
  return base.map(([x, y]) => [x * r, y * r]);
}
