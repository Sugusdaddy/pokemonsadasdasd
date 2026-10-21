import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type Room } from 'colyseus.js';
import {
  STARTER_DECK,
  INPUT_DELAY_TICKS,
  PROTOCOL_VERSION,
  Lockstep,
  runReplay,
  mirrorPoint,
  type ClientJoin,
  type Replay,
  type RewardsMsg,
  type StartMsg,
  type CatchupMsg,
  type TickMsg,
  type EndMsg,
  type RejectMsg,
  type MatchedMsg,
} from '@arena/shared';
import { startServer, type RunningServer } from '../src/app';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { MemoryStore } from '../src/store/memory';
import { closeSeasonIfNeeded } from '../src/seasons';
import { seasonAt, previousSeasonId } from '@arena/shared';

type StoredReplay = Replay & { meta: { hash: number; ticks: number } };

let server: RunningServer;
let endpoint: string;
let http: string;

beforeAll(async () => {
  server = await startServer({
    port: 0,
    store: new MemoryStore(),
    allowCheats: true,
    rateLimits: false,
    seasonJob: false,
    queueBotAfterMs: 1200,
    matchFillBotAfterMs: 1500,
    matchStartDelayMs: 150,
    reconnectSeconds: 3,
    linger: 1,
  });
  endpoint = `ws://localhost:${server.port}`;
  http = `http://localhost:${server.port}`;
});

afterAll(async () => {
  await server.close();
});

/** Crea una cuenta de invitado con esos trofeos y nombre, y devuelve con qué entrar. */
async function opts(trophies = 100, name = 'Tester'): Promise<ClientJoin & { accountId: string }> {
  const r = await fetch(`${http}/api/auth/guest`, { method: 'POST' });
  const { token, account } = (await r.json()) as { token: string; account: { id: string } };
  await server.store.mutate(account.id, (s) => {
    s.trophies = trophies;
    s.maxTrophies = trophies;
    s.name = name;
  });
  return { token, protocol: PROTOCOL_VERSION, accountId: account.id };
}

/** Cliente de prueba: guarda los mensajes y mantiene su copia lockstep de la partida. */
class Player {
  start: StartMsg | null = null;
  ls: Lockstep | null = null;
  ends: EndMsg[] = [];
  rewards: RewardsMsg[] = [];
  rejects: RejectMsg[] = [];
  ticks: TickMsg[] = [];
  code: string | null = null;

  constructor(public room: Room) {
    this.listen(room);
  }

  listen(room: Room): void {
    this.room = room;
    room.onMessage('start', (m: StartMsg) => {
      this.start = m;
      if (!this.ls) this.ls = new Lockstep(m);
    });
    room.onMessage('catchup', (m: CatchupMsg) => this.ls?.catchup(m));
    room.onMessage('tick', (m: TickMsg) => {
      this.ticks.push(m);
      this.ls?.onTick(m);
      this.ls?.drain();
    });
    room.onMessage('end', (m: EndMsg) => this.ends.push(m));
    room.onMessage('rewards', (m: RewardsMsg) => this.rewards.push(m));
    room.onMessage('reject', (m: RejectMsg) => this.rejects.push(m));
    room.onMessage('code', (m: { code: string }) => (this.code = m.code));
    room.onMessage('queue', () => {});
  }

  get hand(): string[] {
    return this.ls!.match.cycles[this.start!.you as 'blue' | 'red'].hand;
  }
}

