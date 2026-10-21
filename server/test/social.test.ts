import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'colyseus.js';
import { CHAT, CLAN, STARTER_DECK, getCard, type ClanChatMessage, type ClanRoomEvent } from '@arena/shared';
import { startServer, type RunningServer } from '../src/app';
import { MemoryStore } from '../src/store/memory';
import { ctx } from '../src/context';

let server: RunningServer;
let http: string;
let ws: string;

beforeAll(async () => {
  server = await startServer({ port: 0, store: new MemoryStore(), rateLimits: false, seasonJob: false });
  http = `http://localhost:${server.port}`;
  ws = `ws://localhost:${server.port}`;
});

afterAll(async () => {
  await server.close();
});

interface Me {
  token: string;
  id: string;
}

async function api<T = Record<string, unknown>>(
  path: string,
  token?: string,
  body?: unknown,
): Promise<{ status: number; json: T & { error?: string } }> {
  const r = await fetch(`${http}/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, json: (await r.json()) as T & { error?: string } };
}

async function player(name: string, trophies = 500, gold = 5000): Promise<Me> {
  const { json } = await api<{ token: string; account: { id: string } }>('/auth/guest', undefined, {});
  await server.store.mutate(json.account.id, (s) => {
    s.name = name;
    s.trophies = trophies;
    s.gold = gold;
  });
  return { token: json.token, id: json.account.id };
}

interface Social {
  code: string;
  friends: Array<{ accountId: string; online: boolean }>;
  incoming: Array<{ accountId: string }>;
  outgoing: Array<{ accountId: string }>;
  invites: Array<{ id: string; code: string; from: { accountId: string } }>;
  clan: { id: string; role: string; members: number } | null;
}
const social = async (p: Me) => (await api<Social>('/social', p.token)).json;

const common = STARTER_DECK.find((k) => getCard(k).rarity === 'common')!;

describe('amigos', () => {
  it('añadir por código, aceptar, ver conectados, ranking de amigos y quitar', async () => {
    const a = await player('Ana', 800),
      b = await player('Beto', 300);
    const codeB = (await social(b)).code;
    expect(codeB).toMatch(/^[A-Z2-9]{8}$/);
    expect((await api('/friends/add', a.token, { code: 'ZZZZZZZZ' })).json.error).toBe('err.friends.notFound');
    expect((await api('/friends/add', a.token, { code: (await social(a)).code })).json.error).toBe('err.friends.self');
    expect((await api('/friends/add', a.token, { code: `#${codeB.toLowerCase()}` })).json).toEqual({ status: 'sent' });
    expect((await api('/friends/add', a.token, { code: codeB })).json.error).toBe('err.friends.pending');
    expect((await social(a)).outgoing.map((f) => f.accountId)).toEqual([b.id]);
    expect((await social(b)).incoming.map((f) => f.accountId)).toEqual([a.id]);

    expect((await api('/friends/accept', b.token, { accountId: a.id })).status).toBe(200);
    const sa = await social(a);
    expect(sa.friends).toEqual([expect.objectContaining({ accountId: b.id, online: true })]);

    const board = (
      await api<{ entries: Array<{ rank: number; accountId: string }> }>('/leaderboard?scope=friends', b.token)
    ).json;
    expect(board.entries.map((e) => [e.rank, e.accountId])).toEqual([
      [1, a.id],
      [2, b.id],
    ]);

    await api('/friends/remove', b.token, { accountId: a.id });
    expect((await social(a)).friends).toEqual([]);
  });

  it('si los dos se piden amistad, la segunda petición la acepta', async () => {
    const a = await player('Cris'),
      b = await player('Dani');
    await api('/friends/add', a.token, { code: (await social(b)).code });
    expect((await api('/friends/add', b.token, { code: (await social(a)).code })).json).toEqual({ status: 'accepted' });
    expect((await social(b)).friends.length).toBe(1);
  });

  it('invitar a una amistosa: solo a amigos y con una sala que exista', async () => {
    const a = await player('Eva'),
      b = await player('Fran'),
      c = await player('Gus');
    await api('/friends/add', a.token, { code: (await social(b)).code });
    await api('/friends/accept', b.token, { accountId: a.id });
    expect((await api('/friends/invite', a.token, { accountId: b.id, code: 'ABCDE' })).json.error).toBe(
      'err.friendly.notFound',
    );
    ctx.friendly.set('ABCDE', 'room-x'); // sala amistosa simulada
    expect((await api('/friends/invite', a.token, { accountId: c.id, code: 'ABCDE' })).json.error).toBe(
      'err.friends.notFriend',
    );
    expect((await api('/friends/invite', a.token, { accountId: b.id, code: 'abcde' })).status).toBe(200);
    const inv = (await social(b)).invites;
    expect(inv).toEqual([
      expect.objectContaining({ code: 'ABCDE', from: expect.objectContaining({ accountId: a.id }) }),
    ]);
    await api('/friends/invite/dismiss', b.token, { id: inv[0].id });
    expect((await social(b)).invites).toEqual([]);
    ctx.friendly.delete('ABCDE');
  });
});

