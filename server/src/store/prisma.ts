import { Prisma, PrismaClient } from '@prisma/client';
import {
  ROLE_RANK,
  sanitize,
  type ClanInput,
  type ClanRole,
  type ClanType,
  type DonationState,
  type IdeaCategory,
  type IdeaStatus,
  type MatchMode,
  type PlayerInfo,
  type ProfileState,
  type Replay,
  type Team,
  type Winner,
} from '@arena/shared';
import type {
  AccountRow,
  AdminLogRow,
  AdminPlayerRow,
  AdminStats,
  IdeaQuery,
  IdeaRow,
  ReportGroup,
  ClanMessageKind,
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

  // ───────────────────────── Social ─────────────────────────

  async ensureCode(id: string, gen: () => string): Promise<string> {
    const a = await this.db.account.findUnique({ where: { id }, select: { code: true } });
    if (!a) throw new Error('err.account.notFound');
    if (a.code) return a.code;
    for (let i = 0; i < 10; i++) {
      const code = gen();
      try {
        // solo si sigue sin código (dos peticiones a la vez no se pisan)
        const r = await this.db.account.updateMany({ where: { id, code: null }, data: { code } });
        if (r.count) return code;
        return (await this.db.account.findUnique({ where: { id }, select: { code: true } }))!.code!;
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      }
    }
    throw new Error('err.server');
  }

  async accountByCode(code: string): Promise<string | null> {
    const a = await this.db.account.findUnique({ where: { code }, select: { id: true } });
    return a?.id ?? null;
  }

  async profiles(ids: string[]): Promise<PublicProfile[]> {
    if (!ids.length) return [];
    const rows = await this.db.account.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        name: true,
        trophies: true,
        kingLevel: true,
        lastSeenAt: true,
        wallets: { select: { address: true }, take: 1 },
      },
    });
    return rows.map((r) => ({
      accountId: r.id,
      name: r.name,
      trophies: r.trophies,
      kingLevel: r.kingLevel,
      lastSeenAt: r.lastSeenAt,
      wallet: r.wallets[0]?.address ?? null,
    }));
  }

  async mutedUntil(id: string): Promise<Date | null> {
    const a = await this.db.account.findUnique({ where: { id }, select: { mutedUntil: true } });
    return a?.mutedUntil ?? null;
  }

  async setMuted(id: string, until: Date | null): Promise<void> {
    await this.db.account.update({ where: { id }, data: { mutedUntil: until } });
  }

  async friendLinks(id: string): Promise<FriendLink[]> {
    const rows = await this.db.friendship.findMany({ where: { OR: [{ a: id }, { b: id }] } });
    return rows.map((l) => ({
      other: l.a === id ? l.b : l.a,
      requester: l.requester,
      accepted: l.accepted,
      createdAt: l.createdAt,
    }));
  }

  async putFriendLink(a: string, b: string, requester: string, accepted: boolean): Promise<void> {
    const [x, y] = a < b ? [a, b] : [b, a];
    await this.db.friendship.upsert({
      where: { a_b: { a: x, b: y } },
      create: { a: x, b: y, requester, accepted },
      update: { requester, accepted },
    });
  }

  async deleteFriendLink(a: string, b: string): Promise<void> {
    const [x, y] = a < b ? [a, b] : [b, a];
    await this.db.friendship.deleteMany({ where: { a: x, b: y } });
  }

  async addInvite(fromId: string, toId: string, code: string): Promise<GameInviteRow> {
    const [, row] = await this.db.$transaction([
      this.db.gameInvite.deleteMany({ where: { fromId, toId } }),
      this.db.gameInvite.create({ data: { fromId, toId, code } }),
    ]);
    // limpieza de caducadas (barata, de vez en cuando)
    if (Math.random() < 0.05)
      await this.db.gameInvite.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 3600_000) } } });
    return row;
  }

  async invitesFor(toId: string, since: Date): Promise<GameInviteRow[]> {
    return this.db.gameInvite.findMany({ where: { toId, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' } });
  }

  async deleteInvite(id: string, toId: string): Promise<void> {
    await this.db.gameInvite.deleteMany({ where: { id, toId } });
  }

  /** Clanes con número de miembros y suma de trofeos. */
  private async clanRows(where: Prisma.ClanWhereInput, take?: number): Promise<ClanRow[]> {
    const clans = await this.db.clan.findMany({ where, take: take ? take * 4 : undefined });
    if (!clans.length) return [];
    const stats = await this.db.$queryRaw<Array<{ clanId: string; members: bigint; trophies: bigint | null }>>`
      SELECT m."clanId", COUNT(*) AS members, SUM(a.trophies) AS trophies
      FROM "ClanMember" m JOIN "Account" a ON a.id = m."accountId"
      WHERE m."clanId" IN (${Prisma.join(clans.map((c) => c.id))})
      GROUP BY m."clanId"`;
    const by = new Map(stats.map((s) => [s.clanId, s]));
    return clans
      .map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        badge: c.badge,
        type: c.type as ClanType,
        minTrophies: c.minTrophies,
        createdAt: c.createdAt,
        members: Number(by.get(c.id)?.members ?? 0),
        trophies: Number(by.get(c.id)?.trophies ?? 0),
      }))
      .sort((a, b) => b.trophies - a.trophies)
      .slice(0, take);
  }

  async createClan(accountId: string, input: ClanInput, charge: (s: ProfileState) => void): Promise<ClanRow> {
    try {
      const id = await this.db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Account" WHERE id = ${accountId} FOR UPDATE`;
          if (await tx.clanMember.findUnique({ where: { accountId } })) throw new Error('err.clan.already');
          const a = await tx.account.findUnique({ where: { id: accountId }, include: { wallets: true } });
          if (!a) throw new Error('err.account.notFound');
          const row = toRow(a);
          charge(row.state);
          await tx.account.update({ where: { id: accountId }, data: { ...columns(row.state), rev: { increment: 1 } } });
          const c = await tx.clan.create({ data: { ...input, nameKey: input.name.toLowerCase() } });
          await tx.clanMember.create({ data: { accountId, clanId: c.id, role: 'leader' } });
          return c.id;
        },
        { maxWait: 10_000, timeout: 10_000 },
      );
      return (await this.getClan(id))!;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw new Error('err.clan.nameTaken');
      throw e;
    }
  }

  async getClan(id: string): Promise<ClanRow | null> {
    return (await this.clanRows({ id }))[0] ?? null;
  }

  async searchClans(q: string, limit: number): Promise<ClanRow[]> {
    return this.clanRows(q ? { nameKey: { contains: q.toLowerCase() } } : { type: 'open' }, limit);
  }

  async updateClan(id: string, input: ClanInput): Promise<void> {
    try {
      await this.db.clan.update({ where: { id }, data: { ...input, nameKey: input.name.toLowerCase() } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw new Error('err.clan.nameTaken');
      throw e;
    }
  }

  private toMember = (m: Prisma.ClanMemberGetPayload<object>): MemberRow => ({
    accountId: m.accountId,
    clanId: m.clanId,
    role: m.role as ClanRole,
    joinedAt: m.joinedAt,
    lastRequestAt: m.lastRequestAt,
    donations: m.donations,
  });

  async memberOf(accountId: string): Promise<MemberRow | null> {
    const m = await this.db.clanMember.findUnique({ where: { accountId } });
    return m ? this.toMember(m) : null;
  }

  async clanMembers(clanId: string): Promise<MemberRow[]> {
    return (await this.db.clanMember.findMany({ where: { clanId } })).map(this.toMember);
  }

  async joinClan(accountId: string, clanId: string, trophies: number, maxMembers: number): Promise<void> {
    await this.db.$transaction(
      async (tx) => {
        // el clan bloqueado: dos que entran a la vez no pueden pasarse del máximo
        const c = await tx.$queryRaw<Array<{ type: string; minTrophies: number }>>`
          SELECT type, "minTrophies" FROM "Clan" WHERE id = ${clanId} FOR UPDATE`;
        if (!c.length) throw new Error('err.clan.notFound');
        if (await tx.clanMember.findUnique({ where: { accountId } })) throw new Error('err.clan.already');
        if (c[0].type === 'closed') throw new Error('err.clan.closed');
        if ((await tx.clanMember.count({ where: { clanId } })) >= maxMembers) throw new Error('err.clan.full');
        if (trophies < c[0].minTrophies) throw new Error('err.clan.trophies');
        await tx.clanMember.create({ data: { accountId, clanId } });
      },
      { maxWait: 10_000, timeout: 10_000 },
    );
  }

  async leaveClan(accountId: string) {
    return this.db.$transaction(
      async (tx) => {
        const m = await tx.clanMember.findUnique({ where: { accountId } });
        if (!m) return null;
        await tx.$queryRaw`SELECT id FROM "Clan" WHERE id = ${m.clanId} FOR UPDATE`;
        await tx.clanMember.delete({ where: { accountId } });
        const rest = (await tx.clanMember.findMany({ where: { clanId: m.clanId } }))
          .map(this.toMember)
          .sort((a, b) => ROLE_RANK[b.role] - ROLE_RANK[a.role] || +a.joinedAt - +b.joinedAt);
        if (!rest.length) {
          await tx.clan.delete({ where: { id: m.clanId } });
          return { clanId: m.clanId, deleted: true, newLeader: null };
        }
        let newLeader: string | null = null;
        if (m.role === 'leader') {
          newLeader = rest[0].accountId;
          await tx.clanMember.update({ where: { accountId: newLeader }, data: { role: 'leader' } });
        }
        return { clanId: m.clanId, deleted: false, newLeader };
      },
      { maxWait: 10_000, timeout: 10_000 },
    );
  }

  async setRole(accountId: string, role: ClanRole): Promise<void> {
    await this.db.clanMember.update({ where: { accountId }, data: { role } });
  }

  private toMessage = (m: Prisma.ClanMessageGetPayload<object>): ClanMessageRow => ({
    id: m.id,
    clanId: m.clanId,
    accountId: m.accountId,
    name: m.name,
    kind: m.kind as ClanMessageKind,
    body: m.body,
    card: m.card,
    want: m.want,
    got: m.got,
    donors: (m.donors ?? {}) as Record<string, number>,
    hidden: m.hidden,
    createdAt: m.createdAt,
  });

  async addMessage(m: NewClanMessage): Promise<ClanMessageRow> {
    return this.toMessage(await this.db.clanMessage.create({ data: { ...m } }));
  }

  async messages(clanId: string, limit: number): Promise<ClanMessageRow[]> {
    const rows = await this.db.clanMessage.findMany({ where: { clanId }, orderBy: { createdAt: 'desc' }, take: limit });
    return rows.reverse().map(this.toMessage);
  }

  async getMessage(id: string): Promise<ClanMessageRow | null> {
    const m = await this.db.clanMessage.findUnique({ where: { id } });
    return m ? this.toMessage(m) : null;
  }

  async createRequest(m: NewClanMessage, now: Date, cooldownSince: Date): Promise<ClanMessageRow> {
    return this.db.$transaction(async (tx) => {
      // solo pasa si sigue en el clan y su última petición es lo bastante antigua
      const r = await tx.clanMember.updateMany({
        where: {
          accountId: m.accountId!,
          clanId: m.clanId,
          OR: [{ lastRequestAt: null }, { lastRequestAt: { lte: cooldownSince } }],
        },
        data: { lastRequestAt: now },
      });
      if (!r.count) {
        const mem = await tx.clanMember.findUnique({ where: { accountId: m.accountId! } });
        throw new Error(mem?.clanId === m.clanId ? 'err.clan.cooldown' : 'err.clan.notMember');
      }
      return this.toMessage(await tx.clanMessage.create({ data: { ...m } }));
    });
  }

  async donate<T>(
    messageId: string,
    donorId: string,
    fn: (req: DonationState, donor: ProfileState, receiver: ProfileState) => T,
  ) {
    return this.db.$transaction(
      async (tx) => {
        // orden fijo de bloqueo (petición y luego cuentas por id) para no interbloquearse
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "ClanMessage" WHERE id = ${messageId} FOR UPDATE`;
        if (!locked.length) throw new Error('err.clan.notFound');
        const msg = this.toMessage((await tx.clanMessage.findUnique({ where: { id: messageId } }))!);
        if (msg.kind !== 'request' || !msg.card || !msg.accountId) throw new Error('err.clan.notFound');
        const mem = await tx.clanMember.findUnique({ where: { accountId: donorId } });
        if (!mem || mem.clanId !== msg.clanId) throw new Error('err.clan.notMember');
        const ids = [donorId, msg.accountId].sort();
        await tx.$queryRaw`SELECT id FROM "Account" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
        const accs = await tx.account.findMany({ where: { id: { in: ids } }, include: { wallets: true } });
        const donorA = accs.find((a) => a.id === donorId),
          recA = accs.find((a) => a.id === msg.accountId);
        if (!donorA || !recA) throw new Error('err.clan.notFound');
        const donor = toRow(donorA).state,
          receiver = toRow(recA).state;
        const req: DonationState = {
          card: msg.card,
          want: msg.want,
          got: msg.got,
          donors: { ...msg.donors },
          requesterId: msg.accountId,
          createdAt: +msg.createdAt,
        };
        const result = fn(req, donor, receiver); // si lanza, la transacción se deshace
        await tx.account.update({ where: { id: donorId }, data: { ...columns(donor), rev: { increment: 1 } } });
        await tx.account.update({
          where: { id: msg.accountId },
          data: { ...columns(receiver), rev: { increment: 1 } },
        });
        await tx.clanMember.update({ where: { accountId: donorId }, data: { donations: { increment: 1 } } });
        const updated = await tx.clanMessage.update({
          where: { id: messageId },
          data: { got: req.got, donors: req.donors },
        });
        return { result, message: this.toMessage(updated), donor };
      },
      { maxWait: 10_000, timeout: 10_000 },
    );
  }

  async report(r: Omit<ReportRow, 'id' | 'createdAt'>): Promise<number> {
    try {
      await this.db.report.create({ data: r });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new Error('err.report.dupe');
      throw e;
    }
    return this.db.report.count({ where: { messageId: r.messageId, resolved: false } });
  }

  async hideMessage(id: string): Promise<void> {
    await this.db.clanMessage.update({ where: { id }, data: { hidden: true } });
  }

  // ───────────────────────── Ideas y admin ─────────────────────────

  private toIdea = (i: Prisma.IdeaGetPayload<object>): IdeaRow => ({
    id: i.id,
    accountId: i.accountId,
    name: i.name,
    title: i.title,
    body: i.body,
    category: i.category as IdeaCategory,
    status: i.status as IdeaStatus,
    reply: i.reply,
    votes: i.votes,
    hidden: i.hidden,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
  });

  async createIdea(i: Pick<IdeaRow, 'accountId' | 'name' | 'title' | 'body' | 'category'>): Promise<IdeaRow> {
    return this.toIdea(await this.db.idea.create({ data: i }));
  }

  async countIdeasSince(accountId: string, since: Date): Promise<number> {
    return this.db.idea.count({ where: { accountId, createdAt: { gte: since } } });
  }

  async listIdeas(q: IdeaQuery): Promise<{ rows: IdeaRow[]; total: number }> {
    const where: Prisma.IdeaWhereInput = {
      ...(q.includeHidden ? {} : { hidden: false }),
      ...(q.status ? { status: q.status } : {}),
      ...(q.accountId ? { accountId: q.accountId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.idea.findMany({
        where,
        orderBy: q.sort === 'top' ? [{ votes: 'desc' }, { createdAt: 'desc' }] : [{ createdAt: 'desc' }],
        take: q.limit,
        skip: q.offset,
      }),
      this.db.idea.count({ where }),
    ]);
    return { rows: rows.map(this.toIdea), total };
  }

  async votedIdeas(accountId: string, ids: string[]): Promise<string[]> {
    if (!ids.length) return [];
    const v = await this.db.ideaVote.findMany({ where: { accountId, ideaId: { in: ids } }, select: { ideaId: true } });
    return v.map((x) => x.ideaId);
  }

  async getIdea(id: string): Promise<IdeaRow | null> {
    const i = await this.db.idea.findUnique({ where: { id } });
    return i ? this.toIdea(i) : null;
  }

  async toggleVote(ideaId: string, accountId: string): Promise<{ voted: boolean; votes: number }> {
    return this.db.$transaction(async (tx) => {
      // la idea bloqueada: dos votos a la vez del mismo jugador no cuentan doble
      const locked = await tx.$queryRaw<Array<{ hidden: boolean }>>`
        SELECT hidden FROM "Idea" WHERE id = ${ideaId} FOR UPDATE`;
      if (!locked.length || locked[0].hidden) throw new Error('err.idea.notFound');
      const had = await tx.ideaVote.deleteMany({ where: { ideaId, accountId } });
      if (!had.count) await tx.ideaVote.create({ data: { ideaId, accountId } });
      const i = await tx.idea.update({
        where: { id: ideaId },
        data: { votes: { increment: had.count ? -1 : 1 } },
      });
      return { voted: !had.count, votes: i.votes };
    });
  }

  async updateIdea(id: string, patch: Partial<Pick<IdeaRow, 'status' | 'reply' | 'hidden'>>): Promise<IdeaRow | null> {
    try {
      return this.toIdea(await this.db.idea.update({ where: { id }, data: patch }));
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') return null;
      throw e;
    }
  }

  async deleteIdea(id: string): Promise<void> {
    await this.db.idea.deleteMany({ where: { id } });
  }

  async adminStats(since: Date): Promise<AdminStats> {
    const now = new Date();
    const [accounts, withWallet, active24h, matches24h, clans, ideasOpen, reports24h, muted] = await Promise.all([
      this.db.account.count(),
      this.db.account.count({ where: { isGuest: false } }),
      this.db.account.count({ where: { lastSeenAt: { gte: since } } }),
      this.db.match.count({ where: { endedAt: { gte: since } } }),
      this.db.clan.count(),
      this.db.idea.count({ where: { status: 'open', hidden: false } }),
      this.db.report.count({ where: { createdAt: { gte: since } } }),
      this.db.account.count({ where: { mutedUntil: { gt: now } } }),
    ]);
    return { accounts, withWallet, active24h, matches24h, clans, ideasOpen, reports24h, muted };
  }

  async listReports(limit: number): Promise<ReportGroup[]> {
    // las denuncias recientes, agrupadas por mensaje
    const reports = await this.db.report.findMany({
      where: { messageId: { not: null }, resolved: false },
      orderBy: { createdAt: 'desc' },
      take: 1000,
      include: { message: { select: { clanId: true, hidden: true } } },
    });
    const groups = new Map<string, ReportGroup>();
    for (const r of reports) {
      let g = groups.get(r.messageId!);
      if (!g) {
        g = {
          messageId: r.messageId!,
          clanId: r.message?.clanId ?? null,
          targetId: r.targetId,
          targetName: '',
          text: r.text,
          hidden: r.message?.hidden ?? false,
          count: 0,
          reasons: {},
          lastAt: r.createdAt,
        };
        groups.set(r.messageId!, g);
      }
      g.count += 1;
      g.reasons[r.reason] = (g.reasons[r.reason] ?? 0) + 1;
    }
    const list = [...groups.values()].slice(0, limit);
    const names = await this.db.account.findMany({
      where: { id: { in: [...new Set(list.map((g) => g.targetId))] } },
      select: { id: true, name: true },
    });
    const byId = new Map(names.map((n) => [n.id, n.name]));
    for (const g of list) g.targetName = byId.get(g.targetId) ?? '?';
    return list;
  }

  async resolveReports(messageId: string): Promise<void> {
    await this.db.report.updateMany({ where: { messageId }, data: { resolved: true } });
  }

  async unhideMessage(id: string): Promise<void> {
    await this.db.clanMessage.updateMany({ where: { id }, data: { hidden: false } });
  }

  async searchAccounts(q: string, limit: number): Promise<AdminPlayerRow[]> {
    const needle = q.trim();
    if (!needle) return [];
    const code = needle.replace(/[#\s-]/g, '').toUpperCase();
    const rows = await this.db.account.findMany({
      where: {
        OR: [
          { id: needle },
          { code },
          { wallets: { some: { address: { startsWith: needle } } } },
          { name: { contains: needle, mode: 'insensitive' } },
        ],
      },
      orderBy: { lastSeenAt: 'desc' },
      take: limit,
      include: { wallets: { select: { address: true } }, clan: { include: { clan: { select: { name: true } } } } },
    });
    const reports = await this.db.report.groupBy({
      by: ['targetId'],
      where: { targetId: { in: rows.map((r) => r.id) } },
      _count: { _all: true },
    });
    const rc = new Map(reports.map((r) => [r.targetId, r._count._all]));
    return rows.map((a) => ({
      accountId: a.id,
      name: a.name,
      trophies: a.trophies,
      kingLevel: a.kingLevel,
      wallets: a.wallets.map((w) => w.address),
      code: a.code,
      mutedUntil: a.mutedUntil,
      createdAt: a.createdAt,
      lastSeenAt: a.lastSeenAt,
      clan: a.clan?.clan.name ?? null,
      reports: rc.get(a.id) ?? 0,
    }));
  }

  async logAdmin(e: Omit<AdminLogRow, 'id' | 'createdAt'>): Promise<void> {
    await this.db.adminLog.create({ data: { ...e, details: e.details as Prisma.InputJsonValue } });
  }

  async listAdminLog(limit: number): Promise<AdminLogRow[]> {
    const rows = await this.db.adminLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
    return rows.map((r) => ({ ...r, details: (r.details ?? {}) as Record<string, unknown> }));
  }

  async close(): Promise<void> {
    await this.db.$disconnect();
  }
}
