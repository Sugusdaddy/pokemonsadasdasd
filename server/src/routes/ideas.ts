import express from 'express';
import { IDEAS, IDEA_STATUSES, cleanIdea, type IdeaSort, type IdeaStatus, type IdeaView } from '@arena/shared';
import type { IdeaRow, Store } from '../store/types';
import { type Authed, fail, handle, isAdminWallet, optionalSession, requireSession } from './util';

/** Partidas jugadas para poder proponer ideas (frena el spam con cuentas nuevas). */
export const IDEA_MIN_BATTLES = 3;

const DAY = 24 * 60 * 60 * 1000;

export const ideaView = (i: IdeaRow, me: string | null, voted: Set<string>): IdeaView => ({
  id: i.id,
  name: i.name,
  title: i.title,
  body: i.body,
  category: i.category,
  status: i.status,
  reply: i.reply,
  votes: i.votes,
  voted: voted.has(i.id),
  mine: i.accountId === me,
  hidden: i.hidden,
  at: +i.createdAt,
});

/**
 * Buzón de ideas: cualquiera las lee; con sesión se proponen (3 al día) y se votan
 * (un voto por idea, se puede quitar). Los admins las moderan desde /api/admin.
 */
export function ideaRoutes(store: Store): express.Router {
  const r = express.Router();
  r.use(express.json({ limit: '8kb' }));

  /** GET /api/ideas?sort=top|new&status=open|planned|done|rejected|all&mine=1&offset=0 */
  r.get(
    '/ideas',
    handle('ideas', async (req) => {
      const me = await optionalSession(req);
      const acc = me ? await store.getAccount(me) : null;
      const admin = !!acc && isAdminWallet(acc.wallets);
      const sort: IdeaSort = req.query.sort === 'new' ? 'new' : 'top';
      const st = String(req.query.status ?? 'open');
      const status = IDEA_STATUSES.includes(st as IdeaStatus) ? (st as IdeaStatus) : null;
      const mine = req.query.mine === '1' && me;
      const offset = Math.max(0, Math.min(10_000, Number(req.query.offset) || 0));
      const { rows, total } = await store.listIdeas({
        sort,
        status: mine ? null : status,
        includeHidden: admin,
        accountId: mine ? me : undefined,
        limit: IDEAS.pageSize,
        offset,
      });
      const voted = new Set(
        me
          ? await store.votedIdeas(
              me,
              rows.map((i) => i.id),
            )
          : [],
      );
      let left: number | null = null;
      if (acc) left = Math.max(0, IDEAS.perDay - (await store.countIdeasSince(acc.id, new Date(Date.now() - DAY))));
      return {
        ideas: rows.map((i) => ideaView(i, me, voted)),
        total,
        offset,
        /** Ideas que aún puedes proponer hoy (null sin sesión). */
        left,
        canPropose: !!acc && acc.state.stats.battles >= IDEA_MIN_BATTLES,
      };
    }),
  );

  r.post(
    '/ideas',
    requireSession,
    handle('ideas', async (req: Authed, me) => {
      const acc = (await store.getAccount(me)) ?? fail('err.session');
      if (acc!.state.stats.battles < IDEA_MIN_BATTLES) fail('err.idea.newPlayer');
      if ((await store.countIdeasSince(me, new Date(Date.now() - DAY))) >= IDEAS.perDay) fail('err.idea.limit');
      const idea = cleanIdea(req.body);
      const row = await store.createIdea({ ...idea, accountId: me, name: acc!.state.name });
      return { idea: ideaView(row, me, new Set()) };
    }),
  );

  r.post(
    '/ideas/:id/vote',
    requireSession,
    handle('ideas', async (req: Authed, me) => {
      const idea = await store.getIdea(String(req.params.id));
      if (!idea || idea.hidden) fail('err.idea.notFound');
      if (idea!.accountId === me) fail('err.idea.own');
      if (idea!.status !== 'open') fail('err.idea.closed');
      return store.toggleVote(idea!.id, me);
    }),
  );

  /** Borrar una idea tuya (solo mientras está abierta). */
  r.post(
    '/ideas/:id/delete',
    requireSession,
    handle('ideas', async (req: Authed, me) => {
      const idea = await store.getIdea(String(req.params.id));
      if (!idea || idea.accountId !== me) fail('err.idea.notFound');
      if (idea!.status !== 'open') fail('err.idea.closed');
      await store.deleteIdea(idea!.id);
      return { ok: true };
    }),
  );

  return r;
}
