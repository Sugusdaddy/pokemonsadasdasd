import { Room, matchMaker, type Client } from '@colyseus/core';
import {
  PROTOCOL_VERSION,
  QUEUE_KINDS,
  challengeOfDay,
  rulesOf,
  trophyWindow,
  type ClientJoin,
  type MatchMode,
  type MatchedMsg,
  type QueueKind,
  type QueueStatusMsg,
  type RuleSet,
} from '@arena/shared';
import { ctx, settings, store } from '../context';
import { authAccount, type MatchRoomOptions, type SeatAuth } from './MatchRoom';
import { reportError } from '../sentry';

interface Waiting {
  client: Client;
  auth: SeatAuth;
  since: number;
  busy: boolean;
  queue: QueueKind;
  /** Solo se emparejan los que tienen la misma clave (modo + desafío del día o torneo). */
  key: string;
  /** Reglas de la partida (desafío o torneo). */
  rules: RuleSet;
  tournamentId?: string;
}

/**
 * Colas de emparejamiento. Cada medio segundo intenta emparejar a quien más lleva
 * esperando:
 *  - clasificatoria: con el rival más cercano en trofeos dentro de su ventana, que se amplía
 *    con la espera; si nadie encaja en QUEUE_BOT_AFTER_MS, contra un bot;
 *  - draft y desafío del día: con el siguiente que espere en la misma cola (o un bot);
 *  - torneo: solo con otro jugador del mismo torneo (nunca con bots);
 *  - 2v2: grupos de 4; si tardan, los que haya y bots en los sitios libres.
 */
export class QueueRoom extends Room {
  private waiting = new Map<string, Waiting>();

  override onCreate(): void {
    this.maxClients = 5000;
    this.clock.setInterval(() => void this.matchmake(), 500);
  }

  override async onAuth(_client: Client, options: ClientJoin): Promise<Omit<Waiting, 'client' | 'since' | 'busy'>> {
    if (options?.protocol !== undefined && options.protocol !== PROTOCOL_VERSION) throw new Error('err.version');
    if (ctx.draining) throw new Error('err.server.restarting');
    const auth = await authAccount(options?.token);
    // una cuenta solo puede estar una vez en la cola
    for (const w of this.waiting.values()) if (w.auth.accountId === auth.accountId) throw new Error('err.queue.twice');
    const queue: QueueKind = QUEUE_KINDS.includes(options?.queue as QueueKind)
      ? (options.queue as QueueKind)
      : 'ranked';
    if (queue === 'ranked') return { auth, queue, key: 'ranked', rules: 'classic' };
    if (queue === 'draft') return { auth, queue, key: 'draft', rules: 'draft' };
    if (queue === '2v2') return { auth, queue, key: '2v2', rules: 'classic' };
    if (queue === 'challenge') {
      const c = challengeOfDay(Date.now());
      const run = (await store().getAccount(auth.accountId))?.state.challenge;
      if (!run || !run.active || run.period !== c.period) throw new Error('err.challenge.notStarted');
      return { auth, queue, key: `challenge:${c.period}`, rules: c.rules };
    }
    const id = String(options?.tournamentId ?? '');
    const t = id ? await store().getTournament(id) : null;
    if (!t) throw new Error('err.tournament.notFound');
    if (Date.now() >= +t.endsAt) throw new Error('err.tournament.ended');
    if (!(await store().tournamentPlayers(id)).some((p) => p.accountId === auth.accountId))
      throw new Error('err.tournament.notIn');
    return { auth, queue, key: `t:${id}`, rules: t.rules, tournamentId: id };
  }

  override onJoin(client: Client, _options: ClientJoin, w: Omit<Waiting, 'client' | 'since' | 'busy'>): void {
    this.waiting.set(client.sessionId, { ...w, client, since: Date.now(), busy: false });
  }

  /** El servidor se apaga: se avisa a quien espera para que vuelva a la cola (ya en el servidor nuevo). */
  override onBeforeShutdown(): void {
    this.broadcast('restart');
    void this.disconnect();
  }

  override onLeave(client: Client): void {
    this.waiting.delete(client.sessionId);
  }

  private async matchmake(): Promise<void> {
    if (ctx.draining) return;
    const now = Date.now();
    const list = [...this.waiting.values()].filter((w) => !w.busy).sort((a, b) => a.since - b.since);
    const used = new Set<Waiting>();
    // 2v2: en cuanto hay cuatro, o cuando el primero lleva esperando el tiempo de los bots
    const pairs = list.filter((w) => w.queue === '2v2');
    while (pairs.length >= 4 || (pairs.length && now - pairs[0].since >= settings().queueBotAfterMs)) {
      const group = pairs.splice(0, 4);
      group.forEach((g) => used.add(g));
      void this.createMatch(group, group.length < 4);
    }
    for (const a of list) {
      if (used.has(a) || a.queue === '2v2') continue;
      let best: Waiting | null = null;
      if (a.queue === 'ranked') {
        const winA = trophyWindow(now - a.since);
        for (const b of list) {
          if (b === a || used.has(b) || b.key !== a.key) continue;
          const diff = Math.abs(a.auth.join.trophies - b.auth.join.trophies);
          if (diff > Math.min(winA, trophyWindow(now - b.since))) continue;
          if (!best || diff < Math.abs(a.auth.join.trophies - best.auth.join.trophies)) best = b;
        }
      } else best = list.find((b) => b !== a && !used.has(b) && b.key === a.key) ?? null;
      if (best) {
        used.add(a).add(best);
        void this.createMatch([a, best], false);
      } else if (a.queue !== 'tournament' && now - a.since >= settings().queueBotAfterMs) {
        used.add(a);
        void this.createMatch([a], true);
      }
    }
    for (const w of this.waiting.values()) {
      if (w.busy || used.has(w)) continue;
      const msg: QueueStatusMsg = { waitedMs: now - w.since, window: trophyWindow(now - w.since) };
      w.client.send('queue', msg);
    }
  }

  private async createMatch(players: Waiting[], vsBot: boolean): Promise<void> {
    const w = players[0];
    const mode: MatchMode = w.queue === 'ranked' ? (vsBot ? 'bot' : 'ranked') : w.queue;
    players.forEach((p) => (p.busy = true));
    try {
      const { rules, draft } = rulesOf(w.rules);
      const team = w.queue === '2v2';
      const options: MatchRoomOptions = {
        mode,
        rules,
        draft,
        vsBot: team ? false : vsBot,
        // 2v2: cuando entren los reservados, bots en el resto
        ...(team ? { teamSize: 2 as const, humans: players.length } : {}),
        tournamentId: w.tournamentId,
        challengePeriod: w.queue === 'challenge' ? w.key.slice('challenge:'.length) : undefined,
      };
      const room = await matchMaker.createRoom('match', options);
      for (const p of players) {
        if (!this.waiting.has(p.client.sessionId)) continue; // se fue mientras tanto
        // la cuenta ya está comprobada: se pasa como datos de autenticación del sitio reservado
        const reservation = await matchMaker.reserveSeatFor(room, {}, p.auth);
        const msg: MatchedMsg = { reservation, mode };
        p.client.send('matched', msg);
        this.waiting.delete(p.client.sessionId);
      }
    } catch (err) {
      console.error('[queue] no se pudo crear la partida', err);
      reportError(err, 'queue');
      players.forEach((p) => (p.busy = false));
    }
  }
}
