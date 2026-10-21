import type { MatchMode, PlayerInfo, ProfileState, Replay, Team, Winner } from '@arena/shared';

export interface AccountRow {
  id: string;
  isGuest: boolean;
  state: ProfileState;
  rev: number;
  wallets: string[];
  createdAt: Date;
}

export interface MatchRecord {
  id: string;
  mode: MatchMode;
  blueId: string | null;
  redId: string | null;
  winner: Winner | null;
  reason: string;
  players: Record<Team, PlayerInfo>;
  crowns: Record<Team, number>;
  ticks: number;
  hash: number;
  replay: Replay;
  endedAt: Date;
}

export type MatchSummary = Omit<MatchRecord, 'replay'>;

/** Una fila de ranking. */
export interface RankEntry {
  accountId: string;
  name: string;
  trophies: number;
  kingLevel: number;
  /** Primera wallet vinculada (null si es invitado). */
  wallet: string | null;
}

/** Filtro de ranking: rango de trofeos [min, max) (por arena) o todos. */
export interface RankRange {
  min?: number;
  max?: number;
}

export interface SeasonResultRow {
  accountId: string;
  rank: number;
  name: string;
  trophies: number;
  best: number;
}

/**
 * Acceso a datos. Hay dos implementaciones con el mismo comportamiento:
 * PrismaStore (PostgreSQL) y MemoryStore (tests y arranque sin base de datos).
 */
export interface Store {
  readonly kind: 'postgres' | 'memory';

  createAccount(state: ProfileState, isGuest: boolean, wallet?: string): Promise<AccountRow>;
  getAccount(id: string): Promise<AccountRow | null>;
  /**
   * Aplica `fn` al estado de una cuenta de forma atómica (en PostgreSQL bloqueando la fila):
   * las peticiones simultáneas de una cuenta se aplican en orden, así no se puede gastar dos
   * veces el mismo oro. Si `fn` lanza, el estado no cambia.
   */
  mutate<T>(id: string, fn: (s: ProfileState) => T): Promise<{ result: T; state: ProfileState }>;
  touch(id: string): Promise<void>;

  findWalletAccount(address: string): Promise<string | null>;
  /** Vincula la wallet a la cuenta y la deja como no invitada. */
  linkWallet(address: string, accountId: string): Promise<void>;

  putNonce(nonce: string, address: string, message: string, expiresAt: Date): Promise<void>;
  /** Devuelve y borra el nonce (un solo uso). */
  takeNonce(nonce: string): Promise<{ address: string; message: string; expiresAt: Date } | null>;

  saveMatch(m: MatchRecord): Promise<void>;

  // ── Rankings ──
  /** Jugadores con trofeos (> 0) ordenados de más a menos. */
  leaderboard(range: RankRange, limit: number, offset: number): Promise<RankEntry[]>;
  /** Cuántos jugadores del rango tienen más trofeos (puesto = esto + 1). */
  countAbove(trophies: number, range: RankRange): Promise<number>;
  countRanked(range: RankRange): Promise<number>;
  /** Todas las cuentas con trofeos, de más a menos (para cerrar la temporada). */
  rankedSnapshot(): Promise<Array<{ accountId: string; trophies: number }>>;

  // ── Temporadas ──
  /** Marca la temporada como "cerrándose". Devuelve false si ya la está cerrando otro o está cerrada. */
  beginSeasonClose(id: string): Promise<boolean>;
  finishSeasonClose(id: string, top: SeasonResultRow[]): Promise<void>;
  seasonTop(id: string, limit: number): Promise<SeasonResultRow[]>;
  getMatch(id: string): Promise<MatchRecord | null>;
  listMatches(limit: number): Promise<MatchSummary[]>;

  close(): Promise<void>;
}
