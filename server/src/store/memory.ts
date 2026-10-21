import crypto from 'node:crypto';
import type { ProfileState } from '@arena/shared';
import type { AccountRow, MatchRecord, MatchSummary, RankEntry, RankRange, SeasonResultRow, Store } from './types';

const clone = <T>(v: T): T => structuredClone(v);

/** Datos en memoria (se pierden al reiniciar). Para tests y para arrancar sin PostgreSQL. */
export class MemoryStore implements Store {
  readonly kind = 'memory' as const;
  private accounts = new Map<string, AccountRow>();
  private wallets = new Map<string, string>();
  private nonces = new Map<string, { address: string; message: string; expiresAt: Date }>();
  private matches: MatchRecord[] = [];
  private seasons = new Map<string, { closed: boolean; top: SeasonResultRow[] }>();

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
    const draft = clone(row.state);
    const result = fn(draft); // si lanza, el estado no cambia
    row.state = draft;
    row.rev += 1;
    return { result, state: clone(draft) };
  }

  async touch(): Promise<void> {}

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

  async close(): Promise<void> {}
}
