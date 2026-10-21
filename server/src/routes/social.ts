import crypto from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  CHAT,
  CLAN,
  EconError,
  FRIENDLY_CODE_ALPHABET,
  FRIENDS,
  ROLES,
  canEdit,
  canKick,
  canSetRole,
  censor,
  checkCardRequest,
  cleanClanInput,
  donateCard,
  hasProfanity,
  isFriendlyCode,
  payClanCreation,
  type ClanRole,
} from '@arena/shared';
import { bearer, verifySession } from '../auth';
import { ctx } from '../context';
import { chatView, systemBody, toClan } from '../rooms/ClanRoom';
import type { ClanRow, MemberRow, PublicProfile, Store } from '../store/types';
import { view } from './account';

type Authed = Request & { accountId?: string };

const newCode = (): string => {
  let c = '';
  for (let i = 0; i < FRIENDS.codeLength; i++)
    c += FRIENDLY_CODE_ALPHABET[crypto.randomInt(FRIENDLY_CODE_ALPHABET.length)];
  return c;
};

/** Código tal como lo escribe la gente: sin #, espacios ni guiones, en mayúsculas. */
const normCode = (c: unknown): string => (typeof c === 'string' ? c.replace(/[#\s-]/g, '').toUpperCase() : '');

const fail = (code: string): never => {
  throw new Error(code);
};

const shortWallet = (w: string | null) => (w ? `${w.slice(0, 4)}…${w.slice(-4)}` : null);

/** Perfil público + si está conectado. */
const publicView = (p: PublicProfile, now: number) => ({
  accountId: p.accountId,
  name: p.name,
  trophies: p.trophies,
  kingLevel: p.kingLevel,
  wallet: shortWallet(p.wallet),
  online: now - +p.lastSeenAt < FRIENDS.onlineMs,
});

const clanView = (c: ClanRow) => ({
  id: c.id,
  name: c.name,
  description: c.description,
  badge: c.badge,
  type: c.type,
  minTrophies: c.minTrophies,
  members: c.members,
  trophies: c.trophies,
});

/**
 * Amigos (código de jugador, solicitudes, conectados, invitar a amistosa) y clanes
 * (crear, unirse, roles, peticiones y donaciones de cartas, denuncias). El chat en vivo
 * va por la sala `clan` de Colyseus.
 */
export function socialRoutes(store: Store): express.Router {
  const r = express.Router();
  r.use(express.json({ limit: '8kb' }));

  const auth = async (req: Authed, res: Response, next: NextFunction) => {
    const s = await verifySession(bearer(req.headers.authorization));
    if (!s) return void res.status(401).json({ error: 'err.session' });
    req.accountId = s.accountId;
    next();
  };

  /** Responde con lo que devuelva `fn`, o con el código de error de la regla. */
  const handle =
    <T>(fn: (req: Authed, me: string) => Promise<T>) =>
    async (req: Authed, res: Response) => {
      try {
        res.json(await fn(req, req.accountId!));
      } catch (e) {
        const code =
          e instanceof EconError ? e.code : e instanceof Error && e.message.startsWith('err.') ? e.message : null;
        if (!code) console.error('[social]', e);
        res.status(code ? 400 : 500).json({ error: code ?? 'err.server' });
      }
    };

  const myClan = async (me: string): Promise<MemberRow> => (await store.memberOf(me)) ?? fail('err.clan.none');

  /** Tu cuenta tal como la ve el cliente (tras una donación cambian tus cartas y tu oro). */
  const accountView = async (me: string) => {
    const acc = (await store.getAccount(me))!;
    return view(me, acc.isGuest, acc.wallets, acc.state);
  };

  // ───────────────────────── Resumen (lo pide el menú cada pocos segundos) ─────────────────────────

  r.get(
    '/social',
    auth,
    handle(async (_req, me) => {
      const now = Date.now();
      await store.touch(me);
      const [code, links, member, muted, invites] = await Promise.all([
        store.ensureCode(me, newCode),
        store.friendLinks(me),
        store.memberOf(me),
        store.mutedUntil(me),
        store.invitesFor(me, new Date(now - FRIENDS.inviteTtlMs)),
      ]);
      const ids = [...new Set([...links.map((l) => l.other), ...invites.map((i) => i.fromId)])];
      const profiles = new Map((await store.profiles(ids)).map((p) => [p.accountId, publicView(p, now)]));
      const pick = (pred: (l: (typeof links)[number]) => boolean) =>
        links
          .filter(pred)
          .map((l) => profiles.get(l.other))
          .filter((p) => !!p);
      const friends = pick((l) => l.accepted).sort(
        (a, b) => Number(b!.online) - Number(a!.online) || b!.trophies - a!.trophies,
      );
      const clan = member ? await store.getClan(member.clanId) : null;
      return {
        code,
        friends,
        incoming: pick((l) => !l.accepted && l.requester !== me),
        outgoing: pick((l) => !l.accepted && l.requester === me),
        invites: invites
          .filter((i) => profiles.has(i.fromId) && ctx.friendly.has(i.code))
          .map((i) => ({ id: i.id, code: i.code, from: profiles.get(i.fromId)!, at: +i.createdAt })),
        clan:
          clan && member
            ? {
                ...clanView(clan),
                role: member.role,
                nextRequestAt: member.lastRequestAt ? +member.lastRequestAt + CLAN.requestCooldownMs : 0,
              }
            : null,
        mutedUntil: muted && +muted > now ? +muted : null,
      };
    }),
  );

  // ───────────────────────── Amigos ─────────────────────────

  r.post(
    '/friends/add',
    auth,
    handle(async (req, me) => {
      const other = await store.accountByCode(normCode(req.body?.code));
      if (!other) fail('err.friends.notFound');
      if (other === me) fail('err.friends.self');
      const links = await store.friendLinks(me);
      const link = links.find((l) => l.other === other);
      if (link?.accepted) fail('err.friends.already');
      if (link && link.requester === other) {
        // ya te lo había pedido: se acepta
        await store.putFriendLink(me, other!, other!, true);
        return { status: 'accepted' };
      }
      if (link) fail('err.friends.pending');
      if (links.filter((l) => l.accepted).length >= FRIENDS.max) fail('err.friends.max');
      const theirs = await store.friendLinks(other!);
      if (theirs.filter((l) => !l.accepted && l.requester !== other).length >= FRIENDS.maxIncoming)
        fail('err.friends.theirFull');
      await store.putFriendLink(me, other!, me, false);
      return { status: 'sent' };
    }),
  );

  r.post(
    '/friends/accept',
    auth,
    handle(async (req, me) => {
      const other = String(req.body?.accountId ?? '');
      const link = (await store.friendLinks(me)).find((l) => l.other === other);
      if (!link || link.accepted || link.requester === me) fail('err.friends.noRequest');
      if ((await store.friendLinks(me)).filter((l) => l.accepted).length >= FRIENDS.max) fail('err.friends.max');
      await store.putFriendLink(me, other, other, true);
      return { ok: true };
    }),
  );

  /** Rechazar una solicitud, cancelar la tuya o quitar a un amigo. */
  r.post(
    '/friends/remove',
    auth,
    handle(async (req, me) => {
      await store.deleteFriendLink(me, String(req.body?.accountId ?? ''));
      return { ok: true };
    }),
  );

  /** Invita a un amigo a la sala amistosa que has creado (su código). */
  r.post(
    '/friends/invite',
    auth,
    handle(async (req, me) => {
      const other = String(req.body?.accountId ?? '');
      const code = normCode(req.body?.code);
      if (!isFriendlyCode(code) || !ctx.friendly.has(code)) fail('err.friendly.notFound');
      const link = (await store.friendLinks(me)).find((l) => l.other === other);
      if (!link?.accepted) fail('err.friends.notFriend');
      await store.addInvite(me, other, code);
      return { ok: true };
    }),
  );

  r.post(
    '/friends/invite/dismiss',
    auth,
    handle(async (req, me) => {
      await store.deleteInvite(String(req.body?.id ?? ''), me);
      return { ok: true };
    }),
  );

  // ───────────────────────── Clanes ─────────────────────────

  r.get(
    '/clans',
    handle(async (req) => {
      const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, CLAN.nameMax) : '';
      return { clans: (await store.searchClans(q, 30)).map(clanView) };
    }),
  );

  r.get(
    '/clans/:id',
    handle(async (req) => {
      const clan = await store.getClan(String(req.params.id));
      if (!clan) fail('err.clan.notFound');
      const now = Date.now();
      const members = await store.clanMembers(clan!.id);
      const profiles = new Map((await store.profiles(members.map((m) => m.accountId))).map((p) => [p.accountId, p]));
      return {
        clan: clanView(clan!),
        members: members
          .filter((m) => profiles.has(m.accountId))
          .map((m) => ({
            ...publicView(profiles.get(m.accountId)!, now),
            role: m.role,
            donations: m.donations,
            joinedAt: +m.joinedAt,
          }))
          .sort((a, b) => b.trophies - a.trophies),
      };
    }),
  );

  /** Datos de clan limpios y sin palabrotas. */
  const clanInput = (body: unknown) => {
    const input = cleanClanInput(body);
    if (hasProfanity(input.name)) fail('err.clan.name');
    input.description = censor(input.description);
    return input;
  };

  r.post(
    '/clans',
    auth,
    handle(async (req, me) => {
      const input = clanInput(req.body);
      const clan = await store.createClan(me, input, payClanCreation);
      const acc = await store.getAccount(me);
      await store.addMessage({
        clanId: clan.id,
        accountId: null,
        name: '',
        kind: 'system',
        body: systemBody('clan.sys.created', { name: acc?.state.name ?? '' }),
      });
      return { clan: clanView(clan), account: await accountView(me) };
    }),
  );

  /** Aviso del sistema guardado y enviado al chat. */
  const announce = async (clanId: string, k: string, params: Record<string, string | number>, drop?: string) => {
    const m = await store.addMessage({
      clanId,
      accountId: null,
      name: '',
      kind: 'system',
      body: systemBody(k, params),
    });
    await toClan(clanId, { type: 'msg', message: chatView(m) }, drop);
    await toClan(clanId, { type: 'members' });
  };

  const nameOf = async (id: string) => (await store.getAccount(id))?.state.name ?? '?';

  r.post(
    '/clan/join',
    auth,
    handle(async (req, me) => {
      const clanId = String(req.body?.clanId ?? '');
      const acc = (await store.getAccount(me))!;
      await store.joinClan(me, clanId, acc.state.trophies, CLAN.maxMembers);
      await announce(clanId, 'clan.sys.joined', { name: acc.state.name });
      return { ok: true };
    }),
  );

  r.post(
    '/clan/leave',
    auth,
    handle(async (_req, me) => {
      const name = await nameOf(me);
      const res = await store.leaveClan(me);
      if (!res) fail('err.clan.none');
      if (!res!.deleted) {
        await announce(res!.clanId, 'clan.sys.left', { name }, me);
        if (res!.newLeader) await announce(res!.clanId, 'clan.sys.newLeader', { name: await nameOf(res!.newLeader) });
      }
      return { ok: true };
    }),
  );

  r.post(
    '/clan/edit',
    auth,
    handle(async (req, me) => {
      const m = await myClan(me);
      if (!canEdit(m.role)) fail('err.clan.rank');
      await store.updateClan(m.clanId, clanInput(req.body));
      await toClan(m.clanId, { type: 'members' });
      return { clan: clanView((await store.getClan(m.clanId))!) };
    }),
  );

  r.post(
    '/clan/role',
    auth,
    handle(async (req, me) => {
      const actor = await myClan(me);
      const targetId = String(req.body?.accountId ?? '');
      const to = req.body?.role as ClanRole;
      if (!ROLES.includes(to)) fail('err.clan.role');
      const target = await store.memberOf(targetId);
      if (!target || target.clanId !== actor.clanId || targetId === me) fail('err.clan.notMember');
      if (!canSetRole(actor.role, target!.role, to)) fail('err.clan.rank');
      if (to === 'leader') await store.setRole(me, 'coLeader'); // el líder cede el puesto
      await store.setRole(targetId, to);
      await announce(actor.clanId, 'clan.sys.role', { name: await nameOf(targetId), role: to });
      return { ok: true };
    }),
  );

  r.post(
    '/clan/kick',
    auth,
    handle(async (req, me) => {
      const actor = await myClan(me);
      const targetId = String(req.body?.accountId ?? '');
      const target = await store.memberOf(targetId);
      if (!target || target.clanId !== actor.clanId) fail('err.clan.notMember');
      if (!canKick(actor.role, target!.role)) fail('err.clan.rank');
      const name = await nameOf(targetId);
      await store.leaveClan(targetId);
      await announce(actor.clanId, 'clan.sys.kicked', { name }, targetId);
      return { ok: true };
    }),
  );

  /** Pide cartas al clan (una petición cada 7 horas). */
  r.post(
    '/clan/request',
    auth,
    handle(async (req, me) => {
      const m = await myClan(me);
      const acc = (await store.getAccount(me))!;
      const now = Date.now();
      // la espera la comprueba el almacén de forma atómica (null aquí = sin mirarla)
      const want = checkCardRequest(acc.state, req.body?.card, null, now);
      const row = await store.createRequest(
        {
          clanId: m.clanId,
          accountId: me,
          name: acc.state.name,
          kind: 'request',
          body: '',
          card: req.body.card as string,
          want,
        },
        new Date(now),
        new Date(now - CLAN.requestCooldownMs),
      );
      await toClan(m.clanId, { type: 'msg', message: chatView(row) });
      return { message: chatView(row), nextAt: now + CLAN.requestCooldownMs };
    }),
  );

  /** Dona una carta a una petición del clan. */
  r.post(
    '/clan/donate',
    auth,
    handle(async (req, me) => {
      const now = Date.now();
      const { result, message } = await store.donate(String(req.body?.messageId ?? ''), me, (rq, donor, receiver) =>
        donateCard(rq, me, donor, receiver, now),
      );
      await toClan(message.clanId, { type: 'update', message: chatView(message) });
      return { result, message: chatView(message), account: await accountView(me) };
    }),
  );

  /** Denuncia un mensaje del chat de tu clan. Con varias denuncias se oculta y se silencia al autor. */
  r.post(
    '/social/report',
    auth,
    handle(async (req, me) => {
      const m = await myClan(me);
      const msg = await store.getMessage(String(req.body?.messageId ?? ''));
      if (!msg || msg.clanId !== m.clanId || msg.kind !== 'text' || !msg.accountId) fail('err.report.invalid');
      if (msg!.accountId === me) fail('err.report.self');
      const reason = ['spam', 'insult', 'cheat', 'other'].includes(req.body?.reason) ? req.body.reason : 'other';
      const n = await store.report({
        reporterId: me,
        targetId: msg!.accountId!,
        messageId: msg!.id,
        reason,
        text: msg!.body,
      });
      if (n >= CHAT.reportsToMute && !msg!.hidden) {
        await store.hideMessage(msg!.id);
        await store.setMuted(msg!.accountId!, new Date(Date.now() + CHAT.muteMs));
        await toClan(m.clanId, { type: 'update', message: chatView({ ...msg!, hidden: true }) });
      }
      return { ok: true };
    }),
  );

  return r;
}
