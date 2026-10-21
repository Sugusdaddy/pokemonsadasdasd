import { T, SPEEDS, RULES, RARITIES, LEVEL_STAT_MULT } from '../config.js';

// ─────────────────────────────────────────────────────────────
//  CARTAS
//  Campos (todos opcionales salvo pokemon y cost):
//    pokemon   ID de la Pokédex (carpeta pokemon/0025_Pikachu → 25)
//    cost      coste de elixir
//    rarity    'common' | 'rare' | 'epic' | 'legendary'
//    arena     índice de arena (config.ARENAS) en el que se desbloquea
//    type      'unit' (por defecto) o 'spell'
//    name      nombre visible (por defecto el de los metadatos)
//    count     cuántas tropas salen (enjambres)
//    hp, dmg   vida y daño por golpe AL NIVEL INICIAL DE SU RAREZA
//    hitSpeed  segundos entre golpes
//    range     alcance (0.8*T = cuerpo a cuerpo, 5*T = a distancia)
//    splash    radio de daño en área (0 = un solo objetivo)
//    speed     'slow' | 'medium' | 'fast' | 'veryfast' | número px/s
//    targets   'ground' | 'any' | 'buildings'
//    flying    vuela (por defecto: campo "hovers" de los metadatos)
//    move      id de ataque de animations_metadata.json → sprite, tipo y efectos
//    scale     escala del sprite (por defecto según su tamaño)
//    desc      texto de la carta
//  Hechizos: radius, dmg, towerDmg (multiplicador contra torres), move
//
//  Si solo pones { pokemon, cost } el resto se calcula a partir del pack.
// ─────────────────────────────────────────────────────────────

