import { Room, matchMaker, type Client } from '@colyseus/core';
import {
  PROTOCOL_VERSION,
  trophyWindow,
  validateJoin,
  type JoinOptions,
  type MatchMode,
  type MatchedMsg,
  type QueueStatusMsg,
} from '@arena/shared';
import { newTicket, settings } from '../context';
import type { MatchRoomOptions } from './MatchRoom';

interface Waiting {
  client: Client;
  join: JoinOptions;
  since: number;
  busy: boolean;
}

/**
 * Cola de emparejamiento por trofeos. Cada medio segundo intenta emparejar a quien
 * más lleva esperando con el rival más cercano dentro de su ventana, que se amplía
 * con la espera. Si nadie encaja en QUEUE_BOT_AFTER_MS, le crea una partida contra un bot.
 */
export class QueueRoom extends Room {
  private waiting = new Map<string, Waiting>();

  override onCreate(): void {
    this.maxClients = 5000;
    this.clock.setInterval(() => void this.matchmake(), 500);
  }

  override onAuth(_client: Client, options: Partial<JoinOptions>): boolean {
    if (options?.protocol !== undefined && options.protocol !== PROTOCOL_VERSION) throw new Error('err.version');
    const err = validateJoin(options);
    if (err) throw new Error(err);
    return true;
  }

  override onJoin(client: Client, options: JoinOptions): void {
    this.waiting.set(client.sessionId, { client, join: options, since: Date.now(), busy: false });
  }

  override onLeave(client: Client): void {
    this.waiting.delete(client.sessionId);
  }

  private async matchmake(): Promise<void> {
    const now = Date.now();
    const list = [...this.waiting.values()].filter((w) => !w.busy).sort((a, b) => a.since - b.since);
    const used = new Set<Waiting>();
    for (const a of list) {
      if (used.has(a)) continue;
      const winA = trophyWindow(now - a.since);
      let best: Waiting | null = null;
      for (const b of list) {
        if (b === a || used.has(b)) continue;
        const diff = Math.abs(a.join.trophies - b.join.trophies);
        if (diff > Math.min(winA, trophyWindow(now - b.since))) continue;
        if (!best || diff < Math.abs(a.join.trophies - best.join.trophies)) best = b;
      }
      if (best) {
        used.add(a).add(best);
        void this.createMatch('ranked', [a, best]);
      } else if (now - a.since >= settings().queueBotAfterMs) {
        used.add(a);
        void this.createMatch('bot', [a]);
      }
    }
    for (const w of this.waiting.values()) {
      if (w.busy || used.has(w)) continue;
      const msg: QueueStatusMsg = { waitedMs: now - w.since, window: trophyWindow(now - w.since) };
      w.client.send('queue', msg);
    }
  }

  private async createMatch(mode: MatchMode, players: Waiting[]): Promise<void> {
    players.forEach((p) => (p.busy = true));
    try {
      const tickets = players.map(() => newTicket());
      const options: MatchRoomOptions = { mode, tickets };
      const room = await matchMaker.createRoom('match', options);
      for (let i = 0; i < players.length; i++) {
        const p = players[i];
        if (!this.waiting.has(p.client.sessionId)) continue; // se fue mientras tanto
        const reservation = await matchMaker.reserveSeatFor(room, { ...p.join, ticket: tickets[i] });
        const msg: MatchedMsg = { reservation, mode };
        p.client.send('matched', msg);
        this.waiting.delete(p.client.sessionId);
      }
    } catch (err) {
      console.error('[queue] no se pudo crear la partida', err);
      players.forEach((p) => (p.busy = false));
    }
  }
}
