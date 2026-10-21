import crypto from 'node:crypto';
import { Protocol, Room, type Client } from '@colyseus/core';
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
  applyBattle,
  applyCasual,
  recordChallenge,
  rankStandings,
  makeDraft,
  draftPick,
  draftDone,
  draftDeck,
  hasPicked,
  autoPick,
  DRAFT_ROUNDS,
  DRAFT_PICK_SECONDS,
  STANDARD_KING,
  TOURNAMENT_GRACE_MS,
  ECONOMY,
  battleStats,
  rollMissions,
  trackBattle,
  deckOf,
  levelsOf,
  DEFAULT_NAME,
  parsePlay,
  seatKey,
  seatOf,
  AI_BY_ARENA,
  Bot,
  Rng,
  type SeatKey,
  type SeatIndex,
  type LobbyMsg,
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
  type ClientJoin,
  type ProfileState,
  type RewardsMsg,
  type MatchRules,
  type DraftState,
  type DraftMsg,
  type PickMsg,
} from '@arena/shared';
import { ctx, newFriendlyCode, settings, store } from '../context';
import type { CardStatRow } from '../store/types';
import { verifySession } from '../auth';
import { reportError } from '../sentry';

export interface MatchRoomOptions {
  mode: MatchMode;
  /** Reglas especiales (desafíos y torneos). */
  rules?: MatchRules;
  /** Los mazos se eligen por turnos antes de empezar. */
  draft?: boolean;
  /** La cola no encontró rival: entra un bot en cuanto llegue el jugador. */
  vsBot?: boolean;
  tournamentId?: string;
  /** Desafío (día) con el que empezó la partida. */
  challengePeriod?: string;
  /** 2 = 2v2 (dos jugadores por equipo). */
  teamSize?: 1 | 2;
  /** 2v2 emparejado: cuántos jugadores reservó la cola (cuando han entrado todos, bots en los huecos). */
  humans?: number;
}

/** Modos con niveles iguales para todos (sin trofeos). */
const STANDARD_MODES: readonly MatchMode[] = ['draft', 'challenge', 'tournament'];

/** Quién es el jugador (lo comprueba onAuth o lo pasa la cola al reservar el sitio). */
export interface SeatAuth {
  accountId: string;
  join: JoinOptions;
}

/** Datos de juego de una cuenta (el servidor no se fía de lo que diga el navegador). */
export function joinFromState(s: ProfileState): JoinOptions {
  const deck = [...deckOf(s)];
  return {
    name: s.name || DEFAULT_NAME,
    trophies: s.trophies,
    kingLevel: s.kingLevel,
    deck,
    levels: levelsOf(s, deck),
  };
}

/** Comprueba la sesión y carga la cuenta. */
export async function authAccount(token: unknown): Promise<SeatAuth> {
  const session = await verifySession(token);
  if (!session) throw new Error('err.session');
  const acc = await store().getAccount(session.accountId);
  if (!acc) throw new Error('err.session');
  return { accountId: acc.id, join: joinFromState(acc.state) };
}

interface Seat {
  key: SeatKey;
  team: Team;
  seat: SeatIndex;
  /** null = bot. */
  accountId: string | null;
  join: JoinOptions;
  info: PlayerInfo;
  client: Client | null;
  /** Cubo de fichas para limitar el ritmo de cartas. */
  tokens: number;
  lastRefill: number;
  lastEmote: number;
}

type JoinPayload = ClientJoin & { mode?: MatchMode };

/**
 * Sala de una partida. El servidor es la autoridad: ejecuta Match, valida cada
 * carta (mano, elixir, zona y ritmo), la programa INPUT_DELAY_TICKS después y
 * reenvía a todos los inputs de cada tick. Guarda la repetición al terminar.
 */
export class MatchRoom extends Room {
  mode: MatchMode = 'ranked';
  code: string | null = null;
  private opts: MatchRoomOptions = { mode: 'ranked' };
  private draft: DraftState | null = null;
  private drafted = false;
  private draftTimer: { clear(): void } | null = null;
  private draftDeadline = 0;
  /** Un bot ocupó el sitio de quien no llegó (en torneos no cuenta para la clasificación). */
  private botFilled = false;
  match: Match | null = null;
  private seats = new Map<SeatKey, Seat>();
  private bySession = new Map<string, SeatKey>();
  private spectators = new Set<string>();
  private bots: Bot[] = [];
  private scheduled = new Map<number, Input[]>();
  private startAt = 0;
  private finished = false;
  /** Se termina de guardar el resultado (al apagar se espera a que acabe). */
  private settled: Promise<void> = Promise.resolve();
  /** El servidor se apaga y esta sala ya se ha cerrado: las salidas no cuentan como abandono. */
  private shuttingDown = false;
  private fillTimer: { clear(): void } | null = null;

