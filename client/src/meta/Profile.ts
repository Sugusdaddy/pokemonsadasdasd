import {
  arenaOf,
  deckOf,
  levelOf,
  levelsOf,
  avgDeckLevel,
  cardsNeeded,
  goldNeeded,
  canUpgrade,
  remaining,
  skipCost,
  freeBallRemaining,
  tickSlots,
  freshProfile,
  DEFAULT_NAME,
  type BallSlot,
  type BallType,
  type BallReward,
  type BattleResult,
  type CardOffer,
  type MissionClaim,
  type ChallengeRun,
  type MissionPeriod,
  type ProfileState,
} from '@arena/shared';
import { t } from '../i18n';
import { ensureSession, request, signOut, type AccountView } from '../net/session';
import type { ShakeLevel } from '../battle/juice';
import type { Volumes } from '../systems/Sfx';
import type { QualityLevel } from '../systems/Quality';

export type { BallSlot, BattleResult, ProfileState };
export type ProfileData = ProfileState;
export type BattleOutcome = 'win' | 'loss' | 'draw';

// ─────────────────────────────────────────────────────────────
//  PERFIL DEL JUGADOR: copia local de la cuenta del servidor.
//  El servidor es quien decide (oro, gemas, cartas, balls, trofeos). Aquí solo se
//  lee para pintar, y cada acción se pide al servidor y se guarda lo que devuelve.
//  Los ajustes de sonido sí son locales (del navegador).
// ─────────────────────────────────────────────────────────────

const SETTINGS_KEY = 'arenaRoyale.settings';
type Listener = () => void;

class ProfileStore {
  /** Estado de la cuenta (lo último que mandó el servidor). */
  d: ProfileState = freshProfile(Date.now());
  account: { id: string; guest: boolean; wallets: string[]; admin: boolean } = {
    id: '',
    guest: true,
    wallets: [],
    admin: false,
  };
  /** Ajustes de este navegador. `sfx`/`music` (sí/no) son de versiones antiguas: ahora manda `vol`. */
  settings: {
    sfx: boolean;
    music: boolean;
    shake: ShakeLevel;
    vol?: Volumes;
    quality?: QualityLevel;
    colorblind?: boolean;
    bigText?: boolean;
  } = {
    sfx: true,
    music: true,
    shake: 'normal',
  };
  shop: { offers: CardOffer[]; resetAt: number } = { offers: [], resetAt: 0 };
  /** Diferencia entre la hora del servidor y la de este equipo (los temporizadores usan la del servidor). */
  private offset = 0;
  private listeners = new Set<Listener>();
  loaded = false;

  /** Conecta con el servidor (crea un invitado si es la primera vez). */
  async init(): Promise<void> {
    this.loadSettings();
    this.apply(await ensureSession());
    this.loaded = true;
  }

  /** Vuelve a pedir la cuenta al servidor. */
  async refresh(): Promise<void> {
    this.apply((await request<{ account: AccountView }>('/me')).account);
  }

  /** Guarda lo que devuelve el servidor. */
  apply(a: AccountView): void {
    this.d = a.state;
    this.account = { id: a.id, guest: a.guest, wallets: a.wallets, admin: !!a.admin };
    this.offset = a.serverNow - Date.now();
    this.shop = { offers: a.shop.offers, resetAt: Date.now() + a.shop.msToReset };
    this.emit();
  }

  /** Estado nuevo que llega al acabar una partida (mensaje 'rewards'). */
  applyState(s: ProfileState): void {
    this.d = s;
    this.emit();
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }

  /** Hora del servidor. */
  now(): number {
    return Date.now() + this.offset;
  }

