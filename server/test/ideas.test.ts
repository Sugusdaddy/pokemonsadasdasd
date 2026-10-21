import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { IDEAS, type IdeaView } from '@arena/shared';
import { startServer, type RunningServer } from '../src/app';
import { MemoryStore } from '../src/store/memory';
import { IDEA_MIN_BATTLES } from '../src/routes/ideas';

let server: RunningServer;
let http: string;
const ADMIN_WALLET = bs58.encode(nacl.sign.keyPair().publicKey);

beforeAll(async () => {
  server = await startServer({
    port: 0,
    store: new MemoryStore(),
    rateLimits: false,
    seasonJob: false,
    adminWallets: [ADMIN_WALLET],
  });
  http = `http://localhost:${server.port}`;
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

async function player(name: string, battles = IDEA_MIN_BATTLES): Promise<Me> {
  const { json } = await api<{ token: string; account: { id: string } }>('/auth/guest', undefined, {});
  await server.store.mutate(json.account.id, (s) => {
    s.name = name;
    s.stats.battles = battles;
  });
  return { token: json.token, id: json.account.id };
}

type IdeaList = { ideas: IdeaView[]; total: number; left: number | null; canPropose: boolean };
const propose = (p: Me, title: string, extra: object = {}) =>
  api<{ idea: IdeaView }>('/ideas', p.token, { title, body: 'Detalles de la idea', category: 'cards', ...extra });

describe('buzón de ideas', () => {
  it('proponer: hace falta haber jugado, título limpio y como mucho 3 al día', async () => {
    const nuevo = await player('Nuevo', 0);
    expect((await propose(nuevo, 'Una carta de Mewtwo')).json.error).toBe('err.idea.newPlayer');
    const p = await player('Ideas');
    expect((await propose(p, 'corto')).json.error).toBe('err.idea.title');
    expect((await propose(p, 'Quitad la mierda de bot')).json.error).toBe('err.idea.language');
    const ok = await propose(p, 'Una carta de Mewtwo', { body: 'que sea legendaria, joder', category: 'nope' });
    expect(ok.status).toBe(200);
    expect(ok.json.idea).toMatchObject({ title: 'Una carta de Mewtwo', category: 'other', mine: true, votes: 0 });
    expect(ok.json.idea.body).toBe('que sea legendaria, *****');
    for (let i = 1; i < IDEAS.perDay; i++) expect((await propose(p, `Otra idea número ${i}`)).status).toBe(200);
    expect((await propose(p, 'Una idea de más')).json.error).toBe('err.idea.limit');
    const mine = (await api<IdeaList>('/ideas?mine=1', p.token)).json;
    expect(mine.total).toBe(IDEAS.perDay);
    expect(mine.left).toBe(0);
  });

  it('votar: uno por cuenta, se puede quitar, no a las tuyas, y ordena por votos', async () => {
    const autor = await player('Autor');
    const a = (await propose(autor, 'Modo 2 contra 2')).json.idea;
    const b = (await propose(autor, 'Tienda de emotes')).json.idea;
    const fans = [await player('F1'), await player('F2')];
    expect((await api(`/ideas/${a.id}/vote`, autor.token, {})).json.error).toBe('err.idea.own');
    for (const f of fans) expect((await api(`/ideas/${b.id}/vote`, f.token, {})).json).toMatchObject({ voted: true });
    expect((await api(`/ideas/${b.id}/vote`, fans[0].token, {})).json).toEqual({ voted: false, votes: 1 });
    await api(`/ideas/${b.id}/vote`, fans[0].token, {});
    const top = (await api<IdeaList>('/ideas?sort=top', fans[0].token)).json.ideas;
    const ib = top.findIndex((i) => i.id === b.id),
      ia = top.findIndex((i) => i.id === a.id);
    expect(ib).toBeLessThan(ia);
    expect(top[ib]).toMatchObject({ votes: 2, voted: true, mine: false });
    // borrar la tuya
    expect((await api(`/ideas/${a.id}/delete`, fans[0].token, {})).json.error).toBe('err.idea.notFound');
    expect((await api(`/ideas/${a.id}/delete`, autor.token, {})).status).toBe(200);
  });
});

describe('admin', () => {
  let admin: Me;
  beforeAll(async () => {
    admin = await player('Admin');
    await server.store.linkWallet(ADMIN_WALLET, admin.id);
  });

  it('solo entran las wallets de ADMIN_WALLETS', async () => {
    const normal = await player('Normal');
    expect((await api('/admin/stats')).status).toBe(401);
    expect((await api('/admin/stats', normal.token)).status).toBe(403);
    expect((await api('/me', normal.token)).json.account).toMatchObject({ admin: false });
    expect((await api('/me', admin.token)).json.account).toMatchObject({ admin: true });
    const st = await api<{ accounts: number }>('/admin/stats', admin.token);
    expect(st.status).toBe(200);
    expect(st.json.accounts).toBeGreaterThan(1);
  });

  it('ideas: cambiar estado, responder y ocultar (y queda en el registro)', async () => {
    const p = await player('Propone');
    const voter = await player('Vota');
    const idea = (await propose(p, 'Más arenas nuevas')).json.idea;
    const up = await api<{ idea: IdeaView }>(`/admin/ideas/${idea.id}`, admin.token, {
      status: 'planned',
      reply: 'Para la temporada que viene',
    });
    expect(up.json.idea).toMatchObject({ status: 'planned', reply: 'Para la temporada que viene' });
    expect((await api(`/ideas/${idea.id}/vote`, voter.token, {})).json.error).toBe('err.idea.closed');
    expect((await api(`/admin/ideas/${idea.id}`, admin.token, { status: 'nope' })).json.error).toBe('err.admin.status');
    const planned = (await api<IdeaList>('/ideas?status=planned')).json.ideas;
    expect(planned.map((i) => i.id)).toContain(idea.id);

    await api(`/admin/ideas/${idea.id}`, admin.token, { hidden: true });
    expect((await api<IdeaList>('/ideas?status=all')).json.ideas.map((i) => i.id)).not.toContain(idea.id);
    const seen = (await api<IdeaList>('/ideas?status=all', admin.token)).json.ideas.find((i) => i.id === idea.id);
    expect(seen?.hidden).toBe(true);

    const log = (
      await api<{ log: Array<{ action: string; target: string; adminName: string }> }>('/admin/log', admin.token)
    ).json.log;
    expect(log[0]).toMatchObject({ action: 'idea.update', target: idea.id, adminName: 'Admin' });
  });

  it('denuncias: castigar oculta el mensaje y silencia al autor; buscar jugadores, silenciar y renombrar', async () => {
    const lead = await player('Lider');
    await server.store.mutate(lead.id, (s) => void (s.gold = 5000));
    const clanId = (await api<{ clan: { id: string } }>('/clans', lead.token, { name: 'Moderados' })).json.clan.id;
    const troll = await player('Trol');
    await api('/clan/join', troll.token, { clanId });
    const msg = await server.store.addMessage({
      clanId,
      accountId: troll.id,
      name: 'Trol',
      kind: 'text',
      body: 'spam spam',
    });
    expect((await api('/social/report', lead.token, { messageId: msg.id, reason: 'spam' })).status).toBe(200);

    const reports = (
      await api<{ reports: Array<{ messageId: string; count: number; targetName: string; reasons: object }> }>(
        '/admin/reports',
        admin.token,
      )
    ).json.reports;
    expect(reports.find((g) => g.messageId === msg.id)).toMatchObject({
      count: 1,
      targetName: 'Trol',
      reasons: { spam: 1 },
    });

    expect(
      (await api('/admin/reports/resolve', admin.token, { messageId: msg.id, action: 'punish', muteHours: 5 })).json
        .error,
    ).toBe('err.admin.hours');
    expect(
      (await api('/admin/reports/resolve', admin.token, { messageId: msg.id, action: 'punish', muteHours: 24 })).status,
    ).toBe(200);
    expect((await server.store.getMessage(msg.id))?.hidden).toBe(true);
    expect(+(await server.store.mutedUntil(troll.id))!).toBeGreaterThan(Date.now() + 23 * 3600_000);
    expect(
      (await api<{ reports: Array<{ messageId: string }> }>('/admin/reports', admin.token)).json.reports.some(
        (g) => g.messageId === msg.id,
      ),
    ).toBe(false);

    type Players = {
      players: Array<{ accountId: string; mutedUntil: number | null; reports: number; clan: string | null }>;
    };
    const found = (await api<Players>('/admin/players?q=trol', admin.token)).json.players;
    expect(found).toEqual([expect.objectContaining({ accountId: troll.id, clan: 'Moderados', reports: 1 })]);
    expect(found[0].mutedUntil).not.toBeNull();
    await api('/admin/players/mute', admin.token, { accountId: troll.id, hours: 0 });
    expect(await server.store.mutedUntil(troll.id)).toBeNull();

    await api('/admin/players/rename', admin.token, { accountId: troll.id });
    expect((await server.store.getAccount(troll.id))!.state.name).not.toBe('Trol');
    const actions = (await api<{ log: Array<{ action: string }> }>('/admin/log', admin.token)).json.log.map(
      (l) => l.action,
    );
    expect(actions.slice(0, 3)).toEqual(['player.rename', 'player.unmute', 'report.punish']);
  });
});
