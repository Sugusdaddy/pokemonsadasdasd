import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { Client, type Room } from 'colyseus.js';
import { PROTOCOL_VERSION, type ClientJoin, type EndMsg, type MatchedMsg, type RewardsMsg } from '@arena/shared';
import { startServer, type RunningServer } from '../src/app';
import { MemoryStore } from '../src/store/memory';
import {
  DEFAULT_DRAIN_SECONDS,
  cheatsAllowed,
  drainSeconds,
  originMatcher,
  parseOrigins,
  productionProblems,
} from '../src/config';

// ─────────────────────────────────────────────────────────────
//  Lo que importa al desplegar: configuración de producción, CORS y el apagado
//  que deja terminar las partidas (un reinicio no hace perder a nadie).
// ─────────────────────────────────────────────────────────────

const PROD_OK = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://u:p@db:5432/arena',
  SESSION_SECRET: 'x'.repeat(48),
  CORS_ORIGINS: 'https://arena.example.com',
};

describe('configuración de producción', () => {
  it('en desarrollo no se exige nada', () => {
    expect(productionProblems({})).toEqual([]);
  });

  it('en producción faltan base de datos, secreto y CORS', () => {
    expect(productionProblems({ NODE_ENV: 'production' })).toHaveLength(3);
    expect(productionProblems(PROD_OK)).toEqual([]);
    expect(productionProblems({ ...PROD_OK, SESSION_SECRET: 'cambia-esto' })).toHaveLength(1);
    expect(productionProblems({ ...PROD_OK, SESSION_SECRET: 'corto' })).toHaveLength(1);
  });

  it('los trucos de Perfil nunca se activan en producción', () => {
    expect(cheatsAllowed({ ALLOW_DEV_CHEATS: '1' })).toBe(true);
    expect(cheatsAllowed({ ...PROD_OK, ALLOW_DEV_CHEATS: '1' })).toBe(false);
    expect(cheatsAllowed({})).toBe(false);
  });

  it('tiempo para terminar partidas: 5 min en producción, nada en desarrollo, o el configurado', () => {
    expect(drainSeconds(PROD_OK)).toBe(DEFAULT_DRAIN_SECONDS);
    expect(drainSeconds({})).toBe(0);
    expect(drainSeconds({ SHUTDOWN_DRAIN_SECONDS: '30' })).toBe(30);
    expect(drainSeconds({ ...PROD_OK, SHUTDOWN_DRAIN_SECONDS: '0' })).toBe(0);
    expect(drainSeconds({ ...PROD_OK, SHUTDOWN_DRAIN_SECONDS: 'x' })).toBe(DEFAULT_DRAIN_SECONDS);
  });

  it('orígenes: exactos o con * para las vistas previas, sin cruzar puntos', () => {
    expect(parseOrigins(' https://a.com/, https://b.com ,')).toEqual(['https://a.com', 'https://b.com']);
    const ok = originMatcher(['https://arena.example.com', 'https://arena-royale-*-team.vercel.app']);
    expect(ok('https://arena.example.com')).toBe(true);
    expect(ok('https://arena-royale-git-main-team.vercel.app')).toBe(true);
    expect(ok('https://arena-royale-x.evil.com-team.vercel.app')).toBe(false);
    expect(ok('https://evil.com')).toBe(false);
    expect(ok('http://arena.example.com')).toBe(false);
    expect(ok(undefined)).toBe(false);
    expect(originMatcher([])('https://lo-que-sea.com')).toBe(true);
  });
});

const GOOD = 'https://arena.example.com';

describe('CORS', () => {
  let server: RunningServer;
  let http: string;
  beforeAll(async () => {
    server = await startServer({ port: 0, store: new MemoryStore(), seasonJob: false, corsOrigins: [GOOD] });
    http = `http://localhost:${server.port}`;
  });
  afterAll(() => server.close());

  it('la API solo responde CORS a las webs permitidas', async () => {
    const ok = await fetch(`${http}/api/health`, { headers: { Origin: GOOD } });
    expect(ok.headers.get('access-control-allow-origin')).toBe(GOOD);
    expect(ok.headers.get('x-content-type-options')).toBe('nosniff');
    expect(ok.headers.get('x-powered-by')).toBeNull();
    const bad = await fetch(`${http}/api/health`, { headers: { Origin: 'https://evil.com' } });
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
    const pre = await fetch(`${http}/api/auth/guest`, { method: 'OPTIONS', headers: { Origin: 'https://evil.com' } });
    expect(pre.status).toBe(403);
  });

  it('el emparejamiento de Colyseus tampoco da el comodín', async () => {
    const opt = (origin: string) =>
      fetch(`${http}/matchmake/joinOrCreate/queue`, { method: 'OPTIONS', headers: { Origin: origin } });
    expect((await opt(GOOD)).headers.get('access-control-allow-origin')).toBe(GOOD);
    expect((await opt('https://evil.com')).headers.get('access-control-allow-origin')).toBeNull();
  });

  it('el WebSocket rechaza otras webs', async () => {
    const status = await new Promise<number>((resolve) => {
      const ws = new WebSocket(`ws://localhost:${server.port}/x`, { headers: { Origin: 'https://evil.com' } });
      ws.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
      ws.on('open', () => (ws.close(), resolve(101)));
      ws.on('error', () => {});
    });
    expect(status).toBe(401);
  });
});