const G = 'ground', A = 'any', B = 'buildings';

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

  // ── Arena 2 · Torre Fantasma ──
  gastly:     { pokemon: 92,  cost: 3, rarity: 'common', arena: 2, hp: 300,  dmg: 75,  hitSpeed: 1.2, range: 3.5 * T, speed: 'fast', move: 'sludge', targets: A, desc: 'Gas volador que lanza lodo.' },
  haunter:    { pokemon: 93,  cost: 4, rarity: 'rare',   arena: 2, hp: 520,  dmg: 110, hitSpeed: 1.4, range: 4.5 * T, speed: 'medium', move: 'shadow-ball', targets: A, desc: 'Fantasma aéreo con Bola Sombra.' },
  marowak:    { pokemon: 105, cost: 4, rarity: 'rare',   arena: 2, hp: 900,  dmg: 110, hitSpeed: 1.4, range: 3.5 * T, splash: 1 * T, speed: 'medium', move: 'bonemerang', targets: G, desc: 'Huesomerang que golpea en área.' },
  gengar:     { pokemon: 94,  cost: 4, rarity: 'epic',   arena: 2, hp: 620,  dmg: 140, hitSpeed: 1.6, range: 5 * T,   speed: 'medium', move: 'shadow-ball', targets: A, desc: 'Daño enorme desde lejos.' },
  arcanine:   { pokemon: 59,  cost: 4, rarity: 'epic',   arena: 2, hp: 900,  dmg: 125, hitSpeed: 1.2, range: 0.9 * T, speed: 'fast', move: 'flame-wheel', targets: G, desc: 'Velocísimo y deja quemaduras.' },
  flamespell: { type: 'spell', pokemon: 37, name: 'Llamarada', cost: 4, rarity: 'rare', arena: 2, dmg: 260, towerDmg: 0.35, radius: 2.2 * T, move: 'heat-wave', desc: 'Fuego en área que además quema.' },

  // ── Arena 3 · Islas Espuma ──
  psyduck:    { pokemon: 54,  cost: 3, rarity: 'common', arena: 3, hp: 560,  dmg: 66,  hitSpeed: 1.2, range: 4.5 * T, speed: 'medium', move: 'confusion', targets: A, desc: 'Ataque psíquico a distancia.' },
  jynx:       { pokemon: 124, cost: 4, rarity: 'rare',   arena: 3, hp: 600,  dmg: 80,  hitSpeed: 1.4, range: 4 * T,   splash: 1.2 * T, speed: 'medium', move: 'powder-snow', targets: A, desc: 'Nieve en área que ralentiza.' },
  vaporeon:   { pokemon: 134, cost: 4, rarity: 'epic',   arena: 3, hp: 1100, dmg: 90,  hitSpeed: 1.2, range: 4 * T,   speed: 'medium', move: 'water-gun', targets: A, desc: 'Mucha vida y ataque a distancia.' },
  lapras:     { pokemon: 131, cost: 5, rarity: 'epic',   arena: 3, hp: 1500, dmg: 120, hitSpeed: 1.6, range: 5 * T,   splash: 1 * T, speed: 'slow', move: 'ice-beam', targets: A, desc: 'Rayo hielo en área que congela.' },
  articuno:   { pokemon: 144, cost: 5, rarity: 'legendary', arena: 3, hp: 1000, dmg: 120, hitSpeed: 1.6, range: 4 * T, splash: 1.4 * T, speed: 'medium', move: 'ice-beam', targets: A, desc: 'Ave legendaria de hielo.' },
  blizzard:   { type: 'spell', pokemon: 225, name: 'Ventisca', cost: 3, rarity: 'rare', arena: 3, dmg: 200, towerDmg: 0.35, radius: 2.6 * T, move: 'hail', desc: 'Granizo en área que ralentiza.' },

  // ── Arena 4 · Monte Ascuas ──
  growlithe:  { pokemon: 58,  cost: 3, rarity: 'common', arena: 4, count: 2, hp: 360, dmg: 80, hitSpeed: 1.1, range: 0.7 * T, speed: 'fast', move: 'flame-wheel', targets: G, desc: 'Pareja de cachorros de fuego.' },
  magmar:     { pokemon: 126, cost: 4, rarity: 'rare',   arena: 4, hp: 640,  dmg: 70,  hitSpeed: 1.0, range: 2.8 * T, splash: 1 * T, speed: 'medium', move: 'flamethrower', targets: A, desc: 'Lanzallamas en área.' },
  golem:      { pokemon: 76,  cost: 5, rarity: 'rare',   arena: 4, hp: 2000, dmg: 160, hitSpeed: 1.6, range: 0.8 * T, speed: 'slow', move: 'body-slam', targets: B, desc: 'Roca andante que va a por torres.' },
  flareon:    { pokemon: 136, cost: 4, rarity: 'epic',   arena: 4, hp: 950,  dmg: 140, hitSpeed: 1.4, range: 0.9 * T, splash: 0.9 * T, speed: 'fast', move: 'flame-wheel', targets: G, desc: 'Golpes de fuego en área.' },
  charizard:  { pokemon: 6,   cost: 5, rarity: 'epic',   arena: 4, hp: 1000, dmg: 110, hitSpeed: 1.5, range: 3.5 * T, splash: 1.2 * T, speed: 'fast', move: 'flamethrower', targets: A, flying: true, desc: 'Dragón volador con lanzallamas.' },
  moltres:    { pokemon: 146, cost: 5, rarity: 'legendary', arena: 4, hp: 1050, dmg: 170, hitSpeed: 1.7, range: 4 * T, splash: 1.2 * T, speed: 'medium', move: 'heat-wave', targets: A, desc: 'Ave legendaria de fuego.' },

  // ── Arena 5 · Meseta Añil ──
  machamp:    { pokemon: 68,  cost: 5, rarity: 'rare',   arena: 5, hp: 1500, dmg: 190, hitSpeed: 1.4, range: 0.9 * T, splash: 1 * T, speed: 'medium', move: 'karate-chop', targets: G, desc: 'Cuatro brazos, golpes en área.' },
  lucario:    { pokemon: 448, cost: 4, rarity: 'epic',   arena: 5, hp: 700,  dmg: 120, hitSpeed: 1.2, range: 5 * T,   speed: 'medium', move: 'aura-sphere', targets: A, desc: 'Esfera aural precisa.' },
  scyther:    { pokemon: 123, cost: 4, rarity: 'epic',   arena: 5, hp: 800,  dmg: 160, hitSpeed: 1.0, range: 0.9 * T, speed: 'veryfast', move: 'aerial-ace', targets: G, desc: 'Asesino rapidísimo.' },
  snorlax:    { pokemon: 143, cost: 6, rarity: 'epic',   arena: 5, hp: 3400, dmg: 200, hitSpeed: 1.5, range: 0.8 * T, speed: 'slow', move: 'body-slam', targets: B, desc: 'El tanque definitivo.' },
  gyarados:   { pokemon: 130, cost: 6, rarity: 'epic',   arena: 5, hp: 1800, dmg: 180, hitSpeed: 1.8, range: 2.5 * T, speed: 'medium', move: 'hydro-pump', targets: A, desc: 'Serpiente voladora furiosa.' },
  zapdos:     { pokemon: 145, cost: 5, rarity: 'legendary', arena: 5, hp: 900, dmg: 160, hitSpeed: 1.4, range: 5 * T, speed: 'medium', move: 'thunderbolt', targets: A, desc: 'Ave legendaria eléctrica.' },
  dragonite:  { pokemon: 149, cost: 6, rarity: 'legendary', arena: 5, hp: 2000, dmg: 220, hitSpeed: 1.4, range: 1.0 * T, speed: 'medium', move: 'dragon-rage', targets: A, flying: true, desc: 'Dragón amable… salvo en combate.' },
  mewtwo:     { pokemon: 150, cost: 7, rarity: 'legendary', arena: 5, hp: 1400, dmg: 200, hitSpeed: 1.3, range: 5.5 * T, splash: 1.2 * T, speed: 'medium', move: 'confusion', targets: A, desc: 'El Pokémon más poderoso.' },
};

