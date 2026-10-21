import express from 'express';
import { ARENAS, SEASON, SEASON_TIERS, previousSeasonId, seasonAt } from '@arena/shared';
import { bearer, verifySession } from '../auth';
import type { RankRange, Store } from '../store/types';

const shortWallet = (w: string | null) => (w ? `${w.slice(0, 4)}…${w.slice(-4)}` : null);

/** Rango de trofeos de una arena: [sus trofeos, los de la siguiente). */
function arenaRange(i: number): RankRange | null {
  const a = ARENAS[i];
  if (!a) return null;
  return { min: a.trophies, max: ARENAS[i + 1]?.trophies };
}

/**
 * Rankings y temporada. Ahora sobre PostgreSQL; la interfaz no cambia cuando pase a Redis
 * (sorted sets) para escalar.
 */
export function leaderboardRoutes(store: Store): express.Router {
  const r = express.Router();

  /** GET /api/leaderboard?scope=global|arena|friends&arena=N&limit=50&offset=0 */
  r.get('/leaderboard', async (req, res) => {
    if (req.query.scope === 'friends') return void (await friendsBoard(req, res));
    const scope = req.query.scope === 'arena' ? 'arena' : 'global';
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50));
    const offset = Math.max(0, Math.min(10_000, Number(req.query.offset) || 0));
    let range: RankRange = {};
    let arena: number | null = null;
    if (scope === 'arena') {
      arena = Number(req.query.arena);
      const rr = Number.isInteger(arena) ? arenaRange(arena) : null;
      if (!rr) return void res.status(400).json({ error: 'err.leaderboard.arena' });
      range = rr;
    }
    const [rows, total] = await Promise.all([store.leaderboard(range, limit, offset), store.countRanked(range)]);
    // puestos con empates (mismo número de trofeos = mismo puesto)
    const entries = await Promise.all(
      rows.map(async (e, i) => ({
        rank: i > 0 && rows[i - 1].trophies === e.trophies ? null : (await store.countAbove(e.trophies, range)) + 1,
        accountId: e.accountId,
        name: e.name,
        trophies: e.trophies,
        kingLevel: e.kingLevel,
        wallet: shortWallet(e.wallet),
      })),
    );
    for (let i = 1; i < entries.length; i++) if (entries[i].rank === null) entries[i].rank = entries[i - 1].rank;

    // mi puesto (si mandas tu sesión)
    let me: { rank: number | null; trophies: number } | null = null;
    const session = await verifySession(bearer(req.headers.authorization));
    if (session) {
      const acc = await store.getAccount(session.accountId);
      if (acc) {
        const t = acc.state.trophies;
        const inRange = t > 0 && t >= (range.min ?? 0) && t < (range.max ?? Infinity);
        me = { rank: inRange ? (await store.countAbove(t, range)) + 1 : null, trophies: t };
      }
    }
    res.json({ scope, arena, total, offset, entries, me, season: seasonAt(Date.now()) });
  });

  /** Tú y tus amigos, de más a menos trofeos (hace falta la sesión). */
  async function friendsBoard(req: express.Request, res: express.Response): Promise<void> {
    const session = await verifySession(bearer(req.headers.authorization));
    if (!session) return void res.status(401).json({ error: 'err.session' });
    const me = session.accountId;
    const ids = [me, ...(await store.friendLinks(me)).filter((l) => l.accepted).map((l) => l.other)];
    const rows = (await store.profiles(ids)).sort((a, b) => b.trophies - a.trophies || b.kingLevel - a.kingLevel);
    let rank = 0;
    const entries = rows.map((p, i) => {
      if (i === 0 || rows[i - 1].trophies !== p.trophies) rank = i + 1;
      return {
        rank,
        accountId: p.accountId,
        name: p.name,
        trophies: p.trophies,
        kingLevel: p.kingLevel,
        wallet: shortWallet(p.wallet),
      };
    });
    const mine = entries.find((e) => e.accountId === me);
    res.json({
      scope: 'friends',
      arena: null,
      total: entries.length,
      offset: 0,
      entries,
      me: mine ? { rank: mine.rank, trophies: mine.trophies } : null,
      season: seasonAt(Date.now()),
    });
  }

  /** GET /api/season: temporada actual, tramos de recompensa y el top de la anterior. */
  r.get('/season', async (_req, res) => {
    const current = seasonAt(Date.now());
    const prev = previousSeasonId(current.id);
    const top = await store.seasonTop(prev, 10);
    res.json({
      current,
      tiers: SEASON_TIERS,
      resetAbove: SEASON.resetAbove,
      keepRatio: SEASON.keepRatio,
      previous: { id: prev, top: top.map((t) => ({ rank: t.rank, name: t.name, trophies: t.trophies, best: t.best })) },
    });
  });

  return r;
}
