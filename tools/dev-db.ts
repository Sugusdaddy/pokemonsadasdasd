/**
 * PostgreSQL local para desarrollo, sin Docker (embedded-postgres).
 * `npm run dev` lo arranca solo si server/.env no tiene un DATABASE_URL propio.
 * Los datos se guardan en server/.pgdata (fuera de git). Ctrl+C lo para.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import EmbeddedPostgres from 'embedded-postgres';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'server/.pgdata');
const PORT = Number(process.env.DEV_DB_PORT) || 54329;
export const LOCAL_DB_URL = `postgresql://arena:arena@localhost:${PORT}/arena`;

async function main() {
  const fresh = !fs.existsSync(path.join(DATA, 'PG_VERSION'));
  const pg = new EmbeddedPostgres({
    databaseDir: DATA,
    user: 'arena',
    password: 'arena',
    port: PORT,
    persistent: true,
    // UTF-8 siempre (en Windows en español saldría WIN1252 y fallarían nombres con emojis u otros alfabetos)
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
  });
  if (fresh) await pg.initialise();
  try {
    await pg.start();
  } catch (e) {
    // quedó en marcha de una ejecución anterior (p. ej. se cerró la terminal): se reutiliza
    if (!fs.existsSync(path.join(DATA, 'postmaster.pid'))) throw e;
    console.log('[db] PostgreSQL local ya estaba en marcha: se reutiliza');
  }
  if (fresh) await pg.createDatabase('arena');
  // aplica las migraciones pendientes (las crea `npm run db:migrate -- --name …`)
  const m = spawnSync('npx', ['prisma', 'migrate', 'deploy', '--schema', 'server/prisma/schema.prisma'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, DATABASE_URL: LOCAL_DB_URL },
  });
  if (m.status !== 0) console.error('[db] fallaron las migraciones');
  console.log(`[db] PostgreSQL local listo: ${LOCAL_DB_URL}`);
  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  // sigue vivo aunque se haya reutilizado otro PostgreSQL: si este proceso acabara,
  // `concurrently -k` cerraría también el servidor y el cliente
  setInterval(() => {}, 1 << 30);
}

main().catch((err) => {
  console.error('[db] no se pudo arrancar PostgreSQL local:', err);
  process.exit(1);
});
