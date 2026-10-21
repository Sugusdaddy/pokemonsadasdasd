import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type Room } from 'colyseus.js';
import {
  STARTER_DECK,
  INPUT_DELAY_TICKS,
  PROTOCOL_VERSION,
  Lockstep,
  runReplay,
  mirrorPoint,
  type JoinOptions,
  type StartMsg,
  type CatchupMsg,
  type TickMsg,
  type EndMsg,
  type RejectMsg,
  type MatchedMsg,
} from '@arena/shared';
import { startServer, type RunningServer } from '../src/app';
import type { StoredReplay } from '../src/replays';

let server: RunningServer;
let endpoint: string;
let http: string;
const replayDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-replays-'));

beforeAll(async () => {
  server = await startServer({
    port: 0,
    replayDir,
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
  fs.rmSync(replayDir, { recursive: true, force: true });
});

const opts = (trophies = 100, name = 'Tester'): JoinOptions => ({
  name,
  trophies,
  kingLevel: 1,
  deck: [...STARTER_DECK],
  levels: {},
  protocol: PROTOCOL_VERSION,
});

/** Cliente de prueba: guarda los mensajes y mantiene su copia lockstep de la partida. */
class Player {
  start: StartMsg | null = null;
  ls: Lockstep | null = null;
  ends: EndMsg[] = [];
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
async function queue(client: Client, o: JoinOptions): Promise<{ room: Room; matched: MatchedMsg }> {
  const q = await client.joinOrCreate('queue', o);
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
    expect(await r.json()).toEqual({ ok: true });
  });

  it('sin rival en la cola → partida contra bot; las cartas llegan con retardo y la repetición se guarda', async () => {
    const client = new Client(endpoint);
    const { room, matched } = await queue(client, opts(50));
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
    const [ra, rb] = await Promise.all([queue(ca, opts(400, 'Ana')), queue(cb, opts(460, 'Beto'))]);
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
    const qa = await ca.joinOrCreate('queue', opts(0, 'Novato'));
    const qb = await cb.joinOrCreate('queue', opts(3000, 'Experto'));
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
    const { room } = await queue(client, opts(10));
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
    const { room } = await queue(client, opts(20));
    const p = new Player(room);
    await until(() => p.ticks.length > 30, 5000, 'partida en marcha');
    const intruder = new Client(endpoint);
    await expect(intruder.joinById(room.roomId, opts(20, 'Intruso'))).rejects.toThrow();

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
    const ra = await ca.create('match', { ...opts(100, 'Host'), mode: 'friendly' });
    const a = new Player(ra);
    await until(() => !!a.code, 2000, 'código');
    const r = await fetch(`${http}/api/friendly/${a.code}`);
    const { roomId } = (await r.json()) as { roomId: string };
    expect(roomId).toBe(ra.roomId);
    expect((await fetch(`${http}/api/friendly/ZZZZZ`)).status).toBe(404);
    const b = new Player(await cb.joinById(roomId, opts(900, 'Invitado')));
    await until(() => !!a.start && !!b.start, 3000, 'inicio amistosa');
    expect(a.start!.mode).toBe('friendly');
    expect(a.start!.players.red.name).toBe('Invitado');
    b.room.send('surrender');
    await until(() => a.ends.length > 0, 4000, 'fin');
  });

  it('reconexión: tras cortarse, el jugador vuelve y se pone al día', async () => {
    const client = new Client(endpoint);
    const { room } = await queue(client, opts(30));
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
