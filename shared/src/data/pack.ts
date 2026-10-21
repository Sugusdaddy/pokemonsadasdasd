// Datos del pack de sprites que necesita el juego (no el arte).
// pack.json lo genera `npm run assets` a partir de animations_metadata.json,
// así la simulación y el servidor no dependen de los 5 MB de metadatos ni de los PNG.
import packJson from './pack.json';

export type AnimName = 'Walk' | 'Attack' | 'Idle' | 'Shoot' | 'Charge' | 'Hurt' | 'Faint';
export const ANIMS: AnimName[] = ['Walk', 'Attack', 'Idle', 'Shoot', 'Charge', 'Hurt', 'Faint'];

export type SpriteOrigin = 'official' | 'mixed' | 'fan' | 'custom';

export interface PackPokemon {
  id: number;
  name: string;
  types: string[];
  stats: { bst?: number; atk?: number; spd?: number; rarity?: number; legendary?: boolean };
  shadow_size: number;
  hovers: boolean;
  /** Alto del frame de Idle (decide la escala por defecto). */
  idleH: number;
  /** Duración total de cada animación, en segundos. */
  animDur: Partial<Record<AnimName, number>>;
  origin: SpriteOrigin;
  /** true si en el atlas se ha sustituido por la criatura genérica (modo fan-only). */
  placeholder: boolean;
}

export interface PackAttack {
  name: string;
  type: string;
  kind: string;
  base_stats: Record<string, number>;
  palette: string;
}

export interface Pack {
  source: { title: string; version: string; spriteSource: string; generatedFrom: string };
  castAnim: Record<string, AnimName>;
  typePalettes: Record<string, string[]>;
  pokemon: Record<string, PackPokemon>;
  attacks: Record<string, PackAttack>;
}

export const PACK = packJson as unknown as Pack;
