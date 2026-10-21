// ─────────────────────────────────────────────────────────────
//  ECONOMÍA: todas las reglas del progreso del jugador.
//  Funciones puras sobre el estado (sin red ni base de datos). El servidor las
//  aplica de forma autoritativa; el cliente solo muestra lo que le devuelve.
//  La hora (`now`, en ms) y el azar (`rand`) entran como parámetros para que
//  todo sea testeable y nadie pueda adelantar relojes desde el navegador.
// ─────────────────────────────────────────────────────────────
import {
  ARENAS,
  RARITIES,
  MAX_LEVEL,
  UPGRADE_CARDS,
  UPGRADE_GOLD,
  UPGRADE_XP,
  KING_XP,
  BALLS,
  BALL_CYCLE,
  BALL_SLOTS,
  FREE_BALL_EVERY,
  CROWNS_FOR_CROWN_BALL,
  GEMS_PER_MINUTE_SKIP,
  ECONOMY,
  arenaFor,
  type BallType,
  type Rarity,
} from '../config';
import { STARTER_DECK, cardsUpToArena, getCard, isCardKey, startLevel } from '../data/cards';
import { rollBall, type BallReward } from './balls';
import { ROAD } from './road';
import { defaultRand, randInt, type RandFn } from './random';
import { hasProfanity } from '../social/filter';
import { seasonAt, softReset, tierFor, type SeasonProgress, type SeasonReward } from './season';
import { MISSION_BONUS, missionDone, type MissionPeriod, type MissionReward, type MissionsState } from './missions';

export type SlotState = 'locked' | 'unlocking' | 'ready';
export interface BallSlot {
  type: BallType;
  arena: number;
  state: SlotState;
  readyAt?: number;
}
export interface OwnedCard {
  level: number;
  count: number;
}

/** Todo el progreso de un jugador. Se guarda tal cual (JSON) en la base de datos. */
export interface ProfileState {
  name: string;
  gold: number;
  gems: number;
  trophies: number;
  maxTrophies: number;
  kingLevel: number;
  xp: number;
  cards: Record<string, OwnedCard>;
  decks: string[][];
  activeDeck: number;
  slots: Array<BallSlot | null>;
  ballCycle: number;
  freeBallAt: number;
  crowns: number;
  roadClaimed: number[];
  shop: { day: string; bought: string[]; freeClaimed: boolean };
  stats: { wins: number; losses: number; draws: number; threeCrowns: number; battles: number; cardsFound: number };
  /** Temporada en curso (las cuentas anteriores a las temporadas no lo tienen hasta su primer cambio). */
  season?: SeasonProgress;
  /** Recompensa de la temporada anterior, pendiente de reclamar. */
  pendingSeason?: SeasonReward | null;
  /** Misiones diarias y semanales (las reparte el servidor al empezar cada periodo). */
  missions?: MissionsState;
  /** Tutorial terminado (y su premio cobrado). */
  tutorialDone?: boolean;
}

/** Error de regla de juego. `code` es una clave de traducción (`econ.*`). */
export class EconError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
const fail = (code: string): never => {
  throw new EconError(code);
};

export const DEFAULT_NAME = 'Entrenador';
export const NAME_MAX = 16;

export function freshProfile(now: number): ProfileState {
  const cards: Record<string, OwnedCard> = {};
  for (const k of STARTER_DECK) cards[k] = { level: startLevel(getCard(k)), count: 0 };
  return {
    name: DEFAULT_NAME,
    gold: ECONOMY.startGold,
    gems: ECONOMY.startGems,
    trophies: 0,
    maxTrophies: 0,
    kingLevel: 1,
    xp: 0,
    cards,
    decks: [[...STARTER_DECK], [...STARTER_DECK], [...STARTER_DECK]],
    activeDeck: 0,
    // primera ball lista para abrir (tutorial)
    slots: [{ type: 'super', arena: 0, state: 'ready' }, null, null, null],
    ballCycle: 0,
    freeBallAt: now,
    crowns: 0,
    roadClaimed: [],
    shop: { day: '', bought: [], freeClaimed: false },
    stats: { wins: 0, losses: 0, draws: 0, threeCrowns: 0, battles: 0, cardsFound: STARTER_DECK.length },
    season: { id: seasonAt(now).id, best: 0, battles: 0 },
    pendingSeason: null,
  };
}

