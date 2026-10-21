import { Prisma, PrismaClient } from '@prisma/client';
import {
  sanitize,
  type MatchMode,
  type PlayerInfo,
  type ProfileState,
  type Replay,
  type Team,
  type Winner,
} from '@arena/shared';
import type { AccountRow, MatchRecord, MatchSummary, RankEntry, RankRange, SeasonResultRow, Store } from './types';

type DbAccount = Prisma.AccountGetPayload<{ include: { wallets: true } }>;

const toRow = (a: DbAccount): AccountRow => ({
  id: a.id,
  isGuest: a.isGuest,
  state: sanitize(a.state as unknown as ProfileState),
  rev: a.rev,
  wallets: a.wallets.map((w) => w.address),
  createdAt: a.createdAt,
});

/** Columnas que se copian del estado para poder consultarlas (rankings, admin). */
const columns = (s: ProfileState) => ({
  name: s.name,
  trophies: s.trophies,
  maxTrophies: s.maxTrophies,
  kingLevel: s.kingLevel,
  state: s as unknown as Prisma.InputJsonValue,
});

/** PostgreSQL con Prisma. */
export class PrismaStore implements Store {
  readonly kind = 'postgres' as const;
  readonly db: PrismaClient;

  constructor(url?: string) {
    this.db = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
  }

  async createAccount(state: ProfileState, isGuest: boolean, wallet?: string): Promise<AccountRow> {
    const a = await this.db.account.create({
      data: {
        ...columns(state),
        isGuest: isGuest && !wallet,
        wallets: wallet ? { create: { address: wallet } } : undefined,
      },
      include: { wallets: true },
    });
    return toRow(a);
  }

  async getAccount(id: string): Promise<AccountRow | null> {
    const a = await this.db.account.findUnique({ where: { id }, include: { wallets: true } });
    return a ? toRow(a) : null;
  }

