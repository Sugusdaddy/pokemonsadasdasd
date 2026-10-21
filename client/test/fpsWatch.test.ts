import { describe, expect, it } from 'vitest';
import { FpsWatch } from '../src/systems/fpsWatch';

/** Simula `seconds` segundos a `fps` fotogramas por segundo. */
const run = (w: FpsWatch, fps: number, seconds: number) => {
  for (let i = 0; i < fps * seconds; i++) w.frame(1000 / fps);
};

describe('calidad automática', () => {
  it('baja la calidad si va lento varios segundos seguidos (tras el arranque)', () => {
    let fired = 0;
    const w = new FpsWatch(
      () => fired++,
      () => true,
      () => true,
    );
    run(w, 30, 3); // arranque: no cuenta
    expect(fired).toBe(0);
    run(w, 30, 3.5);
    expect(fired).toBe(0);
    run(w, 30, 1);
    expect(fired).toBe(1);
    run(w, 20, 10);
    expect(fired).toBe(1); // solo una vez
  });

  it('un bajón suelto no cuenta y a 60 fps nunca baja', () => {
    let fired = 0;
    const w = new FpsWatch(
      () => fired++,
      () => true,
      () => true,
    );
    run(w, 60, 3);
    for (let k = 0; k < 10; k++) {
      run(w, 30, 2);
      run(w, 60, 1);
    }
    expect(fired).toBe(0);
  });

  it('las pausas de la pestaña y el modo manual no cuentan', () => {
    let fired = 0,
      visible = false,
      enabled = true;
    const w = new FpsWatch(
      () => fired++,
      () => enabled,
      () => visible,
    );
    run(w, 10, 20);
    expect(fired).toBe(0); // pestaña oculta
    visible = true;
    enabled = false;
    run(w, 10, 20);
    expect(fired).toBe(0); // calidad elegida a mano
    w.frame(5000); // un salto de 5 s (pausa) tampoco
    expect(fired).toBe(0);
  });
});
