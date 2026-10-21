import crypto from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  EconError,
  freshProfile,
  tickSlots,
  refreshShop,
  dailyOffers,
  arenaOf,
  msToNextShopDay,
  setName,
  setActiveDeck,
  setDeckCard,
  upgrade,
  startUnlock,
  skip,
  openSlot,
  claimFreeBall,
  claimCrownBall,
  claimRoad,
  claimDailyGift,
  claimSeasonReward,
  rollSeason,
  rollMissions,
  trackMission,
  claimMission,
  claimMissionBonus,
  completeTutorial,
  buyCardOffer,
  buyBall,
  buyGold,
  devCheat,
  DEFAULT_NAME,
  type ProfileState,
} from '@arena/shared';
import {
  NONCE_TTL_MS,
  bearer,
  isSolanaAddress,
  newNonce,
  signInMessage,
  signSession,
  verifySession,
  verifySignature,
} from '../auth';
import type { Store } from '../store/types';
import { isAdminWallet } from './util';

/** Lo que ve el cliente de su cuenta. */
export interface AccountView {
  id: string;
  guest: boolean;
  wallets: string[];
  state: ProfileState;
  /** Hora del servidor (para que los temporizadores del cliente no dependan de su reloj). */
  serverNow: number;
  shop: { offers: ReturnType<typeof dailyOffers>; msToReset: number };
  /** Tiene una wallet de ADMIN_WALLETS (ve la pestaña de admin). */
  admin: boolean;
}

type Authed = Request & { accountId?: string; guest?: boolean };

export const view = (id: string, guest: boolean, wallets: string[], state: ProfileState): AccountView => {
  const now = Date.now();
  return {
    id,
    guest,
    wallets,
    state,
    serverNow: now,
    shop: { offers: dailyOffers(state.shop.day, arenaOf(state)), msToReset: msToNextShopDay(now) },
    admin: isAdminWallet(wallets),
  };
};

/** Limitador sencillo por IP (login y creación de invitados). */
function rateLimit(perMinute: number) {
  const hits = new Map<string, { n: number; at: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip ?? 'x';
    const now = Date.now();
    const h = hits.get(ip);
    if (!h || now - h.at > 60_000) hits.set(ip, { n: 1, at: now });
    else if (++h.n > perMinute) return void res.status(429).json({ error: 'err.rate' });
    if (hits.size > 10_000) hits.clear();
    next();
  };
}

