import crypto from 'node:crypto';
import { Room, type Client } from '@colyseus/core';
import {
  DT,
  HASH_EVERY,
  INPUT_DELAY_TICKS,
  PLAY_RATE,
  EMOTE_COOLDOWN_MS,
  PROTOCOL_VERSION,
  PLAYER_EMOTES,
  MAX_TICKS,
  Match,
  makeBots,
  makeOpponent,
  arenaFor,
  startLevel,
  getCard,
  validateJoin,
  parsePlay,
  other,
  type Bot,
  type Input,
  type JoinOptions,
  type MatchMode,
  type MatchSetup,
  type PlayerInfo,
  type Team,
  type StartMsg,
  type CatchupMsg,
  type TickMsg,
  type RejectMsg,
  type EndMsg,
  type EmoteMsg,
} from '@arena/shared';
import { ctx, newFriendlyCode, settings } from '../context';
import { ReplayStore } from '../replays';

export interface MatchRoomOptions {
  mode: MatchMode;
  /** Partidas igualadas: solo pueden entrar como jugadores quienes traigan uno de estos tickets. */
  tickets?: string[];
}

interface Seat {
  team: Team;
  join: JoinOptions;
  info: PlayerInfo;
  client: Client | null;
  /** Cubo de fichas para limitar el ritmo de cartas. */
  tokens: number;
  lastRefill: number;
  lastEmote: number;
}

type JoinPayload = Partial<JoinOptions> & { ticket?: string };

/**
 * Sala de una partida. El servidor es la autoridad: ejecuta Match, valida cada
 * carta (mano, elixir, zona y ritmo), la programa INPUT_DELAY_TICKS después y
 * reenvía a todos los inputs de cada tick. Guarda la repetición al terminar.
 */
export class MatchRoom extends Room {
  mode: MatchMode = 'ranked';
  code: string | null = null;
  match: Match | null = null;
  private tickets = new Set<string>();
  private seats = new Map<Team, Seat>();
  private bySession = new Map<string, Team>();
  private spectators = new Set<string>();
  private bots: Bot[] = [];
  private scheduled = new Map<number, Input[]>();
  private startAt = 0;
  private finished = false;
  private fillTimer: { clear(): void } | null = null;

  override onCreate(options: MatchRoomOptions): void {
    this.mode = options.mode ?? 'ranked';
    this.maxClients = 2 + 30; // jugadores + espectadores
    for (const t of options.tickets ?? []) this.tickets.add(t);
    if (this.mode === 'friendly') {
      this.code = newFriendlyCode();
      ctx.friendly.set(this.code, this.roomId);
      void this.setPrivate(true);
    }
    void this.setMetadata({ mode: this.mode, code: this.code, started: false, players: null });
    this.onMessage('play', (c, m: unknown) => this.onPlay(c, m));
    this.onMessage('emote', (c, m: EmoteMsg) => this.onEmote(c, m));
    this.onMessage('surrender', (c) => this.onSurrender(c));
    this.onMessage('resync', (c) => this.sendCatchup(c));
    // en una partida igualada, si el rival no llega, entra un bot
    if (this.mode === 'ranked') {
      this.fillTimer = this.clock.setTimeout(() => this.fillWithBot(), settings().matchFillBotAfterMs);
    }
  }

  override onAuth(_client: Client, options: JoinPayload): boolean {
    if (options?.protocol !== undefined && options.protocol !== PROTOCOL_VERSION) throw new Error('err.version');
    if (options?.spectate) return true;
    const err = validateJoin(options);
    if (err) throw new Error(err);
    if (this.mode === 'ranked' && (!options.ticket || !this.tickets.has(options.ticket)))
      throw new Error('err.room.reserved');
    if (this.seats.size >= 2 || this.match) throw new Error('err.room.full');
    return true;
  }

  override onJoin(client: Client, options: JoinPayload): void {
    if (options.spectate) {
      this.spectators.add(client.sessionId);
      if (this.match) {
        client.send('start', this.startMsg('spectator'));
        this.sendCatchup(client);
      }
      return;
    }
    if (options.ticket) this.tickets.delete(options.ticket);
    const team: Team = this.seats.has('blue') ? 'red' : 'blue';
    const join = options as JoinOptions;
    this.seats.set(team, {
      team,
      join,
      client,
      info: { name: join.name.trim(), trophies: join.trophies, kingLevel: join.kingLevel, bot: false },
      tokens: PLAY_RATE.burst,
      lastRefill: Date.now(),
      lastEmote: 0,
    });
    this.bySession.set(client.sessionId, team);
    if (this.mode === 'friendly' && this.code) client.send('code', { code: this.code });
    if (this.mode === 'bot') this.fillWithBot();
    else if (this.seats.size === 2) this.begin();
  }

