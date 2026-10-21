import { describe, expect, it } from 'vitest';
import { getCard } from '../src/data/cards';
import { cleanOverrides, liveCard, setLiveBalance, NO_BALANCE } from '../src/meta/balance';
import { Match, runBotMatch, runReplay } from '../src/sim';
import { setup } from './helpers';

describe('balance editable', () => {
  it('valida los cambios: cartas y estadísticas que existen, dentro de límites, y quita los iguales a la base', () => {
    const base = getCard('bulbasaur');
    expect(cleanOverrides({ bulbasaur: { hp: base.hp + 100, dmg: base.dmg } })).toEqual({
      bulbasaur: { hp: base.hp + 100 },
    });
    expect(cleanOverrides({ bulbasaur: { hitSpeed: 1.234 } })).toEqual({ bulbasaur: { hitSpeed: 1.23 } });
    expect(cleanOverrides({ nope: { hp: 1 } })).toBe('err.balance.card');
    expect(cleanOverrides({ bulbasaur: { speed: 99 } })).toBe('err.balance.stat');
    expect(cleanOverrides({ bulbasaur: { hp: base.hp * 10 } })).toBe('err.balance.range');
    expect(cleanOverrides({ bulbasaur: { cost: 0 } })).toBe('err.balance.range');
    expect(cleanOverrides({ rockslide: { hp: 100 } })).toBe('err.balance.stat'); // un hechizo no tiene vida
    expect(cleanOverrides({ rockslide: { dmg: 400 } })).toEqual({ rockslide: { dmg: 400 } });
    expect(cleanOverrides([])).toBe('err.balance.shape');
  });

  it('la partida usa sus cambios: coste para el elixir y vida base que luego sube con el nivel', () => {
    const lv = getCard('bulbasaur').level + 2;
    const s = setup({ balance: { v: 3, o: { bulbasaur: { cost: 7, hp: 1000 } } } });
    s.players.blue.levels.bulbasaur = lv;
    const m = new Match(s);
    m.cycles.blue.hand[0] = 'bulbasaur';
    m.elixir.blue = 6;
    expect(m.canPlay('blue', 'bulbasaur', 140, 900)).toBe('elixir');
    m.elixir.blue = 7;
    expect(m.canPlay('blue', 'bulbasaur', 140, 900)).toBe('ok');
    const normal = new Match(setup());
    normal.setup.players.blue.levels.bulbasaur = lv;
    const ratio = m.cardFor('blue', 'bulbasaur').hp / normal.cardFor('blue', 'bulbasaur').hp;
    expect(ratio).toBeCloseTo(1000 / getCard('bulbasaur').hp, 2);
  });

  it('una partida con cambios se reproduce igual desde su repetición', () => {
    const s = setup({ seed: 12, balance: { v: 1, o: { pikachu: { dmg: 120 }, machop: { cost: 3 } } } });
    const a = runBotMatch(s);
    expect(runReplay(JSON.parse(JSON.stringify(a.replay))).match.hash()).toBe(a.match.hash());
    // y es otra partida que sin cambios
    expect(a.match.hash()).not.toBe(runBotMatch(setup({ seed: 12 })).match.hash());
  });

  it('los menús enseñan el balance en vigor', () => {
    const base = getCard('eevee');
    setLiveBalance({ v: 2, o: { eevee: { cost: 3 } } });
    expect(liveCard('eevee').cost).toBe(3);
    expect(getCard('eevee').cost).toBe(base.cost); // la base no cambia
    setLiveBalance(NO_BALANCE);
    expect(liveCard('eevee').cost).toBe(base.cost);
  });
});
