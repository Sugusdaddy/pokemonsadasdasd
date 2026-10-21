import {
  DEFAULT_PORT,
  PROTOCOL_VERSION,
  type ClientJoin,
  type MatchMode,
  type PlayerInfo,
  type Replay,
  type Team,
  type Winner,
  type SeasonInfo,
  type SeasonTier,
} from '@arena/shared';
import { sessionToken } from './session';

/** Servidor de juego. En producción se fija con VITE_SERVER_URL (p. ej. wss://arena.midominio.com). */
export const SERVER_URL: string =
  (import.meta.env.VITE_SERVER_URL as string | undefined) ||
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:${DEFAULT_PORT}`;
export const HTTP_URL = SERVER_URL.replace(/^ws/, 'http');

export interface LiveMatch {
  roomId: string;
  mode: MatchMode;
  players: Record<Team, PlayerInfo>;
  startedAt: string;
  spectators: number;
}

export interface ReplayMeta {
  id: string;
  mode: MatchMode;
  players: Record<Team, PlayerInfo>;
  winner: Winner | null;
  crowns: Record<Team, number>;
  ticks: number;
  endedAt: string;
}

export type StoredReplay = Replay & { meta: ReplayMeta };

export interface RankRow {
  rank: number;
  accountId: string;
  name: string;
  trophies: number;
  kingLevel: number;
  /** Wallet acortada (Abcd…wxyz) o null si es invitado. */
  wallet: string | null;
}

export interface LeaderboardPage {
  scope: 'global' | 'arena' | 'friends';
  arena: number | null;
  total: number;
  offset: number;
  entries: RankRow[];
  /** Tu puesto (null si no apareces en este ranking) y tus trofeos. */
  me: { rank: number | null; trophies: number } | null;
  season: SeasonInfo;
}

export interface SeasonOverview {
  current: SeasonInfo;
  tiers: SeasonTier[];
  resetAbove: number;
  keepRatio: number;
  previous: { id: string; top: Array<{ rank: number; name: string; trophies: number; best: number }> };
}

async function get<T>(path: string): Promise<T> {
  const tok = sessionToken();
  const r = await fetch(`${HTTP_URL}${path}`, {
    signal: AbortSignal.timeout(5000),
    headers: tok ? { Authorization: `Bearer ${tok}` } : undefined,
  });
  const body = (await r.json()) as T & { error?: string };
  if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
  return body;
}

export const api = {
  health: () => get<{ ok: boolean }>('/api/health'),
  live: () => get<LiveMatch[]>('/api/live'),
  replays: (limit = 20) => get<ReplayMeta[]>(`/api/replays?limit=${limit}`),
  replay: (id: string) => get<StoredReplay>(`/api/replays/${encodeURIComponent(id)}`),
  friendly: (code: string) => get<{ roomId: string }>(`/api/friendly/${encodeURIComponent(code)}`),
  /** Ranking global o de una arena (con tu puesto si hay sesión). */
  leaderboard: (
    scope: 'global' | 'arena' | 'friends',
    opts: { arena?: number; limit?: number; offset?: number } = {},
  ) =>
    get<LeaderboardPage>(
      `/api/leaderboard?scope=${scope}&limit=${opts.limit ?? 50}&offset=${opts.offset ?? 0}${scope === 'arena' ? `&arena=${opts.arena ?? 0}` : ''}`,
    ),
  season: () => get<SeasonOverview>('/api/season'),
};

/** Lo que el jugador manda al servidor al unirse: solo su sesión (el resto lo sabe el servidor). */
export function joinOptions(): ClientJoin {
  return { token: sessionToken() ?? undefined, protocol: PROTOCOL_VERSION };
}
