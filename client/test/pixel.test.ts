import { describe, expect, it } from 'vitest';
import { INK, Pix, shade } from '../src/art/pixel';

describe('pixel art', () => {
  it('rect, línea y polígono pintan dentro de la rejilla (lo de fuera se ignora)', () => {
    const p = new Pix(8, 8);
    p.rect(-2, -2, 4, 4, 0xff0000);
    expect(p.get(0, 0)).toBe(0xff0000);
    expect(p.get(1, 1)).toBe(0xff0000);
    expect(p.get(2, 2)).toBe(-1);
    p.line(0, 7, 7, 7, 0x00ff00);
    for (let x = 0; x < 8; x++) expect(p.get(x, 7)).toBe(0x00ff00);
    const q = new Pix(10, 10).poly(
      [
        [5, 0],
        [0, 9],
        [9, 9],
      ],
      0x0000ff,
    );
    expect(q.get(5, 1)).toBe(0x0000ff);
    expect(q.get(0, 0)).toBe(-1);
    expect(q.get(5, 8)).toBe(0x0000ff);
  });

  it('el contorno rodea lo pintado sin tocar el interior', () => {
    const p = new Pix(5, 5).rect(1, 1, 3, 3, 0xaaaaaa).outline();
    expect(p.get(2, 2)).toBe(0xaaaaaa);
    expect(p.get(0, 2)).toBe(INK);
    expect(p.get(2, 4)).toBe(INK);
    expect(p.get(0, 0)).toBe(-1); // las esquinas diagonales no se cierran (estilo pixel art)
  });

  it('la misma semilla da el mismo dibujo (detalles aleatorios estables)', () => {
    const a = new Pix(16, 16, 42).rect(0, 0, 16, 16, 1).speckle(0, 0, 16, 16, 2, 0.3);
    const b = new Pix(16, 16, 42).rect(0, 0, 16, 16, 1).speckle(0, 0, 16, 16, 2, 0.3);
    expect([...a.data]).toEqual([...b.data]);
  });

  it('shade aclara y oscurece sin salirse del rango', () => {
    expect(shade(0x808080, 1)).toBe(0xffffff);
    expect(shade(0x808080, -1)).toBe(0x000000);
    expect(shade(0x808080, 0)).toBe(0x808080);
  });
});
