// ─────────────────────────────────────────────────────────────
//  MISIONES diarias y semanales.
//  Cada periodo (día UTC, o semana UTC de lunes a domingo) el servidor reparte 3 misiones
//  de cada tipo, al azar entre las de su lista y sin repetir clase. El progreso solo sube
//  con lo que ve el servidor: partidas que ha simulado él (clasificatorias y contra el bot;
//  las amistosas no cuentan) y acciones de la economía. La recompensa se fija al repartir,
//  y completar las tres de un periodo da además un premio extra.
//  Funciones puras sobre el estado, como el resto de la economía.
// ─────────────────────────────────────────────────────────────
import { arenaFor, type BallType } from '../config';
import { getCard } from '../data/cards';
import type { Team, TimedInput } from '../sim/types';
import type { ProfileState } from './economy';
import { randInt, type RandFn } from './random';

export type MissionKind =
  'battles' | 'wins' | 'crowns' | 'threeCrowns' | 'spells' | 'units' | 'elixir' | 'balls' | 'upgrades' | 'goldSpent';
export type MissionPeriod = 'daily' | 'weekly';
export const MISSION_PERIODS: readonly MissionPeriod[] = ['daily', 'weekly'];

export interface MissionReward {
  gold?: number;
  gems?: number;
  xp?: number;
  ball?: BallType;
}

export interface Mission {
  id: string;
  kind: MissionKind;
  target: number;
  progress: number;
  claimed: boolean;
  reward: MissionReward;
}

export interface MissionBoard {
  /** Día ("2026-10-21") o semana ("w2912", lunes a lunes) en que se repartieron. */
  period: string;
  list: Mission[];
  bonusClaimed: boolean;
}

export interface MissionsState {
  daily: MissionBoard;
  weekly: MissionBoard;
}

interface MissionDef {
  kind: MissionKind;
  /** Cuánto hay que hacer (según la arena al repartir). */
  target: (arena: number) => number;
}

export const MISSIONS_PER_PERIOD = 3;

/** Lista de misiones posibles de cada periodo. */
export const MISSION_POOL: Record<MissionPeriod, MissionDef[]> = {
  daily: [
    { kind: 'battles', target: () => 3 },
    { kind: 'wins', target: () => 2 },
    { kind: 'crowns', target: () => 4 },
    { kind: 'spells', target: () => 5 },
    { kind: 'units', target: () => 20 },
    { kind: 'elixir', target: () => 60 },
    { kind: 'balls', target: () => 2 },
  ],
  weekly: [
    { kind: 'battles', target: () => 20 },
    { kind: 'wins', target: () => 12 },
    { kind: 'crowns', target: () => 25 },
    { kind: 'threeCrowns', target: () => 3 },
    { kind: 'spells', target: () => 35 },
    { kind: 'elixir', target: () => 400 },
    { kind: 'balls', target: () => 8 },
    { kind: 'upgrades', target: () => 3 },
    { kind: 'goldSpent', target: (a) => 1000 + a * 500 },
  ],
};

/** Recompensa de cada misión (crece con la arena). */
export const missionReward = (period: MissionPeriod, arena: number): MissionReward =>
  period === 'daily' ? { gold: 50 + arena * 15, xp: 2 } : { gold: 250 + arena * 75, gems: 10, xp: 5 };

/** Premio extra por completar y reclamar las tres misiones del periodo. */
export const MISSION_BONUS: Record<MissionPeriod, MissionReward> = {
  daily: { gems: 5, ball: 'poke' },
  weekly: { gems: 25, ball: 'ultra' },
};

// ───────────────────────── Periodos ─────────────────────────

const DAY = 86_400_000;
/** 1970-01-01 fue jueves: sumando 3 días, las semanas empiezan en lunes. */
const weekIndex = (now: number): number => Math.floor((Math.floor(now / DAY) + 3) / 7);

export function missionPeriodId(period: MissionPeriod, now: number): string {
  return period === 'daily' ? new Date(now).toISOString().slice(0, 10) : `w${weekIndex(now)}`;
}

