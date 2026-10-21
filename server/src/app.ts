import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
import { ReplayStore } from './replays';
import { MatchRoom } from './rooms/MatchRoom';
import { QueueRoom } from './rooms/QueueRoom';

export interface StartOptions extends Partial<ServerSettings> {
  port?: number;
  replayDir?: string;
}

export interface RunningServer {
  port: number;
  gameServer: Server;
  replays: ReplayStore;
  close(): Promise<void>;
}

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Arranca el servidor de juego (WebSocket de Colyseus + API HTTP en el mismo puerto). */
export async function startServer(opts: StartOptions = {}): Promise<RunningServer> {
  ctx.settings = {
    queueBotAfterMs: opts.queueBotAfterMs ?? QUEUE_BOT_AFTER_MS,
    matchFillBotAfterMs: opts.matchFillBotAfterMs ?? MATCH_FILL_BOT_AFTER_MS,
    matchStartDelayMs: opts.matchStartDelayMs ?? MATCH_START_DELAY_MS,
    reconnectSeconds: opts.reconnectSeconds ?? RECONNECT_SECONDS,
    linger: opts.linger ?? 15,
  };
  const replays = new ReplayStore(opts.replayDir ?? path.resolve(HERE, '../data/replays'));
  ctx.replays = replays;

  const app = express();
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (req.method === 'OPTIONS') return void res.sendStatus(204);
    next();
  });
  app.get('/api/health', (_req, res) => void res.json({ ok: true }));
  app.get('/api/replays', (req, res) => void res.json(replays.list(Number(req.query.limit) || 20)));
  app.get('/api/replays/:id', (req, res) => {
    const r = replays.get(req.params.id);
    if (!r) return void res.status(404).json({ error: 'No existe esa repetición' });
    res.json(r);
  });
  app.get('/api/friendly/:code', (req, res) => {
    const code = req.params.code.toUpperCase();
    const roomId = isFriendlyCode(code) ? ctx.friendly.get(code) : undefined;
    if (!roomId) return void res.status(404).json({ error: 'No hay ninguna sala con ese código' });
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

  const httpServer = http.createServer(app);
  const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }), greet: false });
  gameServer.define('match', MatchRoom);
  gameServer.define('queue', QueueRoom);
  await gameServer.listen(opts.port ?? DEFAULT_PORT);
  const address = httpServer.address();
  const port = typeof address === 'object' && address ? address.port : (opts.port ?? DEFAULT_PORT);

  return {
    port,
    gameServer,
    replays,
    close: async () => {
      await gameServer.gracefullyShutdown(false);
    },
  };
}
