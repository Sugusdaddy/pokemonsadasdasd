import { AI_BY_ARENA } from '../config';
import { Bot } from './bot';
import { Match } from './match';
import { Rng } from './rng';
import type { Input, MatchSetup, SimEvent, Team, TimedInput, Winner } from './types';

/** Una repetición es la configuración (con la semilla) + los inputs con su tick. */
export interface Replay {
  version: 1;
  setup: MatchSetup;
  inputs: TimedInput[];
}

/** Tope de seguridad: 6 minutos de partida. */
export const MAX_TICKS = 20 * 60 * 6;

/** Agrupa los inputs por tick. */
export function inputsByTick(inputs: readonly TimedInput[]): Map<number, Input[]> {
  const byTick = new Map<number, Input[]>();
  for (const ti of inputs) {
    const list = byTick.get(ti.tick) ?? [];
    list.push(ti.input);
    byTick.set(ti.tick, list);
  }
  return byTick;
}

/** Reproduce una partida entera sin dibujar nada. */
export function runReplay(
  replay: Replay,
  onTick?: (m: Match, events: SimEvent[]) => void,
): { match: Match; winner: Winner | null } {
  const m = new Match(replay.setup);
  const byTick = inputsByTick(replay.inputs);
  while (!m.over && m.tick < MAX_TICKS) {
    const ev = m.step(byTick.get(m.tick) ?? []);
    onTick?.(m, ev);
  }
  return { match: m, winner: m.winner };
}

/** Crea los bots de una partida a partir de su semilla (mismo resultado en cliente y servidor). */
export function makeBots(setup: MatchSetup, teams: readonly Team[]): Bot[] {
  const rng = new Rng((setup.seed ^ 0x5bd1e995) >>> 0);
  return teams.map((t) => new Bot(t, AI_BY_ARENA(setup.arena), rng.fork(t === 'blue' ? 1 : 2)));
}

/** Partida bot contra bot (tests y balance). */
export function runBotMatch(
  setup: MatchSetup,
  teams: readonly Team[] = ['blue', 'red'],
): { match: Match; replay: Replay } {
  const m = new Match(setup);
  const bots = makeBots(setup, teams);
  bots.forEach((b) => b.greet());
  while (!m.over && m.tick < MAX_TICKS) {
    const inputs = bots.flatMap((b) => b.update(m));
    const ev = m.step(inputs);
    bots.forEach((b) => b.observe(ev));
  }
  return { match: m, replay: { version: 1, setup, inputs: [...m.log] } };
}
