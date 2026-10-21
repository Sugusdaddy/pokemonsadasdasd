// ─────────────────────────────────────────────────────────────
//  CONFIGURACIÓN GENERAL: casi todo el "balance" se toca aquí.
//  Lo comparten el cliente, el servidor y la simulación.
// ─────────────────────────────────────────────────────────────

export const TITLE = 'Arena Royale';
export const VERSION = '3.0-phase2a';

// ─────────────────────────── Arte ───────────────────────────
// `npm run assets` lee el pack de `root` y genera los atlas del cliente.
//  - spriteSource 'all'      usa todos los sprites del pack.
//  - spriteSource 'fan-only' solo los de fans (CC BY-NC, ver CREDITS.md); los
//    oficiales de Chunsoft y los mixtos se sustituyen por una criatura genérica.
//  - Para arte propio, pon root en otra carpeta con la misma estructura y el
//    mismo animations_metadata.json (ver ART_PIPELINE.md) y spriteSource 'all'.
// Tras cambiarlo, vuelve a ejecutar `npm run assets`.
export type SpriteSource = 'all' | 'fan-only';
export const ART: { root: string; spriteSource: SpriteSource } = {
  root: 'assets/SpritesPokemon/',
  spriteSource: 'all',
};

// Resolución lógica (vertical, como un móvil). Se escala sola a la pantalla.
export const W = 720;
export const H = 1280;

// 1 casilla = 40 px. Rangos y velocidades se expresan en casillas × T.
export const T = 40;

// La simulación corre a un tick fijo de 20 Hz.
export const TICK_RATE = 20;
export const DT = 1 / TICK_RATE;

export const ARENA = {
  top: 70,
  bottom: 1070,
  left: 0,
  right: W,
  riverY: 570,
  riverHalf: 20,
  bridges: [140, 580] as const,
  bridgeHalf: 40,
};

export const TOWER_LAYOUT = {
  kingX: W / 2,
  princessX: [140, 580] as const,
  kingOffset: 104,
  princessOffset: 230,
};

export type TowerKind = 'king' | 'princess';

// Valores a nivel de rey 1. Suben un 7 % por cada nivel de rey.
export const TOWERS: Record<TowerKind, { hp: number; dmg: number; hitSpeed: number; range: number; radius: number }> = {
  king: { hp: 2400, dmg: 60, hitSpeed: 1.0, range: 7.0 * T, radius: 46 },
  princess: { hp: 1400, dmg: 50, hitSpeed: 0.8, range: 7.5 * T, radius: 34 },
};
export const TOWER_LEVEL_MULT = 1.07;

// El Pokémon que "vive" encima de cada torre y su ataque.
// blue = abajo (el jugador local), red = arriba (el rival).
export const TOWER_GUARDIANS: Record<'blue' | 'red', Record<TowerKind, { pokemon: number; move: string }>> = {
  blue: { king: { pokemon: 25, move: 'thunder-shock' }, princess: { pokemon: 7, move: 'water-gun' } },
  red: { king: { pokemon: 150, move: 'confusion' }, princess: { pokemon: 92, move: 'shadow-ball' } },
};

export const RULES = {
  matchTime: 180,
  doubleElixirAt: 60,
  overtime: 60,
  elixirStart: 5,
  elixirMax: 10,
  elixirRegen: 2.8,
  deployTime: 1.0,
  handSize: 4,
  unitScale: 2,
  projectileSpeed: 520,
  spellDelay: 0.55,
  typeMult: { super: 1.5, weak: 0.75, immune: 0.5 },
};

export const SPEEDS = {
  slow: 0.75 * T,
  medium: 1.0 * T,
  fast: 1.33 * T,
  veryfast: 1.67 * T,
};
export type SpeedName = keyof typeof SPEEDS;

export const SIGHT = 5.5 * T;

