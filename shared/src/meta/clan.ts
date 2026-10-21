// ─────────────────────────────────────────────────────────────
//  CLANES: reglas puras (crear, roles, pedir y donar cartas).
//  El servidor las aplica; aquí no hay red ni base de datos.
// ─────────────────────────────────────────────────────────────
import { MAX_LEVEL, type Rarity } from '../config';
import { getCard, isCardKey } from '../data/cards';
import { EconError, addXp, type ProfileState } from './economy';

export const CLAN = {
  createCost: 1000, // oro
  maxMembers: 50,
  nameMin: 3,
  nameMax: 20,
  descMax: 120,
  badges: 12,
  /** Tiempo entre peticiones de cartas de un mismo jugador. */
  requestCooldownMs: 7 * 60 * 60 * 1000,
  /** Las peticiones se cierran solas pasado este tiempo. */
  requestTtlMs: 24 * 60 * 60 * 1000,
  /** Mensajes que se cargan al abrir el chat. */
  history: 60,
} as const;

/** Lo que se puede pedir y lo que da donar, por rareza (épicas y legendarias no se piden). */
export const DONATION: Partial<Record<Rarity, { want: number; perDonor: number; gold: number; xp: number }>> = {
  common: { want: 10, perDonor: 4, gold: 5, xp: 1 },
  rare: { want: 1, perDonor: 1, gold: 50, xp: 10 },
};

export type ClanRole = 'leader' | 'coLeader' | 'elder' | 'member';
export const ROLE_RANK: Record<ClanRole, number> = { member: 0, elder: 1, coLeader: 2, leader: 3 };
export const ROLES: ClanRole[] = ['member', 'elder', 'coLeader', 'leader'];
export type ClanType = 'open' | 'closed';

export interface ClanInput {
  name: string;
  description: string;
  badge: number;
  type: ClanType;
  minTrophies: number;
}

const fail = (code: string): never => {
  throw new EconError(code);
};

/** Valida y limpia los datos de un clan (nombre y descripción ya filtrados aparte). */
export function cleanClanInput(raw: unknown): ClanInput {
  const r = (raw ?? {}) as Record<string, unknown>;
  const name = typeof r.name === 'string' ? r.name.replace(/\s+/g, ' ').trim() : '';
  if (name.length < CLAN.nameMin || name.length > CLAN.nameMax || /[<>]/.test(name)) fail('err.clan.name');
  const description =
    typeof r.description === 'string' ? r.description.replace(/\s+/g, ' ').trim().slice(0, CLAN.descMax) : '';
  if (/[<>]/.test(description)) fail('err.clan.description');
  const badge = Number.isInteger(r.badge) ? Math.max(0, Math.min(CLAN.badges - 1, r.badge as number)) : 0;
  const type: ClanType = r.type === 'closed' ? 'closed' : 'open';
  const mt = Number(r.minTrophies);
  const minTrophies = Number.isFinite(mt) ? Math.max(0, Math.min(10_000, Math.round(mt / 100) * 100)) : 0;
  return { name, description, badge, type, minTrophies };
}

/** Paga la creación del clan. */
export function payClanCreation(s: ProfileState): void {
  if (s.gold < CLAN.createCost) fail('econ.noGold');
  s.gold -= CLAN.createCost;
}

/** ¿Puede `actor` cambiar el rol de `target` a `to`? (los ascensos solo hasta por debajo del propio). */
export function canSetRole(actor: ClanRole, target: ClanRole, to: ClanRole): boolean {
  if (to === 'leader' || target === 'leader') return actor === 'leader' && to !== target && target !== 'leader';
  return ROLE_RANK[actor] > ROLE_RANK[target] && ROLE_RANK[actor] > ROLE_RANK[to] && to !== target;
}

/** ¿Puede `actor` echar a `target`? (veterano o más, y solo a rangos inferiores). */
export const canKick = (actor: ClanRole, target: ClanRole): boolean =>
  ROLE_RANK[actor] >= ROLE_RANK.elder && ROLE_RANK[actor] > ROLE_RANK[target];

