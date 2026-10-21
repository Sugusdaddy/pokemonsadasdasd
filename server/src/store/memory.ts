import crypto from 'node:crypto';
import { ROLE_RANK, type ClanInput, type ClanRole, type DonationState, type ProfileState } from '@arena/shared';
import type {
  AccountRow,
  AdminLogRow,
  AdminPlayerRow,
  AdminStats,
  IdeaQuery,
  IdeaRow,
  ReportGroup,
  ClanMessageRow,
  ClanRow,
  FriendLink,
  GameInviteRow,
  MatchRecord,
  MatchSummary,
  MemberRow,
  NewClanMessage,
  PublicProfile,
  RankEntry,
  RankRange,
  ReportRow,
  SeasonResultRow,
  Store,
} from './types';

const clone = <T>(v: T): T => structuredClone(v);

/** Datos en memoria (se pierden al reiniciar). Para tests y para arrancar sin PostgreSQL. */
export class MemoryStore implements Store {
  readonly kind = 'memory' as const;
  private accounts = new Map<string, AccountRow>();
  private wallets = new Map<string, string>();
  private nonces = new Map<string, { address: string; message: string; expiresAt: Date }>();
  private matches: MatchRecord[] = [];
  private seasons = new Map<string, { closed: boolean; top: SeasonResultRow[] }>();
  private seen = new Map<string, Date>();
  private codes = new Map<string, string>(); // código → cuenta
  private muted = new Map<string, Date>();
  private links = new Map<string, { a: string; b: string; requester: string; accepted: boolean; createdAt: Date }>();
  private invites: GameInviteRow[] = [];
  private clans = new Map<string, Omit<ClanRow, 'members' | 'trophies'>>();
  private members = new Map<string, MemberRow>();
  private msgs: ClanMessageRow[] = [];
  private reports: Array<ReportRow & { resolved?: boolean }> = [];
  private ideas: IdeaRow[] = [];
  private ideaVotes = new Set<string>(); // idea|cuenta
  private adminLog: AdminLogRow[] = [];

  private ranked(range: RankRange): AccountRow[] {
    return [...this.accounts.values()]
      .filter(
        (a) =>
          a.state.trophies > 0 && (range.min ?? 0) <= a.state.trophies && a.state.trophies < (range.max ?? Infinity),
      )
      .sort(
        (a, b) =>
          b.state.trophies - a.state.trophies || b.state.kingLevel - a.state.kingLevel || +a.createdAt - +b.createdAt,
      );
  }

  async leaderboard(range: RankRange, limit: number, offset: number): Promise<RankEntry[]> {
    return this.ranked(range)
      .slice(offset, offset + limit)
      .map((a) => ({
        accountId: a.id,
        name: a.state.name,
        trophies: a.state.trophies,
        kingLevel: a.state.kingLevel,
        wallet: a.wallets[0] ?? null,
      }));
  }

  async countAbove(trophies: number, range: RankRange): Promise<number> {
    return this.ranked(range).filter((a) => a.state.trophies > trophies).length;
  }

  async countRanked(range: RankRange): Promise<number> {
    return this.ranked(range).length;
  }

  async rankedSnapshot() {
    return this.ranked({}).map((a) => ({ accountId: a.id, trophies: a.state.trophies }));
  }

  async beginSeasonClose(id: string): Promise<boolean> {
    if (this.seasons.has(id)) return false;
    this.seasons.set(id, { closed: false, top: [] });
    return true;
  }

  async finishSeasonClose(id: string, top: SeasonResultRow[]): Promise<void> {
    this.seasons.set(id, { closed: true, top: clone(top) });
  }

  async seasonTop(id: string, limit: number): Promise<SeasonResultRow[]> {
    return clone((this.seasons.get(id)?.top ?? []).slice(0, limit));
  }

  async createAccount(state: ProfileState, isGuest: boolean, wallet?: string): Promise<AccountRow> {
    const row: AccountRow = {
      id: crypto.randomUUID(),
      isGuest,
      state: clone(state),
      rev: 0,
      wallets: [],
      createdAt: new Date(),
    };
    this.accounts.set(row.id, row);
    if (wallet) await this.linkWallet(wallet, row.id);
    return clone(row);
  }

  async getAccount(id: string): Promise<AccountRow | null> {
    const r = this.accounts.get(id);
    return r ? clone(r) : null;
  }

