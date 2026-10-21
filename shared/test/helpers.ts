import { ARENA } from '../src/config';
import { STARTER_DECK } from '../src/data/cards';
import { Match, type MatchSetup, type Team } from '../src/sim';

export const mirrorY = (y: number) => 2 * ARENA.riverY - y;

export function setup(over: Partial<MatchSetup> = {}): MatchSetup {
  return {
    seed: 1,
    arena: 0,
    players: {
      blue: { deck: [...STARTER_DECK], levels: {}, kingLevel: 1 },
      red: { deck: [...STARTER_DECK], levels: {}, kingLevel: 1 },
    },
    ...over,
  };
}

/** Partida con la carta indicada en la mano de cada equipo y elixir de sobra. */
export function matchWith(cards: Partial<Record<Team, string[]>> = {}, over: Partial<MatchSetup> = {}): Match {
  const s = setup(over);
  for (const team of ['blue', 'red'] as const) {
    for (const k of cards[team] ?? []) if (!s.players[team].deck.includes(k)) s.players[team].deck.push(k);
  }
  const m = new Match(s);
  for (const team of ['blue', 'red'] as const) {
    const want = cards[team] ?? [];
    if (!want.length) continue;
    const rest = s.players[team].deck.filter((k) => !want.includes(k));
    m.cycles[team].hand = [...want, ...rest].slice(0, 4);
    m.cycles[team].queue = [...want, ...rest].slice(4);
  }
  m.elixir.blue = m.elixir.red = 10;
  return m;
}

/** Avanza n ticks sin inputs. */
export function run(m: Match, n: number): void {
  for (let i = 0; i < n && !m.over; i++) m.step();
}
