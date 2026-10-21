import type { Balance, CardOverride, IdeaCategory, IdeaSort, IdeaStatus, IdeaView } from '@arena/shared';
import { request } from './session';

// ─────────────────────────────────────────────────────────────
//  BUZÓN DE IDEAS (todos) y herramientas de ADMIN (solo wallets de ADMIN_WALLETS;
//  el servidor lo comprueba en cada petición).
// ─────────────────────────────────────────────────────────────

export interface IdeaPage {
  ideas: IdeaView[];
  total: number;
  offset: number;
  /** Ideas que aún puedes proponer hoy (null sin sesión). */
  left: number | null;
  /** Has jugado lo bastante para proponer. */
  canPropose: boolean;
}

/** Filtro de la lista: un estado, todas, o solo las tuyas. */
export type IdeaFilter = IdeaStatus | 'all' | 'mine';

export const Ideas = {
  list: (sort: IdeaSort, filter: IdeaFilter, offset = 0) =>
    request<IdeaPage>(
      `/ideas?sort=${sort}&status=${filter === 'mine' ? 'all' : filter}${filter === 'mine' ? '&mine=1' : ''}&offset=${offset}`,
    ),
  propose: (title: string, body: string, category: IdeaCategory) =>
    request<{ idea: IdeaView }>('/ideas', { title, body, category }),
  vote: (id: string) => request<{ voted: boolean; votes: number }>(`/ideas/${encodeURIComponent(id)}/vote`, {}),
  remove: (id: string) => request(`/ideas/${encodeURIComponent(id)}/delete`, {}),
};

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

export interface ReportGroup {
  messageId: string;
  clanId: string | null;
  targetId: string;
  targetName: string;
  text: string;
  hidden: boolean;
  count: number;
  reasons: Record<string, number>;
  lastAt: number;
}

export interface AdminPlayer {
  accountId: string;
  name: string;
  trophies: number;
  kingLevel: number;
  wallets: string[];
  code: string | null;
  mutedUntil: number | null;
  createdAt: number;
  lastSeenAt: number;
  clan: string | null;
  reports: number;
}

export interface AdminLogEntry {
  id: string;
  adminName: string;
  action: string;
  target: string;
  details: Record<string, unknown>;
  createdAt: number;
}

/** Horas de silencio que acepta el servidor (0 = quitarlo). */
export const MUTE_OPTIONS = [1, 24, 168, 720] as const;

/** Partidas, victorias y jugadas de una carta con una versión del balance. */
export interface CardStat {
  key: string;
  games: number;
  wins: number;
  plays: number;
}

export const Admin = {
  balance: () =>
    request<{ current: Balance; history: Array<{ version: number; note: string; at: number; cards: number }> }>(
      '/admin/balance',
    ),
  saveBalance: (overrides: Record<string, CardOverride>, note: string) =>
    request<{ current: Balance }>('/admin/balance', { overrides, note }),
  cards: () => request<{ version: number; decks: number; rows: CardStat[] }>('/admin/cards'),
  stats: () => request<AdminStats>('/admin/stats'),
  reports: () => request<{ reports: ReportGroup[] }>('/admin/reports').then((r) => r.reports),
  resolve: (messageId: string, action: 'dismiss' | 'punish', muteHours = 24) =>
    request('/admin/reports/resolve', { messageId, action, muteHours }),
  players: (q: string) =>
    request<{ players: AdminPlayer[] }>(`/admin/players?q=${encodeURIComponent(q)}`).then((r) => r.players),
  mute: (accountId: string, hours: number) => request('/admin/players/mute', { accountId, hours }),
  rename: (accountId: string) => request('/admin/players/rename', { accountId }),
  updateIdea: (id: string, patch: { status?: IdeaStatus; reply?: string; hidden?: boolean }) =>
    request<{ idea: IdeaView }>(`/admin/ideas/${encodeURIComponent(id)}`, patch),
  deleteIdea: (id: string) => request(`/admin/ideas/${encodeURIComponent(id)}/delete`, {}),
  log: () => request<{ log: AdminLogEntry[] }>('/admin/log').then((r) => r.log),
};