  async mutate<T>(id: string, fn: (s: ProfileState) => T): Promise<{ result: T; state: ProfileState }> {
    const row = this.accounts.get(id);
    if (!row) throw new Error('err.account.notFound');
    this.seen.set(id, new Date());
    const draft = clone(row.state);
    const result = fn(draft); // si lanza, el estado no cambia
    row.state = draft;
    row.rev += 1;
    return { result, state: clone(draft) };
  }

  async touch(id: string): Promise<void> {
    this.seen.set(id, new Date());
  }

  async findWalletAccount(address: string): Promise<string | null> {
    return this.wallets.get(address) ?? null;
  }

  async linkWallet(address: string, accountId: string): Promise<void> {
    if (this.wallets.has(address)) throw new Error('err.wallet.taken');
    this.wallets.set(address, accountId);
    const row = this.accounts.get(accountId)!;
    row.isGuest = false;
    row.wallets.push(address);
  }

  async putNonce(nonce: string, address: string, message: string, expiresAt: Date): Promise<void> {
    this.nonces.set(nonce, { address, message, expiresAt });
  }

  async takeNonce(nonce: string) {
    const n = this.nonces.get(nonce) ?? null;
    this.nonces.delete(nonce);
    return n;
  }

  async saveMatch(m: MatchRecord): Promise<void> {
    this.matches.unshift(clone(m));
    if (this.matches.length > 500) this.matches.pop();
  }

  async getMatch(id: string): Promise<MatchRecord | null> {
    const m = this.matches.find((x) => x.id === id);
    return m ? clone(m) : null;
  }

  async listMatches(limit: number): Promise<MatchSummary[]> {
    return this.matches.slice(0, limit).map(({ replay: _r, ...rest }) => clone(rest));
  }

  // ───────────────────────── Social ─────────────────────────

  async ensureCode(id: string, gen: () => string): Promise<string> {
    for (const [c, a] of this.codes) if (a === id) return c;
    let c = gen();
    while (this.codes.has(c)) c = gen();
    this.codes.set(c, id);
    return c;
  }

  async accountByCode(code: string): Promise<string | null> {
    return this.codes.get(code) ?? null;
  }

  async profiles(ids: string[]): Promise<PublicProfile[]> {
    return ids
      .map((id) => this.accounts.get(id))
      .filter((a): a is AccountRow => !!a)
      .map((a) => ({
        accountId: a.id,
        name: a.state.name,
        trophies: a.state.trophies,
        kingLevel: a.state.kingLevel,
        lastSeenAt: this.seen.get(a.id) ?? a.createdAt,
        wallet: a.wallets[0] ?? null,
      }));
  }

  async mutedUntil(id: string): Promise<Date | null> {
    return this.muted.get(id) ?? null;
  }

  async setMuted(id: string, until: Date | null): Promise<void> {
    if (until) this.muted.set(id, until);
    else this.muted.delete(id);
  }

  private linkKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  async friendLinks(id: string): Promise<FriendLink[]> {
    return [...this.links.values()]
      .filter((l) => l.a === id || l.b === id)
      .map((l) => ({
        other: l.a === id ? l.b : l.a,
        requester: l.requester,
        accepted: l.accepted,
        createdAt: l.createdAt,
      }));
  }

  async putFriendLink(a: string, b: string, requester: string, accepted: boolean): Promise<void> {
    const k = this.linkKey(a, b);
    const [x, y] = a < b ? [a, b] : [b, a];
    this.links.set(k, { a: x, b: y, requester, accepted, createdAt: this.links.get(k)?.createdAt ?? new Date() });
  }

  async deleteFriendLink(a: string, b: string): Promise<void> {
    this.links.delete(this.linkKey(a, b));
  }

  async addInvite(fromId: string, toId: string, code: string): Promise<GameInviteRow> {
    this.invites = this.invites.filter((i) => !(i.fromId === fromId && i.toId === toId));
    const row = { id: crypto.randomUUID(), fromId, toId, code, createdAt: new Date() };
    this.invites.push(row);
    return clone(row);
  }

  async invitesFor(toId: string, since: Date): Promise<GameInviteRow[]> {
    return clone(this.invites.filter((i) => i.toId === toId && i.createdAt >= since));
  }

  async deleteInvite(id: string, toId: string): Promise<void> {
    this.invites = this.invites.filter((i) => !(i.id === id && i.toId === toId));
  }