  override onCreate(options: MatchRoomOptions): void {
    this.mode = options.mode ?? 'ranked';
    // (las amistosas las crea el cliente: solo se acepta 1 o 2 por equipo)
    this.opts = { ...options, mode: this.mode, teamSize: options.teamSize === 2 ? 2 : 1 };
    this.maxClients = this.capacity + 30; // jugadores + espectadores
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
    this.onMessage('pick', (c, m: PickMsg) => this.onPick(c, m));
    // 2v2 con amigos: quien creó la sala empieza cuando quiera (bots en los huecos)
    this.onMessage('startNow', (c) => {
      if (this.bySession.get(c.sessionId) === 'blue' && !this.match) this.fillWithBot();
    });
    // en una partida emparejada, si el rival no llega, entra un bot
    if (this.mode !== 'friendly' && this.mode !== 'bot' && !options.vsBot) {
      this.fillTimer = this.clock.setTimeout(() => this.fillWithBot(), settings().matchFillBotAfterMs);
    }
  }

  override async onAuth(_client: Client, options: JoinPayload): Promise<SeatAuth | true> {
    if (options?.protocol !== undefined && options.protocol !== PROTOCOL_VERSION) throw new Error('err.version');
    if (options?.spectate) return true;
    if (ctx.draining) throw new Error('err.server.restarting');
    // a las emparejadas solo se entra con el sitio que reserva la cola (sin pasar por aquí)
    if (this.mode !== 'friendly') throw new Error('err.room.reserved');
    if (this.seats.size >= this.capacity || this.match) throw new Error('err.room.full');
    const auth = await authAccount(options?.token);
    if ([...this.seats.values()].some((s) => s.accountId === auth.accountId)) throw new Error('err.room.self');
    return auth;
  }

  override onJoin(client: Client, options: JoinPayload, auth?: SeatAuth | true): void {
    if (options.spectate) {
      this.spectators.add(client.sessionId);
      if (this.match) {
        client.send('start', this.startMsg('spectator'));
        this.sendCatchup(client);
      }
      return;
    }
    if (!auth || auth === true) {
      client.leave(4003);
      return;
    }
    const key = this.seatOrder().find((k) => !this.seats.has(k))!;
    const { team, seat: idx } = seatOf(key);
    const join = this.standard ? { ...auth.join, levels: {}, kingLevel: STANDARD_KING } : auth.join;
    this.seats.set(key, {
      key,
      team,
      seat: idx,
      accountId: auth.accountId,
      join,
      client,
      info: { name: join.name.trim(), trophies: join.trophies, kingLevel: join.kingLevel, bot: false },
      tokens: PLAY_RATE.burst,
      lastRefill: Date.now(),
      lastEmote: 0,
    });
    this.bySession.set(client.sessionId, key);
    if (this.mode === 'friendly' && this.code) client.send('code', { code: this.code });
    this.sendLobby();
    const humans = [...this.seats.values()].filter((s) => !s.info.bot).length;
    if (this.mode === 'bot' || this.opts.vsBot || (this.opts.humans && humans >= this.opts.humans)) this.fillWithBot();
    else if (this.seats.size === this.capacity) this.begin();
  }

  // ───────────────────────── Asientos (1v1 y 2v2) ─────────────────────────

  private get teamSize(): 1 | 2 {
    return this.opts.teamSize === 2 ? 2 : 1;
  }

  private get capacity(): number {
    return this.teamSize * 2;
  }

  /**
   * Orden en que se ocupan los sitios. 2v2 con amigos: los dos primeros juntos; emparejado:
   * los dos primeros enfrentados (y los bots, de compañeros).
   */
  private seatOrder(): SeatKey[] {
    if (this.teamSize === 1) return ['blue', 'red'];
    return this.mode === 'friendly' ? ['blue', 'blue2', 'red', 'red2'] : ['blue', 'red', 'blue2', 'red2'];
  }

  /** Lo que se ve de un equipo: en 2v2, los dos nombres juntos. */
  private teamInfo(team: Team): PlayerInfo {
    const a = this.seats.get(team)!.info;
    const b = this.seats.get(seatKey(team, 1))?.info;
    return b ? { ...a, name: `${a.name} & ${b.name}`, bot: a.bot && b.bot } : a;
  }