// ───────────────────────── Apagado ─────────────────────────

const until = async (cond: () => boolean, ms = 5000, what = 'condición'): Promise<void> => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`Tiempo agotado esperando: ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
};

/** Arranca un servidor con `drain` segundos de margen al apagar y una cuenta de invitado. */
async function setup(drain: number, queueBotAfterMs = 300) {
  const store = new MemoryStore();
  const server = await startServer({
    port: 0,
    store,
    rateLimits: false,
    seasonJob: false,
    queueBotAfterMs,
    matchFillBotAfterMs: 300,
    matchStartDelayMs: 100,
    reconnectSeconds: 1,
    linger: 1,
    drainSeconds: drain,
  });
  const http = `http://localhost:${server.port}`;
  const r = await fetch(`${http}/api/auth/guest`, { method: 'POST' });
  const { token, account } = (await r.json()) as { token: string; account: { id: string } };
  await store.mutate(account.id, (s) => {
    s.trophies = 100;
    s.maxTrophies = 100;
  });
  const join: ClientJoin = { token, protocol: PROTOCOL_VERSION };
  return { server, store, http, join, accountId: account.id, client: new Client(`ws://localhost:${server.port}`) };
}

/** Partida contra bot (nadie más en la cola): devuelve la sala y lo que va llegando. */
async function botMatch(client: Client, join: ClientJoin) {
  const q = await client.joinOrCreate('queue', join);
  q.onMessage('queue', () => {});
  const matched = await new Promise<MatchedMsg>((resolve) => q.onMessage('matched', resolve));
  const room: Room = await client.consumeSeatReservation(
    matched.reservation as Parameters<Client['consumeSeatReservation']>[0],
  );
  void q.leave();
  const seen = { ticks: 0, ends: [] as EndMsg[], rewards: [] as RewardsMsg[], closed: 0 };
  room.onMessage('start', () => {});
  room.onMessage('catchup', () => {});
  room.onMessage('tick', () => seen.ticks++);
  room.onMessage('end', (m: EndMsg) => seen.ends.push(m));
  room.onMessage('rewards', (m: RewardsMsg) => seen.rewards.push(m));
  room.onLeave((code) => (seen.closed = code));
  await until(() => seen.ticks > 5, 5000, 'inicio de la partida');
  return { room, seen };
}

describe('apagado al desplegar', () => {
  it('la cola avisa para volver a entrar y no se aceptan partidas nuevas', async () => {
    const { server, http, join, client } = await setup(5, 60_000);
    const q = await client.joinOrCreate('queue', join);
    q.onMessage('queue', () => {});
    let restart = false;
    q.onMessage('restart', () => (restart = true));
    await new Promise((r) => setTimeout(r, 100));

    const done = server.gameServer.gracefullyShutdown(false);
    await until(() => restart, 3000, 'aviso de reinicio');
    const health = await fetch(`${http}/api/health`).catch(() => null);
    if (health) expect(health.status).toBe(503);
    await done;
  });

  it('una partida en marcha termina con su resultado normal antes de apagar', async () => {
    const { server, client, join } = await setup(10);
    const { room, seen } = await botMatch(client, join);

    let closed = false;
    const done = server.gameServer.gracefullyShutdown(false).then(() => (closed = true));
    // la partida sigue: llegan ticks y nadie ha perdido por el reinicio
    const before = seen.ticks;
    await until(() => seen.ticks > before + 10, 3000, 'ticks durante el apagado');
    expect(seen.ends).toHaveLength(0);
    expect(closed).toBe(false);

    // acaba de verdad (se rinde) → resultado y recompensas como siempre, y entonces se apaga
    room.send('surrender');
    await until(() => seen.ends.length > 0 && seen.rewards.length > 0, 5000, 'fin y recompensas');
    expect(seen.ends[0].winner).toBe('red');
    await done;
    expect(closed).toBe(true);
  });

  it('si no acaba a tiempo se corta sin resultado: nadie gana ni pierde trofeos', async () => {
    const { server, store, client, join, accountId } = await setup(1);
    const trophies = (await store.getAccount(accountId))!.state.trophies;
    const { seen } = await botMatch(client, join);

    await server.gameServer.gracefullyShutdown(false);
    await until(() => seen.closed !== 0, 3000, 'cierre');
    expect(seen.ends).toHaveLength(0);
    expect(seen.rewards).toHaveLength(0);
    expect((await store.getAccount(accountId))!.state.trophies).toBe(trophies);
  });
});
