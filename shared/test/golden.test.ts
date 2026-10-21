import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { check, type GoldenCase } from '../../tools/golden-replays';

// Repeticiones de referencia (tools/golden-replays.ts): el motor tiene que reproducirlas
// exactamente igual. Si este test falla, un cambio en la simulación hace que las
// repeticiones ya guardadas (y las partidas verificadas) se vean distinto. Si el cambio
// es a propósito: `npm run golden -- --update` y explicarlo en el commit.

const cases = JSON.parse(
  fs.readFileSync(new URL('./fixtures/golden-replays.json', import.meta.url), 'utf8'),
) as GoldenCase[];

describe('repeticiones de referencia (determinismo)', () => {
  it('cubren 1v1, reglas especiales, 2v2 y cambios de balance', () => {
    expect(cases.length).toBeGreaterThanOrEqual(20);
    expect(cases.some((c) => c.replay.setup.partners)).toBe(true);
    expect(cases.some((c) => c.replay.setup.rules?.suddenDeath)).toBe(true);
    expect(cases.some((c) => c.replay.setup.balance)).toBe(true);
  });

  it('el motor actual las reproduce con la misma huella y el mismo final', () => {
    expect(check(cases)).toEqual([]);
  });
});
