// ─────────────────────────────────────────────────────────────
//  MODOS DE JUEGO: desafíos con reglas especiales, draft y torneos.
//  Todos son gratis (sin cuotas de entrada) y con niveles iguales para todos: las cartas
//  al nivel inicial de su rareza y el rey a nivel STANDARD_KING. Así gana quien juega
//  mejor, no quien tiene más cartas mejoradas. Las reglas viajan en MatchSetup.rules, así
//  que las repeticiones se reproducen igual.
// ─────────────────────────────────────────────────────────────
import type { MatchRules } from '../sim/types';
import type { MissionReward } from './missions';

/** Nivel de rey en los modos con niveles iguales (desafíos, draft y torneos). */
export const STANDARD_KING = 5;

/** Reglas que puede tener un desafío o un torneo. */
export type RuleSet = 'classic' | 'double' | 'triple' | 'sudden' | 'draft';
export const RULE_SETS: readonly RuleSet[] = ['classic', 'double', 'triple', 'sudden', 'draft'];

export const isRuleSet = (v: unknown): v is RuleSet => typeof v === 'string' && RULE_SETS.includes(v as RuleSet);

/** Reglas de la simulación y si se juega con draft. */
export function rulesOf(r: RuleSet): { rules: MatchRules; draft: boolean } {
  switch (r) {
    case 'double':
      return { rules: { elixir: 2 }, draft: false };
    case 'triple':
      return { rules: { elixir: 3 }, draft: false };
    case 'sudden':
      return { rules: { suddenDeath: true }, draft: false };
    case 'draft':
      return { rules: {}, draft: true };
    default:
      return { rules: {}, draft: false };
  }
}

// ───────────────────────── Desafío del día ─────────────────────────

/** Rotación diaria (día UTC): elixir doble, muerte súbita, draft y elixir triple. */
export const CHALLENGE_ROTATION: readonly RuleSet[] = ['double', 'sudden', 'draft', 'triple'];
export const CHALLENGE_MAX_WINS = 12;
export const CHALLENGE_MAX_LOSSES = 3;

/** Premios por victorias en un desafío; cada uno se cobra una vez por día aunque repitas. */
export const CHALLENGE_REWARDS: ReadonlyArray<{ wins: number; reward: MissionReward }> = [
  { wins: 1, reward: { gold: 100 } },
  { wins: 3, reward: { gold: 250 } },
  { wins: 5, reward: { gems: 15 } },
  { wins: 7, reward: { ball: 'super' } },
  { wins: 9, reward: { gold: 1000 } },
  { wins: 12, reward: { gems: 50, ball: 'ultra' } },
];

const DAY = 86_400_000;

export interface Challenge {
  /** Día UTC ("2026-10-21"): el desafío y sus premios cambian cada día. */
  period: string;
  rules: RuleSet;
}

export function challengeOfDay(now: number): Challenge {
  const day = Math.floor(now / DAY);
  return {
    period: new Date(now).toISOString().slice(0, 10),
    rules: CHALLENGE_ROTATION[day % CHALLENGE_ROTATION.length],
  };
}

export const msToNextChallenge = (now: number): number => (Math.floor(now / DAY) + 1) * DAY - now;

/** Progreso del jugador en el desafío del día (dentro de su cuenta). */
export interface ChallengeRun {
  period: string;
  wins: number;
  losses: number;
  /** Victorias cuyo premio ya se ha cobrado hoy (el mejor intento del día). */
  paid: number;
  /** Hay un intento en marcha (se acaba con 12 victorias o 3 derrotas). */
  active: boolean;
}

/** Premios nuevos al llegar a `wins` victorias si ya se cobraron hasta `paid`. */
export const challengeRewardsBetween = (paid: number, wins: number): MissionReward[] =>
  CHALLENGE_REWARDS.filter((r) => r.wins > paid && r.wins <= wins).map((r) => r.reward);

// ───────────────────────── Torneos ─────────────────────────

export const TOURNAMENT_DURATIONS = [15, 30, 60] as const;
export const TOURNAMENT_MAX_PLAYERS = [4, 8, 16, 32] as const;
export const TOURNAMENT_NAME_MAX = 24;
/** Las partidas que acaban poco después del final todavía cuentan. */
export const TOURNAMENT_GRACE_MS = 6 * 60_000;
/**
 * Premio de oro por puesto (1.º, 2.º, 3.º). Para evitar granjas de cuentas solo hay premio
 * si han jugado al menos 4 jugadores con 3 partidas cada uno, y como mucho uno al día.
 */
export const TOURNAMENT_PRIZES = [500, 300, 150] as const;
export const TOURNAMENT_PRIZE_MIN_PLAYERS = 4;
export const TOURNAMENT_PRIZE_MIN_GAMES = 3;

export interface TournamentStanding {
  accountId: string;
  name: string;
  wins: number;
  losses: number;
  crowns: number;
  joinedAt: string;
}

/** Clasificación: más victorias, menos derrotas, más coronas y, si no, quien entró antes. */
export function rankStandings<T extends TournamentStanding>(list: readonly T[]): T[] {
  return [...list].sort(
    (a, b) => b.wins - a.wins || a.losses - b.losses || b.crowns - a.crowns || a.joinedAt.localeCompare(b.joinedAt),
  );
}

/** ¿Hay premios en este torneo? (suficientes jugadores que hayan jugado de verdad) */
export const tournamentHasPrizes = (list: readonly TournamentStanding[]): boolean =>
  list.filter((p) => p.wins + p.losses >= TOURNAMENT_PRIZE_MIN_GAMES).length >= TOURNAMENT_PRIZE_MIN_PLAYERS;

/** Lo que ve el cliente de un torneo en las listas. */
export interface TournamentSummary {
  id: string;
  code: string;
  name: string;
  rules: RuleSet;
  maxPlayers: number;
  players: number;
  isPublic: boolean;
  /** ms (época) en que acaba. */
  endsAt: number;
  /** Lo has creado tú. */
  mine: boolean;
}

/** Detalle con la clasificación. */
export interface TournamentDetail extends TournamentSummary {
  standings: Array<{ rank: number; accountId: string; name: string; wins: number; losses: number; crowns: number }>;
  ended: boolean;
  hasPrizes: boolean;
  /** Tu puesto y si ya cobraste (si estás dentro). */
  me: { rank: number; prizeClaimed: boolean } | null;
}
