import {
  DEFAULT_PORT,
  PROTOCOL_VERSION,
  type JoinOptions,
  type MatchMode,
  type PlayerInfo,
  type Replay,
  type Team,
  type Winner,
} from '@arena/shared';
import { Profile } from '../meta/Profile';

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

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${HTTP_URL}${path}`, { signal: AbortSignal.timeout(5000) });
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
};

/** Lo que el jugador manda al servidor al unirse. (Fase 2: lo sabrá el servidor por su cuenta.) */
export function joinOptions(): JoinOptions {
  const deck = [...Profile.deck];
  return {
    name: Profile.displayName.slice(0, 24),
    trophies: Profile.d.trophies,
    kingLevel: Profile.d.kingLevel,
    deck,
    levels: Profile.levelsOf(deck),
    protocol: PROTOCOL_VERSION,
  };
}