export const STARTER_DECK = ['pikachu', 'bulbasaur', 'charmander', 'squirtle', 'rattata', 'pidgey', 'machop', 'rockslide'];

const DEFAULT_MOVE = {
  normal: 'tackle', fire: 'ember', water: 'water-gun', grass: 'vine-whip', electric: 'thunder-shock',
  psychic: 'confusion', ice: 'ice-beam', fighting: 'karate-chop', poison: 'sludge', ground: 'bonemerang',
  flying: 'wing-attack', bug: 'bug-bite', rock: 'rock-throw', ghost: 'shadow-ball', dragon: 'dragon-rage',
  dark: 'bite', steel: 'metal-claw', fairy: 'fairy-wind',
};
const MELEE_KINDS = new Set(['melee', 'dash', 'aura', 'trail', 'buff', 'orbit']);
const RARITY_FROM_META = (s) => (s.legendary || s.rarity >= 5 ? 'legendary' : s.rarity >= 3 ? 'epic' : s.rarity === 2 ? 'rare' : 'common');

const resolved = {};

/** Completa una carta con valores por defecto usando los metadatos del pack. */
export function resolveCard(key, meta) {
  const def = CARDS[key];
  if (!def) throw new Error(`Carta desconocida: ${key}`);
  const pk = meta.pokemon[String(def.pokemon)];
  if (!pk) throw new Error(`El Pokémon ${def.pokemon} (${key}) no está en animations_metadata.json`);
  const types = pk.types || ['normal'];
  const move = def.move || DEFAULT_MOVE[types[0]] || 'tackle';
  const mv = meta.attacks[move] || meta.attacks.tackle;
  const melee = MELEE_KINDS.has(mv.kind);
  const f = (pk.stats?.bst || 400) / 420;
  const atk = pk.stats?.atk || 1;
  const spd = pk.stats?.spd || 100;
  const idleH = pk.animations?.Idle?.frame_height || 40;

  const c = {
    key,
    type: def.type || 'unit',
    name: def.name || pk.name,
    pokemon: def.pokemon,
    types,
    rarity: def.rarity || RARITY_FROM_META(pk.stats || {}),
    arena: def.arena ?? 0,
    desc: def.desc || '',
    cost: def.cost,
    count: def.count || 1,
    move,
    moveType: mv.type,
    moveKind: mv.kind,
    moveStats: mv.base_stats || {},
    palette: mv.vfx?.palette || types[0],
    flying: def.flying ?? !!pk.hovers,
    targets: def.targets || 'ground',
    hp: def.hp ?? Math.round(def.cost * (melee ? 260 : 150) * f),
    dmg: def.dmg ?? Math.round(def.cost * (melee ? 28 : 24) * atk),
    hitSpeed: def.hitSpeed ?? 1.2,
    range: def.range ?? (melee ? 0.8 * T : 5 * T),
    splash: def.splash ?? (mv.kind === 'nova' || mv.kind === 'cone' ? 1.2 * T : 0),
    speedName: typeof def.speed === 'string' ? def.speed : (spd >= 115 ? 'fast' : spd <= 90 ? 'slow' : 'medium'),
    scale: def.scale ?? (idleH >= 88 ? 1 : idleH >= 64 ? 1.5 : RULES.unitScale),
    radius: [9, 12, 18][pk.shadow_size ?? 1] ?? 12,
    radiusSpell: def.radius ?? 2 * T,
    towerDmg: def.towerDmg ?? 0.35,
  };
  c.speed = typeof def.speed === 'number' ? def.speed : SPEEDS[c.speedName];
  if (def.targets == null && c.range > 1.2 * T) c.targets = 'any';
  resolved[key] = c;
  return c;
}

export function resolveAll(meta) {
  return Object.keys(CARDS).map((k) => resolveCard(k, meta));
}

export function getCard(key) {
  const c = resolved[key];
  if (!c) throw new Error(`Carta no resuelta: ${key}`);
  return c;
}

export const startLevel = (card) => RARITIES[card.rarity].start;

/** Copia de la carta con vida y daño escalados a un nivel. */
export function cardAtLevel(key, level) {
  const c = getCard(key);
  const lv = Math.max(level ?? startLevel(c), startLevel(c));
  const m = Math.pow(LEVEL_STAT_MULT, lv - startLevel(c));
  return { ...c, level: lv, hp: Math.round(c.hp * m), dmg: Math.round(c.dmg * m) };
}

export function allCardKeys() {
  return Object.keys(CARDS).sort((a, b) => {
    const ca = getCard(a), cb = getCard(b);
    return ca.arena - cb.arena || ca.cost - cb.cost || a.localeCompare(b);
  });
}

export function cardsUpToArena(arena) {
  return allCardKeys().filter((k) => getCard(k).arena <= arena);
}