  async mutate<T>(id: string, fn: (s: ProfileState) => T): Promise<{ result: T; state: ProfileState }> {
    // La fila de la cuenta se bloquea (SELECT … FOR UPDATE) durante el cambio: las peticiones
    // de una misma cuenta se aplican en orden, sin perder ninguna; las de otras cuentas, en paralelo.
    return this.db.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Account" WHERE id = ${id} FOR UPDATE`;
        if (!locked.length) throw new Error('err.account.notFound');
        const a = (await tx.account.findUnique({ where: { id }, include: { wallets: true } }))!;
        const row = toRow(a);
        const result = fn(row.state); // si la regla lanza, la transacción se deshace
        await tx.account.update({
          where: { id },
          data: { ...columns(row.state), rev: { increment: 1 }, lastSeenAt: new Date() },
        });
        return { result, state: row.state };
      },
      { maxWait: 10_000, timeout: 10_000 },
    );
  }

  async touch(id: string): Promise<void> {
    await this.db.account.update({ where: { id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }

  async findWalletAccount(address: string): Promise<string | null> {
    const w = await this.db.wallet.findUnique({ where: { address } });
    return w?.accountId ?? null;
  }

  async linkWallet(address: string, accountId: string): Promise<void> {
    try {
      await this.db.$transaction([
        this.db.wallet.create({ data: { address, accountId } }),
        this.db.account.update({ where: { id: accountId }, data: { isGuest: false } }),
      ]);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new Error('err.wallet.taken');
      throw e;
    }
  }

  async putNonce(nonce: string, address: string, message: string, expiresAt: Date): Promise<void> {
    await this.db.authNonce.create({ data: { nonce, address, message, expiresAt } });
    // limpieza de caducados (barata, de vez en cuando)
    if (Math.random() < 0.05) await this.db.authNonce.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  }

  async takeNonce(nonce: string) {
    try {
      const n = await this.db.authNonce.delete({ where: { nonce } });
      return { address: n.address, message: n.message, expiresAt: n.expiresAt };
    } catch {
      return null;
    }
  }

  async saveMatch(m: MatchRecord): Promise<void> {
    await this.db.match.create({
      data: {
        id: m.id,
        mode: m.mode,
        blueId: m.blueId,
        redId: m.redId,
        winner: m.winner,
        reason: m.reason,
        players: m.players as unknown as Prisma.InputJsonValue,
        crowns: m.crowns as unknown as Prisma.InputJsonValue,
        ticks: m.ticks,
        hash: BigInt(m.hash),
        replay: m.replay as unknown as Prisma.InputJsonValue,
        endedAt: m.endedAt,
      },
    });
  }

  private toMatch(r: Prisma.MatchGetPayload<object>): MatchRecord {
    return {
      id: r.id,
      mode: r.mode as MatchMode,
      blueId: r.blueId,
      redId: r.redId,
      winner: r.winner as Winner | null,
      reason: r.reason,
      players: r.players as unknown as Record<Team, PlayerInfo>,
      crowns: r.crowns as unknown as Record<Team, number>,
      ticks: r.ticks,
      hash: Number(r.hash),
      replay: r.replay as unknown as Replay,
      endedAt: r.endedAt,
    };
  }

  async getMatch(id: string): Promise<MatchRecord | null> {
    const r = await this.db.match.findUnique({ where: { id } });
    return r ? this.toMatch(r) : null;
  }

  async listMatches(limit: number): Promise<MatchSummary[]> {
    const rows = await this.db.match.findMany({
      orderBy: { endedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        mode: true,
        blueId: true,
        redId: true,
        winner: true,
        reason: true,
        players: true,
        crowns: true,
        ticks: true,
        hash: true,
        endedAt: true,
      },
    });
    return rows.map((r) => {
      const { replay: _r, ...rest } = this.toMatch({ ...r, replay: null as unknown as Prisma.JsonValue });
      return rest;
    });
  }

  private where(range: RankRange): Prisma.AccountWhereInput {
    return { trophies: { gt: 0, gte: range.min ?? 0, ...(range.max !== undefined ? { lt: range.max } : {}) } };
  }

  async leaderboard(range: RankRange, limit: number, offset: number): Promise<RankEntry[]> {
    const rows = await this.db.account.findMany({
      where: this.where(range),
      orderBy: [{ trophies: 'desc' }, { kingLevel: 'desc' }, { createdAt: 'asc' }],
      take: limit,
      skip: offset,
      select: {
        id: true,
        name: true,
        trophies: true,
        kingLevel: true,
        wallets: { select: { address: true }, take: 1 },
      },
    });
    return rows.map((r) => ({
      accountId: r.id,
      name: r.name,
      trophies: r.trophies,
      kingLevel: r.kingLevel,
      wallet: r.wallets[0]?.address ?? null,
    }));
  }

  async countAbove(trophies: number, range: RankRange): Promise<number> {
    const w = this.where(range);
    return this.db.account.count({ where: { AND: [w, { trophies: { gt: trophies } }] } });
  }

  async countRanked(range: RankRange): Promise<number> {
    return this.db.account.count({ where: this.where(range) });
  }

  async rankedSnapshot() {
    const rows = await this.db.account.findMany({
      where: { trophies: { gt: 0 } },
      orderBy: [{ trophies: 'desc' }, { kingLevel: 'desc' }, { createdAt: 'asc' }],
      select: { id: true, trophies: true },
    });
    return rows.map((r) => ({ accountId: r.id, trophies: r.trophies }));
  }

  async beginSeasonClose(id: string): Promise<boolean> {
    try {
      await this.db.season.create({ data: { id } });
      return true;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return false;
      throw e;
    }
  }

  async finishSeasonClose(id: string, top: SeasonResultRow[]): Promise<void> {
    await this.db.$transaction([
      this.db.seasonResult.createMany({ data: top.map((r) => ({ ...r, seasonId: id })), skipDuplicates: true }),
      this.db.season.update({ where: { id }, data: { closedAt: new Date() } }),
    ]);
  }

  async seasonTop(id: string, limit: number): Promise<SeasonResultRow[]> {
    const rows = await this.db.seasonResult.findMany({
      where: { seasonId: id },
      orderBy: { rank: 'asc' },
      take: limit,
    });
    return rows.map(({ seasonId: _s, ...r }) => r);
  }

  async close(): Promise<void> {
    await this.db.$disconnect();
  }
}
