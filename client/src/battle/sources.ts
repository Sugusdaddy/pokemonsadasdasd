import {
  DT,
  Match,
  makeBots,
  inputsByTick,
  MAX_TICKS,
  type Bot,
  type Input,
  type MatchSetup,
  type PlayerInfo,
  type Replay,
  type SimEvent,
  type Team,
} from '@arena/shared';
import type { OnlineSession } from '../net/OnlineSession';

/**
 * De dónde salen los ticks de una batalla. BattleScene no sabe si juega en local
 * contra un bot, online, como espectador o viendo una repetición: solo pide eventos.
 */
export interface BattleSource {
  readonly kind: 'local' | 'online' | 'replay';
  /** La partida actual. Puede cambiar de objeto (reconexión): mira `takeReset()`. */
  readonly match: Match;
  /** Mi equipo; null si solo miro (espectador o repetición). */
  readonly me: Team | null;
  readonly players: Record<Team, PlayerInfo>;
  /** Fracción del siguiente tick ya transcurrida (para interpolar al dibujar). */
  readonly alpha: number;
  /** Avanza según el tiempo real y devuelve los eventos de los ticks simulados. */
  advance(dtSeconds: number): SimEvent[];
  /** true una vez si la partida se ha reconstruido y hay que recrear las vistas. */
  takeReset(): boolean;
  send(input: Input): void;
  /** Llamar cuando acaba la intro y empieza a correr el reloj. */
  begin(): void;
  dispose(): void;
}

/** Partida local contra el bot, sin servidor (modo sin conexión). */
export class LocalSource implements BattleSource {
  readonly kind = 'local';
  readonly match: Match;
  readonly me: Team = 'blue';
  private bots: Bot[];
  private pending: Input[] = [];
  private acc = 0;
  private running = false;

  constructor(
    setup: MatchSetup,
    readonly players: Record<Team, PlayerInfo>,
  ) {
    this.match = new Match(setup);
    this.bots = makeBots(setup, ['red']);
  }

  get alpha(): number {
    return this.match.over ? 1 : Math.min(1, this.acc / DT);
  }

  begin(): void {
    this.running = true;
    setTimeout(() => this.bots.forEach((b) => b.greet()), 1500);
  }

  advance(dt: number): SimEvent[] {
    const m = this.match;
    const out: SimEvent[] = [];
    if (!this.running || m.over) return out;
    // como mucho 5 ticks por frame para no congelarse tras una pausa
    this.acc += Math.min(dt, 0.25);
    while (this.acc >= DT && !m.over) {
      const inputs = this.pending.splice(0);
      for (const b of this.bots) inputs.push(...b.update(m));
      const ev = m.step(inputs);
      this.bots.forEach((b) => b.observe(ev));
      out.push(...ev);
      this.acc -= DT;
    }
    return out;
  }

  takeReset(): boolean {
    return false;
  }

  send(input: Input): void {
    this.pending.push(input);
  }

  dispose(): void {}
}

/**
 * Partida online (jugador o espectador). Simula los ticks según llegan del servidor,
 * con un pequeño colchón para absorber el jitter de la red.
 */
export class OnlineSource implements BattleSource {
  readonly kind = 'online';
  private acc = 0;

  constructor(readonly session: OnlineSession) {}

  get match(): Match {
    return this.session.ls!.match;
  }

  get me(): Team | null {
    const you = this.session.start!.you;
    return you === 'spectator' ? null : you;
  }

  get players(): Record<Team, PlayerInfo> {
    return this.session.start!.players;
  }

  get alpha(): number {
    return this.match.over ? 1 : Math.min(1, this.acc / DT);
  }

  begin(): void {}

  advance(dt: number): SimEvent[] {
    const ls = this.session.ls;
    const out: SimEvent[] = [];
    if (!ls) return out;
    this.acc += Math.min(dt, 0.25);
    let steps = Math.floor(this.acc / DT);
    // si nos hemos quedado atrás (pestaña en segundo plano, ráfaga de red), recuperamos de golpe
    if (ls.buffered > 4) steps = Math.max(steps, ls.buffered - 2);
    for (let i = 0; i < steps; i++) {
      const ev = ls.stepOne();
      if (!ev) {
        this.acc = Math.min(this.acc, DT * 0.99); // esperando al servidor: no acumulamos retraso
        break;
      }
      out.push(...ev);
      this.acc = Math.max(0, this.acc - DT);
    }
    return out;
  }

  takeReset(): boolean {
    if (!this.session.resetPending) return false;
    this.session.resetPending = false;
    return true;
  }

  send(input: Input): void {
    this.session.send(input);
  }

  dispose(): void {
    if (this.session.state !== 'ended') this.session.leave();
  }
}

/** Repetición: semilla + inputs, con pausa y velocidad. */
export class ReplaySource implements BattleSource {
  readonly kind = 'replay';
  readonly match: Match;
  readonly me = null;
  speed = 1;
  paused = false;
  private byTick: Map<number, Input[]>;
  private acc = 0;
  private running = false;

  constructor(
    replay: Replay,
    readonly players: Record<Team, PlayerInfo>,
  ) {
    this.match = new Match(replay.setup);
    this.byTick = inputsByTick(replay.inputs);
  }

  get alpha(): number {
    return this.match.over ? 1 : Math.min(1, this.acc / DT);
  }

  begin(): void {
    this.running = true;
  }

  advance(dt: number): SimEvent[] {
    const m = this.match;
    const out: SimEvent[] = [];
    if (!this.running || this.paused || m.over) return out;
    this.acc += Math.min(dt, 0.25) * this.speed;
    while (this.acc >= DT && !m.over && m.tick < MAX_TICKS) {
      out.push(...m.step(this.byTick.get(m.tick) ?? []));
      this.acc -= DT;
    }
    return out;
  }

  takeReset(): boolean {
    return false;
  }

  send(): void {}

  dispose(): void {}
}
