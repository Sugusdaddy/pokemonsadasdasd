import type * as SentryNode from '@sentry/node';
import { VERSION } from '@arena/shared';

// ─────────────────────────────────────────────────────────────
//  ERRORES A SENTRY (opcional).
//  Solo si existe SENTRY_DSN: sin ella ni siquiera se carga el SDK y no sale nada del
//  servidor. No se mandan datos personales: sin usuario, sin cabeceras (la sesión va en
//  Authorization) ni cookies, sin el nombre de la máquina ni lo que sale por consola, y sin
//  trazas de rendimiento.
// ─────────────────────────────────────────────────────────────

let sentry: typeof SentryNode | null = null;

export async function initSentry(): Promise<boolean> {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return false;
  const S = await import('@sentry/node');
  S.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    release: `arena-royale@${VERSION}`,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    // sin el nombre de la máquina ni los mensajes de consola (pueden llevar ids de cuentas)
    serverName: 'arena',
    integrations: (defaults) => defaults.filter((i) => i.name !== 'Console'),
    beforeSend(event) {
      delete event.user;
      if (event.request) {
        delete event.request.headers;
        delete event.request.cookies;
        delete event.request.data;
      }
      return event;
    },
  });
  sentry = S;
  console.log('[sentry] informes de errores activados');
  return true;
}

/** Manda un error a Sentry (si está activado). `where` dice de qué parte del servidor viene. */
export function reportError(err: unknown, where: string, extra?: Record<string, unknown>): void {
  sentry?.captureException(err, { tags: { where }, extra });
}