export function accountRoutes(
  store: Store,
  opts: { allowCheats: boolean; domain: (req: Request) => string; rateLimits: boolean },
): express.Router {
  const r = express.Router();
  const limit = (perMinute: number) =>
    opts.rateLimits ? rateLimit(perMinute) : (_q: Request, _s: Response, next: NextFunction) => next();
  r.use(express.json({ limit: '8kb' }));

  const auth = async (req: Authed, res: Response, next: NextFunction) => {
    const s = await verifySession(bearer(req.headers.authorization));
    if (!s) return void res.status(401).json({ error: 'err.session' });
    req.accountId = s.accountId;
    req.guest = s.guest;
    next();
  };

  /** Ejecuta una regla de economía sobre la cuenta y responde con el resultado + estado nuevo. */
  const act =
    <T>(fn: (s: ProfileState, req: Authed, now: number) => T) =>
    async (req: Authed, res: Response) => {
      try {
        const now = Date.now();
        const { result, state } = await store.mutate(req.accountId!, (s) => {
          rollSeason(s, now);
          tickSlots(s, now);
          refreshShop(s, now);
          rollMissions(s, now, rand);
          const gold = s.gold;
          const out = fn(s, req, now);
          // misión "gasta oro": cuenta cualquier acción que lo haya gastado (mejoras, tienda)
          if (s.gold < gold) trackMission(s, 'goldSpent', gold - s.gold);
          return out;
        });
        const acc = await store.getAccount(req.accountId!);
        res.json({ result, account: view(req.accountId!, acc?.isGuest ?? true, acc?.wallets ?? [], state) });
      } catch (e) {
        const code =
          e instanceof EconError ? e.code : e instanceof Error && e.message.startsWith('err.') ? e.message : null;
        if (!code) console.error('[api]', e);
        res.status(code ? 400 : 500).json({ error: code ?? 'err.server' });
      }
    };

  // ── Sesión ──

  /** Crea una cuenta de invitado y devuelve su sesión. */
  r.post('/auth/guest', limit(10), async (_req, res) => {
    const acc = await store.createAccount(freshProfile(Date.now()), true);
    res.json({
      token: await signSession({ accountId: acc.id, guest: true }),
      account: view(acc.id, true, [], acc.state),
    });
  });

  /** Mensaje para firmar con la wallet. */
  r.get('/auth/nonce', limit(30), async (req, res) => {
    const address = req.query.address;
    if (!isSolanaAddress(address)) return void res.status(400).json({ error: 'err.wallet.address' });
    const nonce = newNonce();
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + NONCE_TTL_MS);
    const message = signInMessage({ domain: opts.domain(req), address, nonce, issuedAt, expiresAt });
    await store.putNonce(nonce, address, message, expiresAt);
    res.json({ nonce, message });
  });

  /**
   * Login con wallet. Si la wallet ya tiene cuenta, se entra en ella. Si no, y vienes de una
   * sesión de invitado, la wallet se vincula a esa cuenta (tu progreso de invitado pasa a ella).
   */
  r.post('/auth/wallet', limit(20), async (req: Authed, res) => {
    const { address, signature, nonce } = (req.body ?? {}) as Record<string, unknown>;
    if (!isSolanaAddress(address) || typeof nonce !== 'string')
      return void res.status(400).json({ error: 'err.wallet.address' });
    const n = await store.takeNonce(nonce);
    if (!n || n.address !== address || n.expiresAt.getTime() < Date.now())
      return void res.status(400).json({ error: 'err.wallet.nonce' });
    if (!verifySignature(n.message, signature, address))
      return void res.status(401).json({ error: 'err.wallet.signature' });

    let accountId = await store.findWalletAccount(address);
    if (!accountId) {
      const guest = await verifySession(bearer(req.headers.authorization));
      const acc = guest?.guest ? await store.getAccount(guest.accountId) : null;
      if (acc && acc.isGuest) {
        await store.linkWallet(address, acc.id);
        accountId = acc.id;
      } else {
        accountId = (await store.createAccount(freshProfile(Date.now()), false, address)).id;
      }
    }
    const acc = (await store.getAccount(accountId))!;
    res.json({
      token: await signSession({ accountId, guest: false }),
      account: view(acc.id, false, acc.wallets, acc.state),
    });
  });

  // ── Cuenta ──

  r.get('/me', auth, async (req: Authed, res) => {
    const now = Date.now();
    try {
      const { state } = await store.mutate(req.accountId!, (s) => {
        rollSeason(s, now);
        tickSlots(s, now);
        refreshShop(s, now);
        rollMissions(s, now, rand);
      });
      const acc = (await store.getAccount(req.accountId!))!;
      res.json({ account: view(acc.id, acc.isGuest, acc.wallets, state) });
    } catch {
      res.status(401).json({ error: 'err.session' });
    }
  });

  r.post(
    '/me/name',
    auth,
    act((s, req) => setName(s, req.body?.name)),
  );
  r.post(
    '/me/deck/active',
    auth,
    act((s, req) => setActiveDeck(s, req.body?.index)),
  );
  r.post(
    '/me/deck/card',
    auth,
    act((s, req) => setDeckCard(s, req.body?.slot, req.body?.key)),
  );
  r.post(
    '/me/cards/upgrade',
    auth,
    act((s, req) => counted(s, 'upgrades', upgrade(s, req.body?.key))),
  );

  r.post(
    '/me/balls/unlock',
    auth,
    act((s, req, now) => startUnlock(s, req.body?.slot, now)),
  );
  r.post(
    '/me/balls/skip',
    auth,
    act((s, req, now) => skip(s, req.body?.slot, now)),
  );
  r.post(
    '/me/balls/open',
    auth,
    act((s, req, now) => counted(s, 'balls', openSlot(s, req.body?.slot, now, rand))),
  );
  r.post(
    '/me/balls/free',
    auth,
    act((s, _req, now) => counted(s, 'balls', claimFreeBall(s, now, rand))),
  );
  r.post(
    '/me/balls/crown',
    auth,
    act((s) => counted(s, 'balls', claimCrownBall(s, rand))),
  );

  r.post(
    '/me/season/claim',
    auth,
    act((s) => claimSeasonReward(s, rand)),
  );

  // ── Misiones y tutorial ──

  r.post(
    '/me/missions/claim',
    auth,
    act((s, req) => claimMission(s, req.body?.period, req.body?.id, rand)),
  );
  r.post(
    '/me/missions/bonus',
    auth,
    act((s, req) => claimMissionBonus(s, req.body?.period, rand)),
  );
  r.post(
    '/me/tutorial/complete',
    auth,
    act((s) => completeTutorial(s)),
  );

  r.post(
    '/me/road/claim',
    auth,
    act((s, req) => claimRoad(s, req.body?.trophies, rand)),
  );

  r.post(
    '/me/shop/gift',
    auth,
    act((s, _req, now) => claimDailyGift(s, now)),
  );
  r.post(
    '/me/shop/card',
    auth,
    act((s, req, now) => buyCardOffer(s, req.body?.id, now)),
  );
  r.post(
    '/me/shop/ball',
    auth,
    act((s, req) => counted(s, 'balls', buyBall(s, req.body?.type, rand))),
  );
  r.post(
    '/me/shop/gold',
    auth,
    act((s, req) => buyGold(s, req.body?.index)),
  );

  r.post(
    '/me/dev',
    auth,
    (req, res, next) => (opts.allowCheats ? next() : res.status(403).json({ error: 'err.forbidden' })),
    act((s, req) => devCheat(s, req.body?.kind)),
  );

  /** Empezar de cero (borra el progreso, mantiene la cuenta y la wallet). */
  r.post(
    '/me/reset',
    auth,
    act((s, _req, now) => {
      const name = s.name;
      Object.assign(s, freshProfile(now));
      s.name = name === DEFAULT_NAME ? s.name : name;
    }),
  );

  return r;
}

/** Devuelve `result` tras sumar uno a las misiones de esa clase (la acción ya se ha hecho). */
function counted<T>(s: ProfileState, kind: Parameters<typeof trackMission>[1], result: T): T {
  trackMission(s, kind);
  return result;
}

/** Azar de la economía (servidor): criptográfico. */
const rand = (): number => crypto.randomInt(0, 2 ** 32) / 2 ** 32;
