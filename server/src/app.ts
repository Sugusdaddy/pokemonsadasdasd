import http from 'node:http';
import express from 'express';
import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import {
  isFriendlyCode,
  DEFAULT_PORT,
  QUEUE_BOT_AFTER_MS,
  MATCH_FILL_BOT_AFTER_MS,
  MATCH_START_DELAY_MS,
  RECONNECT_SECONDS,
} from '@arena/shared';
import { ctx, type ServerSettings } from './context';
import { MatchRoom } from './rooms/MatchRoom';
import { QueueRoom } from './rooms/QueueRoom';
import { ClanRoom } from './rooms/ClanRoom';
import { accountRoutes } from './routes/account';
import { leaderboardRoutes } from './routes/leaderboard';
import { socialRoutes } from './routes/social';
import { startSeasonJob } from './seasons';
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
  };
  const store: Store = opts.store ?? (process.env.DATABASE_URL ? new PrismaStore() : new MemoryStore());
  if (store.kind === 'memory' && !opts.store)
    console.warn('[arena] sin DATABASE_URL: las cuentas se guardan en memoria');
  ctx.store = store;

  const app = express();
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return void res.sendStatus(204);
    next();
  });
  app.get('/api/health', (_req, res) => void res.json({ ok: true, db: store.kind }));
  app.use(
    '/api',
    accountRoutes(store, {
      allowCheats: opts.allowCheats ?? process.env.ALLOW_DEV_CHEATS === '1',
      // dominio del mensaje que firma la wallet: el configurado, o la web desde la que se juega
      domain: (req) =>
        opts.domain ?? process.env.PUBLIC_DOMAIN ?? originHost(req.get('origin')) ?? req.get('host') ?? 'arena-royale',
      rateLimits: opts.rateLimits ?? true,
    }),
  );
  app.use('/api', leaderboardRoutes(store));
  app.use('/api', socialRoutes(store));
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
  const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }), greet: false });
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
    close: async () => {
      stopSeasons();
      await gameServer.gracefullyShutdown(false);
      await store.close();
    },
  };
}
