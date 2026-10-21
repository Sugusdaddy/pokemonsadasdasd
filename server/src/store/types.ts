import type {
  ClanInput,
  ClanRole,
  ClanType,
  DonationState,
  IdeaCategory,
  IdeaSort,
  IdeaStatus,
  MatchMode,
  PlayerInfo,
  ProfileState,
  Replay,
  Team,
  Winner,
} from '@arena/shared';
import type { RuleSet, TournamentStanding } from '@arena/shared';

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

// ───────────────────────── Social ─────────────────────────

/** Lo que se puede enseñar de otro jugador. */
export interface PublicProfile {
  accountId: string;
  name: string;
  trophies: number;
  kingLevel: number;
  lastSeenAt: Date;
  wallet: string | null;
}

export interface FriendLink {
  /** La otra cuenta. */
  other: string;
  requester: string;
  accepted: boolean;
  createdAt: Date;
}

export interface GameInviteRow {
  id: string;
  fromId: string;
  toId: string;
  code: string;
  createdAt: Date;
}

export interface ClanRow {
  id: string;
  name: string;
  description: string;
  badge: number;
  type: ClanType;
  minTrophies: number;
  createdAt: Date;
  members: number;
  /** Suma de los trofeos de sus miembros. */
  trophies: number;
}

export interface MemberRow {
  accountId: string;
  clanId: string;
  role: ClanRole;
  joinedAt: Date;
  lastRequestAt: Date | null;
  donations: number;
}

export type ClanMessageKind = 'text' | 'request' | 'system';

export interface ClanMessageRow {
  id: string;
  clanId: string;
  accountId: string | null;
  name: string;
  kind: ClanMessageKind;
  body: string;
  card: string | null;
  want: number;
  got: number;
  donors: Record<string, number>;
  hidden: boolean;
  createdAt: Date;
}

export type NewClanMessage = Pick<ClanMessageRow, 'clanId' | 'accountId' | 'name' | 'kind' | 'body'> &
  Partial<Pick<ClanMessageRow, 'card' | 'want'>>;

export interface ReportRow {
  id: string;
  reporterId: string;
  targetId: string;
  messageId: string | null;
  reason: string;
  text: string;
  createdAt: Date;
}

/** Social: amigos, invitaciones, clanes, chat y denuncias. */
export interface SocialStore {
  /** Código de amigo de la cuenta (lo crea con `gen` si no tiene). */
  ensureCode(id: string, gen: () => string): Promise<string>;
  accountByCode(code: string): Promise<string | null>;
  profiles(ids: string[]): Promise<PublicProfile[]>;
  mutedUntil(id: string): Promise<Date | null>;
  setMuted(id: string, until: Date | null): Promise<void>;

  friendLinks(id: string): Promise<FriendLink[]>;
  putFriendLink(a: string, b: string, requester: string, accepted: boolean): Promise<void>;
  deleteFriendLink(a: string, b: string): Promise<void>;

  addInvite(fromId: string, toId: string, code: string): Promise<GameInviteRow>;
  invitesFor(toId: string, since: Date): Promise<GameInviteRow[]>;
  deleteInvite(id: string, toId: string): Promise<void>;

  /**
   * Crea el clan con `accountId` de líder, cobrando con `charge` en la misma transacción.
   * Errores: err.clan.already (ya está en uno), err.clan.nameTaken.
   */
  createClan(accountId: string, input: ClanInput, charge: (s: ProfileState) => void): Promise<ClanRow>;
  getClan(id: string): Promise<ClanRow | null>;
  /** Clanes abiertos por nombre (o los más fuertes si no hay búsqueda). */
  searchClans(q: string, limit: number): Promise<ClanRow[]>;
  updateClan(id: string, input: ClanInput): Promise<void>;
  memberOf(accountId: string): Promise<MemberRow | null>;
  clanMembers(clanId: string): Promise<MemberRow[]>;
  /** Errores: err.clan.already, err.clan.notFound, err.clan.closed, err.clan.full, err.clan.trophies. */
  joinClan(accountId: string, clanId: string, trophies: number, maxMembers: number): Promise<void>;
  /** Sale del clan. Si era líder, hereda el miembro de más rango y antigüedad; si era el último, el clan se borra. */
  leaveClan(accountId: string): Promise<{ clanId: string; deleted: boolean; newLeader: string | null } | null>;
  setRole(accountId: string, role: ClanRole): Promise<void>;

  addMessage(m: NewClanMessage): Promise<ClanMessageRow>;
  messages(clanId: string, limit: number): Promise<ClanMessageRow[]>;
  getMessage(id: string): Promise<ClanMessageRow | null>;
  /** Publica una petición de cartas si la última es anterior a `cooldownSince` (si no, err.clan.cooldown). */
  createRequest(m: NewClanMessage, now: Date, cooldownSince: Date): Promise<ClanMessageRow>;
  /**
   * Donación atómica: bloquea la petición y las dos cuentas, aplica `fn` y lo guarda todo.
   * El donante tiene que estar en el clan de la petición (err.clan.notMember).
   */
  donate<T>(
    messageId: string,
    donorId: string,
    fn: (req: DonationState, donor: ProfileState, receiver: ProfileState) => T,
  ): Promise<{ result: T; message: ClanMessageRow; donor: ProfileState }>;

  /** Guarda una denuncia y devuelve cuántas sin resolver tiene ese mensaje (err.report.dupe si ya lo denunciaste). */
  report(r: Omit<ReportRow, 'id' | 'createdAt'>): Promise<number>;
  hideMessage(id: string): Promise<void>;
}