// ───────────────────────── Consultas ─────────────────────────

export const arenaOf = (s: ProfileState): number => arenaFor(s.trophies);
export const deckOf = (s: ProfileState): string[] => s.decks[s.activeDeck];
export const levelOf = (s: ProfileState, key: string): number => s.cards[key]?.level ?? startLevel(getCard(key));
export const levelsOf = (s: ProfileState, keys: readonly string[]): Record<string, number> =>
  Object.fromEntries(keys.map((k) => [k, levelOf(s, k)]));

/** Nivel medio del mazo "normalizado" (como si todas fueran comunes). */
export function avgDeckLevel(s: ProfileState): number {
  const lv = deckOf(s).map((k) => levelOf(s, k) - startLevel(getCard(k)) + 1);
  return lv.reduce((a, b) => a + b, 0) / lv.length;
}

export function cardsNeeded(s: ProfileState, key: string): number {
  const step = levelOf(s, key) - RARITIES[getCard(key).rarity].start;
  return levelOf(s, key) >= MAX_LEVEL ? Infinity : (UPGRADE_CARDS[step] ?? Infinity);
}
export const goldNeeded = (s: ProfileState, key: string): number => UPGRADE_GOLD[levelOf(s, key) + 1] ?? Infinity;
export function canUpgrade(s: ProfileState, key: string): boolean {
  const c = s.cards[key];
  return !!c && c.level < MAX_LEVEL && c.count >= cardsNeeded(s, key);
}

export function remaining(slot: BallSlot | null, now: number): number {
  if (!slot) return 0;
  if (slot.state === 'locked') return BALLS[slot.type].unlock;
  if (slot.state === 'unlocking') return Math.max(0, ((slot.readyAt ?? 0) - now) / 1000);
  return 0;
}
export const skipCost = (slot: BallSlot | null, now: number): number =>
  Math.max(1, Math.ceil(remaining(slot, now) / 60) * GEMS_PER_MINUTE_SKIP);
export const freeBallRemaining = (s: ProfileState, now: number): number => Math.max(0, (s.freeBallAt - now) / 1000);

/** Día de la tienda (UTC, igual para todos): AAAA-MM-DD. */
export const shopDay = (now: number): string => new Date(now).toISOString().slice(0, 10);
export const msToNextShopDay = (now: number): number => {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - now;
};

// ───────────────────────── Cambios internos ─────────────────────────

function addCards(s: ProfileState, key: string, n: number): boolean {
  const isNew = !s.cards[key];
  if (isNew) {
    s.cards[key] = { level: startLevel(getCard(key)), count: n - 1 };
    s.stats.cardsFound += 1;
  } else s.cards[key].count += n;
  return isNew;
}

export function addXp(s: ProfileState, xp: number): boolean {
  s.xp += xp;
  let up = false;
  while (s.xp >= (KING_XP[s.kingLevel] ?? Infinity)) {
    s.xp -= KING_XP[s.kingLevel];
    s.kingLevel += 1;
    up = true;
  }
  return up;
}

function applyReward(s: ProfileState, reward: BallReward): BallReward {
  s.gold += reward.gold;
  s.gems += reward.gems;
  for (const it of reward.cards) it.isNew = addCards(s, it.key, it.count);
  return reward;
}

/** Los temporizadores de las balls avanzan con la hora del servidor. */
export function tickSlots(s: ProfileState, now: number): void {
  for (const slot of s.slots)
    if (slot && slot.state === 'unlocking' && now >= (slot.readyAt ?? 0)) slot.state = 'ready';
}

/** Al empezar un día nuevo se renueva la tienda. */
export function refreshShop(s: ProfileState, now: number): void {
  const day = shopDay(now);
  if (s.shop.day !== day) s.shop = { day, bought: [], freeClaimed: false };
}

