// ─────────────────────────────────────────────────────────────
//  TEMPORADAS: una por mes natural (UTC).
//  - Durante la temporada se apunta el máximo de trofeos y las partidas jugadas.
//  - Al empezar la siguiente: reinicio suave de trofeos (se pierde la mitad de lo que
//    pase de RESET_ABOVE) y una recompensa según el máximo, que se reclama al entrar.
//  - Solo reciben recompensa quienes jugaron al menos una partida esa temporada.
// ─────────────────────────────────────────────────────────────
import type { BallType } from '../config';

export const SEASON = {
  /** Por encima de estos trofeos se aplica el reinicio suave. */
  resetAbove: 1600,
  /** Fracción que se conserva de lo que pasa de resetAbove. */
  keepRatio: 0.5,
};

export interface SeasonTier {
  /** Trofeos máximos de la temporada para llegar a este tramo. */
  trophies: number;
  gold: number;
  gems: number;
  ball: BallType | null;
}

/** Tramos de recompensa (del más bajo al más alto). Cambia aquí el balance. */
export const SEASON_TIERS: SeasonTier[] = [
  { trophies: 0, gold: 100, gems: 0, ball: null },
  { trophies: 300, gold: 300, gems: 10, ball: null },
  { trophies: 700, gold: 600, gems: 20, ball: 'super' },
  { trophies: 1100, gold: 1000, gems: 40, ball: 'super' },
  { trophies: 1600, gold: 2000, gems: 80, ball: 'ultra' },
  { trophies: 2200, gold: 4000, gems: 150, ball: 'master' },
];

export interface SeasonInfo {
  /** AAAA-MM */
  id: string;
  startsAt: number;
  endsAt: number;
}

/** Temporada en la que cae un instante. */
export function seasonAt(now: number): SeasonInfo {
  const d = new Date(now);
  const y = d.getUTCFullYear(),
    m = d.getUTCMonth();
  return {
    id: `${y}-${String(m + 1).padStart(2, '0')}`,
    startsAt: Date.UTC(y, m, 1),
    endsAt: Date.UTC(y, m + 1, 1),
  };
}

/** Temporada anterior a una dada (AAAA-MM). */
export function previousSeasonId(id: string): string {
  const [y, m] = id.split('-').map(Number);
  return seasonAt(Date.UTC(y, m - 2, 1)).id;
}

export const tierFor = (best: number): SeasonTier =>
  [...SEASON_TIERS].reverse().find((t) => best >= t.trophies) ?? SEASON_TIERS[0];

export const softReset = (trophies: number): number =>
  trophies > SEASON.resetAbove
    ? SEASON.resetAbove + Math.floor((trophies - SEASON.resetAbove) * SEASON.keepRatio)
    : trophies;

/** Lo que guarda cada jugador de la temporada en curso. */
export interface SeasonProgress {
  id: string;
  best: number;
  battles: number;
}

/** Recompensa de una temporada terminada, pendiente de reclamar. */
export interface SeasonReward {
  seasonId: string;
  best: number;
  trophiesBefore: number;
  trophiesAfter: number;
  /** Puesto en el ranking global al cierre (si se conoce). */
  rank?: number;
  tier: SeasonTier;
}
