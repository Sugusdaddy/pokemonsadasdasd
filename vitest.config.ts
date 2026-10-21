import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['shared/test/**/*.test.ts', 'server/test/**/*.test.ts', 'client/test/**/*.test.ts'],
    environment: 'node',
    // hilos y no procesos: Colyseus usa process.send (PM2) si existe y choca con el pool de procesos
    pool: 'threads',
    testTimeout: 20000,
  },
});
