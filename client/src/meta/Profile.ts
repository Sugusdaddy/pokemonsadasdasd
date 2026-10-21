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
  FREE_BALL_EVERY,
  CROWNS_FOR_CROWN_BALL,
  GEMS_PER_MINUTE_SKIP,
  ECONOMY,
  STARTER_DECK,
  getCard,
  startLevel,
  isCardKey,
  rollBall,
  type BallType,
  type BallReward,
} from '@arena/shared';

// ─────────────────────────────────────────────────────────────
//  PERFIL DEL JUGADOR (guardado en el navegador con localStorage)
//  Todo el progreso vive aquí: oro, gemas, trofeos, cartas, mazos y Pokéballs.
//  En la Fase 2 este módulo pasa a ser una caché de lo que diga el servidor.
// ─────────────────────────────────────────────────────────────

const KEY = 'arenaRoyale.profile.v2';
const now = () => Date.now();
const rand = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

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

export interface ProfileData {
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
  crownBallReady: boolean;
  roadClaimed: number[];
  shop: { day: string; bought: string[]; freeClaimed: boolean };
  stats: { wins: number; losses: number; draws: number; threeCrowns: number; battles: number; cardsFound: number };
  settings: { sfx: boolean; music: boolean };
  created: number;
}

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

function fresh(): ProfileData {
  const cards: Record<string, OwnedCard> = {};
  for (const k of STARTER_DECK) cards[k] = { level: startLevel(getCard(k)), count: 0 };
  return {
    name: 'Entrenador',
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
    freeBallAt: now(),
    crowns: 0,
    crownBallReady: false,
    roadClaimed: [],
    shop: { day: '', bought: [], freeClaimed: false },
    stats: { wins: 0, losses: 0, draws: 0, threeCrowns: 0, battles: 0, cardsFound: STARTER_DECK.length },
    settings: { sfx: true, music: true },
    created: now(),
  };
}

class ProfileStore {
  d: ProfileData = fresh();

  /** Se llama en BootScene. */
  init(): void {
    this.load();
  }

  load(): void {
    let data: Partial<ProfileData> | null = null;
    try {
      data = JSON.parse(localStorage.getItem(KEY) || 'null') as Partial<ProfileData> | null;
    } catch {
      data = null;
    }
    const base = fresh();
    this.d = data
      ? {
          ...base,
          ...data,
          stats: { ...base.stats, ...data.stats },
          settings: { ...base.settings, ...data.settings },
          shop: { ...base.shop, ...data.shop },
        }
      : base;
    // limpia cartas que ya no existan
    for (const k of Object.keys(this.d.cards)) if (!isCardKey(k)) delete this.d.cards[k];
    this.d.decks = this.d.decks.map((deck) => {
      const ok = deck.filter((k) => this.d.cards[k]);
      for (const k of STARTER_DECK) if (ok.length < 8 && !ok.includes(k)) ok.push(k);
      return ok.slice(0, 8);
    });
  }

