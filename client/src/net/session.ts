import type { CardOffer, ProfileState } from '@arena/shared';
import { HTTP_URL } from './api';

// ─────────────────────────────────────────────────────────────
//  SESIÓN CON EL SERVIDOR
//  Al abrir el juego por primera vez se crea una cuenta de invitado y se guarda su
//  token. Con "Conectar wallet" esa cuenta pasa a estar ligada a tu wallet de Solana.
// ─────────────────────────────────────────────────────────────

const TOKEN_KEY = 'arenaRoyale.session';

export interface AccountView {
  id: string;
  guest: boolean;
  wallets: string[];
  state: ProfileState;
  serverNow: number;
  shop: { offers: CardOffer[]; msToReset: number };
  /** Tiene una wallet de admin: ve la pestaña de admin (el servidor lo comprueba en cada petición). */
  admin?: boolean;
}

/** Error que devuelve el servidor (`code` es una clave de traducción). */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

let token: string | null = (() => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
})();

export const sessionToken = (): string | null => token;

function setToken(t: string | null): void {
  token = t;
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* sin almacenamiento */
  }
}

export async function request<T>(path: string, body?: unknown, auth = true): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${HTTP_URL}/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(auth && token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new ApiError('err.offline', 0);
  }
  const json = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new ApiError(json.error ?? 'err.server', r.status);
  return json;
}

/** Abre la sesión guardada o crea un invitado nuevo. */
export async function ensureSession(): Promise<AccountView> {
  if (token) {
    try {
      return (await request<{ account: AccountView }>('/me')).account;
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401) throw e;
      setToken(null); // sesión caducada o de otro servidor
    }
  }
  const g = await request<{ token: string; account: AccountView }>('/auth/guest', {}, false);
  setToken(g.token);
  return g.account;
}

/** Login con wallet: el servidor da el mensaje, la wallet lo firma y se devuelve la sesión nueva. */
export async function walletSignIn(address: string, sign: (message: string) => Promise<string>): Promise<AccountView> {
  const n = await request<{ nonce: string; message: string }>(
    `/auth/nonce?address=${encodeURIComponent(address)}`,
    undefined,
    false,
  );
  const signature = await sign(n.message);
  // se manda la sesión de invitado para que, si la wallet es nueva, se quede con tu progreso
  const r = await request<{ token: string; account: AccountView }>('/auth/wallet', {
    address,
    nonce: n.nonce,
    signature,
  });
  setToken(r.token);
  return r.account;
}

/** Cierra la sesión. La próxima vez se crea un invitado nuevo (la cuenta con wallet sigue en el servidor). */
export function signOut(): void {
  setToken(null);
}
