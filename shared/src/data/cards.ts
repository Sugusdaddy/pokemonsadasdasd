import { T, SPEEDS, RULES, RARITIES, LEVEL_STAT_MULT, type Rarity, type SpeedName } from '../config';
import { PACK, type Pack } from './pack';

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
//  Si usas un Pokémon nuevo, vuelve a ejecutar `npm run assets`.
// ─────────────────────────────────────────────────────────────

import { CARDS, DEFS, STARTER_DECK, DEFAULT_MOVE, type CardDef, type CardKey, type Targets } from './cardDefs';

export { CARDS, STARTER_DECK, type CardDef, type CardKey, type Targets };

const MELEE_KINDS = new Set(['melee', 'dash', 'aura', 'trail', 'buff', 'orbit']);
const RARITY_FROM_META = (s: { legendary?: boolean; rarity?: number }): Rarity =>
  s.legendary || (s.rarity ?? 0) >= 5
    ? 'legendary'
    : (s.rarity ?? 0) >= 3
      ? 'epic'
      : s.rarity === 2
        ? 'rare'
        : 'common';

/** Carta completa (al nivel inicial de su rareza salvo que venga de cardAtLevel). */
export interface Card {
  key: string;
  type: 'unit' | 'spell';
  name: string;
  pokemon: number;
  types: string[];
  rarity: Rarity;
  arena: number;
  desc: string;
  cost: number;
  count: number;
  move: string;
  moveType: string;
  moveKind: string;
  moveStats: Record<string, number>;
  palette: string;
  flying: boolean;
  targets: Targets;
  hp: number;
  dmg: number;
  hitSpeed: number;
  range: number;
  splash: number;
  speedName: string;
  speed: number;
  scale: number;
  radius: number;
  radiusSpell: number;
  towerDmg: number;
  /** Duración de la animación de ataque (decide el retardo del golpe). */
  attackAnimDur: number;
  level: number;
}

/** Completa una carta con valores por defecto usando los datos del pack. */
export function resolveCard(key: string, pack: Pack = PACK): Card {
  const def = DEFS[key];
  if (!def) throw new Error(`Carta desconocida: ${key}`);
  const pk = pack.pokemon[String(def.pokemon)];
  if (!pk) throw new Error(`El Pokémon ${def.pokemon} (${key}) no está en pack.json: ejecuta "npm run assets"`);
  const types = pk.types.length ? pk.types : ['normal'];
  const move = def.move || DEFAULT_MOVE[types[0]] || 'tackle';
  const mv = pack.attacks[move] || pack.attacks.tackle;
  const melee = MELEE_KINDS.has(mv.kind);
  const f = (pk.stats.bst || 400) / 420;
  const atk = pk.stats.atk || 1;
  const spd = pk.stats.spd || 100;
  const idleH = pk.idleH || 40;
  const rarity = def.rarity || RARITY_FROM_META(pk.stats);

  const range = def.range ?? (melee ? 0.8 * T : 5 * T);
  const speedName = typeof def.speed === 'string' ? def.speed : spd >= 115 ? 'fast' : spd <= 90 ? 'slow' : 'medium';
  let targets: Targets = def.targets || 'ground';
  if (def.targets == null && range > 1.2 * T) targets = 'any';
  const castAnim = range <= 1.2 * T ? 'Attack' : pack.castAnim[mv.kind] || 'Shoot';

  return {
    key,
    type: def.type || 'unit',
    name: def.name || pk.name,
    pokemon: def.pokemon,
    types,
    rarity,
    arena: def.arena ?? 0,
    desc: def.desc || '',
    cost: def.cost,
    count: def.count || 1,
    move,
    moveType: mv.type,
    moveKind: mv.kind,
    moveStats: mv.base_stats || {},
    palette: mv.palette || types[0],
    flying: def.flying ?? !!pk.hovers,
    targets,
    hp: def.hp ?? Math.round(def.cost * (melee ? 260 : 150) * f),
    dmg: def.dmg ?? Math.round(def.cost * (melee ? 28 : 24) * atk),
    hitSpeed: def.hitSpeed ?? 1.2,
    range,
    splash: def.splash ?? (mv.kind === 'nova' || mv.kind === 'cone' ? 1.2 * T : 0),
    speedName,
    speed: typeof def.speed === 'number' ? def.speed : SPEEDS[speedName as SpeedName],
    scale: def.scale ?? (idleH >= 88 ? 1 : idleH >= 64 ? 1.5 : RULES.unitScale),
    radius: [9, 12, 18][pk.shadow_size ?? 1] ?? 12,
    radiusSpell: def.radius ?? 2 * T,
    towerDmg: def.towerDmg ?? 0.35,
    attackAnimDur: pk.animDur[castAnim] ?? 0.4,
    level: RARITIES[rarity].start,
  };
}

const resolved: Record<string, Card> = {};
for (const k of Object.keys(DEFS)) resolved[k] = resolveCard(k);

export function getCard(key: string): Card {
  const c = resolved[key];
  if (!c) throw new Error(`Carta desconocida: ${key}`);
  return c;
}

export const isCardKey = (key: string): boolean => key in resolved;

export const startLevel = (card: Card): number => RARITIES[card.rarity].start;

/** Multiplicador de nivel. Se calcula multiplicando (no con Math.pow) para que sea idéntico en todos los motores. */
export function levelMult(steps: number, base = LEVEL_STAT_MULT): number {
  let m = 1;
  for (let i = 0; i < steps; i++) m *= base;
  return m;
}

/** Copia de la carta con vida y daño escalados a un nivel. */
export function cardAtLevel(key: string, level?: number): Card {
  const c = getCard(key);
  const lv = Math.max(level ?? startLevel(c), startLevel(c));
  const m = levelMult(lv - startLevel(c));
  return { ...c, level: lv, hp: Math.round(c.hp * m), dmg: Math.round(c.dmg * m) };
}

export function allCardKeys(): string[] {
  return Object.keys(resolved).sort((a, b) => {
    const ca = getCard(a),
      cb = getCard(b);
    return ca.arena - cb.arena || ca.cost - cb.cost || a.localeCompare(b);
  });
}

export function cardsUpToArena(arena: number): string[] {
  return allCardKeys().filter((k) => getCard(k).arena <= arena);
}

/** IDs de todos los Pokémon que usan las cartas. */
export function cardPokemonIds(): number[] {
  return [...new Set(Object.values(DEFS).map((d) => d.pokemon))];
}

/** Ataques que usan las cartas (tras resolver el ataque por defecto). */
export function cardMoves(): string[] {
  return [...new Set(Object.values(resolved).map((c) => c.move))];
}