/** Puede editar el clan: líder y colíder. */
export const canEdit = (r: ClanRole): boolean => ROLE_RANK[r] >= ROLE_RANK.coLeader;

/** Rol siguiente/anterior (para los botones de ascender y degradar). */
export const nextRole = (r: ClanRole): ClanRole | null => ROLES[ROLE_RANK[r] + 1] ?? null;
export const prevRole = (r: ClanRole): ClanRole | null => (ROLE_RANK[r] > 0 ? ROLES[ROLE_RANK[r] - 1] : null);

/** Comprueba una petición de cartas: carta válida, tuya, pedible y sin estar al máximo. Devuelve cuántas se piden. */
export function checkCardRequest(s: ProfileState, card: unknown, lastRequestAt: number | null, now: number): number {
  if (typeof card !== 'string' || !isCardKey(card)) fail('err.clan.card');
  const key = card as string;
  const rule = DONATION[getCard(key).rarity];
  if (!rule) fail('err.clan.rarity');
  if (!s.cards[key]) fail('err.clan.card');
  if (s.cards[key].level >= MAX_LEVEL) fail('err.clan.maxed');
  if (lastRequestAt !== null && now - lastRequestAt < CLAN.requestCooldownMs) fail('err.clan.cooldown');
  return rule!.want;
}

export interface DonationState {
  card: string;
  want: number;
  got: number;
  /** Cartas donadas por cada jugador. */
  donors: Record<string, number>;
  requesterId: string;
  createdAt: number;
}

/**
 * Dona UNA carta a una petición. Valida y aplica los cambios al donante, a la petición y
 * al que la pidió (los tres los guarda el servidor en la misma transacción).
 */
export function donateCard(
  req: DonationState,
  donorId: string,
  donor: ProfileState,
  receiver: ProfileState,
  now: number,
): { gold: number; xp: number } {
  if (donorId === req.requesterId) fail('err.clan.ownRequest');
  if (now - req.createdAt > CLAN.requestTtlMs) fail('err.clan.expired');
  if (req.got >= req.want) fail('err.clan.full');
  const rule = DONATION[getCard(req.card).rarity];
  if (!rule) fail('err.clan.rarity');
  if ((req.donors[donorId] ?? 0) >= rule!.perDonor) fail('err.clan.donorLimit');
  const own = donor.cards[req.card];
  if (!own || own.count < 1) fail('err.clan.noCopies');
  if (!receiver.cards[req.card]) fail('err.clan.card');
  own!.count -= 1;
  receiver.cards[req.card].count += 1;
  req.got += 1;
  req.donors[donorId] = (req.donors[donorId] ?? 0) + 1;
  donor.gold += rule!.gold;
  addXp(donor, rule!.xp);
  return { gold: rule!.gold, xp: rule!.xp };
}

// ───────────────────────── Chat de clan (lo que viaja al cliente) ─────────────────────────

export interface ClanChatMessage {
  id: string;
  accountId: string | null;
  name: string;
  kind: 'text' | 'request' | 'system';
  /** Texto; en los avisos del sistema, JSON {k: clave de traducción, ...parámetros}. */
  body: string;
  card: string | null;
  want: number;
  got: number;
  donors: Record<string, number>;
  /** Oculto por denuncias (el texto no se envía). */
  hidden: boolean;
  at: number;
}

/** Mensajes de la sala de chat de clan (servidor → cliente). */
export type ClanRoomEvent =
  | { type: 'history'; messages: ClanChatMessage[] }
  | { type: 'msg'; message: ClanChatMessage }
  | { type: 'update'; message: ClanChatMessage }
  | { type: 'members' }
  | { type: 'error'; code: string };

// ───────────────────────── Amigos ─────────────────────────

export const FRIENDS = {
  max: 100,
  /** Solicitudes pendientes que puede tener alguien sin contestar. */
  maxIncoming: 50,
  /** Código de amigo: 8 caracteres sin letras confusas. */
  codeLength: 8,
  /** Se considera conectado si dio señales en este tiempo. */
  onlineMs: 90_000,
  /** Las invitaciones a amistosa caducan. */
  inviteTtlMs: 2 * 60_000,
} as const;
