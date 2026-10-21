import http from 'node:http';
import express from 'express';
import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import {
  isFriendlyCode,
  NO_BALANCE,
  DEFAULT_PORT,
  QUEUE_BOT_AFTER_MS,
  MATCH_FILL_BOT_AFTER_MS,
  MATCH_START_DELAY_MS,
  RECONNECT_SECONDS,
} from '@arena/shared';
import { ctx, settings, type ServerSettings } from './context';
import { cheatsAllowed, originMatcher, parseOrigins } from './config';
import { rateLimit } from './routes/util';
import { MatchRoom } from './rooms/MatchRoom';
import { QueueRoom } from './rooms/QueueRoom';
import { ClanRoom } from './rooms/ClanRoom';
import { accountRoutes } from './routes/account';
import { leaderboardRoutes } from './routes/leaderboard';
import { socialRoutes } from './routes/social';
import { startSeasonJob } from './seasons';
import { isSolanaAddress } from './auth';
import { ideaRoutes } from './routes/ideas';
import { adminRoutes } from './routes/admin';
import { tournamentRoutes } from './routes/tournaments';
import { MemoryStore } from './store/memory';
import { PrismaStore } from './store/prisma';
import type { Store } from './store/types';

export interface StartOptions extends Partial<ServerSettings> {
  port?: number;
  /** Almacén de datos. Si no se pasa: PostgreSQL con DATABASE_URL, o memoria si no hay. */
  store?: Store;
  allowCheats?: boolean;
  /** Dominio que aparece en el mensaje que firma la wallet. */
  domain?: string;
  /** Límites de peticiones por IP (los tests los quitan). */
  rateLimits?: boolean;
  /** Cierre automático de temporadas (los tests lo lanzan a mano). */
  seasonJob?: boolean;
  /** Wallets de admin (si no: ADMIN_WALLETS, separadas por comas). */
  adminWallets?: string[];
  /** Webs desde las que se puede jugar (si no: CORS_ORIGINS; vacío = todas, para desarrollo). */
  corsOrigins?: string[];
}

export interface RunningServer {
  port: number;
  gameServer: Server;
  store: Store;
  close(): Promise<void>;
}

const originHost = (o: string | undefined): string | undefined => {
  try {
    return o ? new URL(o).host : undefined;
  } catch {
    return undefined;
  }
};

