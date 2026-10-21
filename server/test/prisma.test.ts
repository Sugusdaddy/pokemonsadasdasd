import { afterAll, describe, expect, it } from 'vitest';
import { freshProfile } from '@arena/shared';
import { PrismaStore } from '../src/store/prisma';

// Solo si hay una base de datos de pruebas: TEST_DATABASE_URL=postgresql://… npm test
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('PostgreSQL (PrismaStore)', () => {
  const store = new PrismaStore(url);
  afterAll(() => store.close());

  it('20 cambios a la vez sobre la misma cuenta no pierden ninguno', async () => {
    const acc = await store.createAccount(freshProfile(Date.now()), true);
    await Promise.all(Array.from({ length: 20 }, () => store.mutate(acc.id, (s) => void (s.gold += 1))));
    const after = (await store.getAccount(acc.id))!;
    expect(after.state.gold).toBe(acc.state.gold + 20);
    expect(after.rev).toBe(20);
  });

  it('si la regla falla, el estado no cambia', async () => {
    const acc = await store.createAccount(freshProfile(Date.now()), true);
    await expect(
      store.mutate(acc.id, (s) => {
        s.gold = 0;
        throw new Error('econ.gold');
      }),
    ).rejects.toThrow();
    expect((await store.getAccount(acc.id))!.state.gold).toBe(acc.state.gold);
  });

  it('una wallet solo puede estar en una cuenta y deja de ser invitada', async () => {
    const a = await store.createAccount(freshProfile(Date.now()), true);
    const b = await store.createAccount(freshProfile(Date.now()), true);
    const addr = `Test${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
    await store.linkWallet(addr, a.id);
    await expect(store.linkWallet(addr, b.id)).rejects.toThrow('err.wallet.taken');
    expect(await store.findWalletAccount(addr)).toBe(a.id);
    expect((await store.getAccount(a.id))!.isGuest).toBe(false);
  });

  it('los nonces son de un solo uso', async () => {
    const n = `n${Date.now()}${Math.random()}`;
    await store.putNonce(n, 'addr', 'msg', new Date(Date.now() + 60_000));
    expect((await store.takeNonce(n))?.message).toBe('msg');
    expect(await store.takeNonce(n)).toBeNull();
  });

  it('guarda y lee partidas con su repetición', async () => {
    const id = `t-${Date.now().toString(36)}`;
    await store.saveMatch({
      id,
      mode: 'bot',
      blueId: null,
      redId: null,
      winner: 'blue',
      reason: 'end',
      players: {
        blue: { name: 'A', trophies: 0, kingLevel: 1, bot: false },
        red: { name: 'B', trophies: 0, kingLevel: 1, bot: true },
      },
      crowns: { blue: 3, red: 0 },
      ticks: 100,
      hash: 4294967295,
      replay: { version: 1, setup: {} as never, inputs: [] },
      endedAt: new Date(),
    });
    const m = (await store.getMatch(id))!;
    expect(m.hash).toBe(4294967295);
    expect((await store.listMatches(5)).some((x) => x.id === id)).toBe(true);
  });

  it('ranking: orden por trofeos, rango por arena y puesto', async () => {
    const tag = Date.now();
    const mk = async (t: number) => {
      const a = await store.createAccount({ ...freshProfile(Date.now()), name: `R${tag}`, trophies: t }, true);
      return a.id;
    };
    const hi = await mk(800_001), lo = await mk(800_000);
    const top = await store.leaderboard({ min: 800_000 }, 10, 0);
    expect(top.slice(0, 2).map((e) => e.accountId)).toEqual([hi, lo]);
    expect(await store.countAbove(800_000, { min: 800_000 })).toBeGreaterThanOrEqual(1);
    expect(await store.countRanked({ min: 800_000, max: 800_001 })).toBeGreaterThanOrEqual(1);
  });

  it('el cierre de una temporada solo lo empieza un proceso', async () => {
    const id = `t${Date.now()}`.slice(0, 20);
    const both = await Promise.all([store.beginSeasonClose(id), store.beginSeasonClose(id)]);
    expect(both.filter(Boolean)).toHaveLength(1);
    await store.finishSeasonClose(id, [{ accountId: 'x', rank: 1, name: 'X', trophies: 10, best: 12 }]);
    expect(await store.seasonTop(id, 5)).toEqual([{ accountId: 'x', rank: 1, name: 'X', trophies: 10, best: 12 }]);
  });
});
