import { Room, matchMaker, type Client } from '@colyseus/core';
import { CHAT, CLAN, cleanChat, type ClanChatMessage, type ClanRoomEvent } from '@arena/shared';
import { verifySession } from '../auth';
import { store } from '../context';
import type { ClanMessageRow } from '../store/types';

/** Lo que ve el cliente de un mensaje (los ocultos van sin texto). */
export const chatView = (m: ClanMessageRow): ClanChatMessage => ({
  id: m.id,
  accountId: m.accountId,
  name: m.name,
  kind: m.kind,
  body: m.hidden ? '' : m.body,
  card: m.card,
  want: m.want,
  got: m.got,
  donors: m.donors,
  hidden: m.hidden,
  at: +m.createdAt,
});

/** Aviso del sistema en el chat (el cliente lo traduce). */
export const systemBody = (k: string, params: Record<string, string | number> = {}): string =>
  JSON.stringify({ k, ...params });

interface Seat {
  accountId: string;
  name: string;
}

/**
 * Sala de chat de un clan (una por clan: filterBy clanId). Los mensajes se guardan en la
 * base de datos; las peticiones, donaciones y cambios de miembros llegan por la API HTTP
 * y se reenvían aquí con `toClan`.
 */
export class ClanRoom extends Room {
  private clanId = '';
  /** Últimos envíos de cada jugador (límite de mensajes). */
  private sent = new Map<string, number[]>();

  override async onAuth(_client: Client, options: { token?: string; clanId?: string }): Promise<Seat> {
    const s = await verifySession(options?.token);
    if (!s) throw new Error('err.session');
    const m = await store().memberOf(s.accountId);
    if (!m || m.clanId !== options.clanId) throw new Error('err.clan.notMember');
    const acc = await store().getAccount(s.accountId);
    return { accountId: s.accountId, name: acc?.state.name ?? '?' };
  }

  override onCreate(options: { clanId: string }): void {
    this.clanId = options.clanId;
    this.autoDispose = true;
    this.onMessage('say', (client, text: unknown) => void this.say(client, text));
  }

  override async onJoin(client: Client): Promise<void> {
    const rows = await store().messages(this.clanId, CLAN.history);
    send(client, { type: 'history', messages: rows.map(chatView) });
  }

  override onLeave(client: Client): void {
    this.sent.delete(client.sessionId);
  }

  private async say(client: Client, raw: unknown): Promise<void> {
    const seat = client.auth as Seat;
    const now = Date.now();
    const times = (this.sent.get(client.sessionId) ?? []).filter((t) => now - t < CHAT.windowMs);
    if (times.length >= CHAT.burst || (times.length && now - times[times.length - 1] < CHAT.minGapMs))
      return send(client, { type: 'error', code: 'err.chat.slow' });
    const text = cleanChat(raw);
    if (!text) return;
    const muted = await store().mutedUntil(seat.accountId);
    if (muted && muted.getTime() > now) return send(client, { type: 'error', code: 'err.chat.muted' });
    // por si le echaron del clan entre medias
    const m = await store().memberOf(seat.accountId);
    if (!m || m.clanId !== this.clanId) return void client.leave(4003);
    times.push(now);
    this.sent.set(client.sessionId, times);
    // el nombre actual (puede haberlo cambiado)
    const acc = await store().getAccount(seat.accountId);
    const row = await store().addMessage({
      clanId: this.clanId,
      accountId: seat.accountId,
      name: acc?.state.name ?? seat.name,
      kind: 'text',
      body: text,
    });
    this.broadcast('event', { type: 'msg', message: chatView(row) } satisfies ClanRoomEvent);
  }

  // ── Llamadas desde la API (matchMaker.remoteRoomCall) ──

  push(ev: ClanRoomEvent): void {
    this.broadcast('event', ev);
  }

  /** Echa de la sala a un jugador (salió del clan o lo expulsaron). */
  drop(accountId: string): void {
    for (const c of this.clients) if ((c.auth as Seat | undefined)?.accountId === accountId) c.leave(4003);
  }
}

const send = (client: Client, ev: ClanRoomEvent): void => client.send('event', ev);

/** Envía un evento a la sala de chat de un clan (si hay alguien conectado). */
export async function toClan(clanId: string, ev: ClanRoomEvent, drop?: string): Promise<void> {
  try {
    const rooms = await matchMaker.query({ name: 'clan', clanId });
    for (const r of rooms) {
      await matchMaker.remoteRoomCall(r.roomId, 'push', [ev]);
      if (drop) await matchMaker.remoteRoomCall(r.roomId, 'drop', [drop]);
    }
  } catch (e) {
    console.error('[clan] no se pudo avisar a la sala', e);
  }
}
