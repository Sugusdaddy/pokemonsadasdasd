import { describe, expect, it } from 'vitest';
import { EN } from '../src/i18n/en';
import { ES } from '../src/i18n/es';
import { CARDS } from '@arena/shared';

// En español, cartas, arenas, rarezas, Pokéballs y emotes salen de /shared: solo el inglés los necesita.
const DATA =
  /^(card\.\w+\.(name|desc)|arena\.\d+|rarity\.(common|rare|epic|legendary)|ball\.(poke|super|ultra|master|free|crown)|emote\.\d+)$/;
const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('idiomas', () => {
  it('inglés y español tienen las mismas claves de interfaz', () => {
    const en = Object.keys(EN)
      .filter((k) => !DATA.test(k))
      .sort();
    const es = Object.keys(ES)
      .filter((k) => !DATA.test(k))
      .sort();
    expect(
      en.filter((k) => !(k in ES)),
      'faltan en es.ts',
    ).toEqual([]);
    expect(
      es.filter((k) => !(k in EN)),
      'faltan en en.ts',
    ).toEqual([]);
  });

  it('los parámetros {x} coinciden en los dos idiomas', () => {
    for (const k of Object.keys(EN)) {
      if (k in ES) expect(params(ES[k]), k).toEqual(params(EN[k]));
    }
  });

  it('todas las cartas tienen descripción en inglés', () => {
    for (const k of Object.keys(CARDS)) expect(EN[`card.${k}.desc`], k).toBeTruthy();
  });

  it('ningún texto está vacío', () => {
    for (const [k, v] of [...Object.entries(EN), ...Object.entries(ES)]) expect(v.trim(), k).not.toBe('');
  });
});
