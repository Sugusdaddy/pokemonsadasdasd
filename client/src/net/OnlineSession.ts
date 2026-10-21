import { Client, type Room } from 'colyseus.js';
import {
  Lockstep,
  RECONNECT_SECONDS,
  type CatchupMsg,
  type ClientJoin,
  type DraftMsg,
  type EndMsg,
  type Input,
  type MatchedMsg,
  type QueueStatusMsg,
  type RejectMsg,
  type StartMsg,
  type RewardsMsg,
  type TickMsg,
} from '@arena/shared';
import { SERVER_URL, api, joinOptions } from './api';

const ACTIVE_KEY = 'arenaRoyale.activeMatch';

let client: Client | null = null;
export const net = (): Client => (client ??= new Client(SERVER_URL));

export type SessionState = 'waiting' | 'playing' | 'reconnecting' | 'ended' | 'lost';

/**
 * Una partida online desde el punto de vista del cliente: la sala de Colyseus,
 * la copia lockstep de la simulación y la reconexión automática si se corta.
 */
export class OnlineSession {
  room: Room;
  start: StartMsg | null = null;
  ls: Lockstep | null = null;
  end: EndMsg | null = null;
  /** Recompensas que calcula el servidor al acabar (no llegan en amistosas ni a espectadores). */
  rewards: RewardsMsg | null = null;
  code: string | null = null;
  /** Última ronda del draft (si la partida empieza eligiendo mazos). */
  draft: DraftMsg | null = null;
  state: SessionState = 'waiting';
  /** Se activa cuando la partida se ha reconstruido (reconexión/resync): hay que redibujar todo. */
  resetPending = false;

  onStart?: (s: StartMsg) => void;
  onReject?: (r: RejectMsg) => void;
  onEnd?: (e: EndMsg) => void;
  onCode?: (code: string) => void;
  onDraft?: (d: DraftMsg) => void;
  onState?: (s: SessionState) => void;

  constructor(room: Room) {
    this.room = room;
    this.bind(room);
  }

  private setState(s: SessionState): void {
    this.state = s;
    this.onState?.(s);
  }

  private bind(room: Room): void {
    this.room = room;
    room.onMessage('start', (m: StartMsg) => {
      this.start = m;
      if (!this.ls) this.ls = new Lockstep(m, () => this.room.send('resync'));
      if (m.you !== 'spectator') remember(room);
      if (this.state === 'waiting' || this.state === 'reconnecting') this.setState('playing');
      this.onStart?.(m);
    });
    room.onMessage('catchup', (m: CatchupMsg) => {
      this.ls?.catchup(m);
      this.resetPending = true;
    });
    room.onMessage('tick', (m: TickMsg) => this.ls?.onTick(m));
    room.onMessage('reject', (m: RejectMsg) => this.onReject?.(m));
    room.onMessage('code', (m: { code: string }) => {
      this.code = m.code;
      this.onCode?.(m.code);
    });
    room.onMessage('rewards', (m: RewardsMsg) => (this.rewards = m));
    room.onMessage('draft', (m: DraftMsg) => {
      this.draft = m;
      this.onDraft?.(m);
    });
    room.onMessage('end', (m: EndMsg) => {
      this.end = m;
      forget();
      this.setState('ended');
      this.onEnd?.(m);
    });
    room.onLeave((code) => {
      // 1000 = cierre normal; 4000 = salida voluntaria
      if (this.state === 'ended' || code === 1000 || code === 4000) return;
      void this.reconnect();
    });
  }

  private async reconnect(): Promise<void> {
    this.setState('reconnecting');
    const token = this.room.reconnectionToken;
    const deadline = Date.now() + RECONNECT_SECONDS * 1000;
    for (let i = 0; Date.now() < deadline; i++) {
      await new Promise((r) => setTimeout(r, Math.min(3000, 400 * (i + 1))));
      try {
        const room = await net().reconnect(token);
        this.bind(room);
        return; // el servidor manda start + catchup
      } catch {
        /* seguimos intentándolo */
      }
    }
    forget();
    this.setState('lost');
  }

  get isPlayer(): boolean {
    return !!this.start && this.start.you !== 'spectator';
  }

  send(input: Input): void {
    if (this.state !== 'playing') return;
    if (input.t === 'play') this.room.send('play', { card: input.card, x: input.x, y: input.y });
    else if (input.t === 'emote') this.room.send('emote', { id: input.id });
    else this.room.send('surrender');
  }

  /** Draft: elige la carta i (0 o 1) de la pareja de esta ronda. */
  pick(i: number): void {
    this.room.send('pick', { i });
  }

  leave(): void {
    forget();
    if (this.state !== 'lost') void this.room.leave(true).catch(() => {});
  }

  // ───────────────────────── Formas de entrar ─────────────────────────

  /**
   * Cola de emparejamiento: por trofeos (por defecto), draft, desafío del día o un torneo.
   * onStatus recibe la espera y la ventana actual.
   */
  static async findMatch(
    onStatus: (s: QueueStatusMsg) => void,
    signal: AbortSignal,
    queue: Pick<ClientJoin, 'queue' | 'tournamentId'> = {},
  ): Promise<OnlineSession> {
    const q = await net().joinOrCreate('queue', { ...joinOptions(), ...queue });
    try {
      const matched = await new Promise<MatchedMsg>((resolve, reject) => {
        q.onMessage('queue', onStatus);
        q.onMessage('matched', resolve);
        q.onLeave(() => reject(new Error('Se ha cerrado la cola')));
        signal.addEventListener('abort', () => reject(new DOMException('Cancelado', 'AbortError')));
      });
      const room = await net().consumeSeatReservation(
        matched.reservation as Parameters<Client['consumeSeatReservation']>[0],
      );
      return new OnlineSession(room);
    } finally {
      void q.leave(true).catch(() => {});
    }
  }

  static async createFriendly(): Promise<OnlineSession> {
    return new OnlineSession(await net().create('match', { ...joinOptions(), mode: 'friendly' }));
  }

  static async joinFriendly(code: string): Promise<OnlineSession> {
    const { roomId } = await api.friendly(code.trim().toUpperCase());
    return new OnlineSession(await net().joinById(roomId, joinOptions()));
  }

  static async spectate(roomId: string): Promise<OnlineSession> {
    return new OnlineSession(await net().joinById(roomId, { spectate: true }));
  }

  /** ¿Hay una partida a medias de antes de recargar la página? */
  static hasActive(): boolean {
    try {
      return !!sessionStorage.getItem(ACTIVE_KEY);
    } catch {
      return false;
    }
  }

  static async resume(): Promise<OnlineSession | null> {
    let saved: { token: string } | null = null;
    try {
      saved = JSON.parse(sessionStorage.getItem(ACTIVE_KEY) || 'null') as { token: string } | null;
    } catch {
      saved = null;
    }
    if (!saved) return null;
    try {
      return new OnlineSession(await net().reconnect(saved.token));
    } catch {
      forget();
      return null;
    }
  }
}

function remember(room: Room): void {
  try {
    sessionStorage.setItem(ACTIVE_KEY, JSON.stringify({ roomId: room.roomId, token: room.reconnectionToken }));
  } catch {
    /* sin almacenamiento */
  }
}

function forget(): void {
  try {
    sessionStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* sin almacenamiento */
  }
}
