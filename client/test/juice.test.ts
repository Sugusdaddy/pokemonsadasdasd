import { describe, expect, it } from 'vitest';
import { HitStop, heavyHit, shakeFactor } from '../src/battle/juice';

describe('juice', () => {
  it('vibración según el ajuste', () => {
    expect(shakeFactor('off')).toBe(0);
    expect(shakeFactor('low')).toBeGreaterThan(0);
    expect(shakeFactor('low')).toBeLessThan(1);
    expect(shakeFactor('normal')).toBe(1);
    expect(shakeFactor(undefined)).toBe(1); // ajuste antiguo sin este campo
  });

  it('golpe fuerte: un cuarto de la vida y al menos 120', () => {
    expect(heavyHit(100, 200)).toBe(false);
    expect(heavyHit(130, 400)).toBe(true);
    expect(heavyHit(500, 4000)).toBe(false);
    expect(heavyHit(1000, 4000)).toBe(true);
  });

  it('hit-stop: congela y luego devuelve todo el tiempo parado (la partida no se retrasa)', () => {
    const h = new HitStop(350, 140);
    let sim = 0;
    expect(h.trigger(1000, 70)).toBe(true);
    for (let t = 1000; t < 1200; t += 16) sim += h.step(t, 0.016);
    // 13 frames de 16 ms: el tiempo total coincide aunque parte estuviera congelado
    expect(sim).toBeCloseTo(13 * 0.016, 6);
    expect(h.active(1050)).toBe(true);
    expect(h.active(1080)).toBe(false);
  });

  it('hit-stop: respeta la espera entre pausas y el máximo seguido', () => {
    const h = new HitStop(350, 140);
    expect(h.trigger(0, 45)).toBe(true);
    expect(h.trigger(100, 45)).toBe(false); // demasiado pronto
    expect(h.trigger(400, 45)).toBe(true);
    expect(h.trigger(420, 500)).toBe(true); // alarga la actual…
    expect(h.active(400 + 139)).toBe(true);
    expect(h.active(400 + 141)).toBe(false); // …pero no más de 140 ms
  });
});