const until = async (cond: () => boolean, ms = 5000, what = 'condición'): Promise<void> => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`Tiempo agotado esperando: ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
};

/** Entra en la cola y devuelve la sala de partida cuando la encuentra. */
async function queue(client: Client, o: ClientJoin): Promise<{ room: Room; matched: MatchedMsg }> {
  const q = await client.joinOrCreate('queue', o);
  q.onMessage('queue', () => {});
  const matched = await new Promise<MatchedMsg>((resolve) => q.onMessage('matched', resolve));
  const room = await client.consumeSeatReservation(
    matched.reservation as Parameters<Client['consumeSeatReservation']>[0],
  );
  void q.leave();
  return { room, matched };
}

describe('servidor', () => {
  it('API de salud', async () => {
    const r = await fetch(`${http}/api/health`);
    expect(await r.json()).toEqual({ ok: true, db: 'memory' });
  });

  it('sin rival en la cola → partida contra bot; las cartas llegan con retardo y la repetición se guarda', async () => {
    const client = new Client(endpoint);
    const { room, matched } = await queue(client, await opts(50));
    expect(matched.mode).toBe('bot');
    const p = new Player(room);
    await until(() => !!p.start && p.ticks.length > 5, 5000, 'inicio');
    expect(p.start!.you).toBe('blue');
    expect(p.start!.players.red.bot).toBe(true);

    // juega una carta válida: se aplica INPUT_DELAY_TICKS después de recibirla
    const card = p.hand.find((k) => k !== 'rockslide')!;
    const sentAt = p.ls!.serverTick;
    room.send('play', { card, x: 200, y: 720 });
    await until(
      () => p.ticks.some((t) => t.i?.some((i) => i.t === 'play' && i.team === 'blue')),
      3000,
      'carta aplicada',
    );
    const applied = p.ticks.find((t) => t.i?.some((i) => i.t === 'play' && i.team === 'blue'))!;
    expect(applied.t).toBeGreaterThanOrEqual(sentAt + INPUT_DELAY_TICKS);
    expect(applied.t).toBeLessThanOrEqual(sentAt + INPUT_DELAY_TICKS + 3);
    expect(p.ls!.match.units.some((u) => u.team === 'blue' && u.card.key === card)).toBe(true);

    // pasan ticks con huella y la copia local coincide
    await until(() => p.ticks.filter((t) => t.h !== undefined).length >= 2, 4000, 'huellas');
    expect(p.ls!.desyncs).toBe(0);

    room.send('surrender');
    await until(() => p.ends.length > 0, 3000, 'fin');
    const end = p.ends[0];
    expect(end.winner).toBe('red');
    expect(end.replayId).toBeTruthy();
    expect(p.ls!.match.over).toBe(true);
    expect(p.ls!.match.winner).toBe('red');

    const rep = (await (await fetch(`${http}/api/replays/${end.replayId}`)).json()) as StoredReplay;
    const r = runReplay(rep);
    expect(r.match.hash()).toBe(rep.meta.hash);
    expect(r.match.hash()).toBe(p.ls!.match.hash());
    const list = (await (await fetch(`${http}/api/replays`)).json()) as Array<{ id: string }>;
    expect(list.some((x) => x.id === end.replayId)).toBe(true);
  });

  it('empareja a dos jugadores con trofeos parecidos y los dos ven la misma partida', async () => {
    const [ca, cb] = [new Client(endpoint), new Client(endpoint)];
    const [ra, rb] = await Promise.all([queue(ca, await opts(400, 'Ana')), queue(cb, await opts(460, 'Beto'))]);
    expect(ra.matched.mode).toBe('ranked');
    expect(ra.room.roomId).toBe(rb.room.roomId);
    const [a, b] = [new Player(ra.room), new Player(rb.room)];
    await until(() => !!a.start && !!b.start && a.ticks.length > 3 && b.ticks.length > 3, 5000, 'inicio');
    expect(new Set([a.start!.you, b.start!.you])).toEqual(new Set(['blue', 'red']));
    expect(a.start!.players.blue.bot || a.start!.players.red.bot).toBe(false);

    // cada uno juega una carta en su lado
    const blue = a.start!.you === 'blue' ? a : b,
      red = blue === a ? b : a;
    blue.room.send('play', { card: blue.hand.find((k) => k !== 'rockslide'), x: 200, y: 720 });
    const [rx, ry] = mirrorPoint(200, 720);
    red.room.send('play', { card: red.hand.find((k) => k !== 'rockslide'), x: rx, y: ry });
    await until(() => blue.ls!.match.units.length >= 2 && red.ls!.match.units.length >= 2, 3000, 'tropas de los dos');
    await until(() => blue.ls!.match.tick === red.ls!.match.tick && blue.ls!.match.tick % 20 === 0, 3000, 'mismo tick');
    expect(blue.ls!.match.hash()).toBe(red.ls!.match.hash());

    red.room.send('surrender');
    await until(() => blue.ends.length > 0 && red.ends.length > 0, 3000, 'fin');
    expect(blue.ends[0].winner).toBe('blue');
    expect(blue.ls!.match.hash()).toBe(red.ls!.match.hash());
  });

  it('no empareja trofeos muy distintos mientras la ventana es pequeña', async () => {
    const [ca, cb] = [new Client(endpoint), new Client(endpoint)];
    const qa = await ca.joinOrCreate('queue', await opts(0, 'Novato'));
    const qb = await cb.joinOrCreate('queue', await opts(3000, 'Experto'));
    let matched = 0;
    const status: number[] = [];
    for (const q of [qa, qb]) {
      q.onMessage('matched', () => matched++);
      q.onMessage('queue', (m: { window: number }) => status.push(m.window));
    }
    await new Promise((r) => setTimeout(r, 900));
    expect(matched).toBe(0);
    expect(status.length).toBeGreaterThan(0);
    expect(Math.max(...status)).toBeLessThan(3000);
    await qa.leave();
    await qb.leave();
  });

  it('rechaza cartas que no están en la mano, fuera de zona o a demasiado ritmo', async () => {
    const client = new Client(endpoint);
    const { room } = await queue(client, await opts(10));
    const p = new Player(room);
    await until(() => p.ticks.length > 3, 5000, 'inicio');
    const notInHand = STARTER_DECK.find((k) => !p.hand.includes(k))!;
    room.send('play', { card: notInHand, x: 200, y: 720 });
    room.send('play', { card: p.hand.find((k) => k !== 'rockslide'), x: 140, y: 300 });
    room.send('play', { card: 'mewtwo', x: 200, y: 720 });
    room.send('play', { card: 'x', x: 'nope', y: 1 });
    await until(() => p.rejects.length >= 4, 3000, 'rechazos');
    expect(p.rejects.map((r) => r.reason)).toEqual(['hand', 'zone', 'hand', 'invalid']);
    // ráfaga: el cubo de fichas corta
    for (let i = 0; i < 6; i++) room.send('play', { card: notInHand, x: 200, y: 720 });
    await until(() => p.rejects.some((r) => r.reason === 'rate'), 3000, 'límite de ritmo');
    room.send('surrender');
    await until(() => p.ends.length > 0, 3000, 'fin');
  });

  it('una partida igualada no admite jugadores sin ticket, pero sí espectadores', async () => {
    const client = new Client(endpoint);
    const { room } = await queue(client, await opts(20));
    const p = new Player(room);
    await until(() => p.ticks.length > 30, 5000, 'partida en marcha');
    const intruder = new Client(endpoint);
    await expect(intruder.joinById(room.roomId, await opts(20, 'Intruso'))).rejects.toThrow();

    const live = (await (await fetch(`${http}/api/live`)).json()) as Array<{ roomId: string }>;
    expect(live.some((l) => l.roomId === room.roomId)).toBe(true);
    const specRoom = await intruder.joinById(room.roomId, { spectate: true });
    const s = new Player(specRoom);
    await until(() => s.start?.you === 'spectator' && s.ticks.length > 5, 3000, 'espectador');
    await until(() => s.ls!.match.tick === p.ls!.match.tick && s.ls!.match.tick % 20 === 0, 3000, 'mismo tick');
    expect(s.ls!.match.hash()).toBe(p.ls!.match.hash());
    room.send('surrender');
    await until(() => s.ends.length > 0, 3000, 'fin visto por el espectador');
  });

  it('sala amistosa por código', async () => {
    const [ca, cb] = [new Client(endpoint), new Client(endpoint)];
    const ra = await ca.create('match', { ...(await opts(100, 'Host')), mode: 'friendly' });
    const a = new Player(ra);
    await until(() => !!a.code, 2000, 'código');
    const r = await fetch(`${http}/api/friendly/${a.code}`);
    const { roomId } = (await r.json()) as { roomId: string };
    expect(roomId).toBe(ra.roomId);
    expect((await fetch(`${http}/api/friendly/ZZZZZ`)).status).toBe(404);
    const b = new Player(await cb.joinById(roomId, await opts(900, 'Invitado')));
    await until(() => !!a.start && !!b.start, 3000, 'inicio amistosa');
    expect(a.start!.mode).toBe('friendly');
    expect(a.start!.players.red.name).toBe('Invitado');
    b.room.send('surrender');
    await until(() => a.ends.length > 0, 4000, 'fin');
  });

  it('reconexión: tras cortarse, el jugador vuelve y se pone al día', async () => {
    const client = new Client(endpoint);
    const { room } = await queue(client, await opts(30));
    const p = new Player(room);
    await until(() => p.ticks.length > 20, 5000, 'partida en marcha');
    p.room.send('play', { card: p.hand.find((k) => k !== 'rockslide'), x: 360, y: 900 });
    await until(() => p.ls!.match.units.some((u) => u.team === 'blue'), 3000, 'tropa');
    const token = room.reconnectionToken;
    // corte brusco (no consentido)
    (room.connection as unknown as { close(code?: number): void }).close(4999);
    await new Promise((r) => setTimeout(r, 400));
    const before = p.ls!.match.tick;
    const back = await client.reconnect(token);
    p.ls = null;
    p.listen(back);
    await until(() => !!p.ls && p.ls.match.tick > before + 10, 4000, 'puesta al día');
    expect(p.ls!.match.units.some((u) => u.team === 'blue')).toBe(true);
    await until(() => p.ls!.match.tick % 20 === 0, 2000, 'tick con huella');
    await new Promise((r) => setTimeout(r, 1100));
    expect(p.ls!.desyncs).toBe(0);
    back.send('surrender');
    await until(() => p.ends.length > 0, 3000, 'fin');
  });
});

// ───────────────────────── Cuentas, wallet y economía ─────────────────────────

interface AccountView {
  id: string;
  guest: boolean;
  wallets: string[];
  state: {
    gold: number;
    gems: number;
    trophies: number;
    name: string;
    stats: { battles: number; losses: number };
    shop: { freeClaimed: boolean };
  };
  shop: { offers: Array<{ id: string; price: number }> };
}

async function api<T = { result: unknown; account: AccountView }>(
  path: string,
  token?: string,
  body?: unknown,
): Promise<{ status: number; json: T & { error?: string } }> {
  const r = await fetch(`${http}/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, json: (await r.json()) as T & { error?: string } };
}