  override async onLeave(client: Client, consented: boolean): Promise<void> {
    if (this.spectators.delete(client.sessionId)) return;
    const team = this.bySession.get(client.sessionId);
    if (!team) return;
    const seat = this.seats.get(team)!;
    seat.client = null;
    if (!this.match) {
      // aún no ha empezado: se libera el sitio
      this.seats.delete(team);
      this.bySession.delete(client.sessionId);
      return;
    }
    if (this.finished || this.match.over) return;
    if (consented) {
      this.schedule({ t: 'surrender', team }, 1);
      return;
    }
    try {
      const back = await this.allowReconnection(client, settings().reconnectSeconds);
      seat.client = back;
      back.send('start', this.startMsg(team));
      this.sendCatchup(back);
    } catch {
      // no ha vuelto a tiempo: pierde
      if (!this.match.over) this.schedule({ t: 'surrender', team }, 1);
    }
  }

  override onDispose(): void {
    if (this.code) ctx.friendly.delete(this.code);
  }

  // ───────────────────────── Inicio ─────────────────────────

  private fillWithBot(): void {
    if (this.match || this.seats.size !== 1) return;
    const human = [...this.seats.values()][0];
    const team = other(human.team);
    const avg =
      human.join.deck.reduce(
        (s, k) => s + (human.join.levels[k] ?? startLevel(getCard(k))) - startLevel(getCard(k)) + 1,
        0,
      ) / human.join.deck.length;
    const opp = makeOpponent({
      arena: arenaFor(human.join.trophies),
      trophies: human.join.trophies,
      kingLevel: human.join.kingLevel,
      avgDeckLevel: avg,
    });
    this.seats.set(team, {
      team,
      join: { name: opp.name, trophies: opp.trophies, kingLevel: opp.kingLevel, deck: opp.deck, levels: opp.levels },
      info: { name: opp.name, trophies: opp.trophies, kingLevel: opp.kingLevel, bot: true },
      client: null,
      tokens: 0,
      lastRefill: 0,
      lastEmote: 0,
    });
    this.begin();
  }

  private begin(): void {
    if (this.match) return;
    this.fillTimer?.clear();
    const blue = this.seats.get('blue')!,
      red = this.seats.get('red')!;
    const setup: MatchSetup = {
      seed: crypto.randomInt(0, 2 ** 32),
      arena: arenaFor(Math.min(blue.join.trophies, red.join.trophies)),
      players: {
        blue: { deck: [...blue.join.deck], levels: { ...blue.join.levels }, kingLevel: blue.join.kingLevel },
        red: { deck: [...red.join.deck], levels: { ...red.join.levels }, kingLevel: red.join.kingLevel },
      },
    };
    this.match = new Match(setup);
    this.bots = makeBots(
      setup,
      [...this.seats.values()].filter((s) => s.info.bot).map((s) => s.team),
    );
    this.startAt = Date.now() + settings().matchStartDelayMs;
    void this.setMetadata({
      started: true,
      players: { blue: blue.info, red: red.info },
      startedAt: new Date(this.startAt).toISOString(),
    });
    for (const c of this.clients) {
      const team = this.bySession.get(c.sessionId);
      c.send('start', this.startMsg(team ?? 'spectator'));
    }
    this.clock.setTimeout(() => this.bots.forEach((b) => b.greet()), settings().matchStartDelayMs + 1500);
    this.setSimulationInterval(() => this.pump(), 10);
  }

  private startMsg(you: Team | 'spectator'): StartMsg {
    const m = this.match!;
    return {
      setup: m.setup,
      you,
      players: { blue: this.seats.get('blue')!.info, red: this.seats.get('red')!.info },
      mode: this.mode,
      inputDelay: INPUT_DELAY_TICKS,
      startsIn: Math.max(0, this.startAt - Date.now()),
    };
  }

  private sendCatchup(client: Client): void {
    if (!this.match) return;
    const msg: CatchupMsg = { tick: this.match.tick, inputs: [...this.match.log] };
    client.send('catchup', msg);
  }

  // ───────────────────────── Bucle de 20 Hz ─────────────────────────

  /** Procesa todos los ticks que tocan según el reloj (recupera si el proceso se retrasa). */
  private pump(): void {
    const m = this.match;
    if (!m || this.finished) return;
    const due = Math.floor((Date.now() - this.startAt) / (DT * 1000));
    let n = 0;
    while (m.tick < due && !m.over && n++ < 10) this.stepOnce();
    if (m.over || m.tick >= MAX_TICKS) this.finish();
  }

