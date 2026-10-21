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
  getMatch(id: string): Promise<MatchRecord | null>;
  listMatches(limit: number): Promise<MatchSummary[]>;

  close(): Promise<void>;
}