  /** 2v2 con amigos: quién está en cada sitio (antes de empezar). */
  private sendLobby(): void {
    if (this.teamSize !== 2 || this.mode !== 'friendly' || this.match) return;
    for (const c of this.clients) {
      const k = this.bySession.get(c.sessionId);
      if (!k) continue;
      const msg: LobbyMsg = {
        seats: this.seatOrder().map((key) => ({ key, name: this.seats.get(key)?.info.name ?? null })),
        host: k === 'blue',
      };
      c.send('lobby', msg);
    }
  }

  /** 2v2: quien se va deja su sitio a un bot y su compañero sigue jugando. */
  private botTakeover(key: SeatKey): void {
    const seat = this.seats.get(key);
    const m = this.match;
    if (!seat || !m || seat.info.bot) return;
    seat.info = { ...seat.info, bot: true };
    seat.client = null;
    const salt = { blue: 11, red: 12, blue2: 13, red2: 14 }[key];
    this.bots.push(
      new Bot(seat.team, AI_BY_ARENA(m.setup.arena), new Rng((m.setup.seed ^ (salt * 0x9e3779b1)) >>> 0), seat.seat),
    );
  }

  /** Alguien se rinde o se va: en 1v1 pierde; en 2v2 lo sustituye un bot. */
  private quit(key: SeatKey): void {
    if (!this.match || this.match.over) return;
    if (this.teamSize === 2) this.botTakeover(key);
    else this.schedule({ t: 'surrender', team: seatOf(key).team }, 1);
  }

  override async onLeave(client: Client, consented: boolean): Promise<void> {
    if (this.spectators.delete(client.sessionId) || this.shuttingDown) return;
    const key = this.bySession.get(client.sessionId);
    if (!key) return;
    const seat = this.seats.get(key)!;
    seat.client = null;
    if (!this.match && this.draft) {
      // se va durante el draft: su sitio lo ocupa un bot (sin premios para nadie de ese lado)
      seat.accountId = null;
      seat.info = { ...seat.info, bot: true };
      this.bySession.delete(client.sessionId);
      if (!draftDone(this.draft)) this.draftRound();
      return;
    }
    if (!this.match) {
      // aún no ha empezado: se libera el sitio
      this.seats.delete(key);
      this.bySession.delete(client.sessionId);
      this.sendLobby();
      return;
    }
    if (this.finished || this.match.over) return;
    if (consented) {
      this.quit(key);
      return;
    }
    try {
      const back = await this.allowReconnection(client, settings().reconnectSeconds);
      // en 2v2 un bot pudo coger su sitio mientras tanto: no vuelve a jugar, solo mira
      if (seat.info.bot) {
        back.send('start', this.startMsg('spectator'));
        this.sendCatchup(back);
        return;
      }
      seat.client = back;
      back.send('start', this.startMsg(key));
      this.sendCatchup(back);
    } catch {
      // no ha vuelto a tiempo: pierde (en 2v2, le sustituye un bot)
      this.quit(key);
    }
  }

  override onDispose(): void {
    if (this.code) ctx.friendly.delete(this.code);
  }

  /**
   * El servidor se apaga (un despliegue). Una partida en marcha (o en el draft) sigue hasta
   * el final con su resultado normal; si no acaba en drainSeconds, se corta sin resultado.
   * Las salas que aún esperan jugadores se cierran ya. Nadie pierde por el reinicio.
   */
  override onBeforeShutdown(): void {
    const s = settings().drainSeconds;
    if (this.finished) return void this.settled.finally(() => this.closeForShutdown());
    if ((!this.match && !this.draft) || s <= 0) return this.closeForShutdown();
    this.clock.setTimeout(() => this.closeForShutdown(), s * 1000);
  }

  private closeForShutdown(): void {
    this.shuttingDown = true;
    this.setSimulationInterval(undefined);
    void this.disconnect(Protocol.WS_CLOSE_WITH_ERROR);
  }

  // ───────────────────────── Inicio ─────────────────────────