/** Wallet de prueba: firma de verdad el mensaje del servidor. */
function testWallet() {
  const kp = nacl.sign.keyPair();
  const address = bs58.encode(kp.publicKey);
  const sign = (message: string) => bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), kp.secretKey));
  return { address, sign };
}

async function walletLogin(w: ReturnType<typeof testWallet>, guestToken?: string) {
  const n = await api<{ nonce: string; message: string }>(`/auth/nonce?address=${w.address}`);
  return api<{ token: string; account: AccountView }>('/auth/wallet', guestToken, {
    address: w.address,
    nonce: n.json.nonce,
    signature: w.sign(n.json.message),
  });
}

describe('cuentas y economía', () => {
  it('un invitado recibe el progreso inicial y sin sesión no hay acceso', async () => {
    const g = await api<{ token: string; account: AccountView }>('/auth/guest', undefined, {});
    expect(g.status).toBe(200);
    expect(g.json.account.guest).toBe(true);
    expect(g.json.account.state.gold).toBe(300);
    expect((await api('/me')).status).toBe(401);
    expect((await api('/me', 'token-falso')).status).toBe(401);
    expect((await api('/me', g.json.token)).json.account.id).toBe(g.json.account.id);
  });

  it('login con wallet: la firma convierte al invitado en cuenta con wallet y conserva su progreso', async () => {
    const g = await api<{ token: string; account: AccountView }>('/auth/guest', undefined, {});
    await server.store.mutate(g.json.account.id, (s) => void (s.gold = 777));
    const w = testWallet();
    const n = await api<{ nonce: string; message: string }>(`/auth/nonce?address=${w.address}`);
    expect(n.json.message).toContain(w.address);
    expect(n.json.message).toContain('will not trigger a blockchain transaction');
    const login = await api<{ token: string; account: AccountView }>('/auth/wallet', g.json.token, {
      address: w.address,
      nonce: n.json.nonce,
      signature: w.sign(n.json.message),
    });
    expect(login.status).toBe(200);
    expect(login.json.account.id).toBe(g.json.account.id);
    expect(login.json.account.guest).toBe(false);
    expect(login.json.account.wallets).toEqual([w.address]);
    expect(login.json.account.state.gold).toBe(777);
    // otra vez con la misma wallet desde otro dispositivo: misma cuenta
    const again = await walletLogin(w);
    expect(again.json.account.id).toBe(g.json.account.id);
  });

  it('rechaza firmas falsas, nonces reutilizados y direcciones inválidas', async () => {
    const w = testWallet(),
      other = testWallet();
    const n = await api<{ nonce: string; message: string }>(`/auth/nonce?address=${w.address}`);
    const bad = await api('/auth/wallet', undefined, {
      address: w.address,
      nonce: n.json.nonce,
      signature: other.sign(n.json.message),
    });
    expect(bad.status).toBe(401);
    expect(bad.json.error).toBe('err.wallet.signature');
    // el nonce ya se gastó con el intento fallido
    const reuse = await api('/auth/wallet', undefined, {
      address: w.address,
      nonce: n.json.nonce,
      signature: w.sign(n.json.message),
    });
    expect(reuse.json.error).toBe('err.wallet.nonce');
    // nonce de otra dirección
    const n2 = await api<{ nonce: string; message: string }>(`/auth/nonce?address=${other.address}`);
    const swap = await api('/auth/wallet', undefined, {
      address: w.address,
      nonce: n2.json.nonce,
      signature: w.sign(n2.json.message),
    });
    expect(swap.json.error).toBe('err.wallet.nonce');
    expect((await api(`/auth/nonce?address=no-es-una-wallet`)).status).toBe(400);
  });

  it('la economía la decide el servidor: sin oro no se compra y no se cobra dos veces', async () => {
    const g = await api<{ token: string; account: AccountView }>('/auth/guest', undefined, {});
    const tok = g.json.token;
    // regalo diario: una sola vez, aunque se pida a la vez
    const both = await Promise.all([api('/me/shop/gift', tok, {}), api('/me/shop/gift', tok, {})]);
    expect(both.map((r) => r.status).sort()).toEqual([200, 400]);
    const me = await api('/me', tok);
    expect(me.json.account.state.gold).toBe(400);
    expect(me.json.account.state.shop.freeClaimed).toBe(true);
    // una oferta de cartas cara sin oro suficiente
    const offer = me.json.account.shop.offers.find((o) => o.price > 400)!;
    const fail = await api('/me/shop/card', tok, { id: offer.id });
    expect(fail.status).toBe(400);
    expect(fail.json.error).toBe('err.econ.gold'.replace('err.', ''));
    // abrir la Super Ball inicial (lista desde el principio)
    const open = await api<{ result: { gold: number; cards: unknown[] }; account: AccountView }>(
      '/me/balls/open',
      tok,
      { slot: 0 },
    );
    expect(open.status).toBe(200);
    expect(open.json.result.cards.length).toBeGreaterThan(0);
    // ya no hay ball en ese hueco
    expect((await api('/me/balls/open', tok, { slot: 0 })).json.error).toBe('econ.slot');
    // datos basura
    expect((await api('/me/name', tok, { name: '<script>' })).json.error).toBe('econ.name');
    expect((await api('/me/deck/card', tok, { slot: 0, key: 'mewtwo' })).json.error).toBe('econ.notOwned');
  });

  it('al acabar una partida el servidor da las recompensas y las guarda', async () => {
    const client = new Client(endpoint);
    const o = await opts(120, 'Premio');
    const { room } = await queue(client, o);
    const p = new Player(room);
    await until(() => p.ticks.length > 5, 5000, 'inicio');
    room.send('surrender');
    await until(() => p.rewards.length > 0, 4000, 'recompensas');
    const r = p.rewards[0];
    expect(r.result.trophies).toBeLessThan(0); // derrota
    expect(r.state.stats.battles).toBe(1);
    const saved = (await server.store.getAccount(o.accountId))!;
    expect(saved.state.trophies).toBe(120 + r.result.trophies);
    expect(saved.state.stats.losses).toBe(1);
  });
});

