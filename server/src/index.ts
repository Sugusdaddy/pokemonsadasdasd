import './env';
import net from 'node:net';
import { DEFAULT_PORT } from '@arena/shared';
import { startServer } from './app';
import { initSentry, reportError } from './sentry';

// ARENA_PORT manda; PORT solo en producción (lo fijan Railway/Fly). En desarrollo, 2567.
const port =
  Number(process.env.ARENA_PORT) ||
  (process.env.NODE_ENV === 'production' ? Number(process.env.PORT) : 0) ||
  DEFAULT_PORT;

/** Espera a que el puerto de la base de datos acepte conexiones (en desarrollo arranca a la vez). */
async function waitForDb(url: string, timeoutMs = 60_000): Promise<void> {
  const { hostname, port: p } = new URL(url);
  const deadline = Date.now() + timeoutMs;
  let warned = false;
  for (;;) {
    const ok = await new Promise<boolean>((resolve) => {
      const s = net.connect({ host: hostname, port: Number(p) || 5432 });
      s.setTimeout(1000);
      s.once('connect', () => (s.destroy(), resolve(true)));
      s.once('timeout', () => (s.destroy(), resolve(false)));
      s.once('error', () => resolve(false));
    });
    if (ok) return;
    if (Date.now() > deadline) throw new Error(`La base de datos no responde (${hostname}:${p})`);
    if (!warned) console.log('[arena] esperando a la base de datos…');
    warned = true;
    await new Promise((r) => setTimeout(r, 500));
  }
}

// errores a Sentry solo si hay SENTRY_DSN (sin ella no se carga nada)
if (await initSentry()) {
  process.on('unhandledRejection', (e) => reportError(e, 'unhandledRejection'));
  process.on('uncaughtException', (e) => {
    reportError(e, 'uncaughtException');
    console.error(e);
  });
}

if (process.env.DATABASE_URL) await waitForDb(process.env.DATABASE_URL);
const server = await startServer({ port });
console.log(
  `[arena] servidor en ws://localhost:${server.port}  (API: http://localhost:${server.port}/api/health, datos: ${server.store.kind})`,
);