// ───────────────────────── Acciones del jugador ─────────────────────────

export function setName(s: ProfileState, name: unknown): void {
  if (typeof name !== 'string') fail('econ.name');
  const n = (name as string).replace(/\s+/g, ' ').trim();
  if (!n || n.length > NAME_MAX || /[<>]/.test(n) || hasProfanity(n)) fail('econ.name');
  s.name = n;
}

export function setActiveDeck(s: ProfileState, i: unknown): void {
  if (!Number.isInteger(i) || (i as number) < 0 || (i as number) >= s.decks.length) fail('econ.deck');
  s.activeDeck = i as number;
}

/** Pone una carta en un hueco del mazo activo (si ya estaba en el mazo, se intercambian). */
export function setDeckCard(s: ProfileState, slot: unknown, key: unknown): void {
  if (!Number.isInteger(slot) || (slot as number) < 0 || (slot as number) > 7) fail('econ.deck');
  if (typeof key !== 'string' || !isCardKey(key) || !s.cards[key]) fail('econ.notOwned');
  const deck = deckOf(s);
  const k = key as string,
    i = slot as number;
  const existing = deck.indexOf(k);
  if (existing >= 0) [deck[existing], deck[i]] = [deck[i], deck[existing]];
  else deck[i] = k;
}

export function upgrade(s: ProfileState, key: unknown): { level: number; kingLevelUp: boolean } {
  if (typeof key !== 'string' || !isCardKey(key)) fail('econ.notOwned');
  const k = key as string;
  if (!canUpgrade(s, k)) fail('econ.cards');
  const gold = goldNeeded(s, k);
  if (s.gold < gold) fail('econ.gold');
  const c = s.cards[k];
  c.count -= cardsNeeded(s, k);
  s.gold -= gold;
  c.level += 1;
  return { level: c.level, kingLevelUp: addXp(s, UPGRADE_XP[c.level] || 0) };
}

function slotAt(s: ProfileState, i: unknown): BallSlot {
  if (!Number.isInteger(i) || (i as number) < 0 || (i as number) >= BALL_SLOTS) fail('econ.slot');
  const slot = s.slots[i as number];
  if (!slot) fail('econ.slot');
  return slot as BallSlot;
}

export function startUnlock(s: ProfileState, i: unknown, now: number): void {
  const slot = slotAt(s, i);
  if (slot.state !== 'locked') fail('econ.slot');
  if (s.slots.some((x) => x && x.state === 'unlocking')) fail('econ.alreadyUnlocking');
  slot.state = 'unlocking';
  slot.readyAt = now + BALLS[slot.type].unlock * 1000;
}

export function skip(s: ProfileState, i: unknown, now: number): number {
  const slot = slotAt(s, i);
  if (slot.state === 'ready') fail('econ.slot');
  const cost = skipCost(slot, now);
  if (s.gems < cost) fail('econ.gems');
  s.gems -= cost;
  slot.state = 'ready';
  return cost;
}

export function openSlot(s: ProfileState, i: unknown, now: number, rand: RandFn = defaultRand): BallReward {
  tickSlots(s, now);
  const slot = slotAt(s, i);
  if (slot.state !== 'ready') fail('econ.notReady');
  s.slots[i as number] = null;
  return applyReward(s, rollBall(slot.type, slot.arena, rand));
}

export function claimFreeBall(s: ProfileState, now: number, rand: RandFn = defaultRand): BallReward {
  if (freeBallRemaining(s, now) > 0) fail('econ.notReady');
  s.freeBallAt = now + FREE_BALL_EVERY * 1000;
  return applyReward(s, rollBall('free', arenaOf(s), rand));
}

export function claimCrownBall(s: ProfileState, rand: RandFn = defaultRand): BallReward {
  if (s.crowns < CROWNS_FOR_CROWN_BALL) fail('econ.notReady');
  s.crowns = 0;
  return applyReward(s, rollBall('crown', arenaOf(s), rand));
}

// ───────────────────────── Camino de trofeos ─────────────────────────