// ───────────────────────── Rankings y temporadas ─────────────────────────

interface Board {
  total: number;
  entries: Array<{ rank: number; accountId: string; name: string; trophies: number; wallet: string | null }>;
  me: { rank: number | null; trophies: number } | null;
}

describe('rankings y temporadas', () => {
  it('ranking global: de más a menos trofeos, empates comparten puesto y sin los de 0', async () => {
    const a = await opts(90_500, 'Top');
    const b = await opts(90_300, 'EmpateA');
    const c = await opts(90_300, 'EmpateB');
    const z = await opts(0, 'Cero');
    const board = (await api<Board>('/leaderboard?scope=global&limit=10', b.token)).json;
    const pos = (id: string) => board.entries.find((e) => e.accountId === id);
    expect(pos(a.accountId)!.rank).toBe(1);
    expect(pos(b.accountId)!.rank).toBe(2);
    expect(pos(c.accountId)!.rank).toBe(2);
    expect(pos(z.accountId)).toBeUndefined();
    expect(board.me).toEqual({ rank: 2, trophies: 90_300 });
    const zb = (await api<Board>('/leaderboard?scope=global', z.token)).json;
    expect(zb.me).toEqual({ rank: null, trophies: 0 });
  });

  it('ranking por arena: solo los trofeos de esa arena', async () => {
    const inArena1 = await opts(450, 'Luna');
    const board = (await api<Board>('/leaderboard?scope=arena&arena=1&limit=100', inArena1.token)).json;
    expect(board.entries.every((e) => e.trophies >= 300 && e.trophies < 700)).toBe(true);
    expect(board.entries.some((e) => e.accountId === inArena1.accountId)).toBe(true);
    expect(board.me?.rank).toBeGreaterThan(0);
    expect((await api('/leaderboard?scope=arena&arena=99')).status).toBe(400);
  });

  it('cierre de temporada: puesto final, reinicio suave, recompensa reclamable una vez y archivo', async () => {
    const now = Date.now();
    const prev = previousSeasonId(seasonAt(now).id);
    // un jugador que jugó la temporada pasada con muchos trofeos
    const p = await opts(1, 'Veterano');
    await server.store.mutate(p.accountId, (s) => {
      s.trophies = 2400;
      s.season = { id: prev, best: 2500, battles: 12 };
    });
    const r = await closeSeasonIfNeeded(server.store, now);
    expect(r?.closed).toBe(prev);
    expect(await closeSeasonIfNeeded(server.store, now)).toBeNull(); // solo una vez
    const me = (await api('/me', p.token)).json.account.state as unknown as {
      trophies: number;
      pendingSeason: { seasonId: string; best: number; rank: number; tier: { gold: number; ball: string } };
    };
    expect(me.trophies).toBe(1600 + 400); // 2400 → reinicio suave
    expect(me.pendingSeason).toMatchObject({ seasonId: prev, best: 2500, tier: { gold: 4000, ball: 'master' } });
    expect(me.pendingSeason.rank).toBeGreaterThan(0);
    const season = (await api<{ previous: { id: string; top: Array<{ name: string }> } }>('/season')).json;
    expect(season.previous.id).toBe(prev);
    expect(season.previous.top.length).toBeGreaterThan(0);
    const before = (await api('/me', p.token)).json.account.state.gold;
    const claim = await api<{ result: { gold: number; ball?: { type: string } }; account: AccountView }>('/me/season/claim', p.token, {});
    expect(claim.status).toBe(200);
    expect(claim.json.result.ball?.type).toBe('master');
    expect(claim.json.account.state.gold).toBeGreaterThanOrEqual(before + 4000);
    expect((await api('/me/season/claim', p.token, {})).json.error).toBe('econ.claimed');
  });
});