// ─────────────────────────── Arenas ───────────────────────────
// Cada arena se desbloquea con X trofeos, cambia el aspecto del campo
// y desbloquea las cartas que tengan "arena: <índice>" en cards.ts.
export interface ArenaTheme {
  name: string;
  trophies: number;
  grass: [number, number];
  river: number;
  riverLight: number;
  edge: number;
  deco: 'tree' | 'rock' | 'grave' | 'ice' | 'lava' | 'pillar';
  star: number;
  /** Qué corre por el río (solo cambia cómo se dibuja). */
  liquid: 'water' | 'lava';
}
export const ARENAS: ArenaTheme[] = [
  {
    name: 'Bosque Verde',
    trophies: 0,
    grass: [0x6dbf4b, 0x64b443],
    river: 0x3d8bff,
    riverLight: 0x8ccaff,
    edge: 0x2c5e2a,
    deco: 'tree',
    liquid: 'water',
    star: 25,
  },
  {
    name: 'Monte Luna',
    trophies: 300,
    grass: [0x9a8a78, 0x8f7f6e],
    river: 0x4a7fd0,
    riverLight: 0x9cc4ff,
    edge: 0x3d342c,
    deco: 'rock',
    liquid: 'water',
    star: 35,
  },
  {
    name: 'Torre Fantasma',
    trophies: 700,
    grass: [0x7d7398, 0x73698d],
    river: 0x5b3fa0,
    riverLight: 0xb59cff,
    edge: 0x2a2440,
    deco: 'grave',
    liquid: 'water',
    star: 94,
  },
  {
    name: 'Islas Espuma',
    trophies: 1100,
    grass: [0xdcecf5, 0xcfe2ee],
    river: 0x2f8aa8,
    riverLight: 0xbff3ff,
    edge: 0x7fa6bf,
    deco: 'ice',
    liquid: 'water',
    star: 131,
  },
  {
    name: 'Monte Ascuas',
    trophies: 1600,
    grass: [0x6e4a3a, 0x654335],
    river: 0xff6a1f,
    riverLight: 0xffd36a,
    edge: 0x2a1610,
    deco: 'lava',
    liquid: 'lava',
    star: 146,
  },
  {
    name: 'Meseta Añil',
    trophies: 2200,
    grass: [0x6b8fd8, 0x6285cf],
    river: 0x1f56c4,
    riverLight: 0xffd84a,
    edge: 0x1b2a6b,
    deco: 'pillar',
    liquid: 'water',
    star: 150,
  },
];

/** Índice de la arena que corresponde a unos trofeos. */
export function arenaFor(trophies: number): number {
  let a = 0;
  ARENAS.forEach((ar, i) => {
    if (trophies >= ar.trophies) a = i;
  });
  return a;
}

// ─────────────────────────── Cartas ───────────────────────────
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export const RARITY_ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
export const RARITIES: Record<Rarity, { label: string; color: number; css: string; start: number }> = {
  common: { label: 'Común', color: 0xb9c4d6, css: '#b9c4d6', start: 1 },
  rare: { label: 'Rara', color: 0xf2a12b, css: '#f2a12b', start: 3 },
  epic: { label: 'Épica', color: 0xb05cff, css: '#c98bff', start: 6 },
  legendary: { label: 'Legendaria', color: 0x3fe0d0, css: '#6ff0e2', start: 9 },
};
export const MAX_LEVEL = 13;
export const LEVEL_STAT_MULT = 1.08; // +8 % vida/daño por nivel
// cartas necesarias para subir, por "paso" desde el nivel inicial de la rareza
export const UPGRADE_CARDS = [2, 4, 10, 20, 50, 100, 200, 400, 800, 1000, 1500, 2000];
// oro para subir AL nivel indicado (índice = nivel destino)
export const UPGRADE_GOLD = [0, 0, 5, 20, 50, 150, 400, 1000, 2000, 4000, 8000, 15000, 35000, 50000];
export const UPGRADE_XP = [0, 0, 4, 5, 6, 10, 25, 50, 100, 200, 400, 600, 800, 1600];
// XP para pasar del nivel de rey N al N+1
export const KING_XP = [0, 20, 50, 100, 200, 400, 800, 1600, 2400, 3600, 5200, 7200, 9999999];

