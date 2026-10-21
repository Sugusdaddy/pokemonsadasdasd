import { describe, expect, it } from 'vitest';
import { ARENAS, TOWER_GUARDIANS, RARITIES } from '../src/config';
import { CARDS, STARTER_DECK, allCardKeys, getCard, cardMoves, cardPokemonIds } from '../src/data/cards';
import { PACK } from '../src/data/pack';
import { rollBall } from '../src/meta/balls';
import { ROAD } from '../src/meta/road';
import { makeOpponent } from '../src/meta/opponent';
import { Rng } from '../src/sim/rng';

describe('datos', () => {
  it('pack.json tiene todos los Pokémon y ataques que usa el juego', () => {
    for (const id of cardPokemonIds()) expect(PACK.pokemon[String(id)], `Pokémon ${id}`).toBeDefined();
    for (const t of Object.values(TOWER_GUARDIANS))
      for (const g of Object.values(t)) expect(PACK.pokemon[String(g.pokemon)]).toBeDefined();
    for (const a of ARENAS) expect(PACK.pokemon[String(a.star)]).toBeDefined();
    for (const m of cardMoves()) expect(PACK.attacks[m], `ataque ${m}`).toBeDefined();
  });

  it('las 41 cartas se resuelven con valores válidos', () => {
    const keys = allCardKeys();
    expect(keys.length).toBe(Object.keys(CARDS).length);
    expect(keys.length).toBe(41);
    for (const k of keys) {
      const c = getCard(k);
      expect(c.cost).toBeGreaterThan(0);
      expect(RARITIES[c.rarity]).toBeDefined();
      if (c.type === 'unit') {
        expect(c.hp).toBeGreaterThan(0);
        expect(c.speed).toBeGreaterThan(0);
        expect(c.count).toBeLessThanOrEqual(6);
      }
      expect(c.dmg).toBeGreaterThan(0);
    }
    expect(STARTER_DECK).toHaveLength(8);
  });

  it('cada Pokémon tiene su origen de sprite (oficial, mixto, fans o propio)', () => {
    for (const p of Object.values(PACK.pokemon)) expect(['official', 'mixed', 'fan', 'custom']).toContain(p.origin);
  });
});

describe('meta', () => {
  const rng = new Rng(5);
  const rand = () => rng.next();

  it('una Pokéball da cartas de la arena, oro y la legendaria garantizada de la Master', () => {
    const r = rollBall('master', 5, rand);
    expect(r.gold).toBeGreaterThan(0);
    expect(r.cards.some((c) => c.rarity === 'legendary')).toBe(true);
    for (const c of r.cards) expect(getCard(c.key).arena).toBeLessThanOrEqual(5);
    const small = rollBall('poke', 0, rand);
    for (const c of small.cards) expect(getCard(c.key).arena).toBe(0);
  });

  it('el camino de trofeos da una recompensa cada 50', () => {
    expect(ROAD[0].trophies).toBe(50);
    expect(ROAD.every((s, i) => i === 0 || s.trophies - ROAD[i - 1].trophies === 50)).toBe(true);
  });

  it('el rival tiene un mazo de 8 cartas distintas de su arena', () => {
    const o = makeOpponent({ arena: 2, trophies: 800, kingLevel: 4, avgDeckLevel: 2 }, rand);
    expect(new Set(o.deck).size).toBe(8);
    for (const k of o.deck) expect(getCard(k).arena).toBeLessThanOrEqual(3);
  });
});
