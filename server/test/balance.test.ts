import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { Client, type Room } from 'colyseus.js';
import {
  PROTOCOL_VERSION,
  getCard,
  type Balance,
  type MatchedMsg,
  type RewardsMsg,
  type StartMsg,
} from '@arena/shared';
import { startServer, type RunningServer } from '../src/app';
import { MemoryStore } from '../src/store/memory';

let server: RunningServer;
let http: string;
let endpoint: string;
const ADMIN_WALLET = bs58.encode(nacl.sign.keyPair().publicKey);

beforeAll(async () => {
  server = await startServer({
    port: 0,
    store: new MemoryStore(),
    rateLimits: false,
    seasonJob: false,
    adminWallets: [ADMIN_WALLET],
    queueBotAfterMs: 300,
    matchStartDelayMs: 100,
    linger: 1,
  });
  http = `http://localhost:${server.port}`;
  endpoint = `ws://localhost:${server.port}`;
});

afterAll(async () => {
  await server.close();
});

async function api<T = Record<string, unknown>>(path: string, token?: string, body?: unknown) {
  const r = await fetch(`${http}/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, json: (await r.json()) as T & { error?: string } };
}

async function guest(): Promise<{ token: string; id: string }> {
  const { json } = await api<{ token: string; account: { id: string } }>('/auth/guest', undefined, {});
  return { token: json.token, id: json.account.id };
}

/** Una partida contra el bot en la que el jugador se rinde enseguida. */
async function quickMatch(token: string): Promise<{ start: StartMsg; rewards: RewardsMsg }> {
  const client = new Client(endpoint);
  const q = await client.joinOrCreate('queue', { token, protocol: PROTOCOL_VERSION });
  q.onMessage('queue', () => {});
  const matched = await new Promise<MatchedMsg>((r) => q.onMessage('matched', r));
  const room: Room = await client.consumeSeatReservation(
    matched.reservation as Parameters<Client['consumeSeatReservation']>[0],
  );
  void q.leave();
  let start: StartMsg | null = null;
  let rewards: RewardsMsg | null = null;
  room.onMessage('start', (m: StartMsg) => (start = m));
  room.onMessage('rewards', (m: RewardsMsg) => (rewards = m));
  for (const t of ['tick', 'catchup', 'end', 'reject']) room.onMessage(t, () => {});
  for (let i = 0; i < 100 && !start; i++) await new Promise((r) => setTimeout(r, 30));
  await new Promise((r) => setTimeout(r, 200));
  room.send('surrender');
  for (let i = 0; i < 150 && !rewards; i++) await new Promise((r) => setTimeout(r, 30));
  void room.leave();
  return { start: start!, rewards: rewards! };
}

describe('balance de cartas (admin)', () => {
  it('solo el admin lo cambia; las partidas nuevas llevan esa versión y las estadísticas van por versión', async () => {
    const admin = await guest();
    await server.store.linkWallet(ADMIN_WALLET, admin.id);
    const player = await guest();
    expect((await api('/admin/balance', player.token)).status).toBe(403);
    expect((await api<Balance>('/balance')).json).toEqual({ v: 0, o: {} });

    // una partida sin cambios: va a la versión 0
    const before = await quickMatch(player.token);
    expect(before.start.setup.balance).toBeUndefined();

    const pika = getCard('pikachu');
    expect(
      (await api('/admin/balance', admin.token, { overrides: { pikachu: { dmg: pika.dmg * 9 } }, note: 'x' })).json
        .error,
    ).toBe('err.balance.range');
    expect((await api('/admin/balance', admin.token, { overrides: {}, note: '' })).json.error).toBe('err.balance.note');
    const saved = await api<{ current: Balance }>('/admin/balance', admin.token, {
      overrides: { pikachu: { dmg: pika.dmg + 10, cost: pika.cost } },
      note: 'Pikachu un poco más fuerte',
    });
    expect(saved.json.current).toEqual({ v: 1, o: { pikachu: { dmg: pika.dmg + 10 } } });
    expect((await api<Balance>('/balance')).json.v).toBe(1);

    const after = await quickMatch(player.token);
    expect(after.start.setup.balance).toEqual({ v: 1, o: { pikachu: { dmg: pika.dmg + 10 } } });

    // estadísticas: una partida de jugador en cada versión, perdida (se rindió)
    const v0 = await api<{ decks: number; rows: Array<{ key: string; games: number; wins: number }> }>(
      '/admin/cards?version=0',
      admin.token,
    );
    expect(v0.json.decks).toBe(1);
    expect(v0.json.rows).toHaveLength(8);
    expect(v0.json.rows.every((r) => r.games === 1 && r.wins === 0)).toBe(true);
    const v1 = await api<{ version: number; decks: number }>('/admin/cards', admin.token);
    expect(v1.json).toMatchObject({ version: 1, decks: 1 });
    const hist = await api<{ history: Array<{ version: number; note: string }> }>('/admin/balance', admin.token);
    expect(hist.json.history[0]).toMatchObject({ version: 1, note: 'Pikachu un poco más fuerte' });
  });
});
