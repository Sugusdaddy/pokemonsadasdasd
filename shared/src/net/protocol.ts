// ─────────────────────────────────────────────────────────────
//  PROTOCOLO CLIENTE ↔ SERVIDOR
//
//  El servidor ejecuta la simulación (sim/Match) y es la única fuente de verdad.
//  Los clientes solo envían "quiero jugar la carta X en (x, y)". El servidor lo
//  valida y lo programa unos ticks después (retardo de input, como Clash Royale),
//  y reenvía a todos los inputs de cada tick. Como la simulación es determinista,
//  cada cliente la reproduce idéntica y solo dibuja.
// ─────────────────────────────────────────────────────────────
import { MAX_LEVEL, RARITIES } from '../config';
import { getCard, isCardKey } from '../data/cards';
import type { Input, MatchSetup, PlayCheck, Team, TimedInput, Winner } from '../sim/types';
import type { BattleResult, ProfileState } from '../meta/economy';

export const PROTOCOL_VERSION = 2;
export const DEFAULT_PORT = 2567;

/** Ticks entre que el servidor recibe un input y lo aplica (2 ticks = 100 ms). */
export const INPUT_DELAY_TICKS = 2;
/** Cada cuántos ticks manda el servidor la huella del estado para detectar desincronizaciones. */
export const HASH_EVERY = 20;
/** Tiempo entre el aviso de inicio y el primer tick (la intro VS dura ~2,2 s). */
export const MATCH_START_DELAY_MS = 3000;
/** Segundos que se guarda el sitio de un jugador que se desconecta. */
export const RECONNECT_SECONDS = 30;
/** Sin rival en este tiempo, la cola te empareja con un bot. */
export const QUEUE_BOT_AFTER_MS = 20000;
/** Si en una sala de partida falta un jugador tras este tiempo, entra un bot. */
export const MATCH_FILL_BOT_AFTER_MS = 10000;
/** Ritmo máximo de cartas por jugador (cubo de fichas). */
export const PLAY_RATE = { perSecond: 4, burst: 3 };
export const EMOTE_COOLDOWN_MS = 1500;

/** Ventana de trofeos permitida según lo que lleva esperando un jugador. */
export function trophyWindow(waitMs: number): number {
  return Math.min(2000, 100 + Math.floor(waitMs / 1000) * 50);
}

export type MatchMode = 'ranked' | 'friendly' | 'bot';

export interface PlayerInfo {
  name: string;
  trophies: number;
  kingLevel: number;
  bot: boolean;
}

/**
 * Lo que manda el cliente al entrar en la cola o en una sala: solo su sesión.
 * Nombre, mazo, niveles y trofeos los saca el servidor de la cuenta (no se fía del navegador).
 */
export interface ClientJoin {
  token?: string;
  /** Solo para mirar una partida (no necesita sesión). */
  spectate?: boolean;
  protocol?: number;
}

/** Datos de juego de un jugador al entrar (los construye el servidor a partir de su cuenta). */
export interface JoinOptions {
  name: string;
  trophies: number;
  kingLevel: number;
  deck: string[];
  levels: Record<string, number>;
  /** Solo para mirar una partida. */
  spectate?: boolean;
  protocol?: number;
}

// ───────────────────────── Mensajes ─────────────────────────

/** Cliente → servidor */
export interface PlayMsg {
  card: string;
  x: number;
  y: number;
}
export interface EmoteMsg {
  id: number;
}

/** Servidor → cliente: la partida empieza (o te unes a una ya empezada). */
export interface StartMsg {
  setup: MatchSetup;
  /** Tu equipo, o 'spectator'. */
  you: Team | 'spectator';
  players: Record<Team, PlayerInfo>;
  mode: MatchMode;
  inputDelay: number;
  /** Ms que faltan para el primer tick (0 si ya ha empezado). */
  startsIn: number;
}

/** Servidor → cliente: todo lo que ha pasado antes de que te unieras (reconexión o espectador). */
export interface CatchupMsg {
  /** El servidor ya ha procesado los ticks [0, tick). */
  tick: number;
  inputs: TimedInput[];
}

/** Servidor → cliente: el servidor ha procesado el tick t con estos inputs. */
export interface TickMsg {
  t: number;
  i?: Input[];
  /** Huella del estado tras el tick (cada HASH_EVERY ticks). */
  h?: number;
}

export interface RejectMsg {
  card: string;
  reason: PlayCheck | 'rate' | 'invalid' | 'late';
}

export interface EndMsg {
  winner: Winner;
  reason: string;
  crowns: Record<Team, number>;
  replayId: string | null;
}

/** Servidor → cada jugador: sus recompensas (calculadas por el servidor) y su estado nuevo. */
export interface RewardsMsg {
  result: BattleResult;
  state: ProfileState;
}

export interface QueueStatusMsg {
  waitedMs: number;
  window: number;
}

/** La cola te ha encontrado partida: conéctate con esta reserva de sitio. */
export interface MatchedMsg {
  // reserva de Colyseus ({ room, sessionId }); se pasa tal cual a consumeSeatReservation
  reservation: unknown;
  mode: MatchMode;
}

// ───────────────────────── Validación ─────────────────────────

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);

/**
 * Valida lo que manda el cliente al unirse. Devuelve un código de error (el cliente
 * lo traduce: ver ERRORS) o null.
 */
export function validateJoin(o: Partial<JoinOptions> | undefined): string | null {
  if (!o || typeof o !== 'object') return 'err.join.empty';
  if (typeof o.name !== 'string' || !o.name.trim() || o.name.length > 24) return 'err.join.name';
  if (!isInt(o.trophies) || o.trophies < 0 || o.trophies > 100000) return 'err.join.trophies';
  if (!isInt(o.kingLevel) || o.kingLevel < 1 || o.kingLevel > 13) return 'err.join.kingLevel';
  if (!Array.isArray(o.deck) || o.deck.length !== 8) return 'err.join.deckSize';
  if (new Set(o.deck).size !== 8) return 'err.join.deckDup';
  for (const k of o.deck) if (typeof k !== 'string' || !isCardKey(k)) return 'err.join.card';
  if (!o.levels || typeof o.levels !== 'object') return 'err.join.levels';
  for (const k of o.deck) {
    const lv = o.levels[k];
    const start = RARITIES[getCard(k).rarity].start;
    if (lv !== undefined && (!isInt(lv) || lv < start || lv > MAX_LEVEL)) return 'err.join.levels';
  }
  return null;
}

/** Valida la forma de un mensaje de carta (el contenido lo valida Match.canPlay). */
export function parsePlay(m: unknown): PlayMsg | null {
  if (!m || typeof m !== 'object') return null;
  const { card, x, y } = m as Record<string, unknown>;
  if (typeof card !== 'string' || card.length > 32) return null;
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { card, x: Math.round(x), y: Math.round(y) };
}

/** Código de sala amistosa: 5 caracteres sin los que se confunden (0/O, 1/I). */
export const FRIENDLY_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const isFriendlyCode = (s: string): boolean => /^[A-HJ-NP-Z2-9]{5}$/.test(s);
