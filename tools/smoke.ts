/**
 * Prueba de humo contra un servidor de verdad (docker compose, staging o producción):
 *
 *   npm run smoke -- --server http://localhost:2567
 *   npm run smoke -- --server https://arena.up.railway.app --origin https://arena-royale.vercel.app
 *   npm run smoke -- --server http://localhost:2567 --drain-cmd "docker compose kill -s SIGTERM server"
 *
 * Crea un invitado, entra en la cola, juega contra el bot (llega a los QUEUE_BOT_AFTER_MS),
 * se rinde y comprueba el resultado, las recompensas y que la repetición guardada da la misma
 * huella con el motor de este código. Con --origin comprueba además el CORS de esa web.
 * Con --drain-cmd, a mitad de partida lanza ese comando (el SIGTERM de un despliegue) y
 * comprueba que la partida sigue, que /api/health responde 503, que el final es normal y que
 * después el servidor se apaga solo.
 */
import { execSync } from 'node:child_process';
import { Client, type Room } from 'colyseus.js';
import {
  MATCH_START_DELAY_MS,
  PROTOCOL_VERSION,
  QUEUE_BOT_AFTER_MS,
  runReplay,
  type EndMsg,
  type MatchedMsg,
  type Replay,
  type RewardsMsg,
} from '../shared/src';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const http = (arg('server') ?? 'http://localhost:2567').replace(/\/+$/, '').replace(/^ws/, 'http');
const ws = http.replace(/^http/, 'ws');
const origin = arg('origin');
const drainCmd = arg('drain-cmd');

const ok = (msg: string): void => console.log(`  ✓ ${msg}`);
function fail(msg: string): never {
  console.error(`  ✗ ${msg}`);
  process.exit(1);
}

async function until(cond: () => boolean, ms: number, what: string): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) fail(`tiempo agotado esperando: ${what}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function health(): Promise<number> {
  try {
    return (await fetch(`${http}/api/health`, { signal: AbortSignal.timeout(3000) })).status;
  } catch {
    return 0; // no responde
  }
}

console.log(`[smoke] ${http}${drainCmd ? ' (con apagado a mitad de partida)' : ''}`);

// 1. el servidor responde (y con CORS para la web del cliente)
const h = await fetch(`${http}/api/health`, { headers: origin ? { Origin: origin } : {} });
if (!h.ok) fail(`/api/health respondió ${h.status}`);
ok(`salud: ${JSON.stringify(await h.json())}`);
if (origin) {
  if (h.headers.get('access-control-allow-origin') !== origin) fail(`sin CORS para ${origin}`);
  const evil = await fetch(`${http}/api/health`, { headers: { Origin: 'https://evil.example' } });
  if (evil.headers.get('access-control-allow-origin')) fail('da CORS a cualquier web');
  ok(`CORS solo para ${origin}`);
}

// 2. cuenta de invitado
const g = await fetch(`${http}/api/auth/guest`, { method: 'POST', headers: origin ? { Origin: origin } : {} });
if (!g.ok) fail(`no se pudo crear el invitado (${g.status})`);
const { token, account } = (await g.json()) as { token: string; account: { id: string } };
ok(`invitado ${account.id}`);

// 3. cola → partida contra el bot
const client = new Client(ws);
const queue = await client.joinOrCreate('queue', { token, protocol: PROTOCOL_VERSION });
queue.onMessage('queue', () => {});
let matched: MatchedMsg | null = null;
queue.onMessage('matched', (m: MatchedMsg) => (matched = m));
await until(() => !!matched, QUEUE_BOT_AFTER_MS + 15_000, 'rival en la cola');
const room: Room = await client.consumeSeatReservation(
  matched!.reservation as Parameters<Client['consumeSeatReservation']>[0],
);
void queue.leave();
const seen = { ticks: 0, end: null as EndMsg | null, rewards: null as RewardsMsg | null, closed: 0 };
room.onMessage('start', () => {});
room.onMessage('catchup', () => {});
room.onMessage('tick', () => seen.ticks++);
room.onMessage('end', (m: EndMsg) => (seen.end = m));
room.onMessage('rewards', (m: RewardsMsg) => (seen.rewards = m));
room.onLeave((code) => (seen.closed = code));
await until(() => seen.ticks > 20, MATCH_START_DELAY_MS + 15_000, 'inicio de la partida');
ok(`partida ${matched!.mode} en marcha (${seen.ticks} ticks)`);

// 4. (opcional) apagado a mitad de partida: la partida tiene que seguir
if (drainCmd) {
  execSync(drainCmd, { stdio: 'inherit' });
  const before = seen.ticks;
  await new Promise((r) => setTimeout(r, 3000));
  if (seen.closed) fail(`la partida se cortó al apagar (código ${seen.closed})`);
  if (seen.ticks < before + 20) fail('la partida se paró al apagar');
  ok(`tras el SIGTERM la partida sigue (${seen.ticks - before} ticks en 3 s)`);
  const s = await health();
  if (s !== 503) fail(`/api/health debería dar 503 mientras se apaga (da ${s})`);
  ok('/api/health responde 503 mientras se apaga');
}

// 5. rendición → resultado y recompensas del servidor
room.send('surrender');
await until(() => !!seen.end && !!seen.rewards, 15_000, 'final y recompensas');
if (seen.end!.winner !== 'red') fail(`ganador inesperado: ${seen.end!.winner}`);
ok(`final: gana ${seen.end!.winner} (${seen.end!.reason}), recompensas recibidas`);

// 6. la repetición guardada se reproduce con la misma huella con este código
const id = seen.end!.replayId;
if (!id) fail('el servidor no guardó la repetición');
const rep = (await (await fetch(`${http}/api/replays/${id}`)).json()) as Replay & { meta: { hash: number } };
const { match } = runReplay(rep);
if (match.hash() !== rep.meta.hash) fail(`la repetición no coincide (${match.hash()} ≠ ${rep.meta.hash})`);
ok(`repetición ${id}: misma huella (${rep.meta.hash})`);

// 7. (opcional) sin partidas, el servidor se apaga solo
if (drainCmd) {
  await until(() => seen.closed !== 0, 30_000, 'cierre de la sala');
  const t0 = Date.now();
  while ((await health()) !== 0) {
    if (Date.now() - t0 > 60_000) fail('el servidor no se apagó al acabar las partidas');
    await new Promise((r) => setTimeout(r, 500));
  }
  ok(`el servidor se apagó solo al acabar la partida (${Math.round((Date.now() - t0) / 1000)} s)`);
} else {
  await room.leave();
}
console.log('[smoke] todo bien');
process.exit(0);
