// ─────────────────────────────────────────────────────────────
//  CONFIGURACIÓN DE PRODUCCIÓN
//  En producción (NODE_ENV=production) el servidor no arranca si falta algo
//  imprescindible: base de datos, un SESSION_SECRET de verdad y la lista de webs
//  desde las que se puede jugar (CORS_ORIGINS). Los trucos de Perfil no se activan nunca.
// ─────────────────────────────────────────────────────────────

export const isProduction = (env: NodeJS.ProcessEnv = process.env): boolean => env.NODE_ENV === 'production';

/** Lo que valía SESSION_SECRET en server/.env.example. */
const PLACEHOLDER_SECRETS = new Set(['cambia-esto', 'change-me', 'changeme', 'secret']);
export const MIN_SECRET_LENGTH = 32;

/** Problemas que impiden arrancar en producción (vacío = todo bien). */
export function productionProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  if (!isProduction(env)) return [];
  const out: string[] = [];
  if (!env.DATABASE_URL) out.push('falta DATABASE_URL (sin ella las cuentas se guardarían en memoria)');
  const secret = env.SESSION_SECRET ?? '';
  if (!secret) out.push('falta SESSION_SECRET');
  else if (PLACEHOLDER_SECRETS.has(secret) || secret.length < MIN_SECRET_LENGTH)
    out.push(`SESSION_SECRET demasiado corto o de ejemplo (mínimo ${MIN_SECRET_LENGTH} caracteres aleatorios)`);
  if (!parseOrigins(env.CORS_ORIGINS).length)
    out.push('falta CORS_ORIGINS (las webs del cliente, p. ej. https://arena-royale.vercel.app)');
  return out;
}

/** Trucos de Perfil (+oro, +gemas…): solo fuera de producción y con ALLOW_DEV_CHEATS=1. */
export function cheatsAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.ALLOW_DEV_CHEATS !== '1') return false;
  if (isProduction(env)) {
    console.warn('[arena] ALLOW_DEV_CHEATS se ignora en producción');
    return false;
  }
  return true;
}

/** CORS_ORIGINS: orígenes separados por comas, sin barra final. */
export const parseOrigins = (raw: string | undefined): string[] =>
  (raw ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

/**
 * ¿Se acepta este origen? Cada patrón es un origen exacto (https://arena.example.com)
 * o lleva un `*` dentro del nombre de la máquina para las vistas previas de Vercel
 * (https://arena-royale-*-equipo.vercel.app): el `*` no cruza puntos.
 * Sin patrones se acepta todo (desarrollo).
 */
export function originMatcher(patterns: string[]): (origin: string | undefined) => boolean {
  if (!patterns.length) return () => true;
  const exact = new Set(patterns.filter((p) => !p.includes('*')));
  const wild = patterns
    .filter((p) => p.includes('*'))
    .map((p) => new RegExp(`^${p.split('*').map(escapeRe).join('[a-z0-9-]*')}$`, 'i'));
  return (origin) => !!origin && (exact.has(origin) || wild.some((re) => re.test(origin)));
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Una partida dura como mucho 3 min + 1 de prórroga; con el draft y la cuenta atrás, 5 de margen. */
export const DEFAULT_DRAIN_SECONDS = 300;

/**
 * Segundos que se deja terminar a las partidas en curso al apagar (SHUTDOWN_DRAIN_SECONDS).
 * Por defecto 5 min en producción y nada en desarrollo (node --watch reinicia al guardar).
 */
export function drainSeconds(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.SHUTDOWN_DRAIN_SECONDS;
  const n = Number(raw);
  if (raw !== undefined && raw !== '' && Number.isFinite(n) && n >= 0) return n;
  return isProduction(env) ? DEFAULT_DRAIN_SECONDS : 0;
}
