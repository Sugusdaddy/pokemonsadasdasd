// ─────────────────────────────────────────────────────────────
//  DRAFT: los mazos se hacen durante la partida, por turnos.
//  En cada una de las 4 rondas cada jugador ve una pareja de cartas distinta: elige una
//  y la otra se la lleva el rival. Al final cada uno tiene 4 elegidas + 4 recibidas.
//  Las 16 cartas son distintas, así que nunca hay repetidas en un mazo.
// ─────────────────────────────────────────────────────────────
import { allCardKeys, getCard } from '../data/cards';
import { RARITIES } from '../config';
import { other, type Team } from '../sim/types';
import { shuffle, type RandFn } from './random';

export const DRAFT_ROUNDS = 4;
/** Segundos para elegir en cada ronda (si no, se elige la primera). */
export const DRAFT_PICK_SECONDS = 12;

export interface DraftState {
  round: number;
  pairs: Record<Team, Array<[string, string]>>;
  picks: Record<Team, string[]>;
  got: Record<Team, string[]>;
}

/**
 * 16 cartas distintas al azar, con como mucho 4 hechizos y 2 edificios entre todas
 * (para que los dos mazos tengan tropas de sobra).
 */
export function makeDraft(rand: RandFn): DraftState {
  const keys = shuffle(rand, allCardKeys());
  const chosen: string[] = [];
  let spells = 0,
    buildings = 0;
  for (const k of keys) {
    const type = getCard(k).type;
    if (type === 'spell' && spells >= 4) continue;
    if (type === 'building' && buildings >= 2) continue;
    if (type === 'spell') spells++;
    if (type === 'building') buildings++;
    chosen.push(k);
    if (chosen.length === DRAFT_ROUNDS * 4) break;
  }
  const pairs: DraftState['pairs'] = { blue: [], red: [] };
  for (let r = 0; r < DRAFT_ROUNDS; r++) {
    pairs.blue.push([chosen[r * 4], chosen[r * 4 + 1]]);
    pairs.red.push([chosen[r * 4 + 2], chosen[r * 4 + 3]]);
  }
  return { round: 0, pairs, picks: { blue: [], red: [] }, got: { blue: [], red: [] } };
}

/** ¿Ya ha elegido este jugador en la ronda actual? */
export const hasPicked = (d: DraftState, team: Team): boolean => d.picks[team].length > d.round;
export const draftDone = (d: DraftState): boolean => d.round >= DRAFT_ROUNDS;

/** Elige la carta i (0 o 1) de su pareja. Devuelve false si no toca. */
export function draftPick(d: DraftState, team: Team, i: number): boolean {
  if (draftDone(d) || hasPicked(d, team) || (i !== 0 && i !== 1)) return false;
  const pair = d.pairs[team][d.round];
  d.picks[team].push(pair[i]);
  d.got[other(team)].push(pair[1 - i]);
  if (hasPicked(d, 'blue') && hasPicked(d, 'red')) d.round++;
  return true;
}

export const draftDeck = (d: DraftState, team: Team): string[] => [...d.picks[team], ...d.got[team]];

/** Lo que elige un bot (o quien no elige a tiempo): la de mejor rareza y, si empatan, la más cara. */
export function autoPick(pair: readonly [string, string]): number {
  const v = (k: string) => {
    const c = getCard(k);
    return Object.keys(RARITIES).indexOf(c.rarity) * 10 + c.cost;
  };
  return v(pair[1]) > v(pair[0]) ? 1 : 0;
}
