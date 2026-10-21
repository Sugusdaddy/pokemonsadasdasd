import { VERSION } from '@arena/shared';

// ─────────────────────────────────────────────────────────────
//  ERRORES DEL NAVEGADOR A SENTRY (opcional).
//  Solo si el build tiene VITE_SENTRY_DSN: sin ella el SDK ni se descarga (va en un trozo
//  aparte que solo se pide en ese caso) y no sale nada. Sin datos personales.
// ─────────────────────────────────────────────────────────────

const DSN = (import.meta.env.VITE_SENTRY_DSN as string | undefined)?.trim();

export function initErrorReporting(): void {
  if (!DSN) return;
  void import('@sentry/browser').then((S) =>
    S.init({
      dsn: DSN,
      release: `arena-royale@${VERSION}`,
      environment: import.meta.env.MODE,
      sendDefaultPii: false,
      tracesSampleRate: 0,
      // sin el rastro de clics, peticiones y consola (puede llevar ids y nombres)
      integrations: (defaults) => defaults.filter((i) => i.name !== 'Breadcrumbs'),
      beforeSend(event) {
        delete event.user;
        return event;
      },
    }),
  );
}
