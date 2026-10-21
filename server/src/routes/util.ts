import type { NextFunction, Request, Response } from 'express';
import { EconError } from '@arena/shared';
import { bearer, verifySession } from '../auth';
import { ctx } from '../context';
import type { Store } from '../store/types';
import { reportError } from '../sentry';

/** Petición con la cuenta de la sesión (la rellena `requireSession`). */
export type Authed = Request & { accountId?: string };

/** Error de regla: el cliente recibe `code` (una clave de traducción) con un 400. */
export const fail = (code: string): never => {
  throw new Error(code);
};

/** Exige una sesión válida (401 si no la hay). */
export async function requireSession(req: Authed, res: Response, next: NextFunction): Promise<void> {
  const s = await verifySession(bearer(req.headers.authorization));
  if (!s) return void res.status(401).json({ error: 'err.session' });
  req.accountId = s.accountId;
  next();
}

/** La cuenta de la sesión si la hay (rutas públicas que muestran algo más si te conoce). */
export async function optionalSession(req: Request): Promise<string | null> {
  return (await verifySession(bearer(req.headers.authorization)))?.accountId ?? null;
}

/** Limitador sencillo por IP: como mucho `perMinute` peticiones por minuto (429 si se pasa). */
export function rateLimit(perMinute: number) {
  const hits = new Map<string, { n: number; at: number }>();
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip ?? 'x';
    const now = Date.now();
    const h = hits.get(ip);
    if (!h || now - h.at > 60_000) hits.set(ip, { n: 1, at: now });
    else if (++h.n > perMinute) return void res.status(429).json({ error: 'err.rate' });
    if (hits.size > 10_000) hits.clear();
    next();
  };
}

/** ¿Alguna de estas wallets es de admin (ADMIN_WALLETS)? */
export const isAdminWallet = (wallets: string[]): boolean => wallets.some((w) => ctx.adminWallets.has(w));

/**
 * Exige que la sesión sea de una cuenta con una wallet de admin. Se comprueba en cada
 * petición: quitar una wallet de ADMIN_WALLETS le quita el acceso al momento.
 */
export const requireAdmin =
  (store: Store) =>
  async (req: Authed, res: Response, next: NextFunction): Promise<void> => {
    const id = await optionalSession(req);
    const acc = id ? await store.getAccount(id) : null;
    if (!acc) return void res.status(401).json({ error: 'err.session' });
    if (!isAdminWallet(acc.wallets)) return void res.status(403).json({ error: 'err.forbidden' });
    req.accountId = id!;
    next();
  };

/** Responde con lo que devuelva `fn`, o con el código de error de la regla (400) / err.server (500). */
export const handle =
  <T>(tag: string, fn: (req: Authed, me: string) => Promise<T>) =>
  async (req: Authed, res: Response): Promise<void> => {
    try {
      res.json(await fn(req, req.accountId!));
    } catch (e) {
      const code =
        e instanceof EconError ? e.code : e instanceof Error && e.message.startsWith('err.') ? e.message : null;
      if (!code) {
        console.error(`[${tag}]`, e);
        reportError(e, `api.${tag}`, { path: req.path });
      }
      res.status(code ? 400 : 500).json({ error: code ?? 'err.server' });
    }
  };