  save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.d));
    } catch {
      /* almacenamiento no disponible */
    }
  }

  reset(): void {
    this.d = fresh();
    this.save();
  }

  // ───────── Arena y trofeos ─────────
  get arena(): number {
    let a = 0;
    ARENAS.forEach((ar, i) => {
      if (this.d.trophies >= ar.trophies) a = i;
    });
    return a;
  }

  get deck(): string[] {
    return this.d.decks[this.d.activeDeck];
  }

  level(key: string): number {
    return this.d.cards[key]?.level ?? startLevel(getCard(key));
  }

  has(key: string): boolean {
    return !!this.d.cards[key];
  }

  levelsOf(keys: readonly string[]): Record<string, number> {
    return Object.fromEntries(keys.map((k) => [k, this.level(k)]));
  }

  avgDeckLevel(): number {
    // nivel "normalizado" (como si todas fueran comunes)
    const lv = this.deck.map((k) => this.level(k) - startLevel(getCard(k)) + 1);
    return lv.reduce((a, b) => a + b, 0) / lv.length;
  }

  // ───────── Cartas y mejoras ─────────
  cardsNeeded(key: string): number {
    const c = getCard(key);
    const step = this.level(key) - RARITIES[c.rarity].start;
    return this.level(key) >= MAX_LEVEL ? Infinity : (UPGRADE_CARDS[step] ?? Infinity);
  }

  goldNeeded(key: string): number {
    return UPGRADE_GOLD[this.level(key) + 1] ?? Infinity;
  }

  canUpgrade(key: string): boolean {
    const c = this.d.cards[key];
    return !!c && c.level < MAX_LEVEL && c.count >= this.cardsNeeded(key);
  }

  upgrade(key: string): { ok: false; reason: 'cards' | 'gold' } | { ok: true; level: number; kingLevelUp: boolean } {
    if (!this.canUpgrade(key)) return { ok: false, reason: 'cards' };
    const gold = this.goldNeeded(key);
    if (this.d.gold < gold) return { ok: false, reason: 'gold' };
    const c = this.d.cards[key];
    c.count -= this.cardsNeeded(key);
    this.d.gold -= gold;
    c.level += 1;
    const lvUp = this.addXp(UPGRADE_XP[c.level] || 0);
    this.save();
    return { ok: true, level: c.level, kingLevelUp: lvUp };
  }

  addCards(key: string, n: number): boolean {
    const isNew = !this.d.cards[key];
    if (isNew) {
      this.d.cards[key] = { level: startLevel(getCard(key)), count: n - 1 };
      this.d.stats.cardsFound += 1;
    } else {
      this.d.cards[key].count += n;
    }
    return isNew;
  }

  addXp(xp: number): boolean {
    this.d.xp += xp;
    let up = false;
    while (this.d.xp >= (KING_XP[this.d.kingLevel] ?? Infinity)) {
      this.d.xp -= KING_XP[this.d.kingLevel];
      this.d.kingLevel += 1;
      up = true;
    }
    return up;
  }

  setDeckCard(slot: number, key: string): void {
    const deck = this.deck;
    const existing = deck.indexOf(key);
    if (existing >= 0) [deck[existing], deck[slot]] = [deck[slot], deck[existing]];
    else deck[slot] = key;
    this.save();
  }

  // ───────── Pokéballs ─────────
  get unlocking(): BallSlot | undefined {
    return this.d.slots.find((s): s is BallSlot => !!s && s.state === 'unlocking');
  }

  tickSlots(): void {
    let changed = false;
    for (const s of this.d.slots) {
      if (s && s.state === 'unlocking' && now() >= (s.readyAt ?? 0)) {
        s.state = 'ready';
        changed = true;
      }
    }
    if (changed) this.save();
  }

  startUnlock(i: number): boolean {
    const s = this.d.slots[i];
    if (!s || s.state !== 'locked' || this.unlocking) return false;
    s.state = 'unlocking';
    s.readyAt = now() + BALLS[s.type].unlock * 1000;
    this.save();
    return true;
  }

  remaining(s: BallSlot | null): number {
    if (!s) return 0;
    if (s.state === 'locked') return BALLS[s.type].unlock;
    if (s.state === 'unlocking') return Math.max(0, ((s.readyAt ?? 0) - now()) / 1000);
    return 0;
  }

  skipCost(s: BallSlot | null): number {
    return Math.max(1, Math.ceil(this.remaining(s) / 60) * GEMS_PER_MINUTE_SKIP);
  }

  skip(i: number): boolean {
    const s = this.d.slots[i];
    if (!s) return false;
    const cost = this.skipCost(s);
    if (this.d.gems < cost) return false;
    this.d.gems -= cost;
    s.state = 'ready';
    this.save();
    return true;
  }

  /** Abre la ball del hueco i (o una ball suelta) y aplica la recompensa. */
  openBall(type: BallType, arena?: number, slotIndex = -1): BallReward {
    const reward = rollBall(type, arena ?? this.arena);
    this.d.gold += reward.gold;
    this.d.gems += reward.gems;
    for (const it of reward.cards) it.isNew = this.addCards(it.key, it.count);
    if (slotIndex >= 0) this.d.slots[slotIndex] = null;
    this.save();
    return reward;
  }

  /** Mete una ball ganada en un hueco libre. Devuelve el tipo o null si no hay hueco. */
  grantBattleBall(): BallType | null {
    const i = this.d.slots.findIndex((s) => !s);
    if (i < 0) return null;
    const type = BALL_CYCLE[this.d.ballCycle % BALL_CYCLE.length];
    this.d.ballCycle += 1;
    this.d.slots[i] = { type, arena: this.arena, state: 'locked' };
    return type;
  }

  freeBallRemaining(): number {
    return Math.max(0, (this.d.freeBallAt - now()) / 1000);
  }

  claimFreeBall(): BallReward | null {
    if (this.freeBallRemaining() > 0) return null;
    this.d.freeBallAt = now() + FREE_BALL_EVERY * 1000;
    return this.openBall('free', this.arena);
  }

  claimCrownBall(): BallReward | null {
    if (this.d.crowns < CROWNS_FOR_CROWN_BALL) return null;
    this.d.crowns = 0;
    return this.openBall('crown', this.arena);
  }

  // ───────── Resultado de batalla ─────────
  applyBattle(outcome: BattleOutcome, myCrowns: number): BattleResult {
    const s = this.d.stats;
    s.battles += 1;
    const arenaBefore = this.arena;
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
      s.wins += 1;
      if (myCrowns === 3) s.threeCrowns += 1;
      res.trophies = rand(...ECONOMY.winTrophies);
      res.gold = ECONOMY.winGold(arenaBefore);
      res.ball = this.grantBattleBall();
      res.xp = ECONOMY.winXp;
    } else if (outcome === 'loss') {
      s.losses += 1;
      const floor = ARENAS[arenaBefore].trophies;
      res.trophies = -Math.min(rand(...ECONOMY.lossTrophies), Math.max(0, this.d.trophies - floor));
    } else {
      s.draws += 1;
    }
    this.d.trophies = Math.max(0, this.d.trophies + res.trophies);
    this.d.maxTrophies = Math.max(this.d.maxTrophies, this.d.trophies);
    this.d.gold += res.gold;
    this.d.crowns = Math.min(CROWNS_FOR_CROWN_BALL, this.d.crowns + myCrowns);
    res.kingLevelUp = this.addXp(res.xp);
    res.arenaUp = this.arena > arenaBefore;
    this.save();
    return res;
  }
}

export const Profile = new ProfileStore();