describe('clanes', () => {
  it('crear (cuesta oro, nombre único y sin palabrotas), buscar y unirse', async () => {
    const lead = await player('Líder', 900, CLAN.createCost + 10);
    expect((await api('/clans', lead.token, { name: 'puta madre' })).json.error).toBe('err.clan.name');
    const r = await api<{ clan: { id: string }; account: { state: { gold: number } } }>('/clans', lead.token, {
      name: 'Los Ases',
      description: 'Clan de prueba',
      minTrophies: 400,
    });
    expect(r.status).toBe(200);
    expect(r.json.account.state.gold).toBe(10);
    expect((await api('/clans', lead.token, { name: 'Otro' })).json.error).toBe('err.clan.already');
    const other = await player('Otro', 100, 5000);
    expect((await api('/clans', other.token, { name: 'los ases' })).json.error).toBe('err.clan.nameTaken');
    const poor = await player('Pobre', 100, 10);
    expect((await api('/clans', poor.token, { name: 'Sin Oro' })).json.error).toBe('econ.noGold');

    const found = (await api<{ clans: Array<{ id: string; members: number }> }>('/clans?q=ases')).json.clans;
    expect(found).toEqual([expect.objectContaining({ id: r.json.clan.id, members: 1 })]);
    expect((await api('/clan/join', other.token, { clanId: r.json.clan.id })).json.error).toBe('err.clan.trophies');
    const ok = await player('Bueno', 450);
    expect((await api('/clan/join', ok.token, { clanId: r.json.clan.id })).status).toBe(200);
    expect((await social(ok)).clan).toMatchObject({ id: r.json.clan.id, role: 'member', members: 2 });
  });

  it('roles, expulsar, ceder el liderazgo y heredar al salir', async () => {
    const lead = await player('Jefa', 500);
    const clanId = (await api<{ clan: { id: string } }>('/clans', lead.token, { name: 'Roles' })).json.clan.id;
    const a = await player('Ani', 500),
      b = await player('Bea', 500);
    await api('/clan/join', a.token, { clanId });
    await api('/clan/join', b.token, { clanId });
    expect((await api('/clan/kick', a.token, { accountId: b.id })).json.error).toBe('err.clan.rank');
    expect((await api('/clan/role', lead.token, { accountId: a.id, role: 'elder' })).status).toBe(200);
    expect((await api('/clan/kick', a.token, { accountId: b.id })).status).toBe(200);
    expect((await social(b)).clan).toBeNull();
    expect((await api('/clan/role', lead.token, { accountId: a.id, role: 'leader' })).status).toBe(200);
    expect((await social(a)).clan?.role).toBe('leader');
    expect((await social(lead)).clan?.role).toBe('coLeader');
    await api('/clan/leave', a.token, {});
    expect((await social(lead)).clan?.role).toBe('leader'); // hereda el de más rango
    await api('/clan/leave', lead.token, {});
    expect((await api('/clans/' + clanId)).json.error).toBe('err.clan.notFound'); // el último cierra el clan
  });

  it('chat en vivo, peticiones y donaciones de cartas, y denuncias', async () => {
    const lead = await player('Sol', 500);
    const clanId = (await api<{ clan: { id: string } }>('/clans', lead.token, { name: 'Chat' })).json.clan.id;
    const mates = [await player('Uno'), await player('Dos'), await player('Tres')];
    for (const m of mates) await api('/clan/join', m.token, { clanId });

    // dos conectados al chat
    const events: ClanRoomEvent[] = [];
    const roomA = await new Client(ws).joinOrCreate('clan', { token: lead.token, clanId });
    roomA.onMessage('event', (e: ClanRoomEvent) => events.push(e));
    const roomB = await new Client(ws).joinOrCreate('clan', { token: mates[0].token, clanId });
    const outsider = await player('Fuera');
    await expect(new Client(ws).joinOrCreate('clan', { token: outsider.token, clanId })).rejects.toThrow();

    const until = async (pred: () => boolean) => {
      for (let i = 0; i < 100 && !pred(); i++) await new Promise((r) => setTimeout(r, 20));
      expect(pred()).toBe(true);
    };
    const msgs = () => events.flatMap((e) => (e.type === 'msg' ? [e.message] : []));
    await until(() => events.some((e) => e.type === 'history'));

    roomB.send('say', '  hola   equipo, sois unos cabrones ');
    await until(() => msgs().some((m) => m.kind === 'text'));
    const said = msgs().find((m) => m.kind === 'text')!;
    expect(said).toMatchObject({ name: 'Uno', body: 'hola equipo, sois unos ********' });

    // demasiados mensajes seguidos
    for (let i = 0; i < CHAT.burst + 2; i++) roomB.send('say', `spam ${i}`);
    await new Promise((r) => setTimeout(r, 200));
    expect(msgs().filter((m) => m.body.startsWith('spam')).length).toBeLessThan(CHAT.burst + 2);

    // petición de cartas
    const rq = await api<{ message: ClanChatMessage }>('/clan/request', lead.token, { card: common });
    expect(rq.status).toBe(200);
    expect((await api('/clan/request', lead.token, { card: common })).json.error).toBe('err.clan.cooldown');
    await until(() => msgs().some((m) => m.kind === 'request'));

    // donación: mueve la carta y paga al donante
    await server.store.mutate(mates[1].id, (s) => {
      s.cards[common].count = 5;
    });
    const before = (await server.store.getAccount(lead.id))!.state.cards[common].count;
    const d = await api<{ result: { gold: number }; message: ClanChatMessage; account: { state: { gold: number } } }>(
      '/clan/donate',
      mates[1].token,
      { messageId: rq.json.message.id },
    );
    expect(d.status).toBe(200);
    expect(d.json.result.gold).toBe(5);
    expect(d.json.message).toMatchObject({ got: 1, donors: { [mates[1].id]: 1 } });
    expect((await server.store.getAccount(lead.id))!.state.cards[common].count).toBe(before + 1);
    expect((await api('/clan/donate', lead.token, { messageId: rq.json.message.id })).json.error).toBe(
      'err.clan.ownRequest',
    );
    expect((await api('/clan/donate', outsider.token, { messageId: rq.json.message.id })).json.error).toBe(
      'err.clan.notMember',
    );
    await until(() => events.some((e) => e.type === 'update' && e.message.got === 1));

    // denuncias: con 3 se oculta el mensaje y se silencia al autor
    expect((await api('/social/report', mates[0].token, { messageId: said.id })).json.error).toBe('err.report.self');
    for (const p of [lead, mates[1], mates[2]]) {
      expect((await api('/social/report', p.token, { messageId: said.id, reason: 'insult' })).status).toBe(200);
    }
    expect((await api('/social/report', lead.token, { messageId: said.id })).json.error).toBe('err.report.dupe');
    await until(() => events.some((e) => e.type === 'update' && e.message.id === said.id && e.message.hidden));
    const errs: string[] = [];
    roomB.onMessage('event', (e: ClanRoomEvent) => e.type === 'error' && errs.push(e.code));
    await new Promise((r) => setTimeout(r, CHAT.minGapMs + 50));
    roomB.send('say', 'sigo aquí');
    await until(() => errs.includes('err.chat.muted'));

    await roomA.leave();
    await roomB.leave();
  });
});