  /** Ocupa con bots los sitios libres (rivales parecidos al primer jugador) y empieza. */
  private fillWithBot(): void {
    if (this.match) return;
    const human = [...this.seats.values()].find((s) => !s.info.bot);
    if (!human) return;
    const missing = this.seatOrder().filter((k) => !this.seats.has(k));
    if (!missing.length) return this.begin();
    const avg =
      human.join.deck.reduce(
        (s, k) => s + (human.join.levels[k] ?? startLevel(getCard(k))) - startLevel(getCard(k)) + 1,
        0,
      ) / human.join.deck.length;
    for (const key of missing) {
      const opp = makeOpponent({
        arena: arenaFor(human.join.trophies),
        trophies: human.join.trophies,
        kingLevel: human.join.kingLevel,
        avgDeckLevel: avg,
      });
      if (this.standard) {
        opp.levels = {};
        opp.kingLevel = STANDARD_KING;
      }
      const { team, seat } = seatOf(key);
      this.seats.set(key, {
        key,
        team,
        seat,
        join: { name: opp.name, trophies: opp.trophies, kingLevel: opp.kingLevel, deck: opp.deck, levels: opp.levels },
        info: { name: opp.name, trophies: opp.trophies, kingLevel: opp.kingLevel, bot: true },
        accountId: null,
        client: null,
        tokens: 0,
        lastRefill: 0,
        lastEmote: 0,
      });
    }
    // si el rival no llegó a una partida emparejada, en torneos ya no cuenta
    if (this.mode !== 'bot' && !this.opts.vsBot) this.botFilled = true;
    this.begin();
  }

  private get standard(): boolean {
    return STANDARD_MODES.includes(this.mode);
  }

  private begin(): void {
    if (this.match) return;
    this.fillTimer?.clear();
    // draft: primero se eligen los mazos
    if (this.opts.draft && !this.drafted) {
      if (!this.draft) this.startDraft();
      return;
    }
    const rules = this.opts.rules;
    const P = (k: SeatKey) => {
      const s = this.seats.get(k)!;
      return { deck: [...s.join.deck], levels: { ...s.join.levels }, kingLevel: s.join.kingLevel };
    };
    const setup: MatchSetup = {
      seed: crypto.randomInt(0, 2 ** 32),
      arena: arenaFor(Math.min(...[...this.seats.values()].map((s) => s.join.trophies))),
      players: { blue: P('blue'), red: P('red') },
      ...(this.teamSize === 2 ? { partners: { blue: P('blue2'), red: P('red2') } } : {}),
      // sin reglas especiales, la partida es idéntica a las de siempre (y sus repeticiones)
      ...(rules && Object.keys(rules).length ? { rules } : {}),
      // balance de cartas en vigor (si el admin ha cambiado algo): viaja con la partida y su repetición
      ...(ctx.balance.v ? { balance: ctx.balance } : {}),
    };
    this.match = new Match(setup);
    this.bots = makeBots(
      setup,
      [...this.seats.values()].filter((s) => s.info.bot).map((s) => s.key),
    );
    this.startAt = Date.now() + settings().matchStartDelayMs;
    void this.setMetadata({
      started: true,
      players: { blue: this.teamInfo('blue'), red: this.teamInfo('red') },
      startedAt: new Date(this.startAt).toISOString(),
    });
    for (const c of this.clients) {
      const key = this.bySession.get(c.sessionId);
      c.send('start', this.startMsg(key ?? 'spectator'));
    }
    this.clock.setTimeout(() => this.bots.forEach((b) => b.greet()), settings().matchStartDelayMs + 1500);
    this.setSimulationInterval(() => this.pump(), 10);
  }

  /**
   * Estadísticas de las cartas (para el balance): por cada jugador (no bots), cada carta de su
   * mazo suma una partida, una victoria si ganó su equipo y las veces que la jugó.
   */
  private async recordCardStats(m: Match): Promise<void> {
    const rows = new Map<string, CardStatRow>();
    for (const seat of this.seats.values()) {
      if (!seat.accountId) continue;
      const win = m.winner === seat.team;
      const deck = seat.seat ? m.setup.partners![seat.team]!.deck : m.setup.players[seat.team].deck;
      for (const key of deck) {
        const r = rows.get(key) ?? { key, games: 0, wins: 0, plays: 0 };
        r.games += 1;
        if (win) r.wins += 1;
        rows.set(key, r);
      }
      for (const { input } of m.log)
        if (input.t === 'play' && input.team === seat.team && (input.seat ?? 0) === seat.seat) {
          const r = rows.get(input.card);
          if (r) r.plays += 1;
        }
    }
    try {
      await store().recordCardStats(m.setup.balance?.v ?? 0, [...rows.values()]);
    } catch (e) {
      console.error('[match] no se pudieron guardar las estadísticas de cartas', e);
      reportError(e, 'match.cardStats');
    }
  }