/** Arranca el servidor de juego (WebSocket de Colyseus + API HTTP en el mismo puerto). */
export async function startServer(opts: StartOptions = {}): Promise<RunningServer> {
  ctx.settings = {
    queueBotAfterMs: opts.queueBotAfterMs ?? QUEUE_BOT_AFTER_MS,
    matchFillBotAfterMs: opts.matchFillBotAfterMs ?? MATCH_FILL_BOT_AFTER_MS,
    matchStartDelayMs: opts.matchStartDelayMs ?? MATCH_START_DELAY_MS,
    reconnectSeconds: opts.reconnectSeconds ?? RECONNECT_SECONDS,
    linger: opts.linger ?? 15,
    drainSeconds: opts.drainSeconds ?? 0,
  };
  ctx.draining = false;
  const store: Store = opts.store ?? (process.env.DATABASE_URL ? new PrismaStore() : new MemoryStore());
  if (store.kind === 'memory' && !opts.store)
    console.warn('[arena] sin DATABASE_URL: las cuentas se guardan en memoria');
  ctx.store = store;
  const bal = await store.currentBalance();
  ctx.balance = bal ? { v: bal.version, o: bal.overrides } : NO_BALANCE;
  const admins = opts.adminWallets ?? (process.env.ADMIN_WALLETS ?? '').split(',');
  ctx.adminWallets = new Set(admins.map((w) => w.trim()).filter(Boolean));
  for (const w of ctx.adminWallets)
    if (!isSolanaAddress(w)) console.warn(`[admin] ADMIN_WALLETS: "${w}" no es una wallet válida`);

  // CORS: solo las webs del cliente (en desarrollo, todas). Se aplica a la API, al
  // emparejamiento de Colyseus y a la conexión WebSocket.
  const patterns = opts.corsOrigins ?? parseOrigins(process.env.CORS_ORIGINS);
  const allowed = originMatcher(patterns);
  const allowOrigin = (origin: string | undefined): string | null =>
    !patterns.length ? origin || '*' : origin && allowed(origin) ? origin : null;
  // Colyseus mezcla sus cabeceras por defecto (Allow-Origin: *) con las de getCorsHeaders: se quita
  // el comodín para que un origen no permitido se quede sin cabecera
  delete (matchMaker.controller.DEFAULT_CORS_HEADERS as Partial<Record<string, string>>)['Access-Control-Allow-Origin'];
  matchMaker.controller.getCorsHeaders = (req): Record<string, string> => {
    const origin = allowOrigin(req.headers.origin);
    return origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : { Vary: 'Origin' };
  };

  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Origin');
    const origin = allowOrigin(req.get('origin'));
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    if (req.method === 'OPTIONS') return void res.sendStatus(origin ? 204 : 403);
    next();
  });
  // mientras se apaga responde 503: los balanceadores dejan de mandarle gente
  app.get(
    '/api/health',
    (_req, res) =>
      void res.status(ctx.draining ? 503 : 200).json({ ok: !ctx.draining, db: store.kind, draining: ctx.draining }),
  );
  // límite general por IP para toda la API (el login y los invitados tienen el suyo, más corto)
  if (opts.rateLimits ?? true) app.use('/api', rateLimit(600));
  // balance de cartas en vigor (los menús enseñan estos números)
  app.get('/api/balance', (_req, res) => void res.json(ctx.balance));
  app.use(
    '/api',
    accountRoutes(store, {
      allowCheats: opts.allowCheats ?? cheatsAllowed(),
      // dominio del mensaje que firma la wallet: el configurado, o la web desde la que se juega
      domain: (req) =>
        opts.domain ?? process.env.PUBLIC_DOMAIN ?? originHost(req.get('origin')) ?? req.get('host') ?? 'arena-royale',
      rateLimits: opts.rateLimits ?? true,
    }),
  );
  app.use('/api', leaderboardRoutes(store));
  app.use('/api', socialRoutes(store));
  app.use('/api', ideaRoutes(store));
  app.use('/api', adminRoutes(store));
  app.use('/api', tournamentRoutes(store));
  app.get('/api/replays', async (req, res) => {
    const list = await store.listMatches(Math.max(1, Math.min(100, Number(req.query.limit) || 20)));
    res.json(list.map((m) => ({ ...m, endedAt: m.endedAt.toISOString() })));
  });
  app.get('/api/replays/:id', async (req, res) => {
    const m = /^[a-z0-9-]{6,40}$/.test(req.params.id) ? await store.getMatch(req.params.id) : null;
    if (!m) return void res.status(404).json({ error: 'err.replay.notFound' });
    const { replay, ...meta } = m;
    res.json({ ...replay, meta: { ...meta, endedAt: meta.endedAt.toISOString() } });
  });
  app.get('/api/friendly/:code', (req, res) => {
    const code = req.params.code.toUpperCase();
    const roomId = isFriendlyCode(code) ? ctx.friendly.get(code) : undefined;
    if (!roomId) return void res.status(404).json({ error: 'err.friendly.notFound' });
    res.json({ roomId });
  });
  app.get('/api/live', async (_req, res) => {
    const rooms = await matchMaker.query({ name: 'match' });
    res.json(
      rooms
        .filter((r) => r.metadata?.started && !r.metadata?.finished && r.metadata?.mode !== 'friendly')
        .map((r) => ({
          roomId: r.roomId,
          mode: r.metadata.mode,
          players: r.metadata.players,
          startedAt: r.metadata.startedAt,
          spectators: Math.max(0, r.clients - 2),
        })),
    );
  });

  const stopSeasons = opts.seasonJob === false ? () => {} : startSeasonJob(store);
  const httpServer = http.createServer(app);
  const gameServer = new Server({
    transport: new WebSocketTransport({
      server: httpServer,
      // los navegadores mandan Origin: solo se aceptan las webs del cliente (sin Origin = bots y tests)
      verifyClient: (info: { origin?: string }) => !info.origin || !!allowOrigin(info.origin),
    }),
    greet: false,
  });
  // Apagado (SIGTERM al desplegar): no se empiezan partidas nuevas y las que están en marcha
  // terminan (MatchRoom.onBeforeShutdown) antes de cerrar la base de datos.
  gameServer.onBeforeShutdown(async () => {
    ctx.draining = true;
    stopSeasons();
    const s = settings().drainSeconds;
    if (s > 0) console.log(`[arena] apagando: las partidas en curso tienen hasta ${s} s para terminar`);
  });
  gameServer.onShutdown(() => store.close());
  gameServer.define('match', MatchRoom);
  gameServer.define('queue', QueueRoom);
  gameServer.define('clan', ClanRoom).filterBy(['clanId']);
  await gameServer.listen(opts.port ?? DEFAULT_PORT);
  const address = httpServer.address();
  const port = typeof address === 'object' && address ? address.port : (opts.port ?? DEFAULT_PORT);

  return {
    port,
    gameServer,
    store,
    close: () => gameServer.gracefullyShutdown(false),
  };
}
