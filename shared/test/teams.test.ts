import { describe, expect, it } from 'vitest';
import { RULES } from '../src/config';
import { STARTER_DECK, getCard } from '../src/data/cards';
import { Match, runBotMatch, runReplay, type MatchSetup, type SimUnit } from '../src/sim';
import { setup } from './helpers';

const DECK2 = ['bulbasaur', 'charmander', 'squirtle', 'pikachu', 'eevee', 'machop', 'chansey', 'rockslide'];

/** Partida 2v2: cada equipo con su compañero (mazo y niveles propios). */
function teamSetup(over: Partial<MatchSetup> = {}): MatchSetup {
  return setup({
    partners: {
      blue: { deck: [...DECK2], levels: { bulbasaur: getCard('bulbasaur').level + 3 }, kingLevel: 1 },
      red: { deck: [...DECK2], levels: {}, kingLevel: 1 },
    },
    ...over,
  });
}

/** Pone una carta en la mano de ese asiento y elixir de sobra. */
function ready(m: Match, k: 'blue' | 'red' | 'blue2' | 'red2', card: string): void {
  if (!m.cycles[k].hand.includes(card)) m.cycles[k].hand[0] = card;
  m.elixir[k] = 10;
}

describe('2v2', () => {
  it('cada jugador tiene su propia mano y su propio elixir', () => {
    const m = new Match(teamSetup());
    expect(m.teamPlay).toBe(true);
    expect(m.seats).toEqual(['blue', 'red', 'blue2', 'red2']);
    ready(m, 'blue2', 'bulbasaur');
    m.elixir.blue = 0;
    m.step([{ t: 'play', team: 'blue', seat: 1, card: 'bulbasaur', x: 140, y: 900 }]);
    expect(m.units.filter((u) => u.team === 'blue')).toHaveLength(1);
    expect(m.elixir.blue2).toBeLessThan(10 - getCard('bulbasaur').cost + 0.1);
    expect(m.elixir.blue).toBeLessThan(0.1); // el del principal no se ha tocado
    expect(m.cycles.blue2.queue[m.cycles.blue2.queue.length - 1]).toBe('bulbasaur'); // va al final de SU mazo
    // en 1v1 no hay compañero: su jugada no vale
    const solo = new Match(setup());
    solo.elixir.blue = 10;
    expect(solo.canPlay('blue', solo.cycles.blue.hand[0], 140, 900, 1)).toBe('hand');
  });

  it('las tropas usan los niveles de quien las juega y el elixir de un edificio va a su dueño', () => {
    const m = new Match(teamSetup());
    ready(m, 'blue2', 'bulbasaur');
    ready(m, 'blue', 'bulbasaur');
    m.step([
      { t: 'play', team: 'blue', seat: 1, card: 'bulbasaur', x: 140, y: 900 },
      { t: 'play', team: 'blue', card: 'bulbasaur', x: 580, y: 900 },
    ]);
    const [mine, partner] = [0, 1].map((s) => m.units.find((u: SimUnit) => u.seat === s)!);
    expect(partner.card.level).toBe(getCard('bulbasaur').level + 3);
    expect(mine.card.level).toBe(getCard('bulbasaur').level);
    expect(partner.maxHp).toBeGreaterThan(mine.maxHp);
    // Chansey del compañero: su elixir, no el del principal
    const n = new Match(teamSetup());
    ready(n, 'blue2', 'chansey');
    n.step([{ t: 'play', team: 'blue', seat: 1, card: 'chansey', x: 360, y: 900 }]);
    n.elixir.blue = 0;
    n.elixir.blue2 = 0;
    const evs = [];
    for (let i = 0; i < 20 * (RULES.deployTime + getCard('chansey').elixirEvery + 0.2); i++) evs.push(...n.step());
    expect(evs.filter((e) => e.e === 'elixirGain')).toHaveLength(1);
    expect(n.elixir.blue2).toBeGreaterThan(n.elixir.blue + 0.99);
  });

  it('partida 2v2 de bots: reproducible y los cuatro juegan', () => {
    const s = teamSetup({ seed: 77 });
    const a = runBotMatch(s),
      b = runBotMatch(s);
    expect(a.match.hash()).toBe(b.match.hash());
    const r = runReplay(JSON.parse(JSON.stringify(a.replay)));
    expect(r.match.hash()).toBe(a.match.hash());
    const plays = a.replay.inputs.filter((i) => i.input.t === 'play');
    for (const team of ['blue', 'red'] as const)
      for (const seat of [0, 1])
        expect(plays.some((i) => i.input.t === 'play' && i.input.team === team && (i.input.seat ?? 0) === seat)).toBe(
          true,
        );
  });

  it('el compañero cambia la huella; sin compañeros, la partida es la de siempre', () => {
    expect(new Match(teamSetup()).hash()).not.toBe(new Match(setup()).hash());
    expect(new Match(setup({ partners: {} })).hash()).toBe(new Match(setup()).hash());
    expect(STARTER_DECK).toHaveLength(8);
  });
});