// ───────────────────────── Ideas y admin ─────────────────────────

export interface IdeaRow {
  id: string;
  accountId: string;
  name: string;
  title: string;
  body: string;
  category: IdeaCategory;
  status: IdeaStatus;
  reply: string;
  votes: number;
  hidden: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IdeaQuery {
  sort: IdeaSort;
  /** null: todas. */
  status: IdeaStatus | null;
  /** Solo los admins ven las ocultas. */
  includeHidden: boolean;
  /** Solo las de esta cuenta. */
  accountId?: string;
  limit: number;
  offset: number;
}

/** Denuncias agrupadas por mensaje (lo que ve el admin). */
export interface ReportGroup {
  messageId: string;
  clanId: string | null;
  targetId: string;
  targetName: string;
  text: string;
  hidden: boolean;
  count: number;
  reasons: Record<string, number>;
  lastAt: Date;
}

export interface AdminPlayerRow {
  accountId: string;
  name: string;
  trophies: number;
  kingLevel: number;
  wallets: string[];
  code: string | null;
  mutedUntil: Date | null;
  createdAt: Date;
  lastSeenAt: Date;
  clan: string | null;
  /** Denuncias recibidas. */
  reports: number;
}

export interface AdminStats {
  accounts: number;
  withWallet: number;
  active24h: number;
  matches24h: number;
  clans: number;
  ideasOpen: number;
  reports24h: number;
  muted: number;
}

export interface AdminLogRow {
  id: string;
  adminId: string;
  adminName: string;
  action: string;
  target: string;
  details: Record<string, unknown>;
  createdAt: Date;
}

/** Buzón de ideas y herramientas de admin. */
export interface AdminStore {
  createIdea(i: Pick<IdeaRow, 'accountId' | 'name' | 'title' | 'body' | 'category'>): Promise<IdeaRow>;
  countIdeasSince(accountId: string, since: Date): Promise<number>;
  listIdeas(q: IdeaQuery): Promise<{ rows: IdeaRow[]; total: number }>;
  /** De estas ideas, cuáles ha votado la cuenta. */
  votedIdeas(accountId: string, ids: string[]): Promise<string[]>;
  getIdea(id: string): Promise<IdeaRow | null>;
  /** Vota o quita el voto (atómico). err.idea.notFound si no existe o está oculta. */
  toggleVote(ideaId: string, accountId: string): Promise<{ voted: boolean; votes: number }>;
  updateIdea(id: string, patch: Partial<Pick<IdeaRow, 'status' | 'reply' | 'hidden'>>): Promise<IdeaRow | null>;
  deleteIdea(id: string): Promise<void>;

  adminStats(since: Date): Promise<AdminStats>;
  listReports(limit: number): Promise<ReportGroup[]>;
  /** Marca como resueltas las denuncias de un mensaje (siguen contando en el historial del jugador). */
  resolveReports(messageId: string): Promise<void>;
  unhideMessage(id: string): Promise<void>;
  /** Busca por id, código de amigo, wallet o parte del nombre. */
  searchAccounts(q: string, limit: number): Promise<AdminPlayerRow[]>;
  logAdmin(e: Omit<AdminLogRow, 'id' | 'createdAt'>): Promise<void>;
  listAdminLog(limit: number): Promise<AdminLogRow[]>;
}

// ───────────────────────── Torneos ─────────────────────────

export interface TournamentRow {
  id: string;
  /** Código para unirse (5 caracteres, como el de las amistosas). */
  code: string;
  name: string;
  creatorId: string;
  rules: RuleSet;
  maxPlayers: number;
  /** Aparece en la lista de torneos abiertos (si no, solo con el código). */
  isPublic: boolean;
  createdAt: Date;
  endsAt: Date;
}

export interface TournamentPlayerRow extends TournamentStanding {
  tournamentId: string;
  prizeClaimed: boolean;
}

export interface TournamentStore {
  /** Crea el torneo con su creador ya dentro. */
  createTournament(
    t: Omit<TournamentRow, 'id' | 'createdAt'>,
    creator: { accountId: string; name: string },
  ): Promise<TournamentRow>;
  getTournament(id: string): Promise<TournamentRow | null>;
  tournamentByCode(code: string): Promise<TournamentRow | null>;
  tournamentPlayers(id: string): Promise<TournamentPlayerRow[]>;
  /** Entra (sin pasarse del máximo, de forma atómica). */
  joinTournament(id: string, accountId: string, name: string): Promise<'ok' | 'full' | 'already'>;
  /** Torneos en los que está la cuenta que acabaron después de `since` (o siguen). */
  myTournaments(accountId: string, since: Date): Promise<TournamentRow[]>;
  /** Públicos que no han acabado, con cuántos jugadores tienen. */
  openTournaments(now: Date, limit: number): Promise<Array<TournamentRow & { players: number }>>;
  /** Cuántos torneos sin terminar ha creado la cuenta. */
  activeCreated(accountId: string, now: Date): Promise<number>;
  recordTournamentGame(id: string, accountId: string, win: boolean, crowns: number): Promise<void>;
  /** Marca el premio como cobrado. Devuelve false si ya lo estaba. */
  markPrizeClaimed(id: string, accountId: string): Promise<boolean>;
}

/**
 * Acceso a datos. Hay dos implementaciones con el mismo comportamiento:
 * PrismaStore (PostgreSQL) y MemoryStore (tests y arranque sin base de datos).
 */
export interface Store extends SocialStore, AdminStore, TournamentStore {
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
