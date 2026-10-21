import crypto from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

// ─────────────────────────────────────────────────────────────
//  SESIONES Y LOGIN CON WALLET DE SOLANA
//  - Invitado: el servidor crea la cuenta y devuelve una sesión firmada.
//  - Wallet: el servidor da un mensaje con un nonce de un solo uso; la wallet lo
//    firma (ed25519) y el servidor comprueba la firma. Sin transacciones ni fondos.
// ─────────────────────────────────────────────────────────────

export const NONCE_TTL_MS = 5 * 60 * 1000;
const GUEST_DAYS = 365;
const WALLET_DAYS = 30;

let secret: Uint8Array | null = null;
function key(): Uint8Array {
  if (secret) return secret;
  let s = process.env.SESSION_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === 'production') throw new Error('Falta SESSION_SECRET');
    s = crypto.randomBytes(32).toString('hex');
    console.warn('[auth] sin SESSION_SECRET: las sesiones caducarán al reiniciar el servidor');
  }
  secret = new TextEncoder().encode(s);
  return secret;
}

export interface Session {
  accountId: string;
  guest: boolean;
}

export async function signSession(s: Session): Promise<string> {
  return new SignJWT({ guest: s.guest })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(s.accountId)
    .setIssuedAt()
    .setExpirationTime(`${s.guest ? GUEST_DAYS : WALLET_DAYS}d`)
    .sign(key());
}

export async function verifySession(token: unknown): Promise<Session | null> {
  if (typeof token !== 'string' || token.length > 2000) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] });
    if (!payload.sub) return null;
    return { accountId: payload.sub, guest: payload.guest === true };
  } catch {
    return null;
  }
}

/** Saca el token de "Authorization: Bearer …". */
export const bearer = (h: string | undefined): string | null => (h?.startsWith('Bearer ') ? h.slice(7) : null);

// ───────────────────────── Wallet ─────────────────────────

/** ¿Es una clave pública de Solana válida (32 bytes en base58)? */
export function isSolanaAddress(a: unknown): a is string {
  if (typeof a !== 'string' || a.length < 32 || a.length > 44) return false;
  try {
    return bs58.decode(a).length === 32;
  } catch {
    return false;
  }
}

export const newNonce = (): string => crypto.randomBytes(16).toString('hex');

/** Mensaje que firma la wallet (formato tipo "Sign in with Solana", legible por el jugador). */
export function signInMessage(p: {
  domain: string;
  address: string;
  nonce: string;
  issuedAt: Date;
  expiresAt: Date;
}): string {
  return [
    `${p.domain} wants you to sign in with your Solana account:`,
    p.address,
    '',
    'Sign in to Arena Royale. This request will not trigger a blockchain transaction or cost any fees.',
    '',
    `URI: ${p.domain}`,
    `Nonce: ${p.nonce}`,
    `Issued At: ${p.issuedAt.toISOString()}`,
    `Expiration Time: ${p.expiresAt.toISOString()}`,
  ].join('\n');
}

/** Comprueba la firma ed25519 del mensaje con la clave pública de la wallet. */
export function verifySignature(message: string, signatureB58: unknown, address: string): boolean {
  if (typeof signatureB58 !== 'string' || signatureB58.length > 128) return false;
  try {
    const sig = bs58.decode(signatureB58);
    if (sig.length !== 64) return false;
    return nacl.sign.detached.verify(new TextEncoder().encode(message), sig, bs58.decode(address));
  } catch {
    return false;
  }
}
