import { describe, expect, it } from 'vitest';
import { appIcon } from '../src/art/icon';

describe('icono de la app', () => {
  it('el de fondo a sangre (maskable / iOS) no tiene huecos transparentes', () => {
    const p = appIcon(96, false);
    expect(Array.from(p.data).some((c) => c === -1)).toBe(false);
  });

  it('el redondeado tiene las esquinas transparentes y el centro pintado', () => {
    const p = appIcon(96, true);
    for (const [x, y] of [
      [0, 0],
      [95, 0],
      [0, 95],
      [95, 95],
    ])
      expect(p.get(x, y)).toBe(-1);
    expect(p.get(48, 48)).not.toBe(-1);
  });

  it('la torre cabe en la zona segura de un icono maskable (círculo del 80%)', () => {
    const a = appIcon(96, false);
    const r = 96 * 0.4;
    let far = 0;
    for (let y = 0; y < 96; y++)
      for (let x = 0; x < 96; x++) {
        const c = a.get(x, y);
        // piedra y tejados: colores claros que el fondo no usa (los destellos, blanco y dorado,
        // son decoración y pueden quedar recortados)
        if (c === 0xffffff || c === 0xffc93c) continue;
        const lum = ((c >> 16) & 255) + ((c >> 8) & 255) + (c & 255);
        if (lum > 400) far = Math.max(far, Math.hypot(x + 0.5 - 48, y + 0.5 - 48));
      }
    expect(far).toBeGreaterThan(0);
    expect(far).toBeLessThan(r);
  });
});
