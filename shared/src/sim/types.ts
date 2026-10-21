import type { Card } from '../data/cards';
import type { TowerKind } from '../config';

/** blue = abajo (en local, el jugador), red = arriba. */
export type Team = 'blue' | 'red';
export const TEAMS: readonly Team[] = ['blue', 'red'];
export const other = (t: Team): Team => (t === 'blue' ? 'red' : 'blue');

export type Winner = Team | 'draw';
export type TowerSide = 'king' | 'left' | 'right';

export interface PlayerSetup {
  deck: string[];
  /** Nivel de cada carta del mazo. Si falta, se usa el inicial de su rareza. */
  levels: Record<string, number>;
  kingLevel: number;
}

export interface MatchSetup {
  seed: number;
  arena: number;
  players: Record<Team, PlayerSetup>;
}

// ───────────────────────── Inputs ─────────────────────────
// Lo único que puede hacer un jugador. En la Fase 1 es lo que viaja por la red.

export type Input =
  | { t: 'play'; team: Team; card: string; x: number; y: number }
  | { t: 'emote'; team: Team; id: number }
  | { t: 'surrender'; team: Team };

/** Input aplicado al principio del tick indicado. */
export interface TimedInput {
  tick: number;
  input: Input;
}

export type PlayCheck = 'ok' | 'over' | 'hand' | 'elixir' | 'zone';

// ───────────────────────── Entidades ─────────────────────────

/** Lo que tienen en común tropas y torres (cualquier cosa que se puede atacar). */
export interface Body {
  id: number;
  team: Team;
  x: number;
  y: number;
  radius: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  flying: boolean;
  types: readonly string[];
  isTower: boolean;
}

export type UnitState = 'deploy' | 'move' | 'attack';

export interface SimUnit extends Body {
  isTower: false;
  card: Card;
  /** Posición del tick anterior (para interpolar al dibujar). */
  px: number;
  py: number;
  mass: number;
  state: UnitState;
  deployLeft: number;
  cooldown: number;
  retarget: number;
  target: Body | null;
  slowT: number;
  slowAmt: number;
  burnT: number;
  burnDps: number;
  /** Hacia dónde mira (vector sin normalizar). */
  faceX: number;
  faceY: number;
}

export interface SimTower extends Body {
  isTower: true;
  kind: TowerKind;
  side: TowerSide;
  level: number;
  dmg: number;
  hitSpeed: number;
  range: number;
  active: boolean;
  cooldown: number;
  target: Body | null;
  move: string;
  moveType: string;
  palette: string;
  /** Altura (relativa a y) desde la que dispara el guardián. */
  shotY: number;
}

/** Copia de los datos de daño del atacante: el proyectil golpea aunque el atacante muera. */
export interface DamageSource {
  team: Team;
  dmg: number;
  moveType: string;
  moveStats: Record<string, number>;
  splash: number;
  groundOnly: boolean;
  isTower: boolean;
  palette: string;
}

export interface SimProjectile {
  id: number;
  team: Team;
  ownerId: number;
  src: DamageSource;
  target: Body;
  /** Posición sobre el suelo. La altura del disparo es solo visual (h0 → altura del objetivo). */
  x: number;
  y: number;
  px: number;
  py: number;
  /** Punto de salida (para calcular el progreso al dibujar). */
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  /** Altura visual a la que sale el proyectil. */
  h0: number;
  speed: number;
  move: string;
  alive: boolean;
}

/** Golpe o hechizo programado para un tick futuro. */
export type Pending =
  | { kind: 'hit'; at: number; unit: SimUnit; target: Body; melee: boolean }
  | { kind: 'spell'; at: number; team: Team; card: Card; x: number; y: number };

// ───────────────────────── Eventos ─────────────────────────
// La simulación no dibuja nada: emite eventos que el cliente convierte en efectos.

export type SimEvent =
  | { e: 'deploy'; team: Team; card: string; x: number; y: number }
  | { e: 'spawn'; id: number }
  | { e: 'attack'; id: number; targetId: number; melee: boolean }
  | { e: 'shoot'; id: number }
  | { e: 'impact'; x: number; y: number; palette: string; scale: number }
  | { e: 'damage'; id: number; amount: number; mult: number; silent: boolean }
  | { e: 'splash'; x: number; y: number; r: number; palette: string }
  | { e: 'spellCast'; team: Team; card: string; x: number; y: number }
  | { e: 'spellImpact'; team: Team; card: string; x: number; y: number }
  | { e: 'death'; id: number }
  | { e: 'kingAwake'; team: Team }
  | { e: 'towerDestroyed'; id: number; team: Team; kind: TowerKind }
  | { e: 'crown'; team: Team; crowns: number }
  | { e: 'doubleElixir' }
  | { e: 'overtime' }
  | { e: 'emote'; team: Team; id: number }
  | { e: 'end'; winner: Winner; reason: 'king' | 'time' | 'tiebreak' | 'overtime' | 'surrender' };
