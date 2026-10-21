import { T, type Rarity, type SpeedName } from '../config';

// Definición de las cartas, sin depender del pack (la usa también `npm run assets`).
// La explicación de cada campo está en cards.ts.

export type Targets = 'ground' | 'any' | 'buildings';
/** Qué hace un hechizo al caer. */
export type SpellEffect = 'damage' | 'freeze' | 'poison' | 'heal' | 'rage';

export interface CardDef {
  pokemon: number;
  cost: number;
  rarity?: Rarity;
  arena?: number;
  type?: 'unit' | 'spell' | 'building';
  name?: string;
  count?: number;
  hp?: number;
  dmg?: number;
  hitSpeed?: number;
  range?: number;
  splash?: number;
  speed?: SpeedName | number;
  targets?: Targets;
  flying?: boolean;
  move?: string;
  scale?: number;
  desc?: string;
  radius?: number;
  towerDmg?: number;
  /** Edificios: segundos que dura (la vida baja sola hasta 0). */
  lifetime?: number;
  /** Edificios generadores: carta que sacan, cuántas y cada cuántos segundos. */
  spawn?: string;
  spawnCount?: number;
  spawnEvery?: number;
  /** Edificios de elixir: +1 de elixir cada tantos segundos. */
  elixirEvery?: number;
  /** Hechizos: efecto (por defecto 'damage') y duración en segundos de los que duran. */
  effect?: SpellEffect;
  duration?: number;
}

const G = 'ground',
  A = 'any',
  B = 'buildings';

