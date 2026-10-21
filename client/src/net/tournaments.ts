import type { ProfileState, RuleSet, TournamentDetail, TournamentSummary } from '@arena/shared';
import { Profile } from '../meta/Profile';
import { request } from './session';

/** Torneos (los valida el servidor): crear, entrar con código, clasificación y premio. */
export const Tournaments = {
  list: () => request<{ mine: TournamentSummary[]; open: TournamentSummary[] }>('/tournaments'),
  create: (b: { name: string; rules: RuleSet; minutes: number; maxPlayers: number; isPublic: boolean }) =>
    request<TournamentDetail>('/tournaments', b),
  join: (code: string) => request<TournamentDetail>('/tournaments/join', { code }),
  get: (id: string) => request<TournamentDetail>(`/tournaments/${encodeURIComponent(id)}`),
  async claim(id: string): Promise<number> {
    const r = await request<{ gold: number; state: ProfileState }>(`/tournaments/${encodeURIComponent(id)}/claim`, {});
    Profile.applyState(r.state);
    return r.gold;
  },
};