  private clanRow(id: string): ClanRow | null {
    const c = this.clans.get(id);
    if (!c) return null;
    const ms = [...this.members.values()].filter((m) => m.clanId === id);
    const trophies = ms.reduce((t, m) => t + (this.accounts.get(m.accountId)?.state.trophies ?? 0), 0);
    return { ...clone(c), members: ms.length, trophies };
  }

  private nameTaken(name: string, except?: string): boolean {
    const key = name.toLowerCase();
    return [...this.clans.values()].some((c) => c.id !== except && c.name.toLowerCase() === key);
  }

  async createClan(accountId: string, input: ClanInput, charge: (s: ProfileState) => void): Promise<ClanRow> {
    if (this.members.has(accountId)) throw new Error('err.clan.already');
    if (this.nameTaken(input.name)) throw new Error('err.clan.nameTaken');
    await this.mutate(accountId, charge);
    const id = crypto.randomUUID();
    this.clans.set(id, { id, ...input, createdAt: new Date() });
    this.members.set(accountId, {
      accountId,
      clanId: id,
      role: 'leader',
      joinedAt: new Date(),
      lastRequestAt: null,
      donations: 0,
    });
    return this.clanRow(id)!;
  }

  async getClan(id: string): Promise<ClanRow | null> {
    return this.clanRow(id);
  }

  async searchClans(q: string, limit: number): Promise<ClanRow[]> {
    const needle = q.toLowerCase();
    return [...this.clans.keys()]
      .map((id) => this.clanRow(id)!)
      .filter((c) => (needle ? c.name.toLowerCase().includes(needle) : c.type === 'open'))
      .sort((a, b) => b.trophies - a.trophies)
      .slice(0, limit);
  }

  async updateClan(id: string, input: ClanInput): Promise<void> {
    if (this.nameTaken(input.name, id)) throw new Error('err.clan.nameTaken');
    const c = this.clans.get(id);
    if (c) Object.assign(c, input);
  }

  async memberOf(accountId: string): Promise<MemberRow | null> {
    const m = this.members.get(accountId);
    return m ? clone(m) : null;
  }

  async clanMembers(clanId: string): Promise<MemberRow[]> {
    return clone([...this.members.values()].filter((m) => m.clanId === clanId));
  }

  async joinClan(accountId: string, clanId: string, trophies: number, maxMembers: number): Promise<void> {
    if (this.members.has(accountId)) throw new Error('err.clan.already');
    const c = this.clanRow(clanId);
    if (!c) throw new Error('err.clan.notFound');
    if (c.type === 'closed') throw new Error('err.clan.closed');
    if (c.members >= maxMembers) throw new Error('err.clan.full');
    if (trophies < c.minTrophies) throw new Error('err.clan.trophies');
    this.members.set(accountId, {
      accountId,
      clanId,
      role: 'member',
      joinedAt: new Date(),
      lastRequestAt: null,
      donations: 0,
    });
  }

  async leaveClan(accountId: string) {
    const m = this.members.get(accountId);
    if (!m) return null;
    this.members.delete(accountId);
    const rest = [...this.members.values()]
      .filter((x) => x.clanId === m.clanId)
      .sort((a, b) => ROLE_RANK[b.role] - ROLE_RANK[a.role] || +a.joinedAt - +b.joinedAt);
    if (!rest.length) {
      this.clans.delete(m.clanId);
      this.msgs = this.msgs.filter((x) => x.clanId !== m.clanId);
      return { clanId: m.clanId, deleted: true, newLeader: null };
    }
    let newLeader: string | null = null;
    if (m.role === 'leader') {
      rest[0].role = 'leader';
      newLeader = rest[0].accountId;
    }
    return { clanId: m.clanId, deleted: false, newLeader };
  }

  async setRole(accountId: string, role: ClanRole): Promise<void> {
    const m = this.members.get(accountId);
    if (m) m.role = role;
  }

  async addMessage(m: NewClanMessage): Promise<ClanMessageRow> {
    const row: ClanMessageRow = {
      id: crypto.randomUUID(),
      card: null,
      want: 0,
      ...m,
      got: 0,
      donors: {},
      hidden: false,
      createdAt: new Date(),
    };
    this.msgs.push(row);
    return clone(row);
  }

  async messages(clanId: string, limit: number): Promise<ClanMessageRow[]> {
    return clone(this.msgs.filter((m) => m.clanId === clanId).slice(-limit));
  }