// prettier-ignore
export const CARDS = {
  // ── Arena 0 · Bosque Verde ──
  pikachu:    { pokemon: 25,  cost: 3, rarity: 'rare',   arena: 0, hp: 340,  dmg: 62,  hitSpeed: 1.1, range: 5.5 * T, speed: 'medium', move: 'thunder-shock', targets: A, desc: 'Dispara rayos a distancia. Ideal contra voladores.' },
  bulbasaur:  { pokemon: 1,   cost: 3, rarity: 'common', arena: 0, hp: 760,  dmg: 85,  hitSpeed: 1.2, range: 0.9 * T, speed: 'medium', move: 'vine-whip', targets: G, desc: 'Resistente y fiable cuerpo a cuerpo.' },
  charmander: { pokemon: 4,   cost: 3, rarity: 'common', arena: 0, hp: 480,  dmg: 70,  hitSpeed: 1.1, range: 3.5 * T, speed: 'medium', move: 'ember', targets: A, desc: 'Ascuas que queman al objetivo.' },
  squirtle:   { pokemon: 7,   cost: 3, rarity: 'common', arena: 0, hp: 520,  dmg: 58,  hitSpeed: 1.0, range: 4.5 * T, speed: 'medium', move: 'water-gun', targets: A, desc: 'Pistola de agua de largo alcance.' },
  rattata:    { pokemon: 19,  cost: 2, rarity: 'common', arena: 0, count: 4, hp: 110, dmg: 50, hitSpeed: 1.0, range: 0.6 * T, speed: 'fast', move: 'bite', targets: G, desc: 'Cuatro mordiscos rápidos y baratos.' },
  pidgey:     { pokemon: 16,  cost: 3, rarity: 'common', arena: 0, count: 3, hp: 180, dmg: 55, hitSpeed: 1.0, range: 1.0 * T, speed: 'fast', move: 'wing-attack', targets: A, flying: true, desc: 'Bandada voladora que ataca todo.' },
  machop:     { pokemon: 66,  cost: 4, rarity: 'common', arena: 0, count: 3, hp: 330, dmg: 80, hitSpeed: 1.3, range: 0.7 * T, speed: 'medium', move: 'karate-chop', targets: G, desc: 'Tres luchadores con golpe kárate.' },
  eevee:      { pokemon: 133, cost: 2, rarity: 'rare',   arena: 0, hp: 430,  dmg: 72,  hitSpeed: 1.1, range: 0.7 * T, speed: 'fast', move: 'tackle', targets: G, desc: 'Barato, rápido y versátil.' },
  rockslide:  { type: 'spell', pokemon: 74, name: 'Avalancha', cost: 4, rarity: 'rare', arena: 0, dmg: 320, towerDmg: 0.35, radius: 2.5 * T, move: 'rock-slide', desc: 'Lluvia de rocas en área.' },

  // ── Arena 1 · Monte Luna ──
  zubat:      { pokemon: 41,  cost: 3, rarity: 'common', arena: 1, count: 3, hp: 190, dmg: 60, hitSpeed: 1.0, range: 1.6 * T, speed: 'fast', move: 'poison-sting', targets: A, desc: 'Tres murciélagos venenosos.' },
  cubone:     { pokemon: 104, cost: 3, rarity: 'common', arena: 1, hp: 500,  dmg: 75,  hitSpeed: 1.2, range: 4 * T,   speed: 'medium', move: 'bonemerang', targets: G, desc: 'Lanza su hueso a las tropas de tierra.' },
  clefairy:   { pokemon: 35,  cost: 3, rarity: 'rare',   arena: 1, hp: 450,  dmg: 55,  hitSpeed: 1.2, range: 4.5 * T, splash: 1 * T, speed: 'medium', move: 'fairy-wind', targets: A, desc: 'Viento feérico que golpea en área.' },
  jigglypuff: { pokemon: 39,  cost: 4, rarity: 'rare',   arena: 1, hp: 560,  dmg: 90,  hitSpeed: 1.4, range: 4.5 * T, splash: 1.3 * T, speed: 'medium', move: 'hyper-voice', targets: A, desc: 'Su canto daña a grupos enteros.' },
  onix:       { pokemon: 95,  cost: 5, rarity: 'rare',   arena: 1, hp: 2400, dmg: 140, hitSpeed: 1.5, range: 0.8 * T, speed: 'medium', move: 'rock-throw', targets: B, desc: 'Coloso que solo ataca torres.' },
  thunder:    { type: 'spell', pokemon: 26, name: 'Rayo', cost: 5, rarity: 'epic', arena: 1, dmg: 620, towerDmg: 0.3, radius: 1.6 * T, move: 'thunderbolt', desc: 'Descarga brutal en un área pequeña.' },
  forretress: { type: 'building', pokemon: 205, cost: 3, rarity: 'common', arena: 1, hp: 740, dmg: 85, hitSpeed: 0.9, range: 5.5 * T, targets: G, lifetime: 30, move: 'spikes', desc: 'Fortaleza que dispara púas a las tropas de tierra.' },
  poison:     { type: 'spell', pokemon: 110, name: 'Tóxico', cost: 4, rarity: 'rare', arena: 1, effect: 'poison', dmg: 400, duration: 8, towerDmg: 0.35, radius: 3 * T, move: 'toxic', desc: 'Nube venenosa que daña todo lo que hay dentro durante 8 s.' },

  // ── Arena 2 · Torre Fantasma ──
  gastly:     { pokemon: 92,  cost: 3, rarity: 'common', arena: 2, hp: 300,  dmg: 75,  hitSpeed: 1.2, range: 3.5 * T, speed: 'fast', move: 'sludge', targets: A, desc: 'Gas volador que lanza lodo.' },
  haunter:    { pokemon: 93,  cost: 4, rarity: 'rare',   arena: 2, hp: 520,  dmg: 110, hitSpeed: 1.4, range: 4.5 * T, speed: 'medium', move: 'shadow-ball', targets: A, desc: 'Fantasma aéreo con Bola Sombra.' },
  marowak:    { pokemon: 105, cost: 4, rarity: 'rare',   arena: 2, hp: 900,  dmg: 110, hitSpeed: 1.4, range: 3.5 * T, splash: 1 * T, speed: 'medium', move: 'bonemerang', targets: G, desc: 'Huesomerang que golpea en área.' },
  gengar:     { pokemon: 94,  cost: 4, rarity: 'epic',   arena: 2, hp: 620,  dmg: 140, hitSpeed: 1.6, range: 5 * T,   speed: 'medium', move: 'shadow-ball', targets: A, desc: 'Daño enorme desde lejos.' },
  arcanine:   { pokemon: 59,  cost: 4, rarity: 'epic',   arena: 2, hp: 900,  dmg: 125, hitSpeed: 1.2, range: 0.9 * T, speed: 'fast', move: 'flame-wheel', targets: G, desc: 'Velocísimo y deja quemaduras.' },
  flamespell: { type: 'spell', pokemon: 37, name: 'Llamarada', cost: 4, rarity: 'rare', arena: 2, dmg: 260, towerDmg: 0.35, radius: 2.2 * T, move: 'heat-wave', desc: 'Fuego en área que además quema.' },
  combee:     { pokemon: 415, cost: 2, rarity: 'common', arena: 2, count: 3, hp: 100, dmg: 40, hitSpeed: 1.0, range: 1.0 * T, speed: 'fast', move: 'bug-bite', targets: A, flying: true, desc: 'Tres abejitas voladoras y baratas.' },
  vespiquen:  { type: 'building', pokemon: 416, cost: 4, rarity: 'rare', arena: 2, hp: 700, dmg: 0, lifetime: 35, spawn: 'combee', spawnCount: 1, spawnEvery: 5, desc: 'Colmena: cada 5 s sale un Combee volando.' },

  // ── Arena 3 · Islas Espuma ──
  psyduck:    { pokemon: 54,  cost: 3, rarity: 'common', arena: 3, hp: 560,  dmg: 66,  hitSpeed: 1.2, range: 4.5 * T, speed: 'medium', move: 'confusion', targets: A, desc: 'Ataque psíquico a distancia.' },
  jynx:       { pokemon: 124, cost: 4, rarity: 'rare',   arena: 3, hp: 600,  dmg: 80,  hitSpeed: 1.4, range: 4 * T,   splash: 1.2 * T, speed: 'medium', move: 'powder-snow', targets: A, desc: 'Nieve en área que ralentiza.' },
  vaporeon:   { pokemon: 134, cost: 4, rarity: 'epic',   arena: 3, hp: 1100, dmg: 90,  hitSpeed: 1.2, range: 4 * T,   speed: 'medium', move: 'water-gun', targets: A, desc: 'Mucha vida y ataque a distancia.' },
  lapras:     { pokemon: 131, cost: 5, rarity: 'epic',   arena: 3, hp: 1500, dmg: 120, hitSpeed: 1.6, range: 5 * T,   splash: 1 * T, speed: 'slow', move: 'ice-beam', targets: A, desc: 'Rayo hielo en área que congela.' },
  articuno:   { pokemon: 144, cost: 5, rarity: 'legendary', arena: 3, hp: 1000, dmg: 120, hitSpeed: 1.6, range: 4 * T, splash: 1.4 * T, speed: 'medium', move: 'ice-beam', targets: A, desc: 'Ave legendaria de hielo.' },
  blizzard:   { type: 'spell', pokemon: 225, name: 'Ventisca', cost: 3, rarity: 'rare', arena: 3, dmg: 200, towerDmg: 0.35, radius: 2.6 * T, move: 'hail', desc: 'Granizo en área que ralentiza.' },
  magneton:   { type: 'building', pokemon: 82, cost: 4, rarity: 'rare', arena: 3, hp: 900, dmg: 115, hitSpeed: 1.1, range: 5.5 * T, targets: A, lifetime: 35, move: 'flash-cannon', desc: 'Torreta magnética: dispara a tierra y aire.' },
  freeze:     { type: 'spell', pokemon: 362, name: 'Congelación', cost: 4, rarity: 'epic', arena: 3, effect: 'freeze', dmg: 80, duration: 4, towerDmg: 0.35, radius: 2.5 * T, move: 'powder-snow', desc: 'Congela tropas, edificios y torres durante 4 s.' },
  heal:       { type: 'spell', pokemon: 182, name: 'Aromaterapia', cost: 3, rarity: 'rare', arena: 3, effect: 'heal', dmg: 450, duration: 3, towerDmg: 0, radius: 3 * T, move: 'giga-drain', desc: 'Cura a tus tropas dentro del área durante 3 s.' },

  // ── Arena 4 · Monte Ascuas ──
  growlithe:  { pokemon: 58,  cost: 3, rarity: 'common', arena: 4, count: 2, hp: 360, dmg: 80, hitSpeed: 1.1, range: 0.7 * T, speed: 'fast', move: 'flame-wheel', targets: G, desc: 'Pareja de cachorros de fuego.' },
  magmar:     { pokemon: 126, cost: 4, rarity: 'rare',   arena: 4, hp: 640,  dmg: 70,  hitSpeed: 1.0, range: 2.8 * T, splash: 1 * T, speed: 'medium', move: 'flamethrower', targets: A, desc: 'Lanzallamas en área.' },
  golem:      { pokemon: 76,  cost: 5, rarity: 'rare',   arena: 4, hp: 2000, dmg: 160, hitSpeed: 1.6, range: 0.8 * T, speed: 'slow', move: 'body-slam', targets: B, desc: 'Roca andante que va a por torres.' },
  flareon:    { pokemon: 136, cost: 4, rarity: 'epic',   arena: 4, hp: 950,  dmg: 140, hitSpeed: 1.4, range: 0.9 * T, splash: 0.9 * T, speed: 'fast', move: 'flame-wheel', targets: G, desc: 'Golpes de fuego en área.' },
  charizard:  { pokemon: 6,   cost: 5, rarity: 'epic',   arena: 4, hp: 1000, dmg: 110, hitSpeed: 1.5, range: 3.5 * T, splash: 1.2 * T, speed: 'fast', move: 'flamethrower', targets: A, flying: true, desc: 'Dragón volador con lanzallamas.' },
  moltres:    { pokemon: 146, cost: 5, rarity: 'legendary', arena: 4, hp: 1050, dmg: 170, hitSpeed: 1.7, range: 4 * T, splash: 1.2 * T, speed: 'medium', move: 'heat-wave', targets: A, desc: 'Ave legendaria de fuego.' },
  rage:       { type: 'spell', pokemon: 57, name: 'Furia', cost: 2, rarity: 'epic', arena: 4, effect: 'rage', dmg: 0, duration: 6, towerDmg: 0, radius: 3 * T, move: 'swords-dance', desc: 'Tus tropas dentro del área se mueven y atacan un 35 % más rápido.' },
  chansey:    { type: 'building', pokemon: 113, cost: 5, rarity: 'epic', arena: 4, hp: 900, dmg: 0, lifetime: 60, elixirEvery: 8.5, desc: 'Pone un huevo de elixir (+1) cada 8,5 s mientras aguante.' },

  // ── Arena 5 · Meseta Añil ──
  machamp:    { pokemon: 68,  cost: 5, rarity: 'rare',   arena: 5, hp: 1500, dmg: 190, hitSpeed: 1.4, range: 0.9 * T, splash: 1 * T, speed: 'medium', move: 'karate-chop', targets: G, desc: 'Cuatro brazos, golpes en área.' },
  lucario:    { pokemon: 448, cost: 4, rarity: 'epic',   arena: 5, hp: 700,  dmg: 120, hitSpeed: 1.2, range: 5 * T,   speed: 'medium', move: 'aura-sphere', targets: A, desc: 'Esfera aural precisa.' },
  scyther:    { pokemon: 123, cost: 4, rarity: 'epic',   arena: 5, hp: 800,  dmg: 160, hitSpeed: 1.0, range: 0.9 * T, speed: 'veryfast', move: 'aerial-ace', targets: G, desc: 'Asesino rapidísimo.' },
  snorlax:    { pokemon: 143, cost: 6, rarity: 'epic',   arena: 5, hp: 3400, dmg: 200, hitSpeed: 1.5, range: 0.8 * T, speed: 'slow', move: 'body-slam', targets: B, desc: 'El tanque definitivo.' },
  gyarados:   { pokemon: 130, cost: 6, rarity: 'epic',   arena: 5, hp: 1800, dmg: 180, hitSpeed: 1.8, range: 2.5 * T, speed: 'medium', move: 'hydro-pump', targets: A, desc: 'Serpiente voladora furiosa.' },
  zapdos:     { pokemon: 145, cost: 5, rarity: 'legendary', arena: 5, hp: 900, dmg: 160, hitSpeed: 1.4, range: 5 * T, speed: 'medium', move: 'thunderbolt', targets: A, desc: 'Ave legendaria eléctrica.' },
  dragonite:  { pokemon: 149, cost: 6, rarity: 'legendary', arena: 5, hp: 2000, dmg: 220, hitSpeed: 1.4, range: 1.0 * T, speed: 'medium', move: 'dragon-rage', targets: A, flying: true, desc: 'Dragón amable… salvo en combate.' },
  mewtwo:     { pokemon: 150, cost: 7, rarity: 'legendary', arena: 5, hp: 1400, dmg: 200, hitSpeed: 1.3, range: 5.5 * T, splash: 1.2 * T, speed: 'medium', move: 'confusion', targets: A, desc: 'El Pokémon más poderoso.' },
} satisfies Record<string, CardDef>;

export type CardKey = keyof typeof CARDS;
export const DEFS: Record<string, CardDef> = CARDS;

export const STARTER_DECK: string[] = [
  'pikachu',
  'bulbasaur',
  'charmander',
  'squirtle',
  'rattata',
  'pidgey',
  'machop',
  'rockslide',
];

export const DEFAULT_MOVE: Record<string, string> = {
  normal: 'tackle',
  fire: 'ember',
  water: 'water-gun',
  grass: 'vine-whip',
  electric: 'thunder-shock',
  psychic: 'confusion',
  ice: 'ice-beam',
  fighting: 'karate-chop',
  poison: 'sludge',
  ground: 'bonemerang',
  flying: 'wing-attack',
  bug: 'bug-bite',
  rock: 'rock-throw',
  ghost: 'shadow-ball',
  dragon: 'dragon-rage',
  dark: 'bite',
  steel: 'metal-claw',
  fairy: 'fairy-wind',
};
