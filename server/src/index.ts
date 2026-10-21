import { DEFAULT_PORT } from '@arena/shared';
import { startServer } from './app';

// ARENA_PORT manda; PORT solo en producción (lo fijan Railway/Fly). En desarrollo, 2567.
const port =
  Number(process.env.ARENA_PORT) ||
  (process.env.NODE_ENV === 'production' ? Number(process.env.PORT) : 0) ||
  DEFAULT_PORT;
const server = await startServer({ port, replayDir: process.env.REPLAY_DIR });
console.log(`[arena] servidor en ws://localhost:${server.port}  (API: http://localhost:${server.port}/api/health)`);