  async getMessage(id: string): Promise<ClanMessageRow | null> {
    const m = this.msgs.find((x) => x.id === id);
    return m ? clone(m) : null;
  }

  async createRequest(m: NewClanMessage, now: Date, cooldownSince: Date): Promise<ClanMessageRow> {
    const mem = m.accountId ? this.members.get(m.accountId) : undefined;
    if (!mem || mem.clanId !== m.clanId) throw new Error('err.clan.notMember');
    if (mem.lastRequestAt && mem.lastRequestAt > cooldownSince) throw new Error('err.clan.cooldown');
    mem.lastRequestAt = now;
    return this.addMessage(m);
  }

  async donate<T>(
    messageId: string,
    donorId: string,
    fn: (req: DonationState, donor: ProfileState, receiver: ProfileState) => T,
  ) {
    const msg = this.msgs.find((x) => x.id === messageId);
    if (!msg || msg.kind !== 'request' || !msg.card || !msg.accountId) throw new Error('err.clan.notFound');
    const mem = this.members.get(donorId);
    if (!mem || mem.clanId !== msg.clanId) throw new Error('err.clan.notMember');
    const donorRow = this.accounts.get(donorId),
      recRow = this.accounts.get(msg.accountId);
    if (!donorRow || !recRow) throw new Error('err.clan.notFound');
    const req: DonationState = {
      card: msg.card,
      want: msg.want,
      got: msg.got,
      donors: clone(msg.donors),
      requesterId: msg.accountId,
      createdAt: +msg.createdAt,
    };
    const donor = clone(donorRow.state),
      receiver = clone(recRow.state);
    const result = fn(req, donor, receiver); // si lanza, nada cambia
    donorRow.state = donor;
    recRow.state = receiver;
    msg.got = req.got;
    msg.donors = req.donors;
    mem.donations += 1;
    return { result, message: clone(msg), donor: clone(donor) };
  }

  async report(r: Omit<ReportRow, 'id' | 'createdAt'>): Promise<number> {
    if (this.reports.some((x) => x.reporterId === r.reporterId && x.messageId === r.messageId))
      throw new Error('err.report.dupe');
    this.reports.push({ ...r, id: crypto.randomUUID(), createdAt: new Date() });
    return this.reports.filter((x) => x.messageId === r.messageId && !x.resolved).length;
  }

  async hideMessage(id: string): Promise<void> {
    const m = this.msgs.find((x) => x.id === id);
    if (m) m.hidden = true;
  }

  // ───────────────────────── Ideas y admin ─────────────────────────

  async createIdea(i: Pick<IdeaRow, 'accountId' | 'name' | 'title' | 'body' | 'category'>): Promise<IdeaRow> {
    const now = new Date();
    const row: IdeaRow = {
      ...i,
      id: crypto.randomUUID(),
      status: 'open',
      reply: '',
      votes: 0,
      hidden: false,
      createdAt: now,
      updatedAt: now,
    };
    this.ideas.push(row);
    return clone(row);
  }

  async countIdeasSince(accountId: string, since: Date): Promise<number> {
    return this.ideas.filter((i) => i.accountId === accountId && i.createdAt >= since).length;
  }

  async listIdeas(q: IdeaQuery): Promise<{ rows: IdeaRow[]; total: number }> {
    const all = this.ideas
      .filter(
        (i) =>
          (q.includeHidden || !i.hidden) &&
          (!q.status || i.status === q.status) &&
          (!q.accountId || i.accountId === q.accountId),
      )
      .sort((a, b) =>
        q.sort === 'top' ? b.votes - a.votes || +b.createdAt - +a.createdAt : +b.createdAt - +a.createdAt,
      );
    return { rows: clone(all.slice(q.offset, q.offset + q.limit)), total: all.length };
  }

  async votedIdeas(accountId: string, ids: string[]): Promise<string[]> {
    return ids.filter((id) => this.ideaVotes.has(`${id}|${accountId}`));
  }

  async getIdea(id: string): Promise<IdeaRow | null> {
    const i = this.ideas.find((x) => x.id === id);
    return i ? clone(i) : null;
  }

  async toggleVote(ideaId: string, accountId: string): Promise<{ voted: boolean; votes: number }> {
    const idea = this.ideas.find((x) => x.id === ideaId);
    if (!idea || idea.hidden) throw new Error('err.idea.notFound');
    const k = `${ideaId}|${accountId}`;
    const voted = !this.ideaVotes.has(k);
    if (voted) this.ideaVotes.add(k);
    else this.ideaVotes.delete(k);
    idea.votes += voted ? 1 : -1;
    return { voted, votes: idea.votes };
  }