export function claimRoad(
  s: ProfileState,
  trophies: unknown,
  rand: RandFn = defaultRand,
): { gold?: number; gems?: number; ball?: BallReward } {
  const step = ROAD.find((r) => r.trophies === trophies);
  if (!step || s.maxTrophies < step.trophies) fail('econ.road');
  if (s.roadClaimed.includes(step!.trophies)) fail('econ.claimed');
  s.roadClaimed.push(step!.trophies);
  const r = step!.reward;
  if ('gold' in r) {
    s.gold += r.gold;
    return { gold: r.gold };
  }
  if ('gems' in r) {
    s.gems += r.gems;
    return { gems: r.gems };
  }
  return { ball: applyReward(s, rollBall(r.ball, arenaOf(s), rand)) };
}

// ───────────────────────── Tienda ─────────────────────────

export const CARD_OFFERS: Record<Rarity, { count: number; price: number }> = {
  common: { count: 20, price: 200 },
  rare: { count: 5, price: 500 },
  epic: { count: 1, price: 1000 },
  legendary: { count: 1, price: 20000 },
};
export const BALL_OFFERS: Array<{ type: BallType; gems: number }> = [
  { type: 'super', gems: 120 },
  { type: 'ultra', gems: 350 },
  { type: 'master', gems: 900 },
];
export const GOLD_OFFERS = [
  { gold: 1000, gems: 60 },
  { gold: 10000, gems: 500 },
];
export const DAILY_GIFT = 100;

export interface CardOffer {
  id: string;
  key: string;
  rarity: Rarity;
  count: number;
  price: number;
}