  /** Apunta el resultado en el torneo (si no fue contra un bot de relleno y el torneo sigue) y da el puesto. */
  private async recordTournament(
    accountId: string,
    win: boolean,
    crowns: number,
  ): Promise<TournamentResult | undefined> {
    const id = this.opts.tournamentId;
    const t = id ? await store().getTournament(id) : null;
    if (!t || this.botFilled || Date.now() > +t.endsAt + TOURNAMENT_GRACE_MS) return undefined;
    await store().recordTournamentGame(t.id, accountId, win, crowns);
    const ranked = rankStandings(await store().tournamentPlayers(t.id));
    const i = ranked.findIndex((p) => p.accountId === accountId);
    return i < 0 ? undefined : { rank: i + 1, players: ranked.length, wins: ranked[i].wins, losses: ranked[i].losses };
  }

  // ───────────────────────── Draft ─────────────────────────

  private startDraft(): void {
    this.draft = makeDraft(rewardRand);
    void this.setMetadata({ drafting: true });
    this.draftRound();
  }

  /** Empieza (o sigue) la ronda actual: los bots eligen al momento y los demás tienen un tiempo. */
  private draftRound(): void {
    const d = this.draft!;
    this.draftTimer?.clear();
    for (const seat of this.seats.values())
      if ((seat.info.bot || !seat.client) && !draftDone(d) && !hasPicked(d, seat.team))
        draftPick(d, seat.team, autoPick(d.pairs[seat.team][d.round]));
    if (draftDone(d)) return this.finishDraft();
    const round = d.round;
    this.draftDeadline = Date.now() + DRAFT_PICK_SECONDS * 1000;
    this.sendDraft();
    this.draftTimer = this.clock.setTimeout(() => {
      if (!this.draft || this.draft.round !== round || draftDone(this.draft)) return;
      // quien no elige a tiempo se queda la mejor de su pareja
      for (const seat of this.seats.values())
        if (!hasPicked(d, seat.team)) draftPick(d, seat.team, autoPick(d.pairs[seat.team][d.round]));
      this.draftRound();
    }, DRAFT_PICK_SECONDS * 1000);
  }

  private onPick(client: Client, m: PickMsg): void {
    const seat = this.seatOf(client);
    const d = this.draft;
    // el draft es solo de 1v1: cada equipo tiene un jugador
    if (!seat || !d || draftDone(d)) return;
    const round = d.round;
    if (!draftPick(d, seat.team, Number(m?.i))) return;
    if (d.round !== round) this.draftRound();
    else this.sendDraft(); // el rival aún está eligiendo
  }

  private sendDraft(): void {
    const d = this.draft!;
    for (const seat of this.seats.values()) {
      if (!seat.client) continue;
      const msg: DraftMsg = {
        round: d.round,
        rounds: DRAFT_ROUNDS,
        pair: draftDone(d) || hasPicked(d, seat.team) ? null : d.pairs[seat.team][d.round],
        picks: [...d.picks[seat.team]],
        got: [...d.got[seat.team]],
        msLeft: Math.max(0, this.draftDeadline - Date.now()),
      };
      seat.client.send('draft', msg);
    }
  }

  private finishDraft(): void {
    const d = this.draft!;
    this.draftTimer?.clear();
    for (const seat of this.seats.values()) seat.join = { ...seat.join, deck: draftDeck(d, seat.team) };
    this.drafted = true;
    this.sendDraft(); // ronda final: los dos mazos completos
    this.begin();
  }