  private stepOnce(): void {
    const m = this.match!;
    const t = m.tick;
    const inputs = this.scheduled.get(t) ?? [];
    this.scheduled.delete(t);
    for (const b of this.bots) inputs.push(...b.update(m));
    const logBefore = m.log.length;
    const events = m.step(inputs);
    this.bots.forEach((b) => b.observe(events));
    const msg: TickMsg = { t };
    if (inputs.length) msg.i = inputs;
    if ((t + 1) % HASH_EVERY === 0) msg.h = m.hash();
    this.broadcast('tick', msg);
    // cartas que eran válidas al recibirlas pero ya no al aplicarlas (p. ej. elixir gastado entretanto)
    const applied = new Set(m.log.slice(logBefore).map((l) => l.input));
    for (const inp of inputs) {
      if (inp.t !== 'play' || applied.has(inp)) continue;
      const seat = this.seats.get(inp.team);
      seat?.client?.send('reject', { card: inp.card, reason: 'late' } satisfies RejectMsg);
    }
  }

  private schedule(input: Input, delay = INPUT_DELAY_TICKS): void {
    const at = this.match!.tick + delay;
    const list = this.scheduled.get(at) ?? [];
    list.push(input);
    this.scheduled.set(at, list);
  }

  // ───────────────────────── Mensajes ─────────────────────────

  private seatOf(client: Client): Seat | null {
    const team = this.bySession.get(client.sessionId);
    return team ? (this.seats.get(team) ?? null) : null;
  }

  private onPlay(client: Client, raw: unknown): void {
    const seat = this.seatOf(client);
    const m = this.match;
    if (!seat || !m || m.over) return;
    const msg = parsePlay(raw);
    if (!msg) {
      client.send('reject', { card: '', reason: 'invalid' } satisfies RejectMsg);
      return;
    }
    // ritmo: cubo de fichas
    const now = Date.now();
    seat.tokens = Math.min(PLAY_RATE.burst, seat.tokens + ((now - seat.lastRefill) / 1000) * PLAY_RATE.perSecond);
    seat.lastRefill = now;
    if (seat.tokens < 1) {
      client.send('reject', { card: msg.card, reason: 'rate' } satisfies RejectMsg);
      return;
    }
    seat.tokens -= 1;
    const check = m.canPlay(seat.team, msg.card, msg.x, msg.y);
    if (check !== 'ok') {
      client.send('reject', { card: msg.card, reason: check } satisfies RejectMsg);
      return;
    }
    this.schedule({ t: 'play', team: seat.team, card: msg.card, x: msg.x, y: msg.y });
  }

  private onEmote(client: Client, msg: EmoteMsg): void {
    const seat = this.seatOf(client);
    if (!seat || !this.match || this.match.over) return;
    const now = Date.now();
    if (now - seat.lastEmote < EMOTE_COOLDOWN_MS || !PLAYER_EMOTES.includes(msg?.id)) return;
    seat.lastEmote = now;
    this.schedule({ t: 'emote', team: seat.team, id: msg.id }, 1);
  }

  private onSurrender(client: Client): void {
    const seat = this.seatOf(client);
    if (!seat || !this.match || this.match.over) return;
    this.schedule({ t: 'surrender', team: seat.team }, 1);
  }

  // ───────────────────────── Final ─────────────────────────

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.setSimulationInterval(undefined);
    const m = this.match!;
    let replayId: string | null = null;
    const store = ctx.replays;
    if (store) {
      replayId = ReplayStore.newId();
      const players = { blue: this.seats.get('blue')!.info, red: this.seats.get('red')!.info };
      store.save(
        { version: 1, setup: m.setup, inputs: [...m.log] },
        {
          id: replayId,
          mode: this.mode,
          players,
          winner: m.winner,
          reason: m.over ? 'end' : 'timeout',
          crowns: { ...m.crowns },
          ticks: m.tick,
          hash: m.hash(),
          endedAt: new Date().toISOString(),
        },
      );
    }
    const end: EndMsg = {
      winner: m.winner ?? 'draw',
      reason: m.over ? 'end' : 'timeout',
      crowns: { ...m.crowns },
      replayId,
    };
    this.broadcast('end', end);
    void this.setMetadata({ finished: true });
    this.clock.setTimeout(() => void this.disconnect(), settings().linger * 1000);
  }
}
