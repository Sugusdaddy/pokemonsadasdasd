import type { Room } from 'colyseus.js';
import type { ClanChatMessage, ClanInput, ClanRole, ClanRoomEvent, ClanType } from '@arena/shared';
import { Profile } from '../meta/Profile';
import { request, sessionToken, type AccountView } from './session';
import { net } from './OnlineSession';

// ─────────────────────────────────────────────────────────────
//  SOCIAL: amigos, invitaciones y clanes (API) + chat de clan en vivo (sala Colyseus).
//  El resumen se pide cada pocos segundos mientras se está en el menú.
// ─────────────────────────────────────────────────────────────

export interface PlayerView {
  accountId: string;
  name: string;
  trophies: number;
  kingLevel: number;
  wallet: string | null;
  online: boolean;
}

export interface ClanView {
  id: string;
  name: string;
  description: string;
  badge: number;
  type: ClanType;
  minTrophies: number;
  members: number;
  trophies: number;
}

export interface MemberView extends PlayerView {
  role: ClanRole;
  donations: number;
  joinedAt: number;
}

export interface SocialSummary {
  code: string;
  friends: PlayerView[];
  incoming: PlayerView[];
  outgoing: PlayerView[];
  invites: Array<{ id: string; code: string; from: PlayerView; at: number }>;
  clan: (ClanView & { role: ClanRole; nextRequestAt: number }) | null;
  mutedUntil: number | null;
}

const POLL_MS = 15_000;
const BLOCK_KEY = 'arenaRoyale.blocked';

class SocialStore {
  summary: SocialSummary | null = null;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private loading: Promise<void> | null = null;
  /** Jugadores silenciados en este navegador (no se ven sus mensajes). */
  blocked = new Set<string>(
    (() => {
      try {
        return JSON.parse(localStorage.getItem(BLOCK_KEY) ?? '[]') as string[];
      } catch {
        return [];
      }
    })(),
  );

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }

  /** Pide el resumen (si ya hay una petición en marcha, espera a esa). */
  refresh(): Promise<void> {
    if (!sessionToken()) return Promise.resolve();
    this.loading ??= request<SocialSummary>('/social')
      .then((s) => {
        this.summary = s;
        this.emit();
      })
      .catch(() => {
        /* sin conexión: se reintenta en el siguiente ciclo */
      })
      .finally(() => (this.loading = null));
    return this.loading;
  }

  /** Empieza a refrescar cada pocos segundos (en el menú). */
  start(): void {
    void this.refresh();
    this.timer ??= setInterval(() => void this.refresh(), POLL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Avisos pendientes: solicitudes de amistad e invitaciones. */
  get pending(): number {
    return (this.summary?.incoming.length ?? 0) + (this.summary?.invites.length ?? 0);
  }

  toggleBlock(accountId: string): boolean {
    if (this.blocked.has(accountId)) this.blocked.delete(accountId);
    else this.blocked.add(accountId);
    try {
      localStorage.setItem(BLOCK_KEY, JSON.stringify([...this.blocked]));
    } catch {
      /* sin almacenamiento */
    }
    this.emit();
    return this.blocked.has(accountId);
  }

  // ── Amigos ──
  private async post<T>(path: string, body: object): Promise<T> {
    const r = await request<T>(path, body);
    void this.refresh();
    return r;
  }
  addFriend = (code: string) => this.post<{ status: 'sent' | 'accepted' }>('/friends/add', { code });
  accept = (accountId: string) => this.post('/friends/accept', { accountId });
  removeFriend = (accountId: string) => this.post('/friends/remove', { accountId });
  invite = (accountId: string, code: string) => request('/friends/invite', { accountId, code });
  dismissInvite = (id: string) => this.post('/friends/invite/dismiss', { id });

  // ── Clanes ──
  searchClans = (q = '') => request<{ clans: ClanView[] }>(`/clans?q=${encodeURIComponent(q)}`).then((r) => r.clans);
  clan = (id: string) => request<{ clan: ClanView; members: MemberView[] }>(`/clans/${encodeURIComponent(id)}`);
  async createClan(input: ClanInput): Promise<ClanView> {
    const r = await this.post<{ clan: ClanView; account: AccountView }>('/clans', input);
    Profile.apply(r.account);
    return r.clan;
  }
  joinClan = (clanId: string) => this.post('/clan/join', { clanId });
  leaveClan = () => this.post('/clan/leave', {});
  editClan = (input: ClanInput) => this.post<{ clan: ClanView }>('/clan/edit', input);
  setRole = (accountId: string, role: ClanRole) => this.post('/clan/role', { accountId, role });
  kick = (accountId: string) => this.post('/clan/kick', { accountId });
  requestCards = (card: string) => this.post<{ message: ClanChatMessage; nextAt: number }>('/clan/request', { card });
  async donate(messageId: string): Promise<{ gold: number; xp: number; message: ClanChatMessage }> {
    const r = await request<{ result: { gold: number; xp: number }; message: ClanChatMessage; account: AccountView }>(
      '/clan/donate',
      { messageId },
    );
    Profile.apply(r.account);
    return { ...r.result, message: r.message };
  }
  report = (messageId: string, reason: string) => request('/social/report', { messageId, reason });
}

export const Social = new SocialStore();

/**
 * Conexión al chat de tu clan. Guarda los mensajes y avisa de cada cambio.
 * Se cierra sola al salir de la pestaña.
 */
export class ClanChat {
  messages: ClanChatMessage[] = [];
  error: string | null = null;
  onChange: (() => void) | null = null;
  /** Cambió la lista de miembros o los datos del clan. */
  onMembers: (() => void) | null = null;
  /** Error puntual (mensaje demasiado rápido, silenciado…). */
  onError: ((code: string) => void) | null = null;
  private room: Room | null = null;
  private closed = false;

  constructor(readonly clanId: string) {
    void this.connect();
  }

  private async connect(): Promise<void> {
    try {
      const room = await net().joinOrCreate('clan', { token: sessionToken(), clanId: this.clanId });
      if (this.closed) return void room.leave();
      this.room = room;
      room.onMessage('event', (e: ClanRoomEvent) => this.onEvent(e));
      room.onLeave((code) => {
        this.room = null;
        // 4003: ya no estás en el clan
        if (!this.closed && code !== 4003) setTimeout(() => !this.closed && void this.connect(), 3000);
      });
    } catch (e) {
      this.error = (e as Error).message?.startsWith('err.') ? (e as Error).message : 'err.offline';
      this.onChange?.();
    }
  }

  private onEvent(e: ClanRoomEvent): void {
    if (e.type === 'history') this.messages = e.messages;
    else if (e.type === 'msg') this.messages = [...this.messages, e.message].slice(-200);
    else if (e.type === 'update') this.messages = this.messages.map((m) => (m.id === e.message.id ? e.message : m));
    else if (e.type === 'members') return void this.onMembers?.();
    else if (e.type === 'error') return void this.onError?.(e.code);
    this.error = null;
    this.onChange?.();
  }

  /** Añade un mensaje que ya devolvió la API (por si la sala tarda). */
  upsert(m: ClanChatMessage): void {
    if (this.messages.some((x) => x.id === m.id)) this.messages = this.messages.map((x) => (x.id === m.id ? m : x));
    else this.messages = [...this.messages, m];
    this.onChange?.();
  }

  get connected(): boolean {
    return !!this.room;
  }

  say(text: string): void {
    this.room?.send('say', text);
  }

  close(): void {
    this.closed = true;
    void this.room?.leave();
    this.room = null;
  }
}
