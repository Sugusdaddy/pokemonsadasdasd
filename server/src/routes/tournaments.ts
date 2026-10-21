import crypto from 'node:crypto';
import express from 'express';
import {
  FRIENDLY_CODE_ALPHABET,
  TOURNAMENT_DURATIONS,
  TOURNAMENT_MAX_PLAYERS,
  TOURNAMENT_NAME_MAX,
  claimTournamentPrize,
  hasProfanity,
  isFriendlyCode,
  isRuleSet,
  rankStandings,
  shopDay,
  tournamentHasPrizes,
  type RuleSet,
  type TournamentDetail,
  type TournamentSummary,
} from '@arena/shared';
import type { Store, TournamentPlayerRow, TournamentRow } from '../store/types';
import { type Authed, fail, handle, requireSession } from './util';

const DAY = 86_400_000;

const summary = (t: TournamentRow, players: number, me: string): TournamentSummary => ({
  id: t.id,
  code: t.code,
  name: t.name,
  rules: t.rules,
  maxPlayers: t.maxPlayers,
  players,
  isPublic: t.isPublic,
  endsAt: +t.endsAt,
  mine: t.creatorId === me,
});

/**
 * Torneos: cualquiera crea uno gratis (nombre, reglas, duración y plazas), los demás entran
 * con el código o desde la lista de abiertos y, mientras dura, se emparejan entre ellos
 * (cola 'tournament'). Al acabar, los tres primeros cobran oro (ver TOURNAMENT_PRIZES).
 */
export function tournamentRoutes(store: Store): express.Router {
  const r = express.Router();
  r.use(express.json({ limit: '4kb' }));

  const nameOf = async (id: string) => (await store.getAccount(id))?.state.name ?? '?';

  const newCode = async (): Promise<string> => {
    for (;;) {
      let code = '';
      for (let i = 0; i < 5; i++) code += FRIENDLY_CODE_ALPHABET[crypto.randomInt(FRIENDLY_CODE_ALPHABET.length)];
      if (!(await store.tournamentByCode(code))) return code;
    }
  };

  const detail = async (t: TournamentRow, me: string): Promise<TournamentDetail> => {
    const players = await store.tournamentPlayers(t.id);
    const ranked = rankStandings(players);
    const mine = ranked.findIndex((p) => p.accountId === me);
    return {
      ...summary(t, players.length, me),
      standings: ranked.map((p, i) => ({
        rank: i + 1,
        accountId: p.accountId,
        name: p.name,
        wins: p.wins,
        losses: p.losses,
        crowns: p.crowns,
      })),
      ended: Date.now() >= +t.endsAt,
      hasPrizes: tournamentHasPrizes(players),
      me: mine >= 0 ? { rank: mine + 1, prizeClaimed: (ranked[mine] as TournamentPlayerRow).prizeClaimed } : null,
    };
  };

  /** GET /api/tournaments → mis torneos (en juego o de las últimas 24 h) y los abiertos. */
  r.get(
    '/tournaments',
    requireSession,
    handle('tournaments', async (_req: Authed, me) => {
      const now = new Date();
      const mine = await store.myTournaments(me, new Date(now.getTime() - DAY));
      const mineSummaries = await Promise.all(
        mine.map(async (t) => summary(t, (await store.tournamentPlayers(t.id)).length, me)),
      );
      const open = (await store.openTournaments(now, 20))
        .filter((t) => !mine.some((m) => m.id === t.id))
        .map((t) => summary(t, t.players, me));
      return { mine: mineSummaries, open };
    }),
  );

  /** POST /api/tournaments { name, rules, minutes, maxPlayers, isPublic } */
  r.post(
    '/tournaments',
    requireSession,
    handle('tournaments', async (req: Authed, me) => {
      const b = (req.body ?? {}) as Record<string, unknown>;
      const name = typeof b.name === 'string' ? b.name.trim().replace(/\s+/g, ' ') : '';
      if (!name || name.length > TOURNAMENT_NAME_MAX) fail('err.tournament.name');
      if (hasProfanity(name)) fail('err.tournament.nameBad');
      if (!isRuleSet(b.rules)) fail('err.tournament.rules');
      const minutes = Number(b.minutes);
      if (!(TOURNAMENT_DURATIONS as readonly number[]).includes(minutes)) fail('err.tournament.duration');
      const max = Number(b.maxPlayers);
      if (!(TOURNAMENT_MAX_PLAYERS as readonly number[]).includes(max)) fail('err.tournament.size');
      const now = new Date();
      if ((await store.activeCreated(me, now)) > 0) fail('err.tournament.oneAtATime');
      const t = await store.createTournament(
        {
          code: await newCode(),
          name,
          creatorId: me,
          rules: b.rules as RuleSet,
          maxPlayers: max,
          isPublic: b.isPublic !== false,
          endsAt: new Date(now.getTime() + minutes * 60_000),
        },
        { accountId: me, name: await nameOf(me) },
      );
      return detail(t, me);
    }),
  );

  /** POST /api/tournaments/join { code } */
  r.post(
    '/tournaments/join',
    requireSession,
    handle('tournaments', async (req: Authed, me) => {
      const code = String(req.body?.code ?? '')
        .trim()
        .toUpperCase();
      if (!isFriendlyCode(code)) fail('err.tournament.notFound');
      const t = await store.tournamentByCode(code);
      if (!t) fail('err.tournament.notFound');
      if (Date.now() >= +t!.endsAt) fail('err.tournament.ended');
      const r = await store.joinTournament(t!.id, me, await nameOf(me));
      if (r === 'full') fail('err.tournament.full');
      return detail(t!, me);
    }),
  );

  /** GET /api/tournaments/:id → clasificación */
  r.get(
    '/tournaments/:id',
    requireSession,
    handle('tournaments', async (req: Authed, me) => {
      const t = await store.getTournament(String(req.params.id));
      if (!t) fail('err.tournament.notFound');
      return detail(t!, me);
    }),
  );

  /** POST /api/tournaments/:id/claim → premio por puesto (1.º-3.º), al acabar. */
  r.post(
    '/tournaments/:id/claim',
    requireSession,
    handle('tournaments', async (req: Authed, me) => {
      const t = await store.getTournament(String(req.params.id));
      if (!t) fail('err.tournament.notFound');
      const d = await detail(t!, me);
      if (!d.ended) fail('err.tournament.notEnded');
      if (!d.me) fail('err.tournament.notIn');
      if (d.me!.prizeClaimed) fail('econ.claimed');
      if (!d.hasPrizes) fail('econ.noPrize');
      const now = Date.now();
      // antes de marcarlo como cobrado: si hoy ya cobró otro, que no pierda este premio
      const acc = await store.getAccount(me);
      if (acc?.state.tournamentPrizeDay === shopDay(now)) fail('econ.prizeToday');
      if (!(await store.markPrizeClaimed(t!.id, me))) fail('econ.claimed');
      const { result, state } = await store.mutate(me, (s) => claimTournamentPrize(s, now, d.me!.rank));
      return { gold: result, state };
    }),
  );

  return r;
}