/** Milisegundos hasta que se renueven las misiones del periodo. */
export function msToNextMissions(period: MissionPeriod, now: number): number {
  const next = period === 'daily' ? (Math.floor(now / DAY) + 1) * DAY : ((weekIndex(now) + 1) * 7 - 3) * DAY;
  return next - now;
}

// ───────────────────────── Reparto y progreso ─────────────────────────

function deal(period: MissionPeriod, now: number, arena: number, rand: RandFn): MissionBoard {
  const pool = [...MISSION_POOL[period]];
  const id = missionPeriodId(period, now);
  const list: Mission[] = [];
  while (list.length < MISSIONS_PER_PERIOD && pool.length) {
    const def = pool.splice(randInt(rand, 0, pool.length - 1), 1)[0];
    list.push({
      id: `${id}:${def.kind}`,
      kind: def.kind,
      target: def.target(arena),
      progress: 0,
      claimed: false,
      reward: missionReward(period, arena),
    });
  }
  return { period: id, list, bonusClaimed: false };
}

/** Reparte misiones nuevas si ha empezado otro día u otra semana. Devuelve true si cambia algo. */
export function rollMissions(s: ProfileState, now: number, rand: RandFn): boolean {
  const arena = arenaFor(s.trophies);
  let changed = false;
  const m = (s.missions ??= {
    daily: { period: '', list: [], bonusClaimed: false },
    weekly: { period: '', list: [], bonusClaimed: false },
  });
  for (const p of MISSION_PERIODS)
    if (m[p].period !== missionPeriodId(p, now)) {
      m[p] = deal(p, now, arena, rand);
      changed = true;
    }
  return changed;
}

/** Suma progreso a las misiones de esa clase que sigan abiertas. */
export function trackMission(s: ProfileState, kind: MissionKind, n = 1): void {
  if (!s.missions || n <= 0) return;
  for (const p of MISSION_PERIODS)
    for (const m of s.missions[p].list)
      if (m.kind === kind && !m.claimed) m.progress = Math.min(m.target, m.progress + n);
}

export const missionDone = (m: Mission): boolean => m.progress >= m.target;

/** Lo que hizo un equipo en una partida, sacado de los inputs aceptados por la simulación. */
export interface BattleStats {
  outcome: 'win' | 'loss' | 'draw';
  crowns: number;
  spells: number;
  units: number;
  elixir: number;
}

export function battleStats(
  log: readonly TimedInput[],
  team: Team,
  outcome: BattleStats['outcome'],
  crowns: number,
): BattleStats {
  const st: BattleStats = { outcome, crowns, spells: 0, units: 0, elixir: 0 };
  for (const { input } of log) {
    if (input.t !== 'play' || input.team !== team) continue;
    const c = getCard(input.card);
    if (c.type === 'spell') st.spells += 1;
    else st.units += 1;
    st.elixir += c.cost;
  }
  return st;
}

/** Progreso de las misiones tras una partida que da recompensas. */
export function trackBattle(s: ProfileState, st: BattleStats): void {
  trackMission(s, 'battles');
  if (st.outcome === 'win') {
    trackMission(s, 'wins');
    if (st.crowns >= 3) trackMission(s, 'threeCrowns');
  }
  trackMission(s, 'crowns', st.crowns);
  trackMission(s, 'spells', st.spells);
  trackMission(s, 'units', st.units);
  trackMission(s, 'elixir', st.elixir);
}

/** Cuántos premios hay por cobrar (misiones completas + premios extra), para los avisos. */
export function claimableMissions(ms: MissionsState | undefined, period?: MissionPeriod): number {
  if (!ms) return 0;
  let n = 0;
  for (const p of period ? [period] : MISSION_PERIODS) {
    const b = ms[p];
    n += b.list.filter((m) => !m.claimed && missionDone(m)).length;
    if (b.list.length && !b.bonusClaimed && b.list.every((m) => m.claimed)) n += 1;
  }
  return n;
}