  private startMsg(key: SeatKey | 'spectator'): StartMsg {
    const m = this.match!;
    const me = key === 'spectator' ? null : seatOf(key);
    return {
      setup: m.setup,
      you: me ? me.team : 'spectator',
      ...(me?.seat ? { seat: me.seat } : {}),
      players: { blue: this.teamInfo('blue'), red: this.teamInfo('red') },
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
      const seat = this.seats.get(seatKey(inp.team, inp.seat ?? 0));
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
    const key = this.bySession.get(client.sessionId);
    return key ? (this.seats.get(key) ?? null) : null;
  }

  private onPlay(client: Client, raw: unknown): void {
    const seat = this.seatOf(client);
    const m = this.match;
    // (en 2v2, si un bot ya ocupa su sitio, ese jugador ya no juega)
    if (!seat || seat.info.bot || !m || m.over) return;
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
    const check = m.canPlay(seat.team, msg.card, msg.x, msg.y, seat.seat);
    if (check !== 'ok') {
      client.send('reject', { card: msg.card, reason: check } satisfies RejectMsg);
      return;
    }
    const play: Input = { t: 'play', team: seat.team, card: msg.card, x: msg.x, y: msg.y };
    // el compañero (2v2) juega con su mano y su elixir
    this.schedule(seat.seat ? { ...play, seat: seat.seat } : play);
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
    this.quit(seat.key);
  }

  // ───────────────────────── Final ─────────────────────────

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    // se para la simulación pero no el reloj de la sala: Colyseus solo lo avanza solo si no hay
    // intervalo, y quitarlo deja el antiguo marcado (sin esto no saltaban el linger ni el apagado)
    this.setSimulationInterval(() => {}, 100);
    this.settled = this.settle();
  }

  /** Guarda la partida, reparte recompensas (calculadas aquí, nunca en el cliente) y avisa. */
  private async settle(): Promise<void> {
    const m = this.match!;
    const blue = this.seats.get('blue')!,
      red = this.seats.get('red')!;
    const players = { blue: this.teamInfo('blue'), red: this.teamInfo('red') };
    const reason = m.over ? 'end' : 'timeout';
    let replayId: string | null = null;
    try {
      replayId = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
      await store().saveMatch({
        id: replayId,
        mode: this.mode,
        blueId: blue.accountId,
        redId: red.accountId,
        winner: m.winner,
        reason,
        players,
        crowns: { ...m.crowns },
        ticks: m.tick,
        hash: m.hash(),
        replay: { version: 1, setup: m.setup, inputs: [...m.log] },
        endedAt: new Date(),
      });
    } catch (e) {
      console.error('[match] no se pudo guardar la partida', e);
      reportError(e, 'match.save', { mode: this.mode });
      replayId = null;
    }
    const end: EndMsg = { winner: m.winner ?? 'draw', reason, crowns: { ...m.crowns }, replayId };
    this.broadcast('end', end);
    // recompensas: las amistosas no dan ni quitan nada
    if (this.mode !== 'friendly') {
      for (const seat of this.seats.values()) {
        if (!seat.accountId) continue;
        const outcome = m.winner === 'draw' || !m.winner ? 'draw' : m.winner === seat.team ? 'win' : 'loss';
        const win = outcome === 'win';
        const crowns = m.crowns[seat.team];
        try {
          const extra: Pick<RewardsMsg, 'challenge' | 'tournament'> = {};
          if (this.mode === 'tournament') extra.tournament = await this.recordTournament(seat.accountId, win, crowns);
          const { result, state } = await store().mutate(seat.accountId, (s) => {
            const res =
              this.mode === 'ranked' || this.mode === 'bot'
                ? applyBattle(s, outcome, crowns, rewardRand)
                : // sin trofeos: draft y 2v2 dan oro por ganar; desafíos y torneos, sus propios premios
                  applyCasual(
                    s,
                    outcome,
                    crowns,
                    this.mode === 'draft' || this.mode === '2v2' ? ECONOMY.winGold(m.setup.arena) : 0,
                  );
            if (this.mode === 'challenge' && this.opts.challengePeriod) {
              const c = recordChallenge(s, this.opts.challengePeriod, win, rewardRand);
              if (c) extra.challenge = { wins: c.run.wins, losses: c.run.losses, ended: c.ended, rewards: c.rewards };
            }
            // misiones: con lo que ha pasado en ESTA simulación (los inputs que aceptó)
            rollMissions(s, Date.now(), rewardRand);
            trackBattle(s, battleStats(m.log, seat.team, outcome, crowns));
            return res;
          });
          seat.client?.send('rewards', { result, state, mode: this.mode, ...extra } satisfies RewardsMsg);
        } catch (e) {
          console.error('[match] no se pudieron dar las recompensas', e);
          reportError(e, 'match.rewards', { mode: this.mode });
        }
      }
    }
    if (this.mode !== 'friendly') void this.recordCardStats(m);
    void this.setMetadata({ finished: true });
    this.clock.setTimeout(() => void this.disconnect(), settings().linger * 1000);
  }
}

const rewardRand = (): number => crypto.randomInt(0, 2 ** 32) / 2 ** 32;

export type TournamentResult = NonNullable<RewardsMsg['tournament']>;