  async updateIdea(id: string, patch: Partial<Pick<IdeaRow, 'status' | 'reply' | 'hidden'>>): Promise<IdeaRow | null> {
    const i = this.ideas.find((x) => x.id === id);
    if (!i) return null;
    Object.assign(i, patch, { updatedAt: new Date() });
    return clone(i);
  }

  async deleteIdea(id: string): Promise<void> {
    this.ideas = this.ideas.filter((i) => i.id !== id);
    for (const k of [...this.ideaVotes]) if (k.startsWith(`${id}|`)) this.ideaVotes.delete(k);
  }

  async adminStats(since: Date): Promise<AdminStats> {
    const accs = [...this.accounts.values()];
    const now = new Date();
    return {
      accounts: accs.length,
      withWallet: accs.filter((a) => a.wallets.length).length,
      active24h: accs.filter((a) => (this.seen.get(a.id) ?? a.createdAt) >= since).length,
      matches24h: this.matches.filter((m) => m.endedAt >= since).length,
      clans: this.clans.size,
      ideasOpen: this.ideas.filter((i) => i.status === 'open' && !i.hidden).length,
      reports24h: this.reports.filter((r) => r.createdAt >= since).length,
      muted: [...this.muted.values()].filter((d) => d > now).length,
    };
  }

  async listReports(limit: number): Promise<ReportGroup[]> {
    const groups = new Map<string, ReportGroup>();
    for (const r of [...this.reports].reverse()) {
      if (!r.messageId || r.resolved) continue;
      let g = groups.get(r.messageId);
      if (!g) {
        const msg = this.msgs.find((m) => m.id === r.messageId);
        g = {
          messageId: r.messageId,
          clanId: msg?.clanId ?? null,
          targetId: r.targetId,
          targetName: this.accounts.get(r.targetId)?.state.name ?? '?',
          text: r.text,
          hidden: msg?.hidden ?? false,
          count: 0,
          reasons: {},
          lastAt: r.createdAt,
        };
        groups.set(r.messageId, g);
      }
      g.count += 1;
      g.reasons[r.reason] = (g.reasons[r.reason] ?? 0) + 1;
    }
    return clone([...groups.values()].slice(0, limit));
  }

  async resolveReports(messageId: string): Promise<void> {
    for (const r of this.reports) if (r.messageId === messageId) r.resolved = true;
  }

  async unhideMessage(id: string): Promise<void> {
    const m = this.msgs.find((x) => x.id === id);
    if (m) m.hidden = false;
  }

  async searchAccounts(q: string, limit: number): Promise<AdminPlayerRow[]> {
    const needle = q.trim();
    if (!needle) return [];
    const code = needle.replace(/[#\s-]/g, '').toUpperCase();
    const lower = needle.toLowerCase();
    const codeOf = (id: string) => [...this.codes].find(([, a]) => a === id)?.[0] ?? null;
    return [...this.accounts.values()]
      .filter(
        (a) =>
          a.id === needle ||
          codeOf(a.id) === code ||
          a.wallets.some((w) => w.startsWith(needle)) ||
          a.state.name.toLowerCase().includes(lower),
      )
      .slice(0, limit)
      .map((a) => {
        const m = this.members.get(a.id);
        return {
          accountId: a.id,
          name: a.state.name,
          trophies: a.state.trophies,
          kingLevel: a.state.kingLevel,
          wallets: [...a.wallets],
          code: codeOf(a.id),
          mutedUntil: this.muted.get(a.id) ?? null,
          createdAt: a.createdAt,
          lastSeenAt: this.seen.get(a.id) ?? a.createdAt,
          clan: m ? (this.clans.get(m.clanId)?.name ?? null) : null,
          reports: this.reports.filter((r) => r.targetId === a.id).length,
        };
      });
  }

  async logAdmin(e: Omit<AdminLogRow, 'id' | 'createdAt'>): Promise<void> {
    this.adminLog.unshift({ ...clone(e), id: crypto.randomUUID(), createdAt: new Date() });
  }

  async listAdminLog(limit: number): Promise<AdminLogRow[]> {
    return clone(this.adminLog.slice(0, limit));
  }

  async close(): Promise<void> {}
}
