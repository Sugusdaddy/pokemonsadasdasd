import express from 'express';
import { DEFAULT_NAME, IDEA_STATUSES, cleanReply, type IdeaStatus } from '@arena/shared';
import { chatView, toClan } from '../rooms/ClanRoom';
import type { Store } from '../store/types';
import { ideaView } from './ideas';
import { type Authed, fail, handle, requireAdmin } from './util';

const DAY = 24 * 60 * 60 * 1000;
/** Silencios que puede poner un admin (horas). 0 = quitarlo. */
const MUTE_HOURS = [0, 1, 24, 168, 720];

/**
 * Pestaña de admin: solo cuentas con una wallet de ADMIN_WALLETS (se comprueba en cada
 * petición). Todo lo que cambia algo queda en el registro (AdminLog).
 */
export function adminRoutes(store: Store): express.Router {
  const r = express.Router();
  r.use('/admin', express.json({ limit: '8kb' }), requireAdmin(store));

  const log = async (me: string, action: string, target: string, details: Record<string, unknown> = {}) => {
    const acc = await store.getAccount(me);
    await store.logAdmin({ adminId: me, adminName: acc?.state.name ?? '?', action, target, details });
  };

  const hours = (h: unknown): number => {
    const n = Number(h);
    if (!MUTE_HOURS.includes(n)) fail('err.admin.hours');
    return n;
  };

  r.get(
    '/admin/stats',
    handle('admin', async () => store.adminStats(new Date(Date.now() - DAY))),
  );

  // ── Denuncias del chat ──
  r.get(
    '/admin/reports',
    handle('admin', async () => ({
      reports: (await store.listReports(100)).map((g) => ({ ...g, lastAt: +g.lastAt })),
    })),
  );

  /**
   * Resolver las denuncias de un mensaje:
   * - dismiss: no había para tanto (el mensaje vuelve a verse).
   * - punish: se oculta el mensaje y se silencia al autor `muteHours` horas.
   * En los dos casos las denuncias quedan resueltas (salen de la lista, pero cuentan en el historial).
   */
  r.post(
    '/admin/reports/resolve',
    handle('admin', async (req: Authed, me) => {
      const msg = (await store.getMessage(String(req.body?.messageId ?? ''))) ?? fail('err.admin.notFound');
      const action = req.body?.action;
      if (action === 'dismiss') {
        await store.unhideMessage(msg!.id);
        await toClan(msg!.clanId, { type: 'update', message: chatView({ ...msg!, hidden: false }) });
      } else if (action === 'punish') {
        const h = hours(req.body?.muteHours ?? 24);
        await store.hideMessage(msg!.id);
        if (msg!.accountId) await store.setMuted(msg!.accountId, h ? new Date(Date.now() + h * 3600_000) : null);
        await toClan(msg!.clanId, { type: 'update', message: chatView({ ...msg!, hidden: true }) });
      } else fail('err.admin.action');
      await store.resolveReports(msg!.id);
      await log(me, `report.${action}`, msg!.accountId ?? '', { messageId: msg!.id, text: msg!.body });
      return { ok: true };
    }),
  );

  // ── Jugadores ──
  r.get(
    '/admin/players',
    handle('admin', async (req) => {
      const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 60) : '';
      const now = Date.now();
      return {
        players: (await store.searchAccounts(q, 30)).map((p) => ({
          ...p,
          mutedUntil: p.mutedUntil && +p.mutedUntil > now ? +p.mutedUntil : null,
          createdAt: +p.createdAt,
          lastSeenAt: +p.lastSeenAt,
        })),
      };
    }),
  );

  r.post(
    '/admin/players/mute',
    handle('admin', async (req: Authed, me) => {
      const id = String(req.body?.accountId ?? '');
      if (!(await store.getAccount(id))) fail('err.admin.notFound');
      const h = hours(req.body?.hours);
      await store.setMuted(id, h ? new Date(Date.now() + h * 3600_000) : null);
      await log(me, h ? 'player.mute' : 'player.unmute', id, { hours: h });
      return { ok: true };
    }),
  );

  /** Nombre ofensivo: se le pone el nombre por defecto. */
  r.post(
    '/admin/players/rename',
    handle('admin', async (req: Authed, me) => {
      const id = String(req.body?.accountId ?? '');
      const acc = (await store.getAccount(id)) ?? fail('err.admin.notFound');
      await store.mutate(id, (s) => void (s.name = DEFAULT_NAME));
      await log(me, 'player.rename', id, { from: acc!.state.name });
      return { ok: true };
    }),
  );

  // ── Ideas ──
  /** Cambiar estado, responder u ocultar. */
  r.post(
    '/admin/ideas/:id',
    handle('admin', async (req: Authed, me) => {
      const patch: { status?: IdeaStatus; reply?: string; hidden?: boolean } = {};
      if (req.body?.status !== undefined) {
        if (!IDEA_STATUSES.includes(req.body.status)) fail('err.admin.status');
        patch.status = req.body.status;
      }
      if (req.body?.reply !== undefined) patch.reply = cleanReply(req.body.reply);
      if (req.body?.hidden !== undefined) patch.hidden = !!req.body.hidden;
      const idea = (await store.updateIdea(String(req.params.id), patch)) ?? fail('err.idea.notFound');
      await log(me, 'idea.update', idea!.id, { title: idea!.title, ...patch });
      return { idea: ideaView(idea!, me, new Set()) };
    }),
  );

  r.post(
    '/admin/ideas/:id/delete',
    handle('admin', async (req: Authed, me) => {
      const idea = (await store.getIdea(String(req.params.id))) ?? fail('err.idea.notFound');
      await store.deleteIdea(idea!.id);
      await log(me, 'idea.delete', idea!.id, { title: idea!.title, by: idea!.name });
      return { ok: true };
    }),
  );

  r.get(
    '/admin/log',
    handle('admin', async () => ({
      log: (await store.listAdminLog(100)).map((l) => ({ ...l, createdAt: +l.createdAt })),
    })),
  );

  return r;
}