// ─────────────────────────── Pokéballs ───────────────────────────
// unlock en segundos (ponlo en horas si quieres el ritmo real de Clash Royale)
export type BallType = 'poke' | 'super' | 'ultra' | 'master' | 'free' | 'crown';
export interface BallConfig {
  label: string;
  unlock: number;
  cards: number;
  gold: [number, number];
  rare: number;
  epic: number;
  legendaryChance: number;
  gems: [number, number];
  colors: [number, number];
  stripe?: number;
}
export const BALLS: Record<BallType, BallConfig> = {
  poke: {
    label: 'Poké Ball',
    unlock: 30,
    cards: 6,
    gold: [30, 50],
    rare: 1,
    epic: 0,
    legendaryChance: 0,
    gems: [0, 0],
    colors: [0xe8303a, 0xffffff],
  },
  super: {
    label: 'Super Ball',
    unlock: 180,
    cards: 15,
    gold: [90, 130],
    rare: 3,
    epic: 0.25,
    legendaryChance: 0.01,
    gems: [0, 0],
    colors: [0x2f6fe0, 0xffffff],
    stripe: 0xe8303a,
  },
  ultra: {
    label: 'Ultra Ball',
    unlock: 480,
    cards: 35,
    gold: [220, 320],
    rare: 7,
    epic: 1,
    legendaryChance: 0.06,
    gems: [0, 5],
    colors: [0x2a2a33, 0xffffff],
    stripe: 0xffd21a,
  },
  master: {
    label: 'Master Ball',
    unlock: 900,
    cards: 60,
    gold: [500, 700],
    rare: 14,
    epic: 4,
    legendaryChance: 1,
    gems: [5, 15],
    colors: [0x7b3fc4, 0xffffff],
    stripe: 0xff6ab4,
  },
  free: {
    label: 'Ball gratis',
    unlock: 0,
    cards: 3,
    gold: [20, 40],
    rare: 0,
    epic: 0,
    legendaryChance: 0,
    gems: [0, 3],
    colors: [0x3fbf5a, 0xffffff],
  },
  crown: {
    label: 'Ball corona',
    unlock: 0,
    cards: 14,
    gold: [120, 180],
    rare: 2,
    epic: 0.2,
    legendaryChance: 0.02,
    gems: [3, 10],
    colors: [0xffc21a, 0xffffff],
    stripe: 0xe8303a,
  },
};
// Orden en que se ganan las balls al vencer (se repite)
export const BALL_CYCLE: BallType[] = [
  'poke',
  'poke',
  'super',
  'poke',
  'poke',
  'super',
  'poke',
  'poke',
  'ultra',
  'poke',
  'poke',
  'super',
  'poke',
  'poke',
  'super',
  'poke',
  'ultra',
  'poke',
  'super',
  'master',
];
export const BALL_SLOTS = 4;
export const FREE_BALL_EVERY = 10 * 60; // segundos
export const CROWNS_FOR_CROWN_BALL = 10;
export const GEMS_PER_MINUTE_SKIP = 2;

export const ECONOMY = {
  startGold: 300,
  startGems: 120,
  winTrophies: [28, 32] as [number, number],
  lossTrophies: [22, 27] as [number, number],
  winGold: (arena: number) => 15 + arena * 5,
  winXp: 2,
};

export interface AiConfig {
  think: number;
  attackElixir: number;
  defendChance: number;
}
export const AI_BY_ARENA = (arena: number): AiConfig => ({
  think: Math.max(0.5, 1.4 - arena * 0.15),
  attackElixir: Math.max(6.5, 9 - arena * 0.4),
  defendChance: Math.min(1, 0.6 + arena * 0.09),
});

export const COLORS = {
  player: 0x3aa0ff,
  enemy: 0xff4a4a,
  elixir: 0xd63cf0,
  bridge: 0x9b6a3a,
  bridgeDark: 0x6e4c1e,
  hud: 0x1b1f3a,
  gold: 0xffc21a,
  gem: 0x3ee07a,
  panel: 0x23284d,
  panelDark: 0x14122b,
  blue: 0x5865d8,
  green: 0x3fbf5a,
  orange: 0xf2a12b,
  red: 0xe0454f,
};

export const FONT = '"Lilita One", "Arial Black", sans-serif';
