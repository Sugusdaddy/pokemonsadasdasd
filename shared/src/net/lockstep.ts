import { Match } from '../sim/match';
import { inputsByTick } from '../sim/replay';
import type { Input, SimEvent } from '../sim/types';
import type { CatchupMsg, StartMsg, TickMsg } from './protocol';

/**
 * Copia local de una partida online. El servidor manda los inputs de cada tick y
 * aquí se aplican en orden a una Match idéntica a la suya. Si una huella de estado
 * no coincide, avisa (onDesync) para pedir una resincronización.
 */
export class Lockstep {
  match: Match;
  /** Ticks recibidos y todavía sin simular (t → inputs). */
  private pending = new Map<number, Input[]>();
  private hashes = new Map<number, number>();
  /** Último tick que el servidor ha confirmado. */
  serverTick = -1;
  desyncs = 0;

  constructor(
    readonly start: StartMsg,
    private readonly onDesync: () => void = () => {},
  ) {
    this.match = new Match(start.setup);
  }

  /** Reconstruye la partida desde cero con todo lo ocurrido (reconexión, espectador o resincronización). */
  catchup(msg: CatchupMsg): void {
    this.match = new Match(this.start.setup);
    const byTick = inputsByTick(msg.inputs);
    while (this.match.tick < msg.tick && !this.match.over) this.match.step(byTick.get(this.match.tick) ?? []);
    for (const t of [...this.pending.keys()]) if (t < msg.tick) this.pending.delete(t);
    this.serverTick = Math.max(this.serverTick, msg.tick - 1);
  }

  onTick(msg: TickMsg): void {
    if (msg.t < this.match.tick) return; // ya lo teníamos (llega tras un catchup)
    this.pending.set(msg.t, msg.i ?? []);
    if (msg.h !== undefined) this.hashes.set(msg.t, msg.h);
    this.serverTick = Math.max(this.serverTick, msg.t);
  }

  /** Ticks recibidos que faltan por simular. */
  get buffered(): number {
    return Math.max(0, this.serverTick + 1 - this.match.tick);
  }

  /** Simula el siguiente tick si ya ha llegado. Devuelve null si hay que esperar al servidor. */
  stepOne(): SimEvent[] | null {
    const t = this.match.tick;
    const inputs = this.pending.get(t);
    if (!inputs || this.match.over) return null;
    this.pending.delete(t);
    const ev = this.match.step(inputs);
    const h = this.hashes.get(t);
    if (h !== undefined) {
      this.hashes.delete(t);
      if (h !== this.match.hash()) {
        this.desyncs++;
        this.onDesync();
      }
    }
    return ev;
  }

  /** Simula todo lo recibido (tests). */
  drain(): SimEvent[] {
    const all: SimEvent[] = [];
    for (let ev = this.stepOne(); ev; ev = this.stepOne()) all.push(...ev);
    return all;
  }
}