/** RNG simple a partir de un texto (las ofertas del día son iguales para la misma arena). */
function seeded(seed: string): RandFn {
  let a = 0;
  for (const ch of seed) a = (a * 31 + ch.charCodeAt(0)) >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Las 6 ofertas de cartas del día para una arena. */
export function dailyOffers(day: string, arena: number): CardOffer[] {
  const rnd = seeded(day + arena);
  const pool = cardsUpToArena(arena);
  const byR = (r: Rarity) => pool.filter((k) => getCard(k).rarity === r);
  const wants: Rarity[] = ['common', 'common', 'common', 'rare', 'rare', rnd() < 0.12 ? 'legendary' : 'epic'];
  const used = new Set<string>();
  return wants.map((want, i) => {
    let r = want;
    let list = byR(r).filter((k) => !used.has(k));
    if (!list.length) {
      r = 'common';
      list = byR('common').filter((k) => !used.has(k));
    }
    if (!list.length) list = pool;
    const key = list[Math.floor(rnd() * list.length)];
    used.add(key);
    return { id: `${day}-${i}`, key, rarity: r, ...CARD_OFFERS[r] };
  });
}

export function claimDailyGift(s: ProfileState, now: number): number {
  refreshShop(s, now);
  if (s.shop.freeClaimed) fail('econ.claimed');
  s.shop.freeClaimed = true;
  s.gold += DAILY_GIFT;
  return DAILY_GIFT;
}

export function buyCardOffer(
  s: ProfileState,
  id: unknown,
  now: number,
): { key: string; count: number; isNew: boolean } {
  refreshShop(s, now);
  const offer = dailyOffers(s.shop.day, arenaOf(s)).find((o) => o.id === id);
  if (!offer) fail('econ.offer');
  if (s.shop.bought.includes(offer!.id)) fail('econ.claimed');
  if (s.gold < offer!.price) fail('econ.gold');
  s.gold -= offer!.price;
  s.shop.bought.push(offer!.id);
  return { key: offer!.key, count: offer!.count, isNew: addCards(s, offer!.key, offer!.count) };
}

export function buyBall(s: ProfileState, type: unknown, rand: RandFn = defaultRand): BallReward {
  const offer = BALL_OFFERS.find((o) => o.type === type);
  if (!offer) fail('econ.offer');
  if (s.gems < offer!.gems) fail('econ.gems');
  s.gems -= offer!.gems;
  return applyReward(s, rollBall(offer!.type, arenaOf(s), rand));
}

export function buyGold(s: ProfileState, index: unknown): number {
  const offer = Number.isInteger(index) ? GOLD_OFFERS[index as number] : undefined;
  if (!offer) fail('econ.offer');
  if (s.gems < offer!.gems) fail('econ.gems');
  s.gems -= offer!.gems;
  s.gold += offer!.gold;
  return offer!.gold;
}

// ───────────────────────── Batallas ─────────────────────────

export type BattleOutcome = 'win' | 'loss' | 'draw';
export interface BattleResult {
  trophies: number;
  gold: number;
  ball: BallType | null;
  xp: number;
  arenaUp: boolean;
  crowns: number;
  kingLevelUp: boolean;
}

/** Mete una ball ganada en un hueco libre. Devuelve el tipo o null si no hay hueco. */
function grantBattleBall(s: ProfileState): BallType | null {
  const i = s.slots.findIndex((x) => !x);
  if (i < 0) return null;
  const type = BALL_CYCLE[s.ballCycle % BALL_CYCLE.length];
  s.ballCycle += 1;
  s.slots[i] = { type, arena: arenaOf(s), state: 'locked' };
  return type;
}

/** Recompensas de una partida. Solo lo llama el servidor con el resultado de SU simulación. */
export function applyBattle(
  s: ProfileState,
  outcome: BattleOutcome,
  myCrowns: number,
  rand: RandFn = defaultRand,
): BattleResult {
  const st = s.stats;
  st.battles += 1;
  const arenaBefore = arenaOf(s);
  const res: BattleResult = {
    trophies: 0,
    gold: 0,
    ball: null,
    xp: 0,
    arenaUp: false,
    crowns: myCrowns,
    kingLevelUp: false,
  };
  if (outcome === 'win') {
    st.wins += 1;
    if (myCrowns === 3) st.threeCrowns += 1;
    res.trophies = randInt(rand, ...ECONOMY.winTrophies);
    res.gold = ECONOMY.winGold(arenaBefore);
    res.ball = grantBattleBall(s);
    res.xp = ECONOMY.winXp;
  } else if (outcome === 'loss') {
    st.losses += 1;
    const floor = ARENAS[arenaBefore].trophies;
    res.trophies = -Math.min(randInt(rand, ...ECONOMY.lossTrophies), Math.max(0, s.trophies - floor));
  } else st.draws += 1;
  s.trophies = Math.max(0, s.trophies + res.trophies);
  s.maxTrophies = Math.max(s.maxTrophies, s.trophies);
  if (s.season) {
    s.season.battles += 1;
    s.season.best = Math.max(s.season.best, s.trophies);
  }
  s.gold += res.gold;
  s.crowns = Math.min(CROWNS_FOR_CROWN_BALL, s.crowns + myCrowns);
  res.kingLevelUp = addXp(s, res.xp);
  res.arenaUp = arenaOf(s) > arenaBefore;
  return res;
}

/** Limpia un estado cargado (cartas que ya no existen, mazos incompletos). */
export function sanitize(s: ProfileState): ProfileState {
  for (const k of Object.keys(s.cards)) if (!isCardKey(k)) delete s.cards[k];
  s.decks = s.decks.map((deck) => {
    const ok = deck.filter((k) => s.cards[k]);
    for (const k of STARTER_DECK) if (ok.length < 8 && !ok.includes(k)) ok.push(k);
    return ok.slice(0, 8);
  });
  return s;
}

// ───────────────────────── Temporadas ─────────────────────────

/**
 * Si ha empezado una temporada nueva desde la última vez: reinicio suave de trofeos y
 * recompensa pendiente (si jugó en la anterior). Devuelve true si ha cambiado algo.
 * `rank` = puesto en el ranking global al cerrar la temporada (lo pone el servidor).
 */
export function rollSeason(s: ProfileState, now: number, rank?: number): boolean {
  const current = seasonAt(now).id;
  if (!s.season) {
    s.season = { id: current, best: s.trophies, battles: 0 };
    return true;
  }
  if (s.season.id === current) return false;
  const old = s.season;
  const before = s.trophies;
  const after = softReset(before);
  if (old.battles > 0) {
    s.pendingSeason = {
      seasonId: old.id,
      best: Math.max(old.best, before),
      trophiesBefore: before,
      trophiesAfter: after,
      rank,
      tier: tierFor(Math.max(old.best, before)),
    };
  }
  s.trophies = after;
  s.season = { id: current, best: after, battles: 0 };
  return true;
}

/** Reclama la recompensa de la temporada anterior. */
export function claimSeasonReward(
  s: ProfileState,
  rand: RandFn = defaultRand,
): { gold: number; gems: number; ball?: BallReward } {
  const p = s.pendingSeason;
  if (!p) fail('econ.claimed');
  const { gold, gems, ball } = p!.tier;
  s.gold += gold;
  s.gems += gems;
  s.pendingSeason = null;
  return { gold, gems, ball: ball ? applyReward(s, rollBall(ball, arenaOf(s), rand)) : undefined };
}

// ───────────────────────── Misiones y tutorial ─────────────────────────

export interface MissionClaim {
  gold: number;
  gems: number;
  xp: number;
  kingLevelUp: boolean;
  ball?: BallReward;
}

function grantMissionReward(s: ProfileState, r: MissionReward, rand: RandFn): MissionClaim {
  const out: MissionClaim = { gold: r.gold ?? 0, gems: r.gems ?? 0, xp: r.xp ?? 0, kingLevelUp: false };
  s.gold += out.gold;
  s.gems += out.gems;
  out.kingLevelUp = addXp(s, out.xp);
  if (r.ball) out.ball = applyReward(s, rollBall(r.ball, arenaOf(s), rand));
  return out;
}

const missionPeriod = (p: unknown): MissionPeriod => (p === 'daily' || p === 'weekly' ? p : fail('econ.mission'));

/** Cobra una misión completada. */
export function claimMission(s: ProfileState, period: unknown, id: unknown, rand: RandFn = defaultRand): MissionClaim {
  const m = s.missions?.[missionPeriod(period)].list.find((x) => x.id === id);
  if (!m) fail('econ.mission');
  if (m!.claimed) fail('econ.claimed');
  if (!missionDone(m!)) fail('econ.missionUndone');
  m!.claimed = true;
  return grantMissionReward(s, m!.reward, rand);
}

/** Premio extra por haber cobrado las tres misiones del periodo. */
export function claimMissionBonus(s: ProfileState, period: unknown, rand: RandFn = defaultRand): MissionClaim {
  const p = missionPeriod(period);
  const board = s.missions?.[p];
  if (!board?.list.length) fail('econ.mission');
  if (board!.bonusClaimed) fail('econ.claimed');
  if (!board!.list.every((m) => m.claimed)) fail('econ.missionUndone');
  board!.bonusClaimed = true;
  return grantMissionReward(s, MISSION_BONUS[p], rand);
}

/** Premio por terminar el tutorial (una vez por cuenta). */
export const TUTORIAL_REWARD = { gold: 150, gems: 20 } as const;

export function completeTutorial(s: ProfileState): { gold: number; gems: number } {
  if (s.tutorialDone) fail('econ.claimed');
  s.tutorialDone = true;
  s.gold += TUTORIAL_REWARD.gold;
  s.gems += TUTORIAL_REWARD.gems;
  return { ...TUTORIAL_REWARD };
}

// ───────────────────────── Solo en desarrollo ─────────────────────────

/** "Modo prueba" de Perfil. El servidor solo lo permite si ALLOW_DEV_CHEATS=1. */
export function devCheat(s: ProfileState, kind: unknown): void {
  if (kind === 'resources') {
    s.gold += 5000;
    s.gems += 500;
  } else if (kind === 'trophies') {
    s.trophies += 300;
    s.maxTrophies = Math.max(s.maxTrophies, s.trophies);
    if (s.season) s.season.best = Math.max(s.season.best, s.trophies);
  } else fail('econ.offer');
}