  // ───────── Ajustes locales ─────────
  private loadSettings(): void {
    try {
      Object.assign(this.settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));
    } catch {
      /* sin almacenamiento */
    }
  }

  saveSettings(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      /* sin almacenamiento */
    }
  }

  // ───────── Lecturas (síncronas) ─────────
  get arena(): number {
    return arenaOf(this.d);
  }
  get deck(): string[] {
    return deckOf(this.d);
  }
  get displayName(): string {
    return !this.d.name || this.d.name === DEFAULT_NAME ? t('player.defaultName') : this.d.name;
  }
  get accountId(): string {
    return this.account.id;
  }
  get admin(): boolean {
    return this.account.admin;
  }
  get wallet(): string | null {
    return this.account.wallets[0] ?? null;
  }
  level(key: string): number {
    return levelOf(this.d, key);
  }
  has(key: string): boolean {
    return !!this.d.cards[key];
  }
  levelsOf(keys: readonly string[]): Record<string, number> {
    return levelsOf(this.d, keys);
  }
  avgDeckLevel(): number {
    return avgDeckLevel(this.d);
  }
  cardsNeeded(key: string): number {
    return cardsNeeded(this.d, key);
  }
  goldNeeded(key: string): number {
    return goldNeeded(this.d, key);
  }
  canUpgrade(key: string): boolean {
    return canUpgrade(this.d, key);
  }
  get unlocking(): BallSlot | undefined {
    return this.d.slots.find((s): s is BallSlot => !!s && s.state === 'unlocking');
  }
  remaining(s: BallSlot | null): number {
    return remaining(s, this.now());
  }
  skipCost(s: BallSlot | null): number {
    return skipCost(s, this.now());
  }
  freeBallRemaining(): number {
    return freeBallRemaining(this.d, this.now());
  }
  /** Marca como listas las balls cuyo tiempo ha pasado (solo para pintar; el servidor hace lo mismo). */
  tickSlots(): void {
    tickSlots(this.d, this.now());
  }
  msToShopReset(): number {
    return Math.max(0, this.shop.resetAt - Date.now());
  }

  // ───────── Acciones (las valida el servidor) ─────────
  /** Pide una acción al servidor; si va bien, guarda el estado nuevo y devuelve el resultado. Si no, lanza ApiError. */
  private async act<T>(path: string, body: object = {}): Promise<T> {
    const r = await request<{ result: T; account: AccountView }>(path, body);
    this.apply(r.account);
    return r.result;
  }

  setName = (name: string) => this.act<void>('/me/name', { name });
  setActiveDeck = (index: number) => this.act<void>('/me/deck/active', { index });
  setDeckCard = (slot: number, key: string) => this.act<void>('/me/deck/card', { slot, key });
  upgrade = (key: string) => this.act<{ level: number; kingLevelUp: boolean }>('/me/cards/upgrade', { key });
  startUnlock = (slot: number) => this.act<void>('/me/balls/unlock', { slot });
  skip = (slot: number) => this.act<number>('/me/balls/skip', { slot });
  openSlot = (slot: number) => this.act<BallReward>('/me/balls/open', { slot });
  claimFreeBall = () => this.act<BallReward>('/me/balls/free');
  claimCrownBall = () => this.act<BallReward>('/me/balls/crown');
  claimRoad = (trophies: number) =>
    this.act<{ gold?: number; gems?: number; ball?: BallReward }>('/me/road/claim', { trophies });
  claimShopGift = () => this.act<number>('/me/shop/gift');
  buyCardOffer = (id: string) => this.act<{ key: string; count: number; isNew: boolean }>('/me/shop/card', { id });
  buyBall = (type: BallType) => this.act<BallReward>('/me/shop/ball', { type });
  buyGold = (index: number) => this.act<number>('/me/shop/gold', { index });
  claimSeasonReward = () => this.act<{ gold: number; gems: number; ball?: BallReward }>('/me/season/claim');
  claimMission = (period: MissionPeriod, id: string) => this.act<MissionClaim>('/me/missions/claim', { period, id });
  claimMissionBonus = (period: MissionPeriod) => this.act<MissionClaim>('/me/missions/bonus', { period });
  completeTutorial = () => this.act<{ gold: number; gems: number }>('/me/tutorial/complete');
  startChallenge = () => this.act<ChallengeRun>('/me/challenge/start');
  devCheat = (kind: 'resources' | 'trophies') => this.act<void>('/me/dev', { kind });
  reset = () => this.act<void>('/me/reset');

  /** Cierra la sesión y entra como invitado nuevo. */
  async signOut(): Promise<void> {
    signOut();
    await this.init();
  }
}

export const Profile = new ProfileStore();
